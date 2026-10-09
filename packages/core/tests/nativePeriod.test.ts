import { describe, expect, test } from 'bun:test';
import {
  createNativePeriod, nativePeriodFromDates, dateBoundaryInstant, normalizePeriodInstant,
  periodsOverlap, intersectPeriodIntervals, splitPeriodInterval,
  type NativePeriod,
} from '../src/period/index';

const interval = (startInstant: string, endExclusive: string) => ({ startInstant, endExclusive });
const meta = { periodId: 'synthetic:year:2026', system: 'bazi' as const, kind: 'year', timezone: 'Asia/Taipei' };

describe('#55 NativePeriod: half-open intervals without timeline migration', () => {
  test('adjacent periods meet exactly but do not overlap or intersect', () => {
    const a = nativePeriodFromDates({ ...meta, startDate: '2026-01-01', endDateExclusive: '2026-02-01' });
    const b = nativePeriodFromDates({ ...meta, periodId: 'synthetic:month:2', startDate: '2026-02-01', endDateExclusive: '2026-03-01' });
    expect(a.endExclusive).toBe(b.startInstant);
    expect(periodsOverlap(a, b)).toBe(false);
    expect(periodsOverlap(b, a)).toBe(false);
    expect(intersectPeriodIntervals(a, b)).toBeNull();
    expect(a).toEqual({ ...meta, precision: 'day', startInstant: '2025-12-31T16:00:00.000Z', endExclusive: '2026-01-31T16:00:00.000Z' });
    expect(Object.isFrozen(a)).toBe(true);
  });

  test('partial overlap, containment and equality use instants rather than string ordering', () => {
    const a = interval('2026-01-01T01:00:00+08:00', '2026-01-01T03:00:00+08:00');
    const b = interval('2025-12-31T18:00:00Z', '2025-12-31T20:00:00Z');
    expect(periodsOverlap(a, b)).toBe(true);
    expect(intersectPeriodIntervals(a, b)).toEqual(interval('2025-12-31T18:00:00.000Z', '2025-12-31T19:00:00.000Z'));
    expect(intersectPeriodIntervals(a, a)).toEqual(interval('2025-12-31T17:00:00.000Z', '2025-12-31T19:00:00.000Z'));
    expect(periodsOverlap(a, interval('2025-12-31T17:30:00Z', '2025-12-31T18:30:00Z'))).toBe(true);
  });

  test('cut points are sorted and deduplicated; edges and outside points never create empty segments', () => {
    const source = interval('2026-01-01T00:00:00Z', '2026-01-04T00:00:00Z');
    const cuts = ['2026-01-03T00:00:00Z', '2026-01-02T08:00:00+08:00', '2026-01-02T00:00:00Z', '2026-01-01T00:00:00Z', '2026-01-05T00:00:00Z'];
    const original = [...cuts];
    const segments = splitPeriodInterval(source, cuts);
    expect(segments).toEqual([
      interval('2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z'),
      interval('2026-01-02T00:00:00.000Z', '2026-01-03T00:00:00.000Z'),
      interval('2026-01-03T00:00:00.000Z', '2026-01-04T00:00:00.000Z'),
    ]);
    expect(cuts).toEqual(original);
    expect(Object.isFrozen(segments)).toBe(true);
    for (const segment of segments) expect(Object.isFrozen(segment)).toBe(true);
    expect(splitPeriodInterval(source, [])).toHaveLength(1);
    for (let i = 1; i < segments.length; i++) {
      expect(segments[i - 1]!.endExclusive).toBe(segments[i]!.startInstant);
      expect(periodsOverlap(segments[i - 1]!, segments[i]!)).toBe(false);
    }
    expect(segments.reduce((sum, s) => sum + Date.parse(s.endExclusive) - Date.parse(s.startInstant), 0)).toBe(3 * 86400000);
  });

  test('millisecond cuts preserve coverage and do not duplicate a boundary', () => {
    const segments = splitPeriodInterval(interval('2026-01-01T00:00:00.001Z', '2026-01-01T00:00:00.003Z'), ['2026-01-01T00:00:00.002Z']);
    expect(segments).toHaveLength(2);
    expect(periodsOverlap(segments[0]!, segments[1]!)).toBe(false);
  });

  test('synthetic interval matrix preserves intersection symmetry and exact split coverage', () => {
    const at = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 1000).toISOString();
    for (let start = 0; start < 5; start++) for (let end = start + 1; end <= 6; end++) {
      const source = interval(at(start), at(end));
      const segments = splitPeriodInterval(source, [at(5), at(1), at(3), at(1)]);
      expect(segments[0]!.startInstant).toBe(at(start));
      expect(segments.at(-1)!.endExclusive).toBe(at(end));
      expect(segments.reduce((sum, s) => sum + Date.parse(s.endExclusive) - Date.parse(s.startInstant), 0)).toBe((end - start) * 1000);
      for (let b = 0; b < 6; b++) {
        const other = interval(at(b), at(b + 1));
        expect(periodsOverlap(source, other)).toBe(start < b + 1 && b < end);
        expect(intersectPeriodIntervals(source, other)).toEqual(intersectPeriodIntervals(other, source));
      }
    }
  });

  test('explicit offsets normalize without rounding or local-host interpretation', () => {
    expect(normalizePeriodInstant('2026-01-01T00:00:00+05:45')).toBe('2025-12-31T18:15:00.000Z');
    expect(normalizePeriodInstant('2026-01-01T00:00:00.12Z')).toBe('2026-01-01T00:00:00.120Z');
    expect(normalizePeriodInstant('2026-01-01T00:00:00-03:30')).toBe('2026-01-01T03:30:00.000Z');
  });

  test('invalid or zone-less instants and zero/reversed intervals fail explicitly', () => {
    for (const value of ['', '2026-01-01', '2026-01-01T00:00:00', '2026-02-30T00:00:00Z', '2026-01-01T24:00:00Z', '2026-01-01T00:00:60Z', '2026-01-01T00:00:00.0001Z', '2026-01-01T00:00:00+24:00', '2026-01-01T00:00:00+01:60']) {
      expect(() => normalizePeriodInstant(value), value).toThrow();
    }
    for (const end of ['2026-01-01T00:00:00Z', '2025-01-01T00:00:00Z']) {
      const invalid = interval('2026-01-01T00:00:00Z', end);
      expect(() => splitPeriodInterval(invalid, [])).toThrow();
      expect(() => periodsOverlap(invalid, invalid)).toThrow();
      expect(() => intersectPeriodIntervals(invalid, invalid)).toThrow();
    }
    expect(() => splitPeriodInterval(interval('2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z'), ['not-an-instant'])).toThrow();
  });

  test('metadata is explicit; caller identity is preserved without generating signal IDs', () => {
    const input: NativePeriod = { ...meta, precision: 'second', startInstant: '2026-01-01T00:00:00+08:00', endExclusive: '2026-01-02T00:00:00+08:00' };
    const period = createNativePeriod(input);
    expect(period.periodId).toBe(meta.periodId);
    expect(period.kind).toBe('year');
    expect(input.startInstant).toBe('2026-01-01T00:00:00+08:00');
    for (const change of [{ periodId: '' }, { kind: ' ' }, { system: 'madeUp' }, { precision: 'minute' }, { timezone: 'Mars/City' }]) {
      expect(() => createNativePeriod({ ...input, ...change } as NativePeriod)).toThrow();
    }
  });
});

