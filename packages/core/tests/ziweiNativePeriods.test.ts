import { describe, expect, test } from 'bun:test';
import { astro } from 'iztro';
import * as api from '../src/index';
import type { NativePeriod } from '../src/period';
import { createAstrolabe, decadeSequence, monthlySequence, yearlySequence } from '../src/calculators/ziwei';

const options = { timezone: 'Asia/Taipei' };
// Synthetic natal input. Direct iztro probes are a compatibility oracle, not an
// independent chart validation. Calendar literals are sourced in the #57 note.
const astrolabe = createAstrolabe('1991-10-05', 7, 'female');
const direct = astro.bySolar('1991-10-5', 7, '女', true, 'zh-TW');
const years = yearlySequence(astrolabe, 2025, 2);
const months = monthlySequence(astrolabe, 2025);
const decades = decadeSequence(astrolabe);
const member = (period: NativePeriod, instant: string) =>
  Date.parse(period.startInstant) <= Date.parse(instant) && Date.parse(instant) < Date.parse(period.endExclusive);

function adjacent(periods: readonly NativePeriod[]) {
  for (let i = 1; i < periods.length; i++) {
    expect(periods[i - 1].endExclusive).toBe(periods[i].startInstant);
    expect(api.periodsOverlap(periods[i - 1], periods[i])).toBe(false);
  }
}

