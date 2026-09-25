/**
 * @fileoverview 紫微斗數 calculator on TimeContext (V1-05).
 *
 * - Time: true solar time by default (`useTrueSolarTime`), mapped to the iztro
 *   (date, timeIndex) pair by `astrolabe.ts#timeIndexFrom`; 子時 convention via
 *   `ziHourConvention` (ARCHITECTURE-V2 §3.4). Alternatives (時辰交界、早晚子、
 *   民用時) are charted too and listed in `chart.alternatives` (D-026 兩盤並算).
 * - `components`: still serialised by the v1 `ZiweiEngine` (single source of the
 *   component shape), fed the resolved (date, timeIndex). With
 *   `useTrueSolarTime: false` and a birth outside 23:00–24:00 they are
 *   byte-identical to the engine inside `analyze()`.
 * - `chart`: natal part from the iztro astrolabe (typed), plus 三方四正 index,
 *   precise 大限 spans, 流年 (asOf lunar year −1 … +9) and 流月 (asOf lunar year).
 *
 * Warnings: TimeContext boundary flags that hit on the clock actually used,
 * `palace_differs_from_civil` when true solar time gives another (date,
 * timeIndex) than the civil clock, then engine messages.
 *
 * @module calculators/ziwei/calculator
 */

import { BirthData } from '../../core/models/BirthData.js';
import { ZiweiEngine } from '../../engines/ZiweiEngine.js';
import type { TimeBasis, TimeContext } from '../../time/types';
import { categoryValues, componentValue, normalizeAsOf, timeContextToBirthData } from '../birthData';
import type { Calculator, CalculatorConfig, ChartResult, Component } from '../types';
import {
  birthLunarYearOf,
  createAstrolabe,
  decadeSequence,
  lunarYearOf,
  monthlySequence,
  natalChart,
  timeIndexFrom,
  yearlySequence,
} from './astrolabe';
import type {
  ZiweiZiHourConvention,
  ZiweiChart,
  ZiweiDecade,
  ZiweiEngineChart,
  ZiweiMutagen,
  ZiweiNatalTransformation,
  ZiweiPalace,
  ZiweiPalaceRef,
  ZiweiStar,
  ZiweiTimeResolution,
} from './types';

export type * from './types';

export const ZIWEI_CALCULATOR_VERSION = '1.0.0';

/** 流年 window around asOf: lunar years asOf−1 … asOf+9. */
export const ZIWEI_YEARLY_BEFORE = 1;
export const ZIWEI_YEARLY_COUNT = 11;

export interface ZiweiCalculatorConfig extends CalculatorConfig {
  /** Default true (ARCHITECTURE-V2 §3.4). */
  useTrueSolarTime?: boolean;
  /** Default 'splitMidnight'. */
  ziHourConvention?: ZiweiZiHourConvention;
}

type EnginePalace = {
  index: number;
  name: string;
  heavenlyStem: string;
  earthlyBranch: string;
  isBodyPalace: boolean;
  isOriginalPalace: boolean;
  decadalRange: [number, number] | null;
  majorStars: ZiweiStar[];
  minorStars: ZiweiStar[];
  adjectiveStars: ZiweiStar[];
};

type EngineNatal = { soul: string; body: string; fiveElementsClass: string };

type EngineDaXian = Omit<ZiweiDecade, 'stem' | 'branch'> & { heavenlyStem: string; earthlyBranch: string };

type EngineYearly = { heavenlyStem: string; earthlyBranch: string; mutagen: string[]; palaceIndex: number; asOf: string };

const ref = (p: ZiweiPalace | undefined): ZiweiPalaceRef | null =>
  p ? { index: p.index, name: p.name, branch: p.branch } : null;

/** Typed view of the engine components. */
export function extractZiweiChart(components: readonly Component[]): ZiweiEngineChart {
  const palaces: ZiweiPalace[] = categoryValues<EnginePalace>(components, 'palaces').map((p) => ({
    index: p.index,
    name: p.name,
    stem: p.heavenlyStem,
    branch: p.earthlyBranch,
    isBodyPalace: p.isBodyPalace,
    isOriginalPalace: p.isOriginalPalace,
    majorStars: p.majorStars,
    minorStars: p.minorStars,
    adjectiveStars: p.adjectiveStars,
    transformations: [...p.majorStars, ...p.minorStars, ...p.adjectiveStars]
      .filter((s) => s.mutagen)
      .map((s) => ({ star: s.name, mutagen: s.mutagen as ZiweiMutagen })),
    decadeRange: p.decadalRange,
  }));
  const natal = componentValue<EngineNatal>(components, 'natal_summary');
  const yearly = componentValue<EngineYearly>(components, 'flyingStars_yearly');
  return {
    palaces,
    // Same lookups the engine uses for its soulVsBody facet.
    soulPalace: ref(palaces.find((p) => p.name === '命宮')),
    bodyPalace: ref(palaces.find((p) => p.isBodyPalace)),
    fiveElementBureau: natal?.fiveElementsClass ?? null,
    soulMaster: natal?.soul ?? null,
    bodyMaster: natal?.body ?? null,
    natalTransformations: categoryValues<ZiweiNatalTransformation>(components, 'fourTransforms'),
    decades: categoryValues<EngineDaXian>(components, 'daXian').map(({ heavenlyStem, earthlyBranch, ...d }) => ({
      index: d.index,
      palaceIndex: d.palaceIndex,
      palaceName: d.palaceName,
      range: d.range,
      stem: heavenlyStem,
      branch: earthlyBranch,
      mutagen: d.mutagen,
      isCurrent: d.isCurrent,
    })),
    yearly: yearly
      ? {
          stem: yearly.heavenlyStem,
          branch: yearly.earthlyBranch,
          mutagen: yearly.mutagen,
          palaceIndex: yearly.palaceIndex,
          asOf: yearly.asOf,
        }
      : null,
  };
}

