/**
 * @fileoverview BirthProfile validation. Pure: no clock, no IO.
 * @module profile/validate
 */

import type { BirthProfile, TimeAccuracy, ValidationResult } from './types';

export const TIME_ACCURACIES: readonly TimeAccuracy[] = Object.freeze([
  'exact',
  'approx15m',
  'approx1h',
  'unknown',
]);

/**
 * 支援的出生年份範圍（含端點）。lunar-javascript 的節氣表與 Espenak–Meeus ΔT
 * 在此範圍內皆有效；超出範圍的輸入視為錯誤而非靜默外推。
 */
export const SUPPORTED_YEAR_RANGE = Object.freeze({ min: 1800, max: 2200 });

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
/** 固定 offset 寫法（'+08:00'、'UTC+8'、'GMT-5'、'Etc/GMT-8'）一律拒收，只收 IANA 地區名。 */
const FIXED_OFFSET_RE = /^([+-]\d|(utc|gmt)\s*[+-]|etc\/gmt[+-])/i;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return days[month - 1];
}

/**
 * True when `Intl` accepts the zone as an IANA name (and it is not a fixed offset).
 */
export function isValidTimeZone(timezone: unknown): boolean {
  if (typeof timezone !== 'string' || timezone.trim() === '') return false;
  if (FIXED_OFFSET_RE.test(timezone)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Validate and normalise untrusted input into a {@link BirthProfile}.
 *
 * - `timeAccuracy` may be omitted: defaults to `'exact'` when `time` is given, `'unknown'` when `time` is null.
 * - `time === null` requires `timeAccuracy === 'unknown'` and vice versa (contradictions are errors).
 * - The returned profile is a fresh object containing only known keys.
 */
export function validateBirthProfile(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (input === null || typeof input !== 'object') {
    return { ok: false, errors: ['profile must be an object'] };
  }
  const raw = input as Record<string, unknown>;

  // date
  const date = raw.date;
  if (typeof date !== 'string' || !DATE_RE.test(date)) {
    errors.push(`date must be 'YYYY-MM-DD' (got ${JSON.stringify(date)})`);
  } else {
    const [, y, m, d] = DATE_RE.exec(date)!.map(Number);
    if (y < SUPPORTED_YEAR_RANGE.min || y > SUPPORTED_YEAR_RANGE.max) {
      errors.push(`date year ${y} outside supported range ${SUPPORTED_YEAR_RANGE.min}–${SUPPORTED_YEAR_RANGE.max}`);
    } else if (m < 1 || m > 12) {
      errors.push(`date month ${m} out of range 1–12`);
    } else if (d < 1 || d > daysInMonth(y, m)) {
      errors.push(`date ${date} does not exist`);
    }
  }

  // time + accuracy
  const time = raw.time === undefined ? null : raw.time;
  if (time !== null && (typeof time !== 'string' || !TIME_RE.test(time))) {
    errors.push(`time must be 'HH:mm' (00:00–23:59) or null (got ${JSON.stringify(raw.time)})`);
  }
  let timeAccuracy = raw.timeAccuracy as TimeAccuracy | undefined;
  if (timeAccuracy === undefined) {
    timeAccuracy = time === null ? 'unknown' : 'exact';
  } else if (!TIME_ACCURACIES.includes(timeAccuracy)) {
    errors.push(`timeAccuracy must be one of ${TIME_ACCURACIES.join(', ')}`);
  } else if (time === null && timeAccuracy !== 'unknown') {
    errors.push(`time is null so timeAccuracy must be 'unknown' (got '${timeAccuracy}')`);
  } else if (time !== null && timeAccuracy === 'unknown') {
    errors.push(`timeAccuracy 'unknown' requires time to be null`);
  }

  // gender
  if (raw.gender !== 'male' && raw.gender !== 'female') {
    errors.push(`gender must be 'male' or 'female'`);
  }

  // name
  if (raw.name !== undefined && typeof raw.name !== 'string') {
    errors.push('name must be a string when provided');
  }

  // birthplace
  const bp = raw.birthplace as Record<string, unknown> | undefined;
  if (bp === null || typeof bp !== 'object') {
    errors.push('birthplace must be an object { label, lat, lng, timezone }');
  } else {
    if (typeof bp.label !== 'string' || bp.label.trim() === '') {
      errors.push('birthplace.label must be a non-empty string');
    }
    if (!isFiniteNumber(bp.lat) || bp.lat < -90 || bp.lat > 90) {
      errors.push('birthplace.lat must be a number within [-90, 90]');
    }
    if (!isFiniteNumber(bp.lng) || bp.lng < -180 || bp.lng > 180) {
      errors.push('birthplace.lng must be a number within [-180, 180]');
    }
    if (!isValidTimeZone(bp.timezone)) {
      errors.push(`birthplace.timezone must be an IANA zone accepted by Intl (got ${JSON.stringify(bp.timezone)})`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const profile: BirthProfile = {
    date: date as string,
    time: time as string | null,
    timeAccuracy,
    gender: raw.gender as BirthProfile['gender'],
    birthplace: {
      label: (bp!.label as string).trim(),
      lat: bp!.lat as number,
      lng: bp!.lng as number,
      timezone: bp!.timezone as string,
    },
  };
  if (typeof raw.name === 'string') profile.name = raw.name;
  return { ok: true, profile };
}
