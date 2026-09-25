import { describe, expect, test } from 'bun:test';
import type { BirthProfile } from '../src/profile/index';
import {
  createTimeContext,
  deltaTSeconds,
  equationOfTimeMinutes,
  julianDayFromUnixMs,
  shichenBoundaryDistance,
  solarTermsAround,
  type TimeContext,
  type TimeFlagCode,
} from '../src/time/index';

const TAIPEI = { label: 'Taipei, Taiwan', lat: 25.0375, lng: 121.5637, timezone: 'Asia/Taipei' };

function profile(date: string, time: string | null, birthplace = TAIPEI, timeAccuracy?: BirthProfile['timeAccuracy']): BirthProfile {
  return {
    date,
    time,
    timeAccuracy: timeAccuracy ?? (time === null ? 'unknown' : 'exact'),
    gender: 'male',
    birthplace,
  };
}

const codes = (ctx: TimeContext): TimeFlagCode[] => ctx.flags.map((f) => f.code);
const flag = <C extends TimeFlagCode>(ctx: TimeContext, code: C) =>
  ctx.flags.find((f) => f.code === code) as Extract<TimeContext['flags'][number], { code: C }> | undefined;

/** Minutes of day of a zoneless 'YYYY-MM-DDTHH:mm:ss' string. */
function minutesOf(iso: string): number {
  const [, hh, mm, ss] = /T(\d{2}):(\d{2}):(\d{2})$/.exec(iso)!.map(Number);
  return hh * 60 + mm + ss / 60;
}

describe('time zone & DST (Asia/Taipei history via Intl tzdata)', () => {
  test('Taipei 1974-07-01 12:00 is DST (+09:00) → 03:00Z', () => {
    const ctx = createTimeContext(profile('1974-07-01', '12:00'));
    expect(ctx.local).toEqual({ iso: '1974-07-01T12:00:00+09:00', utcOffsetMinutes: 540, dst: true });
    expect(ctx.utc!.iso).toBe('1974-07-01T03:00:00Z');
    expect(codes(ctx)).toContain('dst_applied');
  });

  test('Taipei 1990-07-01 12:00 is standard time (+08:00)', () => {
    const ctx = createTimeContext(profile('1990-07-01', '12:00'));
    expect(ctx.local!.utcOffsetMinutes).toBe(480);
    expect(ctx.local!.dst).toBe(false);
    expect(ctx.utc!.iso).toBe('1990-07-01T04:00:00Z');
    expect(codes(ctx)).not.toContain('dst_applied');
  });

  // tzdata Rule Taiwan 1974–1975: Apr 1 00:00 → +1h, Oct 1 00:00 → back.
  // Intl confirms: 1974-03-31T16:00Z 480→540, 1974-09-30T15:00Z 540→480.
  test('DST gap: 1974-04-01 00:30 does not exist → shifted to 01:30 +09:00, flagged', () => {
    const ctx = createTimeContext(profile('1974-04-01', '00:30'));
    expect(ctx.local!.iso).toBe('1974-04-01T01:30:00+09:00');
    expect(ctx.utc!.iso).toBe('1974-03-31T16:30:00Z');
    const gap = flag(ctx, 'dst_gap')!;
    expect(gap.data).toEqual({
      requestedLocal: '1974-04-01T00:30:00',
      resolvedLocal: '1974-04-01T01:30:00',
      gapMinutes: 60,
      requiresConfirmation: true,
    });
    expect(codes(ctx)).not.toContain('dst_overlap');
  });

  test('DST overlap: 1974-09-30 23:30 occurs twice → earlier (+09:00) by default, later on request', () => {
    const early = createTimeContext(profile('1974-09-30', '23:30'));
    expect(early.utc!.iso).toBe('1974-09-30T14:30:00Z');
    expect(early.local).toEqual({ iso: '1974-09-30T23:30:00+09:00', utcOffsetMinutes: 540, dst: true });
    const ov = flag(early, 'dst_overlap')!;
    expect(ov.data.chosen).toBe('earlier');
    expect(ov.data.candidates).toEqual([
      { utcIso: '1974-09-30T14:30:00Z', utcOffsetMinutes: 540 },
      { utcIso: '1974-09-30T15:30:00Z', utcOffsetMinutes: 480 },
    ]);

    const late = createTimeContext(profile('1974-09-30', '23:30'), { dstOverlap: 'later' });
    expect(late.utc!.iso).toBe('1974-09-30T15:30:00Z');
    expect(late.local).toEqual({ iso: '1974-09-30T23:30:00+08:00', utcOffsetMinutes: 480, dst: false });
    expect(codes(late)).toEqual(expect.arrayContaining(['dst_overlap']));
    expect(codes(late)).not.toContain('dst_applied');
  });

  test('New York 1995-07-16 22:00 EDT → 1995-07-17 02:00Z', () => {
    const ny = { label: 'New York, US', lat: 40.7128, lng: -74.006, timezone: 'America/New_York' };
    const ctx = createTimeContext(profile('1995-07-16', '22:00', ny));
    expect(ctx.local).toEqual({ iso: '1995-07-16T22:00:00-04:00', utcOffsetMinutes: -240, dst: true });
    expect(ctx.utc!.iso).toBe('1995-07-17T02:00:00Z');
    expect(codes(ctx)).toContain('dst_applied');
  });
});

