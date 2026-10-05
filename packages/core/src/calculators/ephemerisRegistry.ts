/**
 * @fileoverview Ephemeris-backed calculators (M5-03, D-039): the systems that need the Swiss
 * Ephemeris WASM and therefore cannot run inside the synchronous `CALCULATORS` / `analyze()`.
 *
 * Sync / async boundary:
 *   - `CALCULATORS`, `runCalculators`, `analyze()`           SYNC, no ephemeris: bazi, ziwei, numerology, tzolkin, mingGua.
 *   - `EPHEMERIS_CALCULATORS`, `runEphemerisCalculators`     ASYNC (`initEphemeris()` first): humanDesign, jyotish.
 *   - `buildTimeline` (sync) skips these systems, reporting `ephemeris_not_initialised` in `skippedSystems`; `buildTimelineAsync` includes them.
 * Report v5 and its golden outputs only contain the sync systems; the ephemeris systems appear through the
 * async timeline, the MCP server and the export bundle.
 *
 * `verified` follows D-039: humanDesign passed the gate (38 cases against two public generators, M5-01);
 * jyotish is still `experimental`. `EXPERIMENTAL_SYSTEMS` (portable/versions) is derived from the same fact.
 *
 * @module calculators/ephemerisRegistry
 */

import type { TimeContext } from '../time/types';
import { initEphemeris } from './astro/index';
import { humanDesignCalculator } from './humanDesign/calculator';
import { jyotishCalculator } from './jyotish/calculator';
import type { Calculator, ChartResult } from './types';
import type { RunCalculatorsOptions } from './index';

export interface EphemerisCalculatorEntry {
  calculator: Calculator<unknown>;
  /** D-039: false = `experimental`; excluded from "high consensus" and caveated everywhere. */
  verified: boolean;
}

/** Ephemeris calculators in fixed run order. */
export const EPHEMERIS_CALCULATORS: readonly EphemerisCalculatorEntry[] = Object.freeze([
  { calculator: humanDesignCalculator as Calculator<unknown>, verified: true },
  { calculator: jyotishCalculator as Calculator<unknown>, verified: false },
]);

/** `await initEphemeris()`, then run every ephemeris calculator (one ChartResult each, registry order). */
export async function runEphemerisCalculators(
  ctx: TimeContext,
  { asOf, name }: RunCalculatorsOptions,
): Promise<ChartResult<unknown>[]> {
  await initEphemeris();
  return EPHEMERIS_CALCULATORS.map(({ calculator }) =>
    calculator.calculate(ctx, name === undefined ? { asOf } : { asOf, name }));
}
