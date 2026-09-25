/**
 * Pure selectors: Report → view models. Components render these and never
 * dig through `engines[].components` themselves, so the parsing lives in one
 * testable place.
 */

import type { Domain as CoreDomain, TimelineCell } from '@fortune/core';
import type { Component, EngineResult, Period, Radar, Report, ScoringRule, Signal, SystemId, Timeline } from './types';

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

// ─── Timeline (Report v4, ARCHITECTURE-V2 §7) ───────────────────────────────

export type TimelineDomain = CoreDomain;

export interface DomainMeta { domain: TimelineDomain; label: string; icon: string; headline: boolean }

/** Display order: the four headline domains first, then the rest in core DOMAINS order. */
export const TIMELINE_DOMAINS: readonly DomainMeta[] = [
  { domain: 'relationship', label: '感情', icon: '❤️', headline: true },
  { domain: 'wealth', label: '財運', icon: '💰', headline: true },
  { domain: 'career', label: '事業', icon: '💼', headline: true },
  { domain: 'movement', label: '移動', icon: '🚗', headline: true },
  { domain: 'self', label: '自我', icon: '🧭', headline: false },
  { domain: 'family', label: '家庭', icon: '🏠', headline: false },
  { domain: 'property', label: '不動產', icon: '🏡', headline: false },
  { domain: 'learning', label: '學習', icon: '📚', headline: false },
  { domain: 'contract', label: '合約', icon: '📝', headline: false },
  { domain: 'health', label: '身心', icon: '🌿', headline: false },
];

export const HEADLINE_DOMAINS: readonly TimelineDomain[] = TIMELINE_DOMAINS.filter(item => item.headline).map(item => item.domain);

/** Core `SystemId`s (V2 signal layer) → 繁中. Differs from the legacy engine ids above. */
export const SIGNAL_SYSTEM_NAMES: Record<string, string> = {
  bazi: '八字',
  ziwei: '紫微斗數',
  numerology: '生命靈數',
  tzolkin: '馬雅曆',
  mingGua: '八宅命卦',
  jyotish: '印度占星',
  humanDesign: '人類圖',
};

export const TRAIT_LABELS: Record<string, string> = {
  change: '變動', growth: '成長', stability: '穩定', pressure: '壓力', opportunity: '機會',
  connection: '連結', separation: '分離', visibility: '能見度', leadership: '主導', risk: '風險',
  independence: '獨立', support: '支援', conflict: '衝突',
};

/** Rule id → short human label. Unknown ids fall back to the id itself (still auditable). */
export const RULE_LABELS: Record<string, string> = {
  'bazi.branch.break': '地支相破',
  'bazi.branch.clash': '地支相沖',
  'bazi.branch.directional': '地支三會',
  'bazi.branch.harm': '地支相害',
  'bazi.branch.harmony': '地支六合',
  'bazi.branch.punishment': '地支相刑',
  'bazi.branch.trine': '地支三合',
  'bazi.pillar.fanyin': '反吟',
  'bazi.pillar.fuyin': '伏吟',
  'bazi.stem.combine': '天干五合',
  'bazi.stem.control': '天干相剋',
  'bazi.stem.produce': '天干相生',
  'bazi.suiyun.binglin': '歲運並臨',
  'ziwei.year.sequence': '紫微流年',
  'ziwei.year.mutagen': '流年四化',
  'ziwei.year.palace_overlay': '流年命宮疊宮',
  'ziwei.month.mutagen': '流月四化',
  'ziwei.month.palace_overlay': '流月命宮疊宮',
  'ziwei.decade.mutagen': '大限四化',
  'ziwei.decade.palace_overlay': '大限疊宮',
  'ziwei.natal.star_traits': '本命星曜',
  'ziwei.sanfang.sha': '三方煞星',
  'ziwei.star.lucun': '祿存',
  'ziwei.star.tianma': '天馬',
  'numerology.personal_year': '個人流年數',
  'numerology.personal_month': '個人流月數',
  'jyotish.dasha.maha': '大運期（Mahadasha）',
  'jyotish.dasha.antar': '子運期（Antardasha）',
  'jyotish.transit.sade_sati': '土星七年半（Sade Sati）',
  'jyotish.transit.slow': '慢行星過境',
  'humanDesign.natal.type': '人類圖類型',
  'humanDesign.natal.authority': '人類圖內在權威',
  'humanDesign.natal.channel_centers': '人類圖通道與中心',
  'humanDesign.transit.gates': '人類圖過境閘門',
};

