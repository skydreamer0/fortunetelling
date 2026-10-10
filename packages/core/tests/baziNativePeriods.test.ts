import { describe, expect, test } from 'bun:test';
import * as api from '../src/index';
import { annualPillars, monthlyPillars, luckCycles, type LuckCycles } from '../src/calculators/bazi/pillars';
import { createTimeContext } from '../src/time';

const options = { periodId: 'synthetic-chart:period', timezone: 'Asia/Taipei' };
const member = (p: { startInstant: string; endExclusive: string }, ms: number) =>
  Date.parse(p.startInstant) <= ms && ms < Date.parse(p.endExclusive);
const ctx = createTimeContext({ date: '1995-07-16', time: '22:00', timeAccuracy: 'exact', gender: 'male',
  birthplace: { label: 'Synthetic Taipei', lat: 25.0375, lng: 121.5637, timezone: 'Asia/Taipei' } });

function fixture(startIso: string): LuckCycles {
  const date = startIso.slice(0, 10);
  const year = Number(date.slice(0, 4));
  return { direction: '順', forward: true, jie: luckCycles(ctx, 'male', { count: 1 }).jie,
    startAge: { years: 1, months: 0, days: 0, hours: 0 }, startIso, startDate: date,
    steps: [{ index: 1, ganZhi: '甲子', start: date,
      end: new Date(Date.UTC(year + 10, Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)) - 1)).toISOString().slice(0, 10),
      startAge: { years: 1, months: 0, days: 0, hours: 0 } }] };
}

