/**
 * @fileoverview EvolutionCalculator（區塊 H③）— 時期演化。
 *
 * 吃 `SystemResult[]` ＋ asOf，產出 `{ periods: Period[], narrative: string }`
 * （形狀見 ARCHITECTURE.md §4.2 Period）：
 *
 *   - 八字：本命 `elements.counts` → 每步大運把天干本氣計 3、地支本氣計 2
 *     疊加 → 每十年一張五行雷達（重算佔比）。計分規則
 *     `bazi_element_balance_dayun`（ScoringRules，公式寫明疊加法）。
 *   - 紫微：每個大限把 `ziwei_palace_strength` 的四化加成改用**該大限 mutagen**
 *     重算 12 宮 → 每十年一張宮強雷達（公式與規則同 `ziwei_palace_strength`，
 *     僅加成來源由生年四化換成大限四化，inputs 可覆核）。
 *
 * 誠實條款：每個 Period 的 `summary` 恰兩行、`narrative` 一段，全部以模板產生
 * 並在產文當下過 `HonestyGuard.lint(text, 'L1')`，違規直接拋錯（程式缺陷）。
 * 資料序列來自引擎的全序列部件（D-016），本模組不 import 引擎或命理函式庫，
 * 干支→五行對照為本模組自帶的靜態資料。
 *
 * @module analysis/EvolutionCalculator
 */

import { HonestyGuard } from './HonestyGuard';
import { getAxisNotes } from './AxisNotes';
import type { SystemResult } from '../core/models/SystemResult';
import type { Radar } from './RadarBuilder';

export interface Period {
  system: 'bazi' | 'ziwei';
  /** e.g. '2022–2031 辛丑大運' */
  label: string;
  /** [startYear, endYear] */
  range: [number, number];
  /** 該時期重算後的雷達 */
  radar: Radar;
  /** 恰好兩行摘要（過 HonestyGuard L1） */
  summary: [string, string];
}

// ─── Static Data（干支→五行；analysis 層不得 import 引擎，故自帶對照）────────

const STEM_ELEMENTS: Readonly<Record<string, string>> = Object.freeze({
  甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土',
  己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水',
});

const BRANCH_ELEMENTS: Readonly<Record<string, string>> = Object.freeze({
  寅: '木', 卯: '木', 巳: '火', 午: '火',
  辰: '土', 戌: '土', 丑: '土', 未: '土',
  申: '金', 酉: '金', 亥: '水', 子: '水',
});

/** 五行雷達軸（順序與 key 同 RadarBuilder 的 bazi_element_balance）。 */
const ELEMENT_AXES = Object.freeze([
  { key: 'wood', label: '木' },
  { key: 'fire', label: '火' },
  { key: 'earth', label: '土' },
  { key: 'metal', label: '金' },
  { key: 'water', label: '水' },
]);

/** 大運本氣權重：天干較直接，地支次之；兩者合計固定為 5。 */
export const DAYUN_STEM_WEIGHT = 3;
export const DAYUN_BRANCH_WEIGHT = 2;
/** @deprecated v0.3 起改用 DAYUN_STEM_WEIGHT / DAYUN_BRANCH_WEIGHT。 */
export const DAYUN_OVERLAY_PER_CHAR = 1;

const round2 = (n: number): number => Math.round(n * 100) / 100;

// ─── Internal Helpers ───────────────────────────────────────────────────────

/**
 * 產文即檢：summary/narrative 必須通過 HonestyGuard L1 lint。
 */
function lintedL1(text: string): string {
  const { ok, problems } = HonestyGuard.lint(text, 'L1');
  if (!ok) {
    throw new Error(`EvolutionCalculator 產文違反 L1 語言規則：${problems.join('；')}（原文：${text}）`);
  }
  return text;
}

function findComponents(result: SystemResult | { components?: Record<string, any>[] }, category: string): Record<string, any>[] {
  const components = result?.components;
  if (!Array.isArray(components)) return [];
  return components.filter((c) => c.category === category);
}

/**
 * 雷達軸值最高／最低的 label（同高時取序列在前者，決定論）。
 */
function topAndLow(radar: Radar): { top: string; low: string } {
  let top = radar.axes[0];
  let low = radar.axes[0];
  for (const axis of radar.axes) {
    if (axis.value > top.value) top = axis;
    if (axis.value < low.value) low = axis;
  }
  return { top: top.label, low: low.label };
}

// ─── BaZi: 大運五行疊加 ─────────────────────────────────────────────────────

/**
 * 由本命五行計數與一步大運干支，重算疊加後的五行雷達。
 *
 * @param natalCounts - 本命五行出現次數
 */
