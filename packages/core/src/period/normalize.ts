import { parseIsoDate } from '../core/calendar';
import { canonicalZoneName } from '../time/tzdb/index';
import { resolveWallTime } from '../time/zone';
import type { PeriodOverlapChoice } from './types';

/** No Intl fallback: the accepted zone set is fixed by the bundled tzdb. */
export function normalizePeriodTimezone(timezone: string): string {
  if (typeof timezone !== 'string' || timezone.length === 0) throw new Error('NativePeriod requires a timezone');
  const canonical = canonicalZoneName(timezone);
  if (!canonical) throw new Error(`NativePeriod timezone is not in bundled tzdb: ${timezone}`);
  return canonical;
}

/**
 * Strict, offset-qualified timestamps, up to millisecond precision. Date-only,
 * zone-less, rollover dates, leap seconds and sub-millisecond loss are rejected.
 * Uses the existing Gregorian date domain (years 0100–9999).
 */
export function normalizePeriodInstant(value: string): string {
  if (typeof value !== 'string') throw new Error('NativePeriod instant must be a string');
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) throw new Error(`NativePeriod requires an offset-qualified instant: ${value}`);
  const { year, month, day } = parseIsoDate(match[1]);
  const hour = Number(match[2]), minute = Number(match[3]), second = Number(match[4]);
  const millis = Number((match[5] ?? '').padEnd(3, '0'));
  if (hour > 23 || minute > 59 || second > 59) throw new Error(`Invalid NativePeriod clock time: ${value}`);
  const offset = match[6]!;
  const offsetHours = offset === 'Z' ? 0 : Number(offset.slice(1, 3));
  const offsetMinutes = offset === 'Z' ? 0 : Number(offset.slice(4, 6));
  if (offsetHours > 23 || offsetMinutes > 59) throw new Error(`Invalid NativePeriod offset: ${value}`);
  const sign = offset.startsWith('-') ? -1 : 1;
  const ms = Date.UTC(year, month - 1, day, hour, minute, second, millis)
    - sign * (offsetHours * 60 + offsetMinutes) * 60000;
  const result = new Date(ms);
  if (result.getUTCFullYear() < 100 || result.getUTCFullYear() > 9999) {
    throw new Error('NativePeriod UTC instant is outside years 0100–9999');
  }
  return result.toISOString();
}

/**
 * Resolve a civil date's midnight through bundled tzdb, not UTC or host time.
 * A missing midnight is rejected rather than shifted to a different clock/day.
 * Repeated midnight requires the caller to select earlier/later explicitly.
 * Adapters needing another boundary convention must handle it explicitly.
 */
export function dateBoundaryInstant(date: string, timezone: string, overlap?: PeriodOverlapChoice): string {
  if (typeof date !== 'string') throw new Error('NativePeriod date must be a string');
  const { year, month, day } = parseIsoDate(date);
  const canonical = normalizePeriodTimezone(timezone);
  if (overlap !== undefined && overlap !== 'earlier' && overlap !== 'later') {
    throw new Error('NativePeriod overlap choice must be earlier or later');
  }
  const resolution = resolveWallTime(canonical, Date.UTC(year, month - 1, day), overlap);
  if (resolution.kind === 'gap') throw new Error(`NativePeriod date boundary is nonexistent: ${date} in ${canonical}`);
  if (resolution.kind === 'overlap' && overlap === undefined) {
    throw new Error(`NativePeriod date boundary is ambiguous; choose earlier or later: ${date} in ${canonical}`);
  }
  return normalizePeriodInstant(new Date(resolution.utcMs).toISOString());
}