describe('JD, ΔT, equation of time', () => {
  test('JD of 2000-01-01T12:00:00Z is exactly 2451545.0', () => {
    expect(julianDayFromUnixMs(Date.UTC(2000, 0, 1, 12))).toBe(2451545.0);
    const ctx = createTimeContext(profile('2000-01-01', '12:00', { label: 'Greenwich', lat: 51.48, lng: 0, timezone: 'UTC' }));
    expect(ctx.jd!.ut).toBe(2451545.0);
    expect(ctx.jd!.tt).toBeCloseTo(2451545.0 + ctx.jd!.deltaTSeconds / 86400, 7);
  });

  test('ΔT ≈ 63.8 s around 2000 (Espenak–Meeus)', () => {
    expect(Math.abs(deltaTSeconds(2000.0) - 63.8)).toBeLessThan(1);
    expect(Math.abs(deltaTSeconds(2000 + 0.5 / 12) - 63.8)).toBeLessThan(1);
    // Other published anchors (NASA table): 1900 ≈ −2.8 s, 1950 ≈ 29.1 s, 1975 ≈ 45.5 s.
    expect(deltaTSeconds(1900)).toBeCloseTo(-2.79, 1);
    expect(deltaTSeconds(1950)).toBeCloseTo(29.07, 1);
    expect(deltaTSeconds(1975)).toBeCloseTo(45.45, 1);
  });

  test('equation of time matches NOAA calculator anchors', () => {
    // NOAA Solar Calculator (noon UT): 2000-01-01 ≈ −3.2 min, 2000-02-11 ≈ −14.2, 2000-11-03 ≈ +16.4.
    expect(equationOfTimeMinutes(julianDayFromUnixMs(Date.UTC(2000, 0, 1, 12)))).toBeCloseTo(-3.2, 0);
    expect(Math.abs(equationOfTimeMinutes(julianDayFromUnixMs(Date.UTC(2000, 1, 11, 12))) + 14.2)).toBeLessThan(0.2);
    expect(Math.abs(equationOfTimeMinutes(julianDayFromUnixMs(Date.UTC(2000, 10, 3, 12))) - 16.4)).toBeLessThan(0.2);
  });

  /*
   * Tainan (lng 120.2°E) 1995-07-16 22:00 CST = 14:00Z.
   * LMT = UTC + 120.2 × 4 min = UTC + 8h00m48s → 22:00:48 (120.2° is EAST of the
   * 120° zone meridian, so LMT is 0.8 min AHEAD of civil time, not behind).
   * EoT mid-July (NOAA) ≈ −6.0 min → true solar ≈ 21:54:48.
   */
  test('Tainan 1995-07-16 22:00: LMT 22:00:48, EoT ≈ −6 min, true solar ≈ 21:54.8', () => {
    const tainan = { label: 'Tainan, Taiwan', lat: 23.0, lng: 120.2, timezone: 'Asia/Taipei' };
    const ctx = createTimeContext(profile('1995-07-16', '22:00', tainan));
    expect(ctx.utc!.iso).toBe('1995-07-16T14:00:00Z');
    expect(ctx.solar!.lmtIso).toBe('1995-07-16T22:00:48');
    expect(Math.abs(ctx.solar!.equationOfTimeMinutes - -6.0)).toBeLessThan(0.3);
    expect(Math.abs(minutesOf(ctx.solar!.trueSolarIso) - (21 * 60 + 54.8))).toBeLessThan(1);
  });
});