/**
 * BirthData whose iztro inputs (solar date, timeIndex) are the resolved ones.
 * ZiweiEngine reads only `solarDateStr`, `timeIndex`, `genderZh`, `year` and
 * `timeKnown`; the legacy getter cannot express 晚子 (timeIndex 12), hence the override.
 */
class ResolvedBirthData extends BirthData {
  #timeIndex: number;

  constructor(base: BirthData, time: ZiweiTimeResolution) {
    const [year, month, day] = time.date.split('-').map(Number);
    super({ ...base.toJSON(), year, month, day });
    this.#timeIndex = time.timeIndex;
  }

  get timeIndex(): number {
    return this.#timeIndex;
  }
}

const TIME_WARNINGS = ['time_unknown', 'dst_gap', 'dst_overlap', 'near_shichen_boundary', 'zi_hour_convention'] as const;

/** TimeContext flags → warning codes; shichen / 子時 flags only when they hit on `basis`. */
function flagWarnings(ctx: TimeContext, basis: TimeBasis): string[] {
  const out: string[] = [];
  for (const flag of ctx.flags) {
    if (!(TIME_WARNINGS as readonly string[]).includes(flag.code)) continue;
    if (flag.code === 'near_shichen_boundary' && !flag.data.hits.some((h) => h.basis === basis)) continue;
    if (flag.code === 'zi_hour_convention' && !flag.data.bases.includes(basis)) continue;
    out.push(flag.code);
  }
  return out;
}

const EMPTY_EXTRAS = {
  sanFangSiZheng: [],
  time: null,
  alternatives: [],
  birthLunarYear: null,
  decadeSequence: [],
  yearlySequence: [],
  monthlySequence: [],
} satisfies Omit<ZiweiChart, keyof ZiweiEngineChart>;

export const ziweiCalculator: Calculator<ZiweiChart, ZiweiCalculatorConfig> = {
  id: 'ziwei',
  version: ZIWEI_CALCULATOR_VERSION,
  // location: true solar time needs the birthplace longitude.
  requires: { time: true, location: true, name: false },
  calculate(ctx: TimeContext, config: ZiweiCalculatorConfig = {}): ChartResult<ZiweiChart> {
    const { date: asOfDate, ymd: asOfYmd } = normalizeAsOf(config.asOf, 'ziwei');
    const legacy = timeContextToBirthData(ctx, { name: config.name });
    const useTrueSolarTime = config.useTrueSolarTime ?? true;
    const time = timeIndexFrom(ctx, { useTrueSolarTime, ziHourConvention: config.ziHourConvention });

    if (time === null) {
      // With timeKnown=false the engine itself returns no components (no guessing).
      const result = new ZiweiEngine({ asOf: asOfDate }).run(legacy);
      const components = result.components as Component[];
      return {
        system: 'ziwei',
        version: ZIWEI_CALCULATOR_VERSION,
        chart: { ...extractZiweiChart(components), ...EMPTY_EXTRAS },
        components,
        warnings: [...flagWarnings(ctx, 'civil'), ...result.errors],
      };
    }

    const { alternatives, ...primary } = time;
    const result = new ZiweiEngine({ asOf: asOfDate }).run(new ResolvedBirthData(legacy, primary));
    const components = result.components as Component[];

    const gender = ctx.profile.gender;
    const astrolabe = createAstrolabe(primary.date, primary.timeIndex, gender);
    const natal = natalChart(astrolabe);
    const birthLunarYear = birthLunarYearOf(astrolabe);
    const asOfLunarYear = lunarYearOf(asOfYmd);

    const engineChart = extractZiweiChart(components);
    const chart: ZiweiChart = {
      ...engineChart,
      ...natal,
      // Keep the engine's decade/yearly views (component-backed) alongside the sequences.
      decades: engineChart.decades,
      yearly: engineChart.yearly,
      time: primary,
      alternatives: alternatives.map((alt) => ({
        ...natalChart(createAstrolabe(alt.date, alt.timeIndex, gender)),
        resolution: alt,
      })),
      birthLunarYear,
      decadeSequence: decadeSequence(astrolabe, birthLunarYear),
      yearlySequence: yearlySequence(astrolabe, asOfLunarYear - ZIWEI_YEARLY_BEFORE, ZIWEI_YEARLY_COUNT),
      monthlySequence: monthlySequence(astrolabe, asOfLunarYear),
    };

    const warnings = flagWarnings(ctx, primary.basis);
    if (alternatives.some((a) => a.reasons.includes('civil_time'))) warnings.push('palace_differs_from_civil');

    return {
      system: 'ziwei',
      version: ZIWEI_CALCULATOR_VERSION,
      chart,
      components,
      warnings: [...warnings, ...result.errors],
    };
  },
};