export const SKIP_REASON_LABELS: Record<string, string> = {
  time_unknown: '需要出生時間',
  ephemeris_not_initialised: '星曆未載入',
  no_timeline_rules: '沒有隨時間變化的規則',
};

export const BAND_ORDER = ['低', '中', '中高', '高'] as const;
export type BandLabel = (typeof BAND_ORDER)[number];

export interface TimelineSignalView {
  id: string;
  system: string;
  systemName: string;
  ruleId: string;
  ruleLabel: string;
  trait: string;
  traitLabel: string;
  text: string;
  /** 0–1. */
  intensity: number;
  /** −1–1. */
  valence: number;
  /** Neutral reading of valence: 支持 (+), 壓力 (−), 變動 (≈0). Never 吉/凶. */
  direction: '支持' | '壓力' | '變動';
}

export interface TimelineConflictSide {
  id: string;
  systemName: string;
  label: string;
  text: string | null;
}

export interface TimelineCellView {
  /** Stable key `${grain}:${start}:${domain}` used for selection. */
  key: string;
  domain: TimelineDomain;
  domainLabel: string;
  icon: string;
  grain: 'year' | 'month';
  periodLabel: string;
  start: string;
  end: string;
  isCurrent: boolean;
  score: number;
  band: BandLabel;
  /** No rule fired for this domain in this window (score 0 by convention). */
  empty: boolean;
  consensus: number;
  highConsensus: boolean;
  conflict: null | { positive: TimelineConflictSide[]; negative: TimelineConflictSide[] };
  /** Systems that emitted signals for this cell (繁中). */
  systems: string[];
  topSignals: TimelineSignalView[];
}

export interface TimelineRow extends DomainMeta { cells: TimelineCellView[] }

export interface TimelineGrid {
  grain: 'year' | 'month';
  periods: { start: string; label: string; isCurrent: boolean }[];
  rows: TimelineRow[];
}

export interface TimelineMeta {
  asOf: string;
  systems: string[];
  skipped: { system: string; name: string; reason: string }[];
  bandCuts: [number, number, number];
}

const isBand = (value: unknown): value is BandLabel => BAND_ORDER.includes(value as BandLabel);

function timelineOf(report: Report): Timeline | null {
  const timeline = report.timeline;
  return timeline && Array.isArray(timeline.years) ? timeline : null;
}

function bandCutsOf(timeline: Timeline): [number, number, number] {
  const cuts = timeline.bandCuts;
  return Array.isArray(cuts) && cuts.length === 3 ? [cuts[0], cuts[1], cuts[2]] : [35, 55, 75];
}

/** Same rule as core `toBand`; used only when a cell lacks a band. */
export function bandOf(score: number, cuts: readonly [number, number, number] = [35, 55, 75]): BandLabel {
  if (score >= cuts[2]) return '高';
  if (score >= cuts[1]) return '中高';
  if (score >= cuts[0]) return '中';
  return '低';
}

export function ruleLabel(ruleId: string): string {
  return RULE_LABELS[ruleId] ?? ruleId;
}

function toSignalView(signal: Signal): TimelineSignalView {
  const valence = Number(signal.valence) || 0;
  return {
    id: signal.id,
    system: signal.system,
    systemName: SIGNAL_SYSTEM_NAMES[signal.system] ?? signal.system,
    ruleId: signal.ruleId,
    ruleLabel: ruleLabel(signal.ruleId),
    trait: signal.trait,
    traitLabel: TRAIT_LABELS[signal.trait] ?? signal.trait,
    text: signal.evidence?.text ?? '',
    intensity: Number(signal.intensity) || 0,
    valence,
    direction: valence > 0.05 ? '支持' : valence < -0.05 ? '壓力' : '變動',
  };
}

/** Signals from a v4 report's flat `signals` list, when it is one (the shape may still evolve). */
function reportSignals(report: Report): Map<string, Signal> {
  const list: Signal[] = Array.isArray(report.signals) ? report.signals : [];
  return new Map(list.filter(item => item && typeof item.id === 'string').map(item => [item.id, item]));
}

type CoreDomainCell = TimelineCell['domains'][number];

