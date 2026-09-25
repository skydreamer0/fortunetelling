/**
 * Pure selectors: Report → view models. Components render these and never
 * dig through `engines[].components` themselves, so the parsing lives in one
 * testable place.
 */

import type { Component, EngineResult, Period, Radar, Report, ScoringRule, SystemId } from './types';

export const SYSTEM_NAMES: Record<string, string> = {
  bazi: '八字',
  ziwei: '紫微斗數',
  numerology: '生命靈數',
  minggua: '八宅命卦',
  dreamspell: '馬雅曆',
};

export type Element = '木' | '火' | '土' | '金' | '水';
export const ELEMENTS: Element[] = ['木', '火', '土', '金', '水'];

export const STEM_ELEMENT: Record<string, Element> = {
  甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水',
};

export const BRANCH_ELEMENT: Record<string, Element> = {
  子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火',
  午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水',
};

export const ELEMENT_KEY: Record<Element, string> = { 木: 'wood', 火: 'fire', 土: 'earth', 金: 'metal', 水: 'water' };

export function engine(report: Report, id: string): EngineResult | null {
  return report.engines.find(item => item.engineId === id) ?? null;
}

function byCategory<V = any>(result: EngineResult | null, category: string): Component<V>[] {
  return (result?.components ?? []).filter(item => item.category === category);
}

function first<V = any>(result: EngineResult | null, category: string): V | null {
  return byCategory<V>(result, category)[0]?.value ?? null;
}

// ─── Input ──────────────────────────────────────────────────────────────────

const pad = (value: number) => String(value).padStart(2, '0');

export function birthLabel(input: Report['input']): { date: string; time: string } {
  return {
    date: `${input.year}.${pad(input.month)}.${pad(input.day)}`,
    time: input.timeKnown === false ? '時辰不確定' : `${pad(input.hour)}:${pad(input.minute ?? 0)}`,
  };
}

// ─── BaZi ───────────────────────────────────────────────────────────────────

export interface Pillar {
  key: 'year' | 'month' | 'day' | 'time';
  label: string;
  stem: string;
  branch: string;
  stemElement: Element | null;
  branchElement: Element | null;
}

/** Four pillars in traditional reading order (時 日 月 年, right-to-left becomes left-to-right). */
export function pillars(report: Report): Pillar[] | null {
  const natal = first<Record<string, string>>(engine(report, 'bazi'), 'natal');
  if (!natal) return null;
  const order: [Pillar['key'], string][] = [['time', '時柱'], ['day', '日柱'], ['month', '月柱'], ['year', '年柱']];
  return order.map(([key, label]) => {
    const [stem = '', branch = ''] = [...(natal[key] ?? '')];
    return {
      key, label, stem, branch,
      stemElement: STEM_ELEMENT[stem] ?? null,
      branchElement: BRANCH_ELEMENT[branch] ?? null,
    };
  });
}

export function dayMaster(report: Report): { stem: string; element: string; yinYang: string } | null {
  return first(engine(report, 'bazi'), 'dayMaster');
}

export interface BaziStructure {
  elements: { element: Element; count: number; share: number }[];
  elementTotal: number;
  elementLimitation: string;
  tenGods: { name: string; count: number }[];
  groups: {
    group: string;
    context: string;
    presence: '顯' | '隱' | '無';
    share: number;
    visibleCount: number;
    hiddenCount: number;
    observed: string[];
  }[];
  currentYear: { year: number; ganZhi: string } | null;
}

export function baziStructure(report: Report): BaziStructure | null {
  const bazi = engine(report, 'bazi');
  const elements = first<{ counts: Record<Element, number>; total: number; limitation: string }>(bazi, 'elements');
  if (!elements) return null;
  const tenGods = first<{ counts: Record<string, number> }>(bazi, 'tenGods');
  const context = first<{ groups: any[] }>(bazi, 'tenGodsContext');
  return {
    elements: ELEMENTS.map(element => ({
      element,
      count: elements.counts[element] ?? 0,
      share: elements.total ? (elements.counts[element] ?? 0) / elements.total : 0,
    })),
    elementTotal: elements.total,
    elementLimitation: elements.limitation,
    tenGods: Object.entries(tenGods?.counts ?? {}).map(([name, count]) => ({ name, count })),
    groups: (context?.groups ?? []).map(group => ({
      group: group.group,
      context: group.context,
      presence: group.presence,
      share: group.share ?? 0,
      visibleCount: group.visibleCount ?? 0,
      hiddenCount: group.hiddenCount ?? 0,
      observed: group.observedTenGods ?? [],
    })),
    currentYear: first(bazi, 'liuNian'),
  };
}

// ─── Zi Wei ─────────────────────────────────────────────────────────────────

export interface Star {
  name: string;
  brightness: string;
  brightnessScore: number | null;
  mutagen: string | null;
}

