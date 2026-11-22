/**
 * #54 test-only slice: DST gap/overlap cross-check between the product's bundled tz
 * database (`src/time/zone.ts`, compiled from IANA tzdb; `source: 'tzdb'`) and the
 * runtime's `Intl.DateTimeFormat` (ICU).
 *
 * IMPORTANT LIMIT: ICU's time-zone data is also derived from the IANA tz database.
 * Both sides share the same upstream, so agreement here is an *implementation*
 * cross-check (our compiler/lookup/wall-time resolution vs. ICU's), NOT an independent
 * historical source. If upstream IANA data were wrong, both sides would agree on the
 * wrong answer. Product rearguard/backzone choices do not affect these post-1970 zones.
 *
 * Expected values for gap/overlap resolution are derived from Intl offsets plus the
 * product's documented policy (`resolveWallTime` JSDoc / WallResolution type):
 * gap → shift forward by the gap (interpret with the pre-transition offset);
 * overlap → two candidates, default `earlier`. They are never read from product output.
 */
import { describe, expect, test } from 'vitest';
import { TZDB_VERSION, resolveWallTime, zoneInfoAt } from '../src/time/zone';

const MIN = 60_000;
const HOUR = 60 * MIN;

/** `longOffset` gives "GMT", "GMT+09:00", "GMT-04:00" (seconds only for LMT, unused here). */
function intlOffsetMinutes(timeZone: string, utcMs: number): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(new Date(utcMs))
    .find((p) => p.type === 'timeZoneName')?.value;
  if (name === 'GMT' || name === 'UTC') return 0;
  const m = /^GMT([+-])(\d{2}):(\d{2})$/.exec(name ?? '');
  if (!m) throw new Error(`Unparseable Intl longOffset for ${timeZone}: ${String(name)}`);
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

const ZONES = ['Asia/Taipei', 'America/New_York', 'Europe/London'] as const;

/** Full-ICU probe: small-ICU/no-ICU builds throw on non-UTC zones or lack longOffset. */
function hasFullIcuTimeZones(): boolean {
  try {
    // Throws (RangeError / unparseable name) when the zone or longOffset is unsupported.
    for (const z of ZONES) intlOffsetMinutes(z, Date.UTC(2025, 6, 1));
    return true;
  } catch {
    return false;
  }
}

const ICU_OK = hasFullIcuTimeZones();
const versions = `node ${process.version}, process.versions.tz=${process.versions.tz ?? 'n/a'}, process.versions.icu=${process.versions.icu ?? 'n/a'}, product TZDB_VERSION=${TZDB_VERSION}`;

type Transition = {
  id: string;
  zone: string;
  /** Transition instant (UTC), from IANA rules as commonly published; confirmed against Intl below. */
  atUtc: string;
  kind: 'gap' | 'overlap';
  /** A wall time inside the gap (nonexistent) or overlap (ambiguous). */
  wall: string;
};

const TRANSITIONS: Transition[] = [
  { id: 'taipei-1974-start', zone: 'Asia/Taipei', atUtc: '1974-03-31T16:00:00Z', kind: 'gap', wall: '1974-04-01T00:30:00' },
  { id: 'taipei-1974-end', zone: 'Asia/Taipei', atUtc: '1974-09-30T15:00:00Z', kind: 'overlap', wall: '1974-09-30T23:30:00' },
  { id: 'taipei-1975-end', zone: 'Asia/Taipei', atUtc: '1975-09-30T15:00:00Z', kind: 'overlap', wall: '1975-09-30T23:30:00' },
  { id: 'new-york-2025-start', zone: 'America/New_York', atUtc: '2025-03-09T07:00:00Z', kind: 'gap', wall: '2025-03-09T02:30:00' },
  { id: 'new-york-2025-end', zone: 'America/New_York', atUtc: '2025-11-02T06:00:00Z', kind: 'overlap', wall: '2025-11-02T01:30:00' },
  { id: 'london-2025-start', zone: 'Europe/London', atUtc: '2025-03-30T01:00:00Z', kind: 'gap', wall: '2025-03-30T01:30:00' },
  { id: 'london-2025-end', zone: 'Europe/London', atUtc: '2025-10-26T01:00:00Z', kind: 'overlap', wall: '2025-10-26T01:30:00' },
];

const naive = (wall: string) => Date.parse(`${wall}Z`);
/** Does the instant `utcMs` read as wall time `wallMs` (naive) according to Intl? */
const intlReadsAs = (zone: string, utcMs: number, wallMs: number) => utcMs + intlOffsetMinutes(zone, utcMs) * MIN === wallMs;