describe('solar terms (lunar-javascript CST → UTC)', () => {
  test('立春 2026 = 2026-02-04 04:02:08 CST = 2026-02-03T20:02:08Z', () => {
    const lichun = solarTermsAround(Date.UTC(2026, 1, 4)).find((t) => t.name === '立春' && t.utcMs > Date.UTC(2026, 0, 1))!;
    expect(new Date(lichun.utcMs).toISOString()).toBe('2026-02-03T20:02:08.000Z');
  });

  test('冬至 1999 matches USNO (1999-12-22 07:44 UT) within 1 min', () => {
    const dz = solarTermsAround(Date.UTC(1999, 11, 22)).find((t) => t.name === '冬至' && t.utcMs > Date.UTC(1999, 11, 1))!;
    expect(Math.abs(dz.utcMs - Date.UTC(1999, 11, 22, 7, 44)) / 60000).toBeLessThan(1);
  });

  test('prev/next Jie and Qi bracket the birth instant', () => {
    const ctx = createTimeContext(profile('1990-07-01', '12:00'));
    expect(ctx.solarTerms.reference).toBe('birth');
    expect(ctx.solarTerms.prevJie.name).toBe('芒种');
    expect(ctx.solarTerms.prevJie.nameHant).toBe('芒種');
    expect(ctx.solarTerms.nextJie.name).toBe('小暑');
    expect(ctx.solarTerms.prevQi.name).toBe('夏至');
    expect(ctx.solarTerms.nextQi.name).toBe('大暑');
    const t = Date.parse(ctx.utc!.iso);
    expect(Date.parse(ctx.solarTerms.prevJie.utcIso)).toBeLessThanOrEqual(t);
    expect(Date.parse(ctx.solarTerms.nextJie.utcIso)).toBeGreaterThan(t);
  });

  test('birth 8 min after 立春 2026 → near_jie_boundary; prevJie is 立春', () => {
    const ctx = createTimeContext(profile('2026-02-04', '04:10'));
    expect(ctx.solarTerms.prevJie.name).toBe('立春');
    const f = flag(ctx, 'near_jie_boundary')!;
    expect(f.data.basis).toBe('instant');
    if (f.data.basis === 'instant') {
      expect(f.data.term.utcIso).toBe('2026-02-03T20:02:08Z');
      expect(f.data.minutesFromTerm).toBeCloseTo(7.87, 1);
      expect(f.data.toleranceMinutes).toBe(30);
    }
    // 3 hours later: no longer near
    expect(codes(createTimeContext(profile('2026-02-04', '07:10')))).not.toContain('near_jie_boundary');
  });
});

