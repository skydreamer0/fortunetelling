/**
 * @fileoverview IANA time-zone resolution via built-in `Intl` (tzdata; D-026:
 * no hand-written DST tables).
 *
 * "Naive ms" = milliseconds of a wall-clock reading as if it were UTC
 * (Date.UTC(y, m-1, d, h, mi, s)). It is only a convenient scalar for
 * wall-clock arithmetic, never an instant.
 * @module time/zone
 */

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      era: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

/** Wall-clock reading (as naive ms) of an instant in a zone. Second precision. */
export function wallNaiveMsAt(timeZone: string, utcMs: number): number {
  const parts: Record<string, string> = {};
  for (const p of formatterFor(timeZone).formatToParts(new Date(utcMs))) parts[p.type] = p.value;
  let year = Number(parts.year);
  if (parts.era === 'BC' || parts.era === 'B') year = 1 - year;
  const hour = Number(parts.hour) % 24; // guard against '24' in some ICU builds
  const d = new Date(0);
  d.setUTCFullYear(year, Number(parts.month) - 1, Number(parts.day));
  d.setUTCHours(hour, Number(parts.minute), Number(parts.second), 0);
  return d.getTime();
}

/** UTC offset (minutes, east positive) in effect at an instant. */
export function offsetMinutesAt(timeZone: string, utcMs: number): number {
  const floored = Math.floor(utcMs / 1000) * 1000;
  return (wallNaiveMsAt(timeZone, floored) - floored) / MINUTE_MS;
}

/**
 * Standard (non-DST) offset for a year: the smaller of the offsets on
 * Jan 1 and Jul 1 (works for both hemispheres). Caveat: in a year where a zone
 * permanently changed its standard offset this heuristic can misclassify.
 */
export function standardOffsetMinutes(timeZone: string, year: number): number {
  const jan = Date.UTC(year, 0, 1, 12);
  const jul = Date.UTC(year, 6, 1, 12);
  return Math.min(offsetMinutesAt(timeZone, jan), offsetMinutesAt(timeZone, jul));
}

export type WallResolution =
  | { kind: 'normal'; utcMs: number; offsetMinutes: number }
  | {
      kind: 'gap';
      /** Wall time shifted forward by the gap, interpreted with the pre-transition offset. */
      utcMs: number;
      offsetMinutes: number;
      gapMinutes: number;
    }
  | {
      kind: 'overlap';
      utcMs: number;
      offsetMinutes: number;
      chosen: 'earlier' | 'later';
      candidates: { utcMs: number; offsetMinutes: number }[];
    };

/**
 * Resolve a local wall time to an instant.
 *
 * Candidate offsets are those in effect 24 h before/after the wall time and at
 * the naive instant; a candidate is valid when the offset at `wall − offset`
 * equals itself. 0 valid → DST gap (shift forward by the gap length);
 * 2 valid → overlap (choose `prefer`, default earlier instant).
 */
export function resolveWallTime(
  timeZone: string,
  wallNaiveMs: number,
  prefer: 'earlier' | 'later' = 'earlier',
): WallResolution {
  const before = offsetMinutesAt(timeZone, wallNaiveMs - DAY_MS);
  const after = offsetMinutesAt(timeZone, wallNaiveMs + DAY_MS);
  const probe = offsetMinutesAt(timeZone, wallNaiveMs);
  const offsets = [...new Set([before, probe, after])];

  const valid: { utcMs: number; offsetMinutes: number }[] = [];
  for (const o of offsets) {
    const utcMs = wallNaiveMs - o * MINUTE_MS;
    if (offsetMinutesAt(timeZone, utcMs) === o && !valid.some((v) => v.utcMs === utcMs)) {
      valid.push({ utcMs, offsetMinutes: o });
    }
  }
  valid.sort((a, b) => a.utcMs - b.utcMs);

  if (valid.length === 1) return { kind: 'normal', ...valid[0] };
  if (valid.length >= 2) {
    const pick = prefer === 'earlier' ? valid[0] : valid[valid.length - 1];
    return { kind: 'overlap', ...pick, chosen: prefer, candidates: valid };
  }
  // Gap: interpret with the pre-transition offset, which lands after the jump.
  const utcMs = wallNaiveMs - before * MINUTE_MS;
  const offsetMinutes = offsetMinutesAt(timeZone, utcMs);
  return { kind: 'gap', utcMs, offsetMinutes, gapMinutes: offsetMinutes - before };
}
