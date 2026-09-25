/**
 * @fileoverview 八字 calculator — adapter over the v1 `BaZiEngine` (V1-03).
 *
 * Behaviour is exactly the engine's: local civil wall time read as
 * Asia/Taipei, no true solar time, lunar-javascript sect=2 (see
 * `calculators/birthData`). The true-solar / ziHourConvention config of
 * ARCHITECTURE-V2 §3.4 arrives in V1-04 with a version bump.
 *
 * @module calculators/bazi/calculator
 */

import { BaZiEngine } from '../../engines/BaZiEngine.js';
import type { TimeContext } from '../../time/types';
import { categoryValues, componentValue, flagWarnings, normalizeAsOf, timeContextToBirthData } from '../birthData';
import type { Calculator, CalculatorConfig, ChartResult, Component } from '../types';

export type FiveElement = '木' | '火' | '土' | '金' | '水';

export interface BaziPillars {
  year: string;
  month: string;
  day: string;
  /** 時柱 (the engine's `time`). */
  hour: string;
}

export interface BaziDayMaster {
  stem: string;
  element: FiveElement;
  yinYang: '陽' | '陰';
}

/** One 大運 step, as the engine emits it (`daYun_1` … `daYun_10`). */
export interface BaziLuckCycle {
  index: number;
  ganZhi: string;
  startYear: number;
  endYear: number;
  /** Nominal (虛歲) starting age. */
  startAge: number;
  /** Whether asOf falls in this step. */
  isCurrent: boolean;
  ageConvention: string;
}

/** 流年 at asOf (year boundary = exact 立春). */
export interface BaziAnnual {
  year: number;
  ganZhi: string;
}

export interface BaziChart {
  /** null when the time is unknown or the engine failed. */
  pillars: BaziPillars | null;
  dayMaster: BaziDayMaster | null;
  /** 五行出現次數 (occurrence counts only, D-019), incl. hidden stems. */
  fiveElements: Record<FiveElement, number> | null;
  /** 十神出現次數, incl. hidden stems. */
  tenGods: Record<string, number> | null;
  luckCycles: BaziLuckCycle[];
  annual: BaziAnnual | null;
}

export const BAZI_CALCULATOR_VERSION = '0.1.0';

const TIME_WARNINGS = [
  'time_unknown',
  'dst_gap',
  'dst_overlap',
  'near_shichen_boundary',
  'near_jie_boundary',
  'zi_hour_convention',
] as const;

/** Typed view of the engine components. */
export function extractBaziChart(components: readonly Component[]): BaziChart {
  const natal = componentValue<{ year: string; month: string; day: string; time: string }>(components, 'natal');
  const elements = componentValue<{ counts: Record<FiveElement, number> }>(components, 'elements');
  const tenGods = componentValue<{ counts: Record<string, number> }>(components, 'ten_gods');
  return {
    pillars: natal ? { year: natal.year, month: natal.month, day: natal.day, hour: natal.time } : null,
    dayMaster: componentValue<BaziDayMaster>(components, 'day_master'),
    fiveElements: elements ? { ...elements.counts } : null,
    tenGods: tenGods ? { ...tenGods.counts } : null,
    luckCycles: categoryValues<BaziLuckCycle>(components, 'daYun'),
    annual: componentValue<BaziAnnual>(components, 'liuNian'),
  };
}

export const baziCalculator: Calculator<BaziChart> = {
  id: 'bazi',
  version: BAZI_CALCULATOR_VERSION,
  // location: the adapted engine ignores coordinates (civil Taipei time); V1-04 flips this.
  requires: { time: true, location: false, name: false },
  calculate(ctx: TimeContext, config: CalculatorConfig = {}): ChartResult<BaziChart> {
    const { ymd } = normalizeAsOf(config.asOf, 'bazi');
    const birth = timeContextToBirthData(ctx, { name: config.name });
    // With timeKnown=false the engine itself returns no components (no guessing).
    const result = new BaZiEngine({ asOf: ymd }).run(birth);
    const components = result.components as Component[];
    return {
      system: 'bazi',
      version: BAZI_CALCULATOR_VERSION,
      chart: extractBaziChart(components),
      components,
      warnings: [...flagWarnings(ctx, TIME_WARNINGS), ...result.errors],
    };
  },
};
