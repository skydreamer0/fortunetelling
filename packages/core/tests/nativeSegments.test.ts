import { describe, expect, it } from 'vitest';
import * as api from '../src/index';
import { annualPillars, luckCycles, monthlyPillars } from '../src/calculators/bazi/pillars';
import { baziNativePeriodsFor } from '../src/calculators/bazi/nativePeriodSet';
import { gregorianCellInterval, segmentWindow, type NativeSegmentation } from '../src/timeline/nativeSegments';
import { createTimeContext } from '../src/time';

const DAY = 86_400_000, HOUR = 3_600_000;
const tz = 'Asia/Taipei';
const ms = (iso: string) => Date.parse(iso);
const length = (i: { startInstant: string; endExclusive: string }) => ms(i.endExclusive) - ms(i.startInstant);

/** Contiguous, no overlap, inside window, and covered + unknown = window length. */
function expectExactCover(result: NativeSegmentation) {
  const { window, segments } = result;
  expect(segments[0]!.interval.startInstant).toBe(window.startInstant);
  expect(segments.at(-1)!.interval.endExclusive).toBe(window.endExclusive);
  for (let i = 1; i < segments.length; i++) {
    expect(segments[i]!.interval.startInstant).toBe(segments[i - 1]!.interval.endExclusive);
  }
  expect(result.coveredMs).toBe(segments.reduce((sum, s) => sum + length(s.interval), 0));
  expect(result.coveredMs + result.unknownMs).toBe(length(window));
  expect(result.unknownMs).toBe(0);
}