export function buildDaYunElementRadar(natalCounts: Record<string, number>, natalTotal: number, daYunValue: { index: number; ganZhi: string }): Radar {
  const { index, ganZhi } = daYunValue;
  const [stem, branch] = [...ganZhi];
  const stemElement = STEM_ELEMENTS[stem];
  const branchElement = BRANCH_ELEMENTS[branch];
  const overlayTotal = (stemElement ? DAYUN_STEM_WEIGHT : 0)
    + (branchElement ? DAYUN_BRANCH_WEIGHT : 0);
  const total = natalTotal + overlayTotal;

  return {
    id: `bazi_element_balance_dayun_${index}`,
    system: 'bazi',
    title: `${ganZhi}大運五行占比`,
    kind: 'radar',
    axes: ELEMENT_AXES.map(({ key, label }) => {
      const natalCount = natalCounts[label] ?? 0;
      const stemOverlay = stemElement === label ? DAYUN_STEM_WEIGHT : 0;
      const branchOverlay = branchElement === label ? DAYUN_BRANCH_WEIGHT : 0;
      const daYunOverlay = stemOverlay + branchOverlay;
      return {
        key,
        label,
        value: round2(((natalCount + daYunOverlay) / total) * 100),
        unit: '%',
        ruleId: 'bazi_element_balance_dayun',
        inputs: { natalCount, stemOverlay, branchOverlay, daYunOverlay, natalTotal, overlayTotal },
        ...getAxisNotes('bazi_element_balance', label),
      };
    }),
  };
}

function buildBaziPeriods(baziResult: SystemResult): Period[] {
  const elements = findComponents(baziResult, 'elements')[0];
  const natalCounts = elements?.value?.counts;
  const natalTotal = elements?.value?.total;
  if (!natalCounts || !(natalTotal > 0)) return [];

  const daYunSteps = findComponents(baziResult, 'daYun')
    .map((c) => c.value)
    .filter((v) => v && typeof v.ganZhi === 'string')
    .sort((a, b) => a.index - b.index);

  return daYunSteps.map((step) => {
    const label = `${step.startYear}–${step.endYear} ${step.ganZhi}大運`;
    const radar = buildDaYunElementRadar(natalCounts, natalTotal, step);
    const { top, low } = topAndLow(radar);
    return {
      system: 'bazi',
      label,
      range: [step.startYear, step.endYear],
      radar,
      isCurrent: !!step.isCurrent,
      summary: [
        lintedL1(`這段時期（${label}）你會偏向受「${top}」能量帶動，行動與判斷較常沿此軸展開。`),
        lintedL1(`「${low}」面向在此期占比相對較低，常見需要留意補位或向外借力。`),
      ],
    };
  });
}

// ─── ZiWei: 大限四化重算宮強 ────────────────────────────────────────────────

/**
 * 用「該大限 mutagen」取代生年四化，重算 12 宮強度雷達。
 * 公式同 `ziwei_palace_strength`：主星亮度×0.6＋min(輔星×10,100)×0.2＋加成×0.2，
 * 加成 = 宮內含該大限四化星 → 100，否則 0。
 *
 * @param palaceComponents - ziwei `palaces` components
 */
export function buildDaXianPalaceRadar(palaceComponents: Record<string, any>[], daXianValue: { index: number; mutagen: string[] }, title: string): Radar {
  const mutagenStars = new Set(daXianValue.mutagen ?? []);

  return {
    id: `ziwei_palace_strength_daxian_${daXianValue.index}`,
    system: 'ziwei',
    title,
    kind: 'radar',
    axes: palaceComponents.map((palace) => {
      const { index, name, majorStars = [], minorStars = [], adjectiveStars = [] } = palace.value ?? {};

      const brightnessScores = majorStars
        .map((star: { brightnessScore: number | null }) => star.brightnessScore)
        .filter((score: unknown): score is number => typeof score === 'number');
      const mainStarBrightness = brightnessScores.length > 0
        ? round2(Math.max(...brightnessScores) * 100)
        : 0;

      const auxiliaryStarCount = minorStars.length;

      const hasDecadalMutagen = [...majorStars, ...minorStars, ...adjectiveStars]
        .some((star) => mutagenStars.has(star.name));
      const fourTransformBonus = hasDecadalMutagen ? 100 : 0;

      const value = round2(
        mainStarBrightness * 0.6
        + Math.min(auxiliaryStarCount * 10, 100) * 0.2
        + fourTransformBonus * 0.2,
      );

      return {
        key: `palace_${index}`,
        label: name,
        value,
        unit: '分',
        ruleId: 'ziwei_palace_strength',
        inputs: { mainStarBrightness, auxiliaryStarCount, fourTransformBonus },
        ...getAxisNotes('ziwei_palace_strength', name),
      };
    }),
  };
}

/**
 * 推導出生年：優先用 bazi 大運（startYear − startAge + 1，虛歲口徑），
 * 其次用 ziwei 小限（asOf 年 − 虛歲 + 1）。推不出時回傳 null。
 */
function deriveBirthYear(baziResult: SystemResult | null, ziweiResult: SystemResult | null): number | null {
  const daYun = baziResult ? findComponents(baziResult, 'daYun')[0]?.value : null;
  if (daYun && Number.isFinite(daYun.startYear) && Number.isFinite(daYun.startAge)) {
    return daYun.startYear - daYun.startAge + 1;
  }
  const xiaoXian = ziweiResult ? findComponents(ziweiResult, 'xiaoXian')[0]?.value : null;
  if (xiaoXian && Number.isFinite(xiaoXian.nominalAge) && typeof xiaoXian.asOf === 'string') {
    return Number(xiaoXian.asOf.slice(0, 4)) - xiaoXian.nominalAge + 1;
  }
  return null;
}