describe('#55 date-precision boundaries use bundled tzdb', () => {
  test('timezone aliases canonicalize; Taipei and Kathmandu do not use UTC midnight', () => {
    expect(dateBoundaryInstant('2026-01-01', 'Asia/Taipei')).toBe('2025-12-31T16:00:00.000Z');
    expect(dateBoundaryInstant('2026-01-01', 'Asia/Kathmandu')).toBe('2025-12-31T18:15:00.000Z');
    const period = nativePeriodFromDates({ ...meta, timezone: 'US/Eastern', startDate: '2026-01-01', endDateExclusive: '2026-01-02' });
    expect(period.timezone).toBe('America/New_York');
  });

  test('DST transition days last 23 or 25 hours rather than a hard-coded 24', () => {
    for (const [date, next, hours] of [['2024-03-10', '2024-03-11', 23], ['2024-11-03', '2024-11-04', 25]] as const) {
      const p = nativePeriodFromDates({ ...meta, timezone: 'America/New_York', startDate: date, endDateExclusive: next });
      expect(Date.parse(p.endExclusive) - Date.parse(p.startInstant)).toBe(hours * 3600000);
    }
  });

  test('nonexistent midnight and skipped civil dates are rejected, never silently shifted', () => {
    expect(() => dateBoundaryInstant('2011-12-30', 'Pacific/Apia')).toThrow(/nonexistent/i);
    expect(() => dateBoundaryInstant('2018-11-04', 'America/Sao_Paulo')).toThrow(/nonexistent/i);
  });

  test('ambiguous midnight requires an explicit overlap choice', () => {
    expect(() => dateBoundaryInstant('2024-11-03', 'America/Havana')).toThrow(/ambiguous/i);
    expect(dateBoundaryInstant('2024-11-03', 'America/Havana', 'earlier')).toBe('2024-11-03T04:00:00.000Z');
    expect(dateBoundaryInstant('2024-11-03', 'America/Havana', 'later')).toBe('2024-11-03T05:00:00.000Z');
  });

  test('reject invalid dates, unsupported zones and impossible date ranges', () => {
    for (const date of ['2026-02-30', '2026-2-01', '0000-01-01', '2026-01-01T00:00:00Z']) expect(() => dateBoundaryInstant(date, 'UTC')).toThrow();
    expect(() => dateBoundaryInstant('2026-01-01', 'Not/AZone')).toThrow();
    expect(() => nativePeriodFromDates({ ...meta, startDate: '2026-02-01', endDateExclusive: '2026-01-01' })).toThrow();
  });
});