describe('#56 Bazi native periods (adapter scope, not Timeline wiring)', () => {
  test('January selects the preceding Li Chun year and changes exactly at the source second', () => {
    const source = annualPillars(2025, 2);
    const periods = source.map((p, i) => api.baziAnnualNativePeriod(p, { ...options, periodId: `year:${i}` }));
    expect(periods[0]).toMatchObject({ system: 'bazi', kind: 'year', precision: 'second',
      startInstant: '2025-02-03T14:10:28.000Z', endExclusive: '2026-02-03T20:02:08.000Z' });
    expect(periods.map(p => member(p, Date.parse('2026-01-15T04:00:00Z')))).toEqual([true, false]);
    const boundary = Date.parse(source[1].start);
    for (const offset of [-1000, 0, 1000]) expect(periods.map(p => member(p, boundary + offset)))
      .toEqual(offset < 0 ? [true, false] : [false, true]);
    expect(api.periodsOverlap(periods[0], periods[1])).toBe(false);
    expect(Object.isFrozen(periods[0])).toBe(true);
  });

  test('all twelve months preserve their existing exact Jie bounds and source objects', () => {
    const source = monthlyPillars(2026), before = structuredClone(source);
    const periods = source.map((p, i) => api.baziMonthlyNativePeriod(p, { ...options, periodId: `month:${i}` }));
    expect(periods).toHaveLength(12);
    for (let i = 0; i < periods.length; i++) {
      expect(periods[i]).toMatchObject({ system: 'bazi', kind: 'month', precision: 'second',
        startInstant: new Date(source[i].start).toISOString(), endExclusive: new Date(source[i].end).toISOString() });
      if (i) {
        expect(periods[i - 1].endExclusive).toBe(periods[i].startInstant);
        const b = Date.parse(periods[i].startInstant);
        for (const offset of [-1000, 0, 1000]) expect([member(periods[i - 1], b + offset), member(periods[i], b + offset)])
          .toEqual(offset < 0 ? [true, false] : [false, true]);
      }
    }
    expect(source).toEqual(before);
  });

  test('luck-cycle boundary retains civil hour/minute/second, both directions and every step', () => {
    for (const gender of ['male', 'female'] as const) {
      const source = luckCycles(ctx, gender, { count: 4 }), before = structuredClone(source);
      const periods = source.steps.map(s => api.baziLuckCycleNativePeriod(source, s.index,
        { ...options, periodId: `chart:${gender}:luck:${s.index}` }));
      expect(periods[0].startInstant).toBe(new Date(`${source.startIso}+08:00`).toISOString());
      expect(periods[0]).toMatchObject({ system: 'bazi', kind: 'luckCycle', precision: 'second' });
      for (let i = 1; i < periods.length; i++) {
        const b = Date.parse(periods[i].startInstant);
        expect(periods[i - 1].endExclusive).toBe(periods[i].startInstant);
        for (const offset of [-1000, 0, 1000]) expect([member(periods[i - 1], b + offset), member(periods[i], b + offset)])
          .toEqual(offset < 0 ? [true, false] : [false, true]);
      }
      expect(source).toEqual(before);
    }
  });

  test('luck-cycle local clock resolves explicit profile timezone, not host or UTC midnight', () => {
    const source = fixture('2000-01-02T03:04:05');
    expect(api.baziLuckCycleNativePeriod(source, 1, options).startInstant).toBe('2000-01-01T19:04:05.000Z');
    expect(api.baziLuckCycleNativePeriod(source, 1, { ...options, timezone: 'America/New_York' }).startInstant)
      .toBe('2000-01-02T08:04:05.000Z');
    const year = annualPillars(2026, 1)[0];
    expect(api.baziAnnualNativePeriod(year, { ...options, timezone: 'America/New_York' }).startInstant)
      .toBe(api.baziAnnualNativePeriod(year, options).startInstant);
  });

  test('missing civil clock rejects; repeated clock requires independent explicit choices', () => {
    const opts = { ...options, timezone: 'America/New_York' };
    expect(() => api.baziLuckCycleNativePeriod(fixture('2021-03-14T02:30:00'), 1, opts)).toThrow('nonexistent');
    const repeated = fixture('2021-11-07T01:30:00');
    expect(() => api.baziLuckCycleNativePeriod(repeated, 1, opts)).toThrow('ambiguous');
    const earlier = api.baziLuckCycleNativePeriod(repeated, 1, { ...opts, startOverlap: 'earlier' });
    const later = api.baziLuckCycleNativePeriod(repeated, 1, { ...opts, startOverlap: 'later' });
    expect(earlier.startInstant).toBe('2021-11-07T05:30:00.000Z');
    expect(later.startInstant).toBe('2021-11-07T06:30:00.000Z');
    const endRepeated = fixture('2011-11-07T01:30:00');
    expect(() => api.baziLuckCycleNativePeriod(endRepeated, 1, opts)).toThrow('ambiguous');
    expect(api.baziLuckCycleNativePeriod(endRepeated, 1, { ...opts, endOverlap: 'later' }).endExclusive)
      .toBe('2021-11-07T06:30:00.000Z');
  });

  test('rejects invalid dates, indexes, inconsistent legacy source dates and lost precision', () => {
    const year = annualPillars(2026, 1)[0];
    for (const start of ['2026-02-30T00:00:00Z', '2026-01-01', '2026-01-01T00:00:00.123Z'])
      expect(() => api.baziAnnualNativePeriod({ ...year, start }, options)).toThrow();
    for (const startIso of ['2000-02-30T00:00:00', '2000-01-02T24:00:00', '2000-01-02T03:04:05Z']) {
      const source = fixture('2000-01-02T03:04:05'); source.startIso = startIso;
      expect(() => api.baziLuckCycleNativePeriod(source, 1, options)).toThrow();
    }
    const source = fixture('2000-01-02T03:04:05');
    for (const index of [0, -1, 1.5, 2, NaN]) expect(() => api.baziLuckCycleNativePeriod(source, index, options)).toThrow();
    source.steps[0].start = '2000-01-03';
    expect(() => api.baziLuckCycleNativePeriod(source, 1, options)).toThrow('source');
    expect(() => api.baziAnnualNativePeriod(year, { ...options, timezone: 'Invalid/Zone' })).toThrow();
    expect(() => api.baziAnnualNativePeriod(year, { ...options, periodId: '' })).toThrow();
  });

  test('leap-day decades stay anchored to original civil start rather than cumulative clamping', () => {
    const source = fixture('2000-02-29T12:34:56');
    source.steps[0].end = '2010-02-27';
    source.steps.push({ ...source.steps[0], index: 2, start: '2010-02-28', end: '2020-02-28' });
    const first = api.baziLuckCycleNativePeriod(source, 1, options);
    const second = api.baziLuckCycleNativePeriod(source, 2, options);
    expect(first.startInstant).toBe('2000-02-29T04:34:56.000Z');
    expect(first.endExclusive).toBe('2010-02-28T04:34:56.000Z');
    expect(second.startInstant).toBe(first.endExclusive);
    expect(second.endExclusive).toBe('2020-02-29T04:34:56.000Z');
  });

  test('end gaps, duplicate steps, malformed choices and out-of-range years fail closed', () => {
    const source = fixture('2011-03-14T02:30:00');
    expect(() => api.baziLuckCycleNativePeriod(source, 1, { ...options, timezone: 'America/New_York' })).toThrow('nonexistent');
    expect(() => api.baziLuckCycleNativePeriod(fixture('2000-01-02T03:04:05'), 1,
      { ...options, endOverlap: 'invalid' as never })).toThrow('overlap choice');
    source.steps.push({ ...source.steps[0] });
    expect(() => api.baziLuckCycleNativePeriod(source, 1, options)).toThrow('exactly one');
    const high = fixture('2000-01-02T03:04:05'); high.startIso = '9995-01-02T03:04:05'; high.startDate = '9995-01-02';
    expect(() => api.baziLuckCycleNativePeriod(high, 1, options)).toThrow('9999');
  });
});
