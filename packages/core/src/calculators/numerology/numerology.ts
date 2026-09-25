/**
 * @fileoverview 生命靈數 (Pythagorean numerology) — pure, deterministic calculators.
 *
 * Every function here is a pure function of its arguments: no clock reads, no
 * I/O, no randomness (D-014). Dates are plain civil dates `{ year, month, day }`
 * (the birth-place civil date; see ARCHITECTURE-V2 §3).
 *
 * ## Reduction conventions (shared by every function below)
 *
 * - `reduce(n)`: repeatedly sum decimal digits until the result is 1–9, but
 *   STOP at the master numbers 11 / 22 / 33 (they are never reduced further).
 *   0 stays 0. This is byte-for-byte the same rule as
 *   `NumerologyEngine.reduceNumber`.
 * - `digit(n)`: full reduction to a single digit 0–9 (master numbers are
 *   reduced too: 11→2, 22→4, 33→6). Used where a method needs single digits
 *   (pinnacle age spans, challenge subtraction, pinnacle inputs).
 *
 * ## Life path: "reduce each part separately, then sum"
 *
 *   lifePath = reduce( reduce(year) + reduce(month) + reduce(day) )
 *
 * Each of year / month / day is reduced on its own (keeping a master number if
 * a part itself reduces to 11/22 — e.g. month 11, day 29→11, day 22), the three
 * are summed (that sum is `compound`), and the sum is reduced once more,
 * preserving 11/22/33. This matches the existing `NumerologyEngine` life-path
 * component exactly (it has always used this convention). Note that the
 * alternative "sum all digits of YYYYMMDD at once" convention can yield a
 * different compound and occasionally a different master/non-master result.
 *
 * @module calculators/numerology/numerology
 */

/** A civil calendar date. `month` is 1–12, `day` is 1–31. */
export interface CivilDate {
  year: number;
  month: number;
  day: number;
}

/** Life-path result. */
export interface LifePath {
  /** Reduced value: 1–9 or a master number 11/22/33. */
  value: number;
  /** Sum of the separately-reduced year, month and day, before final reduction. */
  compound: number;
  /** `'11/2'` style for master numbers, plain `'7'` otherwise. */
  display: string;
}

/** One pinnacle or challenge period. */
export interface NumerologyPeriod {
  /** 1–4. */
  index: number;
  /** Pinnacle: 1–9 or master 11/22/33. Challenge: 0–8. */
  number: number;
  /** Age (in completed years) at which the period begins. */
  startAge: number;
  /**
   * Age at which the period ends — the same age at which the next one begins
   * (exclusive boundary). `null` for the 4th period, which lasts for life.
   */
  endAge: number | null;
}

const MASTER_NUMBERS: ReadonlySet<number> = new Set([11, 22, 33]);

function sumDigits(n: number): number {
  let sum = 0;
  let rest = Math.abs(Math.trunc(n));
  while (rest > 0) {
    sum += rest % 10;
    rest = Math.floor(rest / 10);
  }
  return sum;
}

/**
 * Reduce to 1–9 by digit-summing, preserving master numbers 11/22/33.
 * Identical to `NumerologyEngine.reduceNumber`.
 */
export function reduce(n: number): number {
  while (n > 9 && !MASTER_NUMBERS.has(n)) n = sumDigits(n);
  return n;
}

/** Fully reduce to a single digit 0–9 (master numbers are reduced too). */
export function digit(n: number): number {
  while (n > 9) n = sumDigits(n);
  return n;
}

/** Whether `n` is a master number 11/22/33. */
export function isMaster(n: number): boolean {
  return MASTER_NUMBERS.has(n);
}

/** `'11/2'` for master numbers, `'7'` otherwise. */
export function displayNumber(n: number): string {
  return isMaster(n) ? `${n}/${digit(n)}` : String(n);
}

/**
 * 生命靈數 (life path). See the module doc for the convention.
 *
 * Example 1995-07-16: 1995→24→6, 7→7, 16→7; compound 6+7+7=20; 20→2 → `'2'`.
 */