describe('#58 native segment helper (inert; not wired into any consumer)', () => {
  it('a 2026 year cell yields two 流年 segments split exactly at 立春 (乙巳 → 丙午)', () => {
    const source = annualPillars(2025, 2);
    expect(source.map(p => p.ganZhi)).toEqual(['乙巳', '丙午']);
    const { annual } = baziNativePeriodsFor({ annual: source }, { idPrefix: 'synthetic', timezone: tz });
    const result = segmentWindow({ kind: 'year', year: 2026 }, annual, tz);
    expect(result.window).toEqual({ startInstant: '2025-12-31T16:00:00.000Z', endExclusive: '2026-12-31T16:00:00.000Z' });
    expect(result.segments.map(s => s.periodId)).toEqual(['synthetic:year:2025', 'synthetic:year:2026']);
    expect(result.segments[0]!.interval.endExclusive).toBe(new Date(source[1]!.start).toISOString());
    expectExactCover(result);
    expect(Object.isFrozen(result) && Object.isFrozen(result.segments) && Object.isFrozen(result.segments[0])).toBe(true);
  });

  it('time no supplied period covers is reported as unknown, not as a segment', () => {
    const { annual } = baziNativePeriodsFor({ annual: annualPillars(2026, 1) }, { idPrefix: 'synthetic', timezone: tz });
    const result = segmentWindow({ kind: 'year', year: 2026 }, annual, tz);
    expect(result.segments).toHaveLength(1);
    expect(result.unknownMs).toBe(ms(annual[0]!.startInstant) - ms(result.window.startInstant));
    expect(result.coveredMs + result.unknownMs).toBe(length(result.window));
    expect(segmentWindow({ kind: 'year', year: 2026 }, [], tz)).toMatchObject({ segments: [], coveredMs: 0, unknownMs: 365 * DAY });
  });

  it('a February 2026 month cell splits at the 丑/寅 交節 instant', () => {
    const source = [monthlyPillars(2025)[11]!, monthlyPillars(2026)[0]!];
    expect(source.map(p => p.ganZhi)).toEqual(['己丑', '庚寅']);
    const { monthly } = baziNativePeriodsFor({ monthly: source }, { idPrefix: 'synthetic', timezone: tz });
    const result = segmentWindow({ kind: 'month', year: 2026, month: 2 }, monthly, tz);
    expect(result.segments.map(s => s.periodId)).toEqual(['synthetic:month:2025-11', 'synthetic:month:2026-0']);
    expect(result.segments[1]!.interval.startInstant).toBe(new Date(source[1]!.start).toISOString());
    expect(length(result.window)).toBe(28 * DAY);
    expectExactCover(result);
  });

  it('a month cell crossing a 大運 boundary splits exactly there', () => {
    const ctx = createTimeContext({ date: '1995-07-16', time: '22:00', timeAccuracy: 'exact', gender: 'male',
      birthplace: { label: 'Synthetic Taipei', lat: 25.0375, lng: 121.5637, timezone: tz } });
    const { luck } = baziNativePeriodsFor({ luck: luckCycles(ctx, 'male', { count: 3 }) }, { idPrefix: 'synthetic', timezone: tz });
    const boundary = ms(luck[1]!.startInstant);
    const local = new Date(boundary + 8 * HOUR); // Asia/Taipei has been fixed UTC+8 over this range.
    const cell = { kind: 'month', year: local.getUTCFullYear(), month: local.getUTCMonth() + 1 } as const;
    const result = segmentWindow(cell, luck, tz);
    expect(ms(result.window.startInstant)).toBeLessThan(boundary);
    expect(result.segments.map(s => s.periodId)).toEqual(['synthetic:luck:1', 'synthetic:luck:2']);
    expect(ms(result.segments[1]!.interval.startInstant)).toBe(boundary);
    expectExactCover(result);
  });

  it('cell bounds use the given IANA zone, including a DST month (America/New_York March 2026)', () => {
    const window = gregorianCellInterval({ kind: 'month', year: 2026, month: 3 }, 'America/New_York');
    expect(window).toEqual({ startInstant: '2026-03-01T05:00:00.000Z', endExclusive: '2026-04-01T04:00:00.000Z' });
    expect(length(window)).toBe(31 * DAY - HOUR);
    const source = [monthlyPillars(2026)[0]!, monthlyPillars(2026)[1]!];
    const { monthly } = baziNativePeriodsFor({ monthly: source }, { idPrefix: 'synthetic', timezone: 'America/New_York' });
    const result = segmentWindow({ kind: 'month', year: 2026, month: 3 }, monthly, 'America/New_York');
    expect(result.segments[1]!.interval.startInstant).toBe(new Date(source[1]!.start).toISOString());
    expectExactCover(result);
  });

  it('a leap-day February (2028) cell is 29 days and splits at 立春', () => {
    const source = [monthlyPillars(2027)[11]!, monthlyPillars(2028)[0]!];
    const { monthly } = baziNativePeriodsFor({ monthly: source }, { idPrefix: 'synthetic', timezone: tz });
    const result = segmentWindow({ kind: 'month', year: 2028, month: 2 }, monthly, tz);
    expect(length(result.window)).toBe(29 * DAY);
    expect(result.segments).toHaveLength(2);
    expect(result.segments[1]!.interval.startInstant).toBe(new Date(source[1]!.start).toISOString());
    expectExactCover(result);
  });

  it('rejects mixed families, overlapping periods, a missing timezone and invalid cells', () => {
    const set = baziNativePeriodsFor({ annual: annualPillars(2025, 2), monthly: monthlyPillars(2026) },
      { idPrefix: 'synthetic', timezone: tz });
    const cell = { kind: 'year', year: 2026 } as const;
    expect(() => segmentWindow(cell, [...set.annual, ...set.monthly], tz)).toThrow(/single period family/);
    expect(() => segmentWindow(cell, [set.annual[0]!, set.annual[0]!], tz)).toThrow(/overlap/);
    const outer = api.createNativePeriod({ ...set.monthly[0]!, periodId: 'outer', endExclusive: set.monthly[5]!.endExclusive });
    expect(() => segmentWindow(cell, [outer, set.monthly[1]!, set.monthly[4]!], tz)).toThrow(/overlap/);
    expect(() => segmentWindow(cell, set.annual, '')).toThrow(/timezone/);
    expect(() => segmentWindow({ kind: 'month', year: 2026, month: 13 }, [], tz)).toThrow(/month 1–12/);
    expect(() => baziNativePeriodsFor({}, { idPrefix: ' ', timezone: tz })).toThrow(/idPrefix/);
  });

  it('is not part of the public barrel', () => {
    expect('segmentWindow' in api).toBe(false);
    expect('baziNativePeriodsFor' in api).toBe(false);
  });

  // Not tested here (CI forbids todo/skip): the #56 consumer AC "a January event
  // must not be evaluated with the post-立春 year pillar" needs buildTimeline
  // wiring, which is out of scope for this inert slice.
});
