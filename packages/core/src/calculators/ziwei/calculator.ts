/**
 * @fileoverview 紫微斗數 calculator — adapter over the v1 `ZiweiEngine` (V1-03).
 *
 * Behaviour is exactly the engine's: iztro `bySolar` on the local civil date,
 * `timeIndex` from the civil hour (no true solar time yet — V1-05), zh-TW.
 * The typed chart only re-shapes what the engine already emits; fields listed
 * in ARCHITECTURE-V2 §4.1 that the engine does not expose yet (流月序列 etc.)
 * are absent rather than recomputed here.
 *
 * @module calculators/ziwei/calculator
 */

import { ZiweiEngine } from '../../engines/ZiweiEngine.js';
import type { TimeContext } from '../../time/types';
import { categoryValues, componentValue, flagWarnings, normalizeAsOf, timeContextToBirthData } from '../birthData';
import type { Calculator, CalculatorConfig, ChartResult, Component } from '../types';

export type ZiweiMutagen = '祿' | '權' | '科' | '忌';

export interface ZiweiStar {
  name: string;
  /** iztro star type ('major' | 'soft' | 'tough' | 'adjective' | …). */
  type: string;
  /** 廟旺得利平不陷, '' when none. */
  brightness: string;
  brightnessScore: number | null;
  mutagen: ZiweiMutagen | null;
}

/** 生年四化 landing on a star. */
export interface ZiweiTransformation {
  star: string;
  mutagen: ZiweiMutagen;
}

export interface ZiweiPalace {
  /** iztro palace index 0–11 (0 = 寅). */
  index: number;
  /** Palace name, e.g. '命宮'. */
  name: string;
  stem: string;
  branch: string;
  isBodyPalace: boolean;
  isOriginalPalace: boolean;
  majorStars: ZiweiStar[];
  minorStars: ZiweiStar[];
  adjectiveStars: ZiweiStar[];
  /** 生年四化 on any star in this palace. */
  transformations: ZiweiTransformation[];
  /** 大限虛歲 [start, end]. */
  decadeRange: [number, number] | null;
}

export interface ZiweiPalaceRef {
  index: number;
  name: string;
  branch: string;
}

export interface ZiweiNatalTransformation extends ZiweiTransformation {
  palace: string;
  palaceIndex: number;
}

/** One 大限 (engine `daXian_n`). */
export interface ZiweiDecade {
  index: number;
  palaceIndex: number;
  palaceName: string;
  range: [number, number];
  stem: string;
  branch: string;
  /** 大限四化 stars in 祿權科忌 order, null if the probe failed. */
  mutagen: string[] | null;
  isCurrent: boolean;
}

/** 流年 at asOf (engine `flyingStars_yearly`). */
export interface ZiweiYearly {
  stem: string;
  branch: string;
  mutagen: string[];
  palaceIndex: number;
  asOf: string;
}

export interface ZiweiChart {
  /** 12 palaces in iztro order; empty when the time is unknown. */
  palaces: ZiweiPalace[];
  soulPalace: ZiweiPalaceRef | null;
  bodyPalace: ZiweiPalaceRef | null;
  /** 五行局, e.g. '水二局'. */
  fiveElementBureau: string | null;
  /** 命主. */
  soulMaster: string | null;
  /** 身主. */
  bodyMaster: string | null;
  natalTransformations: ZiweiNatalTransformation[];
  decades: ZiweiDecade[];
  yearly: ZiweiYearly | null;
}

export const ZIWEI_CALCULATOR_VERSION = '0.1.0';

const TIME_WARNINGS = ['time_unknown', 'dst_gap', 'dst_overlap', 'near_shichen_boundary', 'zi_hour_convention'] as const;

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
export function extractZiweiChart(components: readonly Component[]): ZiweiChart {
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

export const ziweiCalculator: Calculator<ZiweiChart> = {
  id: 'ziwei',
  version: ZIWEI_CALCULATOR_VERSION,
  // location: the adapted engine ignores coordinates (civil time); V1-05 flips this.
  requires: { time: true, location: false, name: false },
  calculate(ctx: TimeContext, config: CalculatorConfig = {}): ChartResult<ZiweiChart> {
    const { date } = normalizeAsOf(config.asOf, 'ziwei');
    const birth = timeContextToBirthData(ctx, { name: config.name });
    // With timeKnown=false the engine itself returns no components (no guessing).
    const result = new ZiweiEngine({ asOf: date }).run(birth);
    const components = result.components as Component[];
    return {
      system: 'ziwei',
      version: ZIWEI_CALCULATOR_VERSION,
      chart: extractZiweiChart(components),
      components,
      warnings: [...flagWarnings(ctx, TIME_WARNINGS), ...result.errors],
    };
  },
};