export function calculateLifePath(date: CivilDate): LifePath {
  const compound = reduce(date.year) + reduce(date.month) + reduce(date.day);
  const value = reduce(compound);
  return { value, compound, display: displayNumber(value) };
}

/** 生日數: the birth day reduced, master numbers kept (29→11, 22→22, 16→7). */
export function calculateBirthdayNumber(date: CivilDate): number {
  return reduce(date.day);
}

/** 態度數: reduce( reduce(month) + reduce(day) ), master numbers kept. */
export function calculateAttitude(date: CivilDate): number {
  return reduce(reduce(date.month) + reduce(date.day));
}

/**
 * 個人流年數 for calendar `year`:
 *   reduce( reduce(month) + reduce(day) + reduce(year) ), master numbers kept.
 * Same convention as the engine's existing `personalYear` component.
 */
export function calculatePersonalYear(date: CivilDate, year: number): number {
  return reduce(reduce(date.month) + reduce(date.day) + reduce(year));
}

/** Personal-year numbers for `count` consecutive years starting at `fromYear`. */
export function calculatePersonalYears(
  date: CivilDate,
  fromYear: number,
  count: number,
): Record<number, number> {
  const out: Record<number, number> = {};
  for (let i = 0; i < count; i += 1) {
    const year = fromYear + i;
    out[year] = calculatePersonalYear(date, year);
  }
  return out;
}

/**
 * Age boundaries shared by pinnacles and challenges (standard Pythagorean):
 * the first period ends at 36 − (life path reduced to a single digit, so
 * 11→2, 22→4, 33→6); the 2nd and 3rd last 9 years each; the 4th lasts for life.
 */
function periodAges(date: CivilDate): Array<{ startAge: number; endAge: number | null }> {
  const firstEnd = 36 - digit(calculateLifePath(date).value);
  return [
    { startAge: 0, endAge: firstEnd },
    { startAge: firstEnd, endAge: firstEnd + 9 },
    { startAge: firstEnd + 9, endAge: firstEnd + 18 },
    { startAge: firstEnd + 18, endAge: null },
  ];
}

/** Single-digit month / day / year used as inputs for pinnacles and challenges. */
function digits(date: CivilDate): { m: number; d: number; y: number } {
  return { m: digit(date.month), d: digit(date.day), y: digit(date.year) };
}

/**
 * 巔峰數 (pinnacles), standard Pythagorean method. With M, D, Y the month, day
 * and year each reduced to a single digit:
 *   P1 = M + D,  P2 = D + Y,  P3 = P1 + P2,  P4 = M + Y
 * each result reduced with master numbers 11/22/33 preserved (P3 sums the
 * already-reduced P1 and P2). Ages: see {@link periodAges}.
 */
export function calculatePinnacles(date: CivilDate): NumerologyPeriod[] {
  const { m, d, y } = digits(date);
  const p1 = reduce(m + d);
  const p2 = reduce(d + y);
  const p3 = reduce(p1 + p2);
  const p4 = reduce(m + y);
  const ages = periodAges(date);
  return [p1, p2, p3, p4].map((number, i) => ({ index: i + 1, number, ...ages[i] }));
}

/**
 * 挑戰數 (challenges), standard method (absolute differences of single digits):
 *   C1 = |M − D|,  C2 = |D − Y|,  C3 = |C1 − C2|,  C4 = |M − Y|
 * Values are 0–8. Age spans are the same as the pinnacles'.
 */
export function calculateChallenges(date: CivilDate): NumerologyPeriod[] {
  const { m, d, y } = digits(date);
  const c1 = Math.abs(m - d);
  const c2 = Math.abs(d - y);
  const c3 = Math.abs(c1 - c2);
  const c4 = Math.abs(m - y);
  const ages = periodAges(date);
  return [c1, c2, c3, c4].map((number, i) => ({ index: i + 1, number, ...ages[i] }));
}