export interface PalaceView {
  index: number;
  name: string;
  stem: string;
  branch: string;
  row: number;
  column: number;
  isSoul: boolean;
  isBody: boolean;
  majorStars: Star[];
  minorStars: Star[];
  score: number;
  decade: [number, number] | null;
  isCurrentDecade: boolean;
  isYearPalace: boolean;
}

/** 4×4 board positions by earthly branch (traditional layout, 寅 bottom-left). */
const BRANCH_POSITIONS: Record<string, [number, number]> = {
  巳: [1, 1], 午: [1, 2], 未: [1, 3], 申: [1, 4],
  辰: [2, 1], 酉: [2, 4],
  卯: [3, 1], 戌: [3, 4],
  寅: [4, 1], 丑: [4, 2], 子: [4, 3], 亥: [4, 4],
};

function toStar(star: any): Star {
  return {
    name: star.name,
    brightness: star.brightness ?? '',
    brightnessScore: typeof star.brightnessScore === 'number' ? star.brightnessScore : null,
    mutagen: star.mutagen || null,
  };
}

export interface ZiweiBoard {
  palaces: PalaceView[];
  fiveElementsClass: string;
  soulMaster: string;
  bodyMaster: string;
  bodyPalace: string;
  lunarDate: string;
  zodiac: string;
  sign: string;
  yearTransforms: { stem: string; branch: string; stars: string[] } | null;
}

export function ziweiBoard(report: Report): ZiweiBoard | null {
  const ziwei = engine(report, 'ziwei');
  const palaces = byCategory(ziwei, 'palaces');
  if (palaces.length !== 12) return null;
  const strength = report.radars.find(radar => radar.id === 'ziwei_palace_strength');
  const natal = first<Record<string, string>>(ziwei, 'natal') ?? {};
  const decades = byCategory(ziwei, 'daXian').map(item => item.value);
  const currentDecade = decades.find(item => item.isCurrent);
  const flying = first<{ heavenlyStem: string; earthlyBranch: string; mutagen: string[]; palaceIndex: number }>(ziwei, 'flyingStars');

  const views = palaces.map(({ value: palace }) => {
    const [row, column] = BRANCH_POSITIONS[palace.earthlyBranch] ?? [1, 1];
    const axis = strength?.axes.find(item => item.label === palace.name);
    return {
      index: palace.index,
      name: palace.name,
      stem: palace.heavenlyStem,
      branch: palace.earthlyBranch,
      row, column,
      isSoul: palace.name === '命宮',
      isBody: Boolean(palace.isBodyPalace),
      majorStars: (palace.majorStars ?? []).map(toStar),
      minorStars: (palace.minorStars ?? []).map(toStar),
      score: Math.round(Math.max(0, Math.min(100, Number(axis?.value) || 0))),
      decade: Array.isArray(palace.decadalRange) ? palace.decadalRange as [number, number] : null,
      isCurrentDecade: currentDecade?.palaceIndex === palace.index,
      isYearPalace: flying?.palaceIndex === palace.index,
    } satisfies PalaceView;
  });

  return {
    palaces: views,
    fiveElementsClass: ziwei?.meta.fiveElementsClass ?? natal.fiveElementsClass ?? '',
    soulMaster: natal.soul ?? '—',
    bodyMaster: natal.body ?? '—',
    bodyPalace: views.find(item => item.isBody)?.name ?? '—',
    lunarDate: natal.lunarDate ?? '',
    zodiac: natal.zodiac ?? '',
    sign: natal.sign ?? '',
    yearTransforms: flying
      ? { stem: flying.heavenlyStem, branch: flying.earthlyBranch, stars: flying.mutagen ?? [] }
      : null,
  };
}

/** The soul palace's stars; falls back to the opposite palace when empty (借宮). */
export function soulStars(report: Report): { text: string; borrowed: boolean } | null {
  const ziwei = engine(report, 'ziwei');
  const svb = first<any>(ziwei, 'soulVsBody');
  if (!svb) return null;
  const direct = (svb.soul?.majorStars ?? []).map((star: any) => star.name);
  if (direct.length) return { text: direct.join('、'), borrowed: false };
  const sanfang = byCategory(ziwei, 'sanFangSiZheng').find(item => item.value?.anchor === '命宮')?.value;
  const opposite = (sanfang?.opposite?.majorStars ?? []).map((star: any) => star.name);
  return opposite.length
    ? { text: `借${sanfang.opposite.name}　${opposite.join('、')}`, borrowed: true }
    : { text: '命宮無主星', borrowed: false };
}

// ─── Numerology / Kin / MingGua ─────────────────────────────────────────────

export interface NumberCell { key: string; label: string; number: number; isMaster: boolean }