describe.skipIf(!ICU_OK)(`#54 DST Intl implementation cross-check (shared IANA upstream; ${versions})`, () => {
  test('metadata: product data source is the bundled tzdb, not the Intl fallback', () => {
    // Recorded for reviewers; versions may legitimately differ across runtimes.
    expect(typeof TZDB_VERSION).toBe('string');
    for (const z of [...ZONES]) expect(zoneInfoAt(z, Date.UTC(2025, 0, 1)).source).toBe('tzdb');
  });

  for (const t of TRANSITIONS) {
    describe(t.id, () => {
      const at = Date.parse(t.atUtc);

      test('Intl itself shows a transition exactly at the listed instant', () => {
        expect(intlOffsetMinutes(t.zone, at - 1000)).not.toBe(intlOffsetMinutes(t.zone, at));
        expect(intlOffsetMinutes(t.zone, at - HOUR)).toBe(intlOffsetMinutes(t.zone, at - 1000));
        expect(intlOffsetMinutes(t.zone, at + HOUR)).toBe(intlOffsetMinutes(t.zone, at));
      });

      test('product UTC offset matches Intl before / at / after the transition', () => {
        const probes = [-HOUR, -MIN, -1000, 0, 1000, MIN, HOUR];
        // Minute-by-minute scan over ±3 h catches an off-by-one transition placement.
        for (let d = -3 * HOUR; d <= 3 * HOUR; d += MIN) probes.push(d);
        for (const d of probes) {
          const info = zoneInfoAt(t.zone, at + d);
          expect(info.source).toBe('tzdb');
          expect(info.offsetSeconds / 60, `${t.id} at ${new Date(at + d).toISOString()}`).toBe(intlOffsetMinutes(t.zone, at + d));
        }
      });

      test(`product ${t.kind} resolution matches policy applied to Intl-derived candidates`, () => {
        const wall = naive(t.wall);
        const pre = intlOffsetMinutes(t.zone, at - 1000);
        const post = intlOffsetMinutes(t.zone, at);
        const candPre = wall - pre * MIN;
        const candPost = wall - post * MIN;

        if (t.kind === 'gap') {
          // Intl: the wall time is nonexistent (no candidate reads back as the wall time).
          expect(intlReadsAs(t.zone, candPre, wall)).toBe(false);
          expect(intlReadsAs(t.zone, candPost, wall)).toBe(false);
          // Policy: interpret with the pre-transition offset → lands after the jump.
          const r = resolveWallTime(t.zone, wall);
          expect(r).toEqual({ kind: 'gap', utcMs: candPre, offsetMinutes: intlOffsetMinutes(t.zone, candPre), gapMinutes: post - pre });
          expect(intlOffsetMinutes(t.zone, candPre)).toBe(post);
        } else {
          // Intl: the wall time is ambiguous (both candidates read back as the wall time).
          expect(intlReadsAs(t.zone, candPre, wall)).toBe(true);
          expect(intlReadsAs(t.zone, candPost, wall)).toBe(true);
          expect(candPre).toBeLessThan(candPost);
          const candidates = [
            { utcMs: candPre, offsetMinutes: pre },
            { utcMs: candPost, offsetMinutes: post },
          ];
          expect(resolveWallTime(t.zone, wall)).toEqual({ kind: 'overlap', utcMs: candPre, offsetMinutes: pre, chosen: 'earlier', candidates });
          expect(resolveWallTime(t.zone, wall, 'later')).toEqual({ kind: 'overlap', utcMs: candPost, offsetMinutes: post, chosen: 'later', candidates });
        }
      });

      test('wall times just outside the gap/overlap resolve as normal, matching Intl', () => {
        const pre = intlOffsetMinutes(t.zone, at - 1000);
        const post = intlOffsetMinutes(t.zone, at);
        const atWallPre = at + pre * MIN; // wall reading where the transition starts (pre side)
        const atWallPost = at + post * MIN;
        const lo = Math.min(atWallPre, atWallPost);
        const hi = Math.max(atWallPre, atWallPost);
        for (const wall of [lo - MIN, hi + MIN]) {
          const r = resolveWallTime(t.zone, wall);
          expect(r.kind).toBe('normal');
          expect(intlReadsAs(t.zone, r.utcMs, wall)).toBe(true);
          expect(r.offsetMinutes).toBe(intlOffsetMinutes(t.zone, r.utcMs));
        }
      });
    });
  }

  test('non-DST control: Asia/Taipei 2025 has a constant +08:00 in both product and Intl', () => {
    const start = Date.UTC(2025, 0, 1);
    const end = Date.UTC(2026, 0, 1);
    for (let ms = start; ms < end; ms += 6 * HOUR) {
      expect(intlOffsetMinutes('Asia/Taipei', ms)).toBe(480);
      expect(zoneInfoAt('Asia/Taipei', ms)).toMatchObject({ offsetSeconds: 480 * 60, isDst: false, source: 'tzdb' });
    }
    for (const wall of ['2025-03-09T02:30:00', '2025-03-30T01:30:00', '2025-10-26T01:30:00', '2025-11-02T01:30:00', '2025-07-01T12:00:00']) {
      expect(resolveWallTime('Asia/Taipei', naive(wall))).toEqual({ kind: 'normal', utcMs: naive(wall) - 480 * MIN, offsetMinutes: 480 });
    }
  });
});