describe('#57 Ziwei date-precision native-period adapters', () => {
  test('public API converts lunar years using explicit profile-zone midnights', () => {
    const periods = years.map(period => api.ziweiYearlyNativePeriod(period, options));
    expect(periods[0]).toEqual({ periodId: 'liuNian_2025', system: 'ziwei', kind: 'year',
      startInstant: '2025-01-28T16:00:00.000Z', endExclusive: '2026-02-16T16:00:00.000Z',
      precision: 'day', timezone: 'Asia/Taipei' });
    adjacent(periods);
    // HKO: 2026-02-16 is lunar year end; 02-17 is New Year, not 01-01 or Li Chun.
    for (const [instant, index, date] of [
      ['2026-02-16T15:59:59.999Z', 0, '2026-2-16'],
      ['2026-02-16T16:00:00.000Z', 1, '2026-2-17'],
    ] as const) {
      expect(periods.map(p => member(p, instant))).toEqual([index === 0, index === 1]);
      const h = direct.horoscope(date).yearly;
      expect(years[index]).toMatchObject({ palaceIndex: h.index, stem: h.heavenlyStem,
        branch: h.earthlyBranch, mutagen: h.mutagen });
    }
  });

  test('leap-month day 15/16 splits at local midnight and preserves all twelve source periods', () => {
    const periods = months.map(period => api.ziweiMonthlyNativePeriod(period, options));
    expect(periods).toHaveLength(12);
    adjacent(periods);
    expect(periods[0].startInstant).toBe('2025-01-28T16:00:00.000Z');
    expect(periods[11].endExclusive).toBe('2026-02-16T16:00:00.000Z');
    expect(periods[5]).toMatchObject({ periodId: 'liuYue_2025_06', kind: 'month', precision: 'day',
      startInstant: '2025-06-24T16:00:00.000Z', endExclusive: '2025-08-08T16:00:00.000Z' });
    expect(periods[6]).toMatchObject({ periodId: 'liuYue_2025_07',
      startInstant: '2025-08-08T16:00:00.000Z', endExclusive: '2025-09-21T16:00:00.000Z' });
    for (const [date, instant, index] of [
      ['2025-7-24', '2025-07-23T16:00:00Z', 5], // regular sixth month end
      ['2025-7-25', '2025-07-24T16:00:00Z', 5], // leap sixth month day 1
      ['2025-8-8', '2025-08-08T15:59:59.999Z', 5], // leap day 15, final instant
      ['2025-8-9', '2025-08-08T16:00:00Z', 6], // leap day 16
      ['2025-8-23', '2025-08-22T16:00:00Z', 6], // regular seventh month day 1
    ] as const) {
      const hits = periods.filter(p => member(p, instant));
      expect(hits).toHaveLength(1);
      expect(hits[0].periodId).toBe(months[index].id);
      const h = direct.horoscope(date).monthly;
      expect(months[index]).toMatchObject({ palaceIndex: h.index, stem: h.heavenlyStem,
        branch: h.earthlyBranch, mutagen: h.mutagen });
    }
    // Check both ends of every source period against the library, not the adapter.
    for (const source of months) for (const date of [source.start, source.end]) {
      const h = direct.horoscope(date.split('-').map(Number).join('-')).monthly;
      expect(source).toMatchObject({ palaceIndex: h.index, stem: h.heavenlyStem,
        branch: h.earthlyBranch, mutagen: h.mutagen });
    }
  });

  test('decade boundary is half-open and matches iztro age/palace transitions', () => {
    const periods = decades.map(period => api.ziweiDecadeNativePeriod(period, options));
    expect(periods).toHaveLength(12);
    adjacent(periods);
    // HKO: 2023-01-22 is New Year. The synthetic chart changes 大限 there.
    expect(periods[2].endExclusive).toBe('2023-01-21T16:00:00.000Z');
    expect(periods[3].startInstant).toBe('2023-01-21T16:00:00.000Z');
    for (const [date, instant, index, age] of [
      ['2023-1-21', '2023-01-21T15:59:59.999Z', 2, 32],
      ['2023-1-22', '2023-01-21T16:00:00.000Z', 3, 33],
    ] as const) {
      expect(periods.filter(p => member(p, instant)).map(p => p.periodId)).toEqual([decades[index].id]);
      const h = direct.horoscope(date);
      expect(h.age.nominalAge).toBe(age);
      expect(decades[index]).toMatchObject({ palaceIndex: h.decadal.index, stem: h.decadal.heavenlyStem,
        branch: h.decadal.earthlyBranch, mutagen: h.decadal.mutagen });
      expect(periods[index]).toMatchObject({ system: 'ziwei', kind: 'decade', precision: 'day' });
    }
  });

  test('different profile zones change instants; aliases canonicalize without host fallback', () => {
    const source = years[0];
    const taipei = api.ziweiYearlyNativePeriod(source, options);
    const ny = api.ziweiYearlyNativePeriod(source, { timezone: 'America/New_York' });
    expect(ny.startInstant).toBe('2025-01-29T05:00:00.000Z');
    expect(ny.endExclusive).toBe('2026-02-17T05:00:00.000Z');
    expect(ny.startInstant).not.toBe(taipei.startInstant);
    expect(api.ziweiYearlyNativePeriod(source, { timezone: 'US/Eastern' })).toEqual(ny);
    expect(api.ziweiYearlyNativePeriod(source, { timezone: 'Asia/Kathmandu' }).startInstant)
      .toBe('2025-01-28T18:15:00.000Z');
  });

  test('inclusive end conversion uses civil date arithmetic across 23/25-hour days', () => {
    for (const [date, start, end, hours] of [
      ['2024-03-10', '2024-03-10T05:00:00.000Z', '2024-03-11T04:00:00.000Z', 23],
      ['2024-11-03', '2024-11-03T04:00:00.000Z', '2024-11-04T05:00:00.000Z', 25],
    ] as const) {
      // Synthetic one-day spans isolate conversion mechanics, not lunar facts.
      const result = api.ziweiMonthlyNativePeriod({ ...months[0], start: date, end: date }, { timezone: 'America/New_York' });
      expect(result.startInstant).toBe(start);
      expect(result.endExclusive).toBe(end);
      expect((Date.parse(end) - Date.parse(start)) / 3_600_000).toBe(hours);
    }
  });

  test('gap boundaries reject; repeated midnight requires explicit choices on both ends', () => {
    const span = (start: string, end = start) => ({ ...months[0], start, end });
    expect(() => api.ziweiMonthlyNativePeriod(span('2011-12-30'), { timezone: 'Pacific/Apia' })).toThrow('nonexistent');
    expect(() => api.ziweiMonthlyNativePeriod(span('2011-12-29'), { timezone: 'Pacific/Apia' })).toThrow('nonexistent');
    expect(() => api.ziweiMonthlyNativePeriod(span('2018-11-04'), { timezone: 'America/Sao_Paulo' })).toThrow('nonexistent');
    expect(() => api.ziweiMonthlyNativePeriod(span('2024-11-03'), { timezone: 'America/Havana' })).toThrow('ambiguous');
    expect(() => api.ziweiMonthlyNativePeriod(span('2024-11-02'), { timezone: 'America/Havana' })).toThrow('ambiguous');
    for (const [choice, instant] of [['earlier', '2024-11-03T04:00:00.000Z'], ['later', '2024-11-03T05:00:00.000Z']] as const) {
      const before = api.ziweiMonthlyNativePeriod(span('2024-11-02'), { timezone: 'America/Havana', endOverlap: choice });
      const after = api.ziweiMonthlyNativePeriod(span('2024-11-03'), { timezone: 'America/Havana', startOverlap: choice });
      expect(before.endExclusive).toBe(instant);
      expect(after.startInstant).toBe(instant);
      adjacent([before, after]);
    }
  });

  test('malformed or reversed source dates reject before rolling inclusive ends over', () => {
    expect(typeof api.ziweiMonthlyNativePeriod).toBe('function');
    for (const fields of [
      { start: '2025-02-30' }, { end: '2025-02-30' }, { end: '2025-13-01' },
      { start: '2025-02-01', end: '2025-01-31' }, { end: '9999-12-31' },
      { end: '2025-02-01T00:00:00Z' }, { id: '' },
    ]) expect(() => api.ziweiMonthlyNativePeriod({ ...months[0], ...fields }, options)).toThrow();
    for (const timezone of ['', 'Not/A_Zone', undefined]) {
      // @ts-expect-error A JS caller can still omit the required timezone.
      expect(() => api.ziweiMonthlyNativePeriod(months[0], { timezone })).toThrow();
    }
  });

  test('output is frozen/detached and original source/chart serialization is untouched', () => {
    const source = structuredClone(months[5]);
    const before = JSON.stringify(source);
    const first = api.ziweiMonthlyNativePeriod(source, options);
    const second = api.ziweiMonthlyNativePeriod(source, options);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(JSON.stringify(source)).toBe(before);
    expect(first.periodId).toBe(source.id); // Source/chart-scoped ID, not a global cache key.
    source.start = '1900-01-01';
    source.id = 'mutated';
    expect(first.startInstant).toBe('2025-06-24T16:00:00.000Z');
    expect(first.periodId).toBe('liuYue_2025_06');
  });
});
