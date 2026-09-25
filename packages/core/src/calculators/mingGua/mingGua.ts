/**
 * @fileoverview 八宅命卦 (Ming Gua / Kua number) — pure calculator core.
 *
 * ## Year boundary
 * The 命卦 year is the *solar* year, which starts at the exact 立春 instant
 * (sun at ecliptic longitude 315°), not on Jan 1 and not on a fixed Feb 4.
 * Instants come from `time/solarTerms.ts` (lunar-javascript, converted to UTC;
 * D-026 / D-031). An instant exactly at 立春 already belongs to the new year
 * (same convention as `prevNextTerm`). This replaces the Feb-4 approximation
 * recorded in D-017.
 *
 * ## Formula (millennium-corrected, identical to the legacy MingGuaEngine)
 *   d = digit-sum of (solarYear mod 100), repeated until a single digit
 *       (year 2000 → "0" → d = 0)
 *   solarYear <  2000: male kua = 10 − d, female kua = d + 5
 *   solarYear >= 2000: male kua =  9 − d, female kua = d + 6
 *   then: kua > 9 → kua − 9; kua = 0 → 9;
 *   kua = 5 (central palace, no trigram) → male 2 (坤), female 8 (艮).
 *
 * Pure and deterministic: no clock, no IO. Results for 立春 are memoised per
 * year (a pure cache).
 * @module calculators/mingGua/mingGua
 */

import { solarTermsAround } from '../../time/solarTerms';

export type MingGuaGender = 'male' | 'female';
/** Kua numbers after the central-5 remap. */
export type MingGuaNumber = 1 | 2 | 3 | 4 | 6 | 7 | 8 | 9;

/** Identifier of the year-boundary convention used by this module. */
export const MING_GUA_YEAR_BOUNDARY = 'liChun-exact' as const;

const HOUR_MS = 3_600_000;
const CST_OFFSET_MS = 8 * HOUR_MS;

const liChunCache = new Map<number, number>();

/**
 * UTC ms of the 立春 that falls in Gregorian `year` (China Standard Time
 * calendar year; 立春 is always around Feb 3–5, far from Jan 1, so the zone
 * choice here never changes which year it belongs to).
 */
export function liChunUtcMs(year: number): number {
  if (!Number.isInteger(year)) throw new TypeError(`year must be an integer, got ${year}`);
  const cached = liChunCache.get(year);
  if (cached !== undefined) return cached;
  const terms = solarTermsAround(Date.UTC(year, 5, 1));
  const hit = terms.find(
    (t) => t.name === '立春' && new Date(t.utcMs + CST_OFFSET_MS).getUTCFullYear() === year,
  );
  if (!hit) throw new RangeError(`no 立春 found for year ${year}`);
  liChunCache.set(year, hit.utcMs);
  return hit.utcMs;
}

/**
 * Solar (立春-based) year of an instant: the Gregorian year if the instant is at
 * or after that year's exact 立春, otherwise the previous year.
 */
export function mingGuaSolarYear(utcMs: number): number {
  if (!Number.isFinite(utcMs)) throw new TypeError(`utcMs must be finite, got ${utcMs}`);
  const year = new Date(utcMs + CST_OFFSET_MS).getUTCFullYear();
  return utcMs >= liChunUtcMs(year) ? year : year - 1;
}

/** Repeated digit sum of a non-negative integer down to one digit (0 stays 0). */
export function reduceToSingleDigit(n: number): number {
  let sum = String(Math.abs(n))
    .split('')
    .reduce((acc, ch) => acc + Number(ch), 0);
  while (sum > 9) {
    sum = String(sum)
      .split('')
      .reduce((acc, ch) => acc + Number(ch), 0);
  }
  return sum;
}

/** Kua number for a solar year and gender (see module docs for the formula). */
export function mingGuaNumber(solarYear: number, gender: MingGuaGender): MingGuaNumber {
  if (!Number.isInteger(solarYear)) throw new TypeError(`solarYear must be an integer, got ${solarYear}`);
  if (gender !== 'male' && gender !== 'female') throw new TypeError(`gender must be 'male' or 'female', got ${gender}`);
  const d = reduceToSingleDigit(solarYear % 100);
  let kua =
    solarYear < 2000 ? (gender === 'male' ? 10 - d : d + 5) : gender === 'male' ? 9 - d : d + 6;
  if (kua > 9) kua -= 9;
  if (kua === 0) kua = 9;
  if (kua === 5) kua = gender === 'male' ? 2 : 8;
  return kua as MingGuaNumber;
}

export type MingGuaInstantResult = {
  solarYear: number;
  guaNumber: MingGuaNumber;
  /** UTC ms of the 立春 that starts `solarYear`. */
  liChunUtcMs: number;
  yearBoundary: typeof MING_GUA_YEAR_BOUNDARY;
};

/** Solar year + kua number of a birth instant. */
export function mingGuaFromInstant(utcMs: number, gender: MingGuaGender): MingGuaInstantResult {
  const solarYear = mingGuaSolarYear(utcMs);
  return {
    solarYear,
    guaNumber: mingGuaNumber(solarYear, gender),
    liChunUtcMs: liChunUtcMs(solarYear),
    yearBoundary: MING_GUA_YEAR_BOUNDARY,
  };
}

/**
 * Instant of a civil wall time at a fixed UTC offset (minutes east of UTC).
 * Used by the legacy engine, whose BirthData has no zone and is read as UTC+8.
 */
export function fixedOffsetCivilToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  offsetMinutes: number,
): number {
  return Date.UTC(year, month - 1, day, hour, minute) - offsetMinutes * 60_000;
}