function conflictSide(ids: string[], cell: CoreDomainCell, lookup: Map<string, Signal>): TimelineConflictSide[] {
  return ids.map(id => {
    const signal = cell.topSignals.find(item => item.id === id) ?? lookup.get(id);
    if (signal) {
      const view = toSignalView(signal);
      return { id, systemName: view.systemName, label: `${view.ruleLabel}・${view.traitLabel}`, text: view.text || null };
    }
    // Not among the cell's top signals: still name the system that emitted it.
    const system = Object.entries(cell.perSystem ?? {}).find(([, value]) => value?.signalIds?.includes(id))?.[0];
    return { id, systemName: system ? SIGNAL_SYSTEM_NAMES[system] ?? system : '未知系統', label: `訊號 ${id}`, text: null };
  });
}

function periodLabel(grain: 'year' | 'month', start: string): string {
  return grain === 'year' ? start.slice(0, 4) : `${Number(start.slice(5, 7))}月`;
}

function isCurrentPeriod(grain: 'year' | 'month', start: string, asOf: string): boolean {
  return grain === 'year' ? start.slice(0, 4) === asOf.slice(0, 4) : start.slice(0, 7) === asOf.slice(0, 7);
}

function buildGrid(report: Report, grain: 'year' | 'month'): TimelineGrid | null {
  const timeline = timelineOf(report);
  if (!timeline) return null;
  const cells = (grain === 'year' ? timeline.years : timeline.months) ?? [];
  if (!cells.length) return null;
  const cuts = bandCutsOf(timeline);
  const lookup = reportSignals(report);
  const asOf = timeline.asOf ?? report.asOf;

  const periods = cells.map(cell => ({
    start: cell.window.start,
    label: periodLabel(grain, cell.window.start),
    isCurrent: isCurrentPeriod(grain, cell.window.start, asOf),
  }));

  const rows = TIMELINE_DOMAINS.map(meta => ({
    ...meta,
    cells: cells.map((cell, index): TimelineCellView => {
      const found = cell.domains.find(item => item.domain === meta.domain);
      const score = Number(found?.score) || 0;
      const systems = Object.entries(found?.perSystem ?? {})
        .filter(([, value]) => (value?.signalIds?.length ?? 0) > 0)
        .map(([system]) => SIGNAL_SYSTEM_NAMES[system] ?? system);
      const topSignals = (found?.topSignals ?? []).map(toSignalView);
      return {
        key: `${grain}:${cell.window.start}:${meta.domain}`,
        domain: meta.domain,
        domainLabel: meta.label,
        icon: meta.icon,
        grain,
        periodLabel: periods[index].label,
        start: cell.window.start,
        end: cell.window.end,
        isCurrent: periods[index].isCurrent,
        score,
        band: isBand(found?.band) ? found.band : bandOf(score, cuts),
        empty: !found || (systems.length === 0 && topSignals.length === 0),
        consensus: found?.consensus ?? 0,
        highConsensus: Boolean(found?.highConsensus),
        conflict: found?.conflict
          ? { positive: conflictSide(found.conflict.positive, found, lookup), negative: conflictSide(found.conflict.negative, found, lookup) }
          : null,
        systems,
        topSignals,
      };
    }),
  }));

  return { grain, periods, rows };
}

/** Year grid: one row per domain (headline first) × the timeline's year cells (normally 5). */
export function selectTimelineYears(report: Report): TimelineGrid | null {
  return buildGrid(report, 'year');
}

/** Month grid of the asOf year (normally 12 cells), same row order as the year grid. */
export function selectTimelineMonths(report: Report): TimelineGrid | null {
  return buildGrid(report, 'month');
}

export function selectTimelineMeta(report: Report): TimelineMeta | null {
  const timeline = timelineOf(report);
  if (!timeline) return null;
  return {
    asOf: timeline.asOf ?? report.asOf,
    systems: (timeline.systems ?? []).map(system => SIGNAL_SYSTEM_NAMES[system] ?? system),
    skipped: (timeline.skippedSystems ?? []).map(item => ({
      system: item.system,
      name: SIGNAL_SYSTEM_NAMES[item.system] ?? item.system,
      reason: SKIP_REASON_LABELS[item.reason] ?? item.reason,
    })),
    bandCuts: bandCutsOf(timeline),
  };
}

/** Find a cell by key in any of the grids (used by the detail panel). */
export function findTimelineCell(key: string | null, ...grids: (TimelineGrid | null)[]): TimelineCellView | null {
  if (!key) return null;
  for (const grid of grids) {
    for (const row of grid?.rows ?? []) {
      const cell = row.cells.find(item => item.key === key);
      if (cell) return cell;
    }
  }
  return null;
}
