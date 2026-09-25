/**
 * @fileoverview Calculator registry (ARCHITECTURE-V2 §4, V1-03).
 *
 * `runCalculators` runs every registered calculator against one TimeContext in
 * the fixed `CALCULATORS` order (bazi, ziwei, numerology, tzolkin, mingGua —
 * the same system order as `analyze()`'s engines). Pure: `asOf` is required.
 *
 * @module calculators
 */

import type { TimeContext } from '../time/types';
import { baziCalculator, type BaziChart } from './bazi/calculator';
import { mingGuaCalculator, type MingGuaChart } from './mingGua/calculator';
import { numerologyCalculator, type NumerologyChart } from './numerology/calculator';
import { tzolkinCalculator, type TzolkinChart } from './tzolkin/calculator';
import type { Calculator, ChartResult } from './types';
import { ziweiCalculator, type ZiweiChart } from './ziwei/calculator';

export type * from './types';
export type * from './bazi/calculator';
export type * from './ziwei/calculator';
export type * from './numerology/calculator';
export type * from './tzolkin/calculator';
export type * from './mingGua/calculator';
export { timeContextToBirthData } from './birthData';
export { baziCalculator, extractBaziChart, pillarStats, toBaziRuleChart, BAZI_CALCULATOR_VERSION } from './bazi/calculator';
export type { BaziRuleChartWithSequence, ToBaziRuleChartOptions } from './bazi/ruleChart';
export {
  computePillars,
  luckCycles,
  annualPillars,
  monthlyPillars,
  yearMonthAt,
  liChunUtcMs,
  solarYearOfAsOf,
} from './bazi/pillars';
export { ziweiCalculator, extractZiweiChart, ZIWEI_CALCULATOR_VERSION } from './ziwei/calculator';
export { numerologyCalculator, extractNumerologyChart, NUMEROLOGY_CALCULATOR_VERSION } from './numerology/calculator';
export { tzolkinCalculator, extractTzolkinChart, TZOLKIN_CALCULATOR_VERSION } from './tzolkin/calculator';
export { mingGuaCalculator, extractMingGuaChart, MINGGUA_CALCULATOR_VERSION } from './mingGua/calculator';

export type AnyChart = BaziChart | ZiweiChart | NumerologyChart | TzolkinChart | MingGuaChart;

/** Registered calculators, in fixed run order. */
export const CALCULATORS: readonly Calculator<AnyChart>[] = Object.freeze([
  baziCalculator,
  ziweiCalculator,
  numerologyCalculator,
  tzolkinCalculator,
  mingGuaCalculator,
] as Calculator<AnyChart>[]);

export interface RunCalculatorsOptions {
  /** Evaluation date ('YYYY-MM-DD' or Date). Required (D-014). */
  asOf: string | Date;
  /** Name override (defaults to `ctx.profile.name`). */
  name?: string;
}

/** Run every calculator; one ChartResult per calculator, in `CALCULATORS` order. */
export function runCalculators(ctx: TimeContext, { asOf, name }: RunCalculatorsOptions): ChartResult<AnyChart>[] {
  return CALCULATORS.map((calc) => calc.calculate(ctx, name === undefined ? { asOf } : { asOf, name }));
}