function buildZiweiPeriods(ziweiResult: SystemResult, birthYear: number | null): Period[] {
  const palaces = findComponents(ziweiResult, 'palaces');
  if (palaces.length === 0 || birthYear == null) return [];

  const daXianSteps = findComponents(ziweiResult, 'daXian')
    .map((c) => c.value)
    .filter((v) => v && Array.isArray(v.range))
    .sort((a, b) => a.range[0] - b.range[0]);

  return daXianSteps.map((step) => {
    const [startAge, endAge] = step.range;
    const startYear = birthYear + startAge - 1; // 虛歲→年度（nominal-year-age）
    const endYear = birthYear + endAge - 1;
    const label = `${startYear}–${endYear} ${step.heavenlyStem}${step.earthlyBranch}大限（${step.palaceName}）`;
    const radar = buildDaXianPalaceRadar(palaces, step, `${step.heavenlyStem}${step.earthlyBranch}大限十二宮力量`);
    const { top } = topAndLow(radar);
    const [lu, , , ji] = step.mutagen ?? [];
    const mutagenLine = lu && ji
      ? `此大限四化以「${lu}」化祿、「${ji}」化忌為軸，常見相應領域的得失轉換。`
      : '此大限四化資料不足，宮強僅反映主星亮度與輔星配置。';
    return {
      system: 'ziwei',
      label,
      range: [startYear, endYear],
      radar,
      isCurrent: !!step.isCurrent,
      summary: [
        lintedL1(`這段時期（${label}）你會偏向把重心放在「${top}」相關的課題上。`),
        lintedL1(mutagenLine),
      ],
    };
  });
}

// ─── EvolutionCalculator ────────────────────────────────────────────────────

/**
 * 時期演化計算器。全部為靜態純函數，無內部狀態。
 */
export class EvolutionCalculator {
  /**
   * 由引擎結果組出全部時期與整體演化敘事。
   *
   * 缺引擎（或缺序列部件）時只產出可支撐的 periods，不編造；
   * 兩系統皆缺時回傳空 periods 與空字串 narrative。
   *
   * @param systemResults - Engine outputs from analyze()
   * @param options.asOf - (default null) 評估基準日（僅用於敘事中標註當前時期）
   */
  static calculate(systemResults: SystemResult[], { asOf = null }: { asOf?: string | null } = {}): { periods: Period[]; narrative: string } {
    const results = Array.isArray(systemResults) ? systemResults : [];
    const byEngine = new Map(results.map((result) => [result?.engineId, result]));
    const bazi = byEngine.get('bazi') ?? null;
    const ziwei = byEngine.get('ziwei') ?? null;

    const baziPeriods = bazi ? buildBaziPeriods(bazi) : [];
    const ziweiPeriods = ziwei ? buildZiweiPeriods(ziwei, deriveBirthYear(bazi, ziwei)) : [];
    const periods = [...baziPeriods, ...ziweiPeriods];

    return { periods, narrative: buildNarrative(baziPeriods, ziweiPeriods, asOf) };
  }
}

/**
 * 整體演化敘事（一段，過 L1 lint）。
 */
function buildNarrative(baziPeriods: Period[], ziweiPeriods: Period[], asOf: string | null): string {
  if (baziPeriods.length === 0 && ziweiPeriods.length === 0) return '';

  const parts = [];
  if (baziPeriods.length > 0) {
    parts.push(`八字大運：${summarizeDominantRuns(baziPeriods, '步')}`);
  }
  if (ziweiPeriods.length > 0) {
    parts.push(`紫微大限：${summarizeDominantRuns(ziweiPeriods, '限')}`);
  }
  const asOfNote = asOf ? `以 ${asOf} 為基準日觀察，` : '';
  return lintedL1(
    `${asOfNote}${parts.join('；')}。這些是隨十年尺度推移的時期性傾向，會隨階段切換而改變，並非固定不變的性格判決；每張時期雷達的軸值都可由其計分規則與輸入值覆核。`,
  );
}

/** Merge consecutive periods that share the same dominant axis. */
function summarizeDominantRuns(periods: Period[], unit: string): string {
  const runs: { top: string; start: number; end: number; count: number }[] = [];
  for (const period of periods) {
    const top = topAndLow(period.radar).top;
    const previous = runs[runs.length - 1];
    if (previous?.top === top && previous.end + 1 >= period.range[0]) {
      previous.end = period.range[1];
      previous.count += 1;
    } else {
      runs.push({ top, start: period.range[0], end: period.range[1], count: 1 });
    }
  }

  if (runs.length === 1) {
    const run = runs[0];
    return `${run.start}–${run.end} 共 ${run.count} ${unit}皆以「${run.top}」為重心`;
  }
  return runs
    .map(run => `${run.start}–${run.end} ${run.count} ${unit}以「${run.top}」為重心`)
    .join('，其後 ');
}