export function numerology(report: Report) {
  const result = engine(report, 'numerology');
  if (!result) return null;
  const cells: NumberCell[] = [
    ['lifePath', '生命靈數'], ['expression', '表達數'], ['soulUrge', '靈魂數'], ['personality', '人格數'],
  ].flatMap(([category, label]) => {
    const value = first<{ number: number; isMaster: boolean }>(result, category);
    return value ? [{ key: category, label, number: value.number, isMaster: value.isMaster }] : [];
  });
  const frequency = first<Record<string, number>>(result, 'digitFrequency') ?? {};
  return {
    cells,
    grid: ['3', '6', '9', '2', '5', '8', '1', '4', '7'].map(digit => ({ digit, count: frequency[digit] ?? 0 })),
    personalYear: first<{ number: number; year: number }>(result, 'personalYear'),
    personalMonth: first<{ number: number; year: number; month: number }>(result, 'personalMonth'),
    notes: result.errors,
  };
}

export function kin(report: Report) {
  const result = engine(report, 'dreamspell');
  const value = first<{ kin: number; signature: string; color: string }>(result, 'kin');
  if (!result || !value) return null;
  return {
    kin: value.kin,
    signature: result.meta.fullSignature ?? value.signature,
    color: value.color,
    tone: first<{ number: number; name: string }>(result, 'tone'),
    seal: first<{ number: number; name: string; color: string }>(result, 'seal'),
    epoch: result.meta.epoch ?? '',
  };
}

export const COMPASS_ORDER = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

export function mingGua(report: Report) {
  const result = engine(report, 'minggua');
  const gua = first<any>(result, 'mingGua');
  const directions = first<{ auspicious: Record<string, { code: string; zh: string }>; inauspicious: Record<string, { code: string; zh: string }> }>(result, 'directions');
  if (!gua || !directions) return null;
  const byCode = new Map<string, { name: string; zh: string; good: boolean }>();
  for (const [name, dir] of Object.entries(directions.auspicious)) byCode.set(dir.code, { name, zh: dir.zh, good: true });
  for (const [name, dir] of Object.entries(directions.inauspicious)) byCode.set(dir.code, { name, zh: dir.zh, good: false });
  return {
    name: gua.name as string,
    elementZh: gua.elementZh as string,
    groupName: gua.groupName as string,
    yearForGua: gua.yearForGua as number,
    compass: COMPASS_ORDER.map(code => ({ code, ...(byCode.get(code) ?? { name: '', zh: code, good: false }) })),
  };
}

// ─── Identity ledger (overview) ─────────────────────────────────────────────

export interface IdentityRow { system: SystemId; label: string; value: string; sub: string }

export function identity(report: Report): IdentityRow[] {
  const rows: IdentityRow[] = [];
  const master = dayMaster(report);
  if (master) rows.push({ system: 'bazi', label: '日主', value: `${master.stem}${master.element}`, sub: `${master.yinYang}${master.element}` });
  const soul = soulStars(report);
  const board = ziweiBoard(report);
  if (soul && board) rows.push({ system: 'ziwei', label: '命宮', value: soul.text, sub: `${board.fiveElementsClass}・身宮在${board.bodyPalace}` });
  const numbers = numerology(report);
  const lifePath = numbers?.cells.find(cell => cell.key === 'lifePath');
  if (lifePath) {
    const expression = numbers?.cells.find(cell => cell.key === 'expression');
    rows.push({
      system: 'numerology', label: '生命靈數', value: String(lifePath.number),
      sub: expression ? `表達數 ${expression.number}${expression.isMaster ? '（大師數）' : ''}` : '未輸入拉丁拼音姓名',
    });
  }
  const signature = kin(report);
  if (signature) rows.push({ system: 'dreamspell', label: 'Kin', value: String(signature.kin), sub: signature.signature });
  const gua = mingGua(report);
  if (gua) rows.push({ system: 'minggua', label: '命卦', value: `${gua.name}卦`, sub: `${gua.groupName}・${gua.elementZh}` });
  return rows;
}

// ─── Periods, rules, notices ────────────────────────────────────────────────

export function periodsBySystem(report: Report): { system: 'bazi' | 'ziwei'; title: string; periods: Period[] }[] {
  const periods = report.evolution?.periods ?? [];
  return ([['bazi', '八字大運'], ['ziwei', '紫微大限']] as const)
    .map(([system, title]) => ({ system, title, periods: periods.filter(period => period.system === system) }))
    .filter(group => group.periods.length > 0);
}

export function rulesById(report: Report): Map<string, ScoringRule> {
  return new Map(Object.values(report.scoringRules?.byRadarType ?? {}).flat().map(rule => [rule.id, rule]));
}

export function radar(report: Report, id: string): Radar | null {
  return report.radars.find(item => item.id === id) ?? null;
}

const INFORMATIONAL = [/姓名無拉丁字母/, /無姓名/, /略過表達數/];

export function notices(report: Report) {
  return {
    unavailable: report.engines
      .filter(item => item.meta?.unavailableReason === 'unknown-time')
      .map(item => item.meta.unavailableMessage as string),
    warnings: report.engines.flatMap(item => item.errors
      .filter(message => !INFORMATIONAL.some(pattern => pattern.test(message)))
      .map(message => `${item.engineName}：${message}`)),
  };
}
