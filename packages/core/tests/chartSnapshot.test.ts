import { describe, expect, test } from 'bun:test';
import { createCalculationSpec } from '../src/core/calculationSpec';
import { canonicalStringify } from '../src/portable/canonical';
import { NumerologyEngine } from '../src/engines/NumerologyEngine';

// The red checkpoint executes every assertion even before the module exists.
const api: any = await import('../src/core/chartSnapshot').catch(() => ({}));
const input = {
  year: 1990, month: 5, day: 17, hour: 23, minute: 10,
  gender: 'female' as const, name: 'ALICE',
  birthplace: { label: 'Synthetic', lat: 22.9999, lng: 119.2269, timezone: 'Asia/Taipei' },
};
const create = (data = input) => api.createChartSnapshot(createCalculationSpec(data));
function frozen(value: unknown) {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) frozen(child);
}

describe('sync ChartSnapshot foundation, not a Report 8 migration', () => {
  test('keeps natal access off the publicly exported engine class surface', () => {
    expect(Reflect.ownKeys(NumerologyEngine.prototype)).toEqual(['constructor', '_compute']);
    expect(new NumerologyEngine()).not.toHaveProperty('natal');
  });
  test('owns a deeply frozen, JSON-roundtrippable five-system natal DTO', () => {
    const snapshot = create();
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.scope).toBe('analyze-sync-natal');
    expect(snapshot.snapshotId).toMatch(/^sn1-[0-9a-f]{16}$/);
    expect(snapshot.specHash).toBe(createCalculationSpec(input).specHash);
    expect(Object.keys(snapshot.natal).sort()).toEqual(['bazi', 'mingGua', 'numerology', 'tzolkin', 'ziwei']);
    frozen(snapshot);
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
    expect(snapshot).not.toHaveProperty('generatedAt');
    expect(snapshot).not.toHaveProperty('asOf');
    expect(snapshot.natal.numerology.chart).not.toHaveProperty('personalYear');
    expect(snapshot.natal.numerology.chart).not.toHaveProperty('personalMonth');
    expect(snapshot.natal.numerology.chart).not.toHaveProperty('personalYears');
    expect(snapshot.natal.ziwei.chart).not.toHaveProperty('yearlySequence');
  });
  test('A to B to A is deterministic; source labels and alias spelling are metadata', () => {
    const a = create();
    const b = create({ ...input, name: 'BOB' });
    expect(b.snapshotId).not.toBe(a.snapshotId);
    expect(b.natal.numerology.chart.expression).not.toEqual(a.natal.numerology.chart.expression);
    expect(create()).toEqual(a);
    expect(create({ ...input, birthplace: { ...input.birthplace, label: 'Another label' } })).toEqual(a);
    expect(api.createChartSnapshot(createCalculationSpec({ ...input, ziHourConvention: 'splitMidnight' }))).toEqual(a);
  });
  test('every supported effective input/setting changes ID including tiny coordinates', () => {
    const a = create();
    for (const changes of [
      { day: 18 }, { hour: 22 }, { minute: 11 }, { gender: 'male' },
      { name: 'BOB' }, { timeAccuracy: 'approx15m' }, { useTrueSolarTime: false },
      { ziHourConvention: 'early' },
      { birthplace: { ...input.birthplace, lat: input.birthplace.lat + 0.000001 } },
      { birthplace: { ...input.birthplace, lng: input.birthplace.lng + 0.000001 } },
      { birthplace: { ...input.birthplace, timezone: 'Asia/Tokyo' } },
    ]) expect(api.createChartSnapshot(createCalculationSpec({ ...input, ...changes } as any)).snapshotId).not.toBe(a.snapshotId);
  });
  test('unknown time explicitly skips time-dependent natal systems', () => {
    const snapshot = api.createChartSnapshot(createCalculationSpec({ ...input, timeKnown: false }));
    expect(snapshot.natal.bazi).toEqual({ status: 'skipped', reason: 'time_unknown' });
    expect(snapshot.natal.ziwei).toEqual({ status: 'skipped', reason: 'time_unknown' });
    expect(snapshot.natal.numerology.status).toBe('computed');
  });
  test('same ID is insufficient: full identity and full natal content must match', () => {
    const expected = create();
    const roundtrip = JSON.parse(JSON.stringify(expected));
    expect(api.validateChartSnapshot(roundtrip, expected)).toBe(expected);
    const other = JSON.parse(JSON.stringify(create({ ...input, name: 'BOB' })));
    other.snapshotId = expected.snapshotId;
    other.specHash = expected.specHash;
    expect(() => api.validateChartSnapshot(other, expected)).toThrow('identity');
    roundtrip.natal.numerology.chart.lifePath.number = 99;
    expect(() => api.validateChartSnapshot(roundtrip, expected)).toThrow('content');
    expect(create()).toEqual(expected);
  });
  test('rejects missing, additional, unsupported and non-current contracts rather than guessing', () => {
    const expected = create();
    for (const candidate of [null, {}, { ...expected, schemaVersion: 2 }, { ...expected, extra: 1 },
      { ...expected, generatedAt: 'ignored?' }, { ...expected, natal: {} }]) {
      expect(() => api.validateChartSnapshot(candidate, expected)).toThrow();
    }
    for (const path of ['scope', 'versions', 'settings']) {
      const spec = structuredClone(createCalculationSpec(input)) as any;
      if (path === 'scope') spec.identity.scope = 'async-seven-system';
      if (path === 'versions') spec.identity.versions.core = 'historical';
      if (path === 'settings') spec.identity.settings.ephemeris.mode = 'enabled';
      expect(() => api.createChartSnapshot(spec)).toThrow();
    }
    expect(() => api.validateChartSnapshot(expected, structuredClone(expected))).toThrow('trusted');
  });
  test('retains the existing name-bearing spec privately, never manufactures fact IDs', () => {
    const a = create();
    expect(a.identity.input.name).toBe('ALICE');
    expect(a.snapshotId).not.toContain('ALICE');
    expect(canonicalStringify(a)).not.toContain('factId');
    expect(a).not.toHaveProperty('source');
  });
  test('rejects array extras, holes, accessors, hidden properties and symbols without reading getters', () => {
    const expected = create();
    for (const corrupt of [
      (c: any) => { c.natal.numerology.warnings.extra = 'unexpected'; },
      (c: any) => { c.natal.numerology.warnings.length = 2; },
      (c: any) => { Object.defineProperty(c, 'hidden', { value: 1 }); },
      (c: any) => { c[Symbol('extra')] = 1; },
      (c: any) => { Object.defineProperty(c, 'identity', { enumerable: true, get() { throw new Error('must not execute'); } }); },
      (c: any) => { Object.defineProperty(c.natal, 'getter', { enumerable: true, get() { throw new Error('must not execute'); } }); },
    ]) {
      const candidate = structuredClone(expected);
      corrupt(candidate);
      expect(() => api.validateChartSnapshot(candidate, expected)).toThrow('content');
    }
  });
});