describe('boundary flags', () => {
  test('birth at 23:30 → zi_hour_convention', () => {
    const ctx = createTimeContext(profile('1990-03-10', '23:30'));
    const f = flag(ctx, 'zi_hour_convention')!;
    expect(f.data.bases).toContain('civil');
    expect(f.data.bases).toContain('trueSolar');
  });

  test('true solar within 3 min of 13:00 (exact) → near_shichen_boundary', () => {
    // lng 120.0 = zone meridian, EoT ≈ 0 on 2026-06-13 → true solar ≈ civil.
    const bp = { label: 'Meridian', lat: 23.5, lng: 120, timezone: 'Asia/Taipei' };
    const ctx = createTimeContext(profile('2026-06-13', '13:02', bp));
    const ts = minutesOf(ctx.solar!.trueSolarIso);
    expect(Math.abs(ts - 13 * 60)).toBeLessThan(3);
    const f = flag(ctx, 'near_shichen_boundary')!;
    const hit = f.data.hits.find((h) => h.basis === 'trueSolar')!;
    expect(hit.boundary).toBe('13:00');
    expect(Math.abs(hit.minutesFromBoundary)).toBeLessThan(3);
    expect(f.data.toleranceMinutes).toBe(5);
    // 12:00 is mid-shichen → no flag
    expect(codes(createTimeContext(profile('2026-06-13', '12:00', bp)))).not.toContain('near_shichen_boundary');
  });

  test('tolerance widens with approx1h', () => {
    const bp = { label: 'Meridian', lat: 23.5, lng: 120, timezone: 'Asia/Taipei' };
    const ctx = createTimeContext(profile('2026-06-13', '13:40', bp, 'approx1h'));
    expect(flag(ctx, 'near_shichen_boundary')!.data.toleranceMinutes).toBe(60);
  });

  test('shichenBoundaryDistance', () => {
    expect(shichenBoundaryDistance(13 * 60 + 2)).toEqual({ boundaryHour: 13, minutesFromBoundary: 2 });
    expect(shichenBoundaryDistance(12 * 60 + 58)).toEqual({ boundaryHour: 13, minutesFromBoundary: -2 });
    expect(shichenBoundaryDistance(23 * 60 + 1)).toEqual({ boundaryHour: 23, minutesFromBoundary: 1 });
    expect(shichenBoundaryDistance(22 * 60 + 59)).toEqual({ boundaryHour: 23, minutesFromBoundary: -1 });
    expect(shichenBoundaryDistance(0)).toEqual({ boundaryHour: 23, minutesFromBoundary: 60 });
    expect(shichenBoundaryDistance(0.5 * 60)).toEqual({ boundaryHour: 1, minutesFromBoundary: -30 });
  });

  test('time null → time_unknown; time-dependent fields null; date-level lunar/terms/jie flag', () => {
    const ctx = createTimeContext(profile('2026-02-04', null));
    expect(codes(ctx)[0]).toBe('time_unknown');
    expect(ctx.local).toBeNull();
    expect(ctx.utc).toBeNull();
    expect(ctx.jd).toBeNull();
    expect(ctx.solar).toBeNull();
    expect(ctx.lunar).toMatchObject({ year: 2025, month: 12, day: 17, isLeap: false });
    expect(ctx.solarTerms.reference).toBe('local_noon');
    expect(ctx.solarTerms.referenceUtcIso).toBe('2026-02-04T04:00:00Z');
    const f = flag(ctx, 'near_jie_boundary')!;
    expect(f.data.basis).toBe('date');
    expect(f.data.term.name).toBe('立春');
    expect(codes(createTimeContext(profile('2026-02-10', null)))).toEqual(['time_unknown']);
  });

  test('lunar date: leap month detection', () => {
    const ctx = createTimeContext(profile('1990-07-01', '12:00'));
    expect(ctx.lunar).toMatchObject({ year: 1990, month: 5, day: 9, isLeap: true, yearGanZhi: '庚午' });
  });
});

describe('determinism & validation', () => {
  test('same input twice → deep-equal output (and input not mutated)', () => {
    const p = profile('1974-09-30', '23:30');
    const snapshot = JSON.parse(JSON.stringify(p));
    const a = createTimeContext(p);
    const b = createTimeContext(p);
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(p).toEqual(snapshot);
  });

  test('invalid profile throws RangeError', () => {
    expect(() => createTimeContext(profile('2023-02-29', '12:00'))).toThrow(RangeError);
  });
});
