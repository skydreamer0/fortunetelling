/**
 * @fileoverview Bridge from the V2 {@link TimeContext} to the v1 engine inputs.
 *
 * V1-03 introduces calculators as an ADAPTER layer over the existing engines,
 * with zero behaviour change. The engines still take a legacy `BirthData`, so
 * `timeContextToBirthData` rebuilds exactly the BirthData that `analyze()` would
 * build from the equivalent raw input (`{ year, month, day, hour, minute, … }`):
 *
 * - date/hour/minute come from the LOCAL CIVIL wall time of the birthplace
 *   (`ctx.local.iso`), NOT from true solar time. The engines themselves treat
 *   that wall time as Asia/Taipei civil time. Switching BaZi/Ziwei to true
 *   solar time was V1-04/05's job; since Report v4 (D-032) `analyze()` runs
 *   八字／紫微 on the TimeContext (`core/timeContextEngines`), so only the
 *   numerology / tzolkin / mingGua adapters stay byte-identical to `analyze()`
 *   by default (八字 with `useTrueSolarTime: false`, 紫微 = ziweiCalculator).
 * - time unknown → `hour: 12, minute: 0, timeKnown: false` (what the web intake
 *   sends); the time-dependent engines then skip their charts on their own.
 * - longitude/latitude come from the birthplace (the engines do not read them yet).
 *
 * Also hosts the small helpers every adapter shares (asOf normalisation,
 * component lookup, TimeContext-flag → warning mapping).
 *
 * @module calculators/birthData
 */

import { BirthData } from '../core/models/BirthData.js';
import type { TimeContext, TimeFlag } from '../time/types';
import type { CalculatorWarningCode, Component } from './types';

const LOCAL_ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

/**
 * Build the legacy BirthData for a TimeContext (see module doc for the
 * conventions that keep engine outputs byte-identical).
 *
 * @param ctx    TimeContext from `createTimeContext`.
 * @param extras `name` overrides `ctx.profile.name` (numerology's name numbers).
 */
export function timeContextToBirthData(ctx: TimeContext, extras: { name?: string } = {}): BirthData {
  const { profile } = ctx;
  const name = extras.name ?? profile.name ?? '';
  const common = {
    longitude: profile.birthplace.lng,
    latitude: profile.birthplace.lat,
    gender: profile.gender,
    name,
  };

  if (ctx.local === null) {
    const [year, month, day] = profile.date.split('-').map(Number);
    return new BirthData({ year, month, day, hour: 12, minute: 0, timeKnown: false, ...common });
  }

  // `local.iso` is the resolved civil wall time (equals profile date/time except
  // for a DST gap, where the non-existent time was shifted forward and flagged).
  const m = LOCAL_ISO.exec(ctx.local.iso);
  if (!m) throw new Error(`Unexpected TimeContext.local.iso: ${ctx.local.iso}`);
  const [year, month, day, hour, minute] = m.slice(1, 6).map(Number);
  return new BirthData({ year, month, day, hour, minute, timeKnown: true, ...common });
}

/**
 * Normalise `asOf` exactly as `analyze()` → `createEngines()` does: a Date for
 * the Ziwei/Numerology engines and its UTC 'YYYY-MM-DD' for BaZi.
 * Throws when missing or invalid — calculators never read the clock (D-014).
 */
export function normalizeAsOf(asOf: string | Date | undefined, system: string): { date: Date; ymd: string } {
  if (asOf === undefined || asOf === null || asOf === '') {
    throw new TypeError(`${system} calculator requires config.asOf (D-014: no implicit "today")`);
  }
  const date = new Date(asOf);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Invalid asOf date: ${String(asOf)}`);
  }
  return { date, ymd: date.toISOString().slice(0, 10) };
}

/** Value of the component with `id`, or null when the engine did not emit it. */
export function componentValue<T>(components: readonly Component[], id: string): T | null {
  const found = components.find((c) => c.id === id);
  return found ? (found.value as T) : null;
}

/** Values of every component in `category`, in engine order. */
export function categoryValues<T>(components: readonly Component[], category: string): T[] {
  return components.filter((c) => c.category === category).map((c) => c.value as T);
}

/**
 * Map TimeContext flags to warning codes relevant to a civil-time calculator.
 * Shichen / zi-hour flags only count when they hit on the CIVIL clock, since
 * that is the clock the adapted engines use (true-solar hits arrive in V1-04/05).
 */
export function flagWarnings(ctx: TimeContext, relevant: readonly CalculatorWarningCode[]): string[] {
  const out: string[] = [];
  for (const flag of ctx.flags as TimeFlag[]) {
    const code = flag.code as CalculatorWarningCode;
    if (!relevant.includes(code)) continue;
    if (flag.code === 'near_shichen_boundary' && !flag.data.hits.some((h) => h.basis === 'civil')) continue;
    if (flag.code === 'zi_hour_convention' && !flag.data.bases.includes('civil')) continue;
    out.push(code);
  }
  return out;
}
