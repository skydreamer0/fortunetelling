import { expect, test } from 'vitest';
import { readLifeObservationV2, migrateLifeEventV1, restoreLifeEventV1, cloneObservationJson, type LifeObservationV2 } from '../src/backtest/observationsV2';
import { countObservationUnits, auditObservationDataset } from '../src/backtest/observationDataset';
import { runBacktest } from '../src/backtest/runBacktest';
import type { BacktestTimeline } from '../src/backtest/timeline';
import { validateLifeEvent } from '../src/backtest/lifeEvents';
const legacy = () => ({ id: 'event1', date: '2024-02-29', category: 'job_change', domains: ['career', 'wealth'], confidence: 'certain', description: '  preserved spaces  ', extra: { future: [false, 0, null, ''] } });
function observation(patch: Partial<LifeObservationV2> = {}): LifeObservationV2 {
  return readLifeObservationV2({ ...migrateLifeEventV1(legacy(), { personId: 'person1', clusterId: 'cluster1' }),
    source: { kind: 'synthetic', reference: null }, legacyV1: null, ...patch });
}
test('explicit migration preserves parsed v1 serialization/order/unknown data and does not normalize source', () => {
  const raw = legacy(), before = JSON.stringify(raw);
  const migrated = migrateLifeEventV1(raw, { personId: 'person1', clusterId: 'cluster1' });
  expect(JSON.stringify(restoreLifeEventV1(migrated))).toBe(before);
  expect(JSON.stringify(raw)).toBe(before);
  expect(migrated.direction).toBe('unknown'); expect(migrated.labelStatus).toBe('unreviewed');
  expect(migrated.observationStatus).toBe('event_recorded'); expect(migrated.observedWindow).toBeNull(); expect(migrated.recordedAt).toBeNull();
  raw.extra.future[0] = true; expect(JSON.stringify(restoreLifeEventV1(migrated))).toBe(before);
  const restored = restoreLifeEventV1(migrated) as ReturnType<typeof legacy>; restored.extra.future[0] = true;
  expect(JSON.stringify(restoreLifeEventV1(migrated))).toBe(before);
});
test.each([undefined, 1])('versionless/numeric1 remain v1 without silently upgrading the old reader: %s', version => {
  const raw = { ...legacy(), ...(version === undefined ? {} : { schemaVersion: version }) };
  const migrated = migrateLifeEventV1(raw, { personId: 'person1', clusterId: 'cluster1' });
  expect(validateLifeEvent(raw).ok).toBe(true); expect(validateLifeEvent(migrated).ok).toBe(false);
  expect(restoreLifeEventV1(migrated)).toEqual(raw);
});
test('month and approximate nominal dates do not create an observed window', () => {
  const result = migrateLifeEventV1({ ...legacy(), date: '2024-02', confidence: 'approx' }, { personId: 'person1', clusterId: 'cluster1' });
  expect(result.date).toEqual({ nominal: '2024-02', precision: 'month', confidence: 'approx' }); expect(result.observedWindow).toBeNull();
});
test.each([2, 3, '1', null, undefined])('explicit unsupported legacy version rejected: %s', schemaVersion => {
  expect(() => migrateLifeEventV1({ ...legacy(), schemaVersion }, { personId: 'person1', clusterId: 'cluster1' })).toThrow();
});
test('v2 never interpreted as v1 by explicit migration or legacy reader', () => {
  const value = observation(); expect(validateLifeEvent(value).ok).toBe(false);
  expect(() => migrateLifeEventV1(value, { personId: 'person1', clusterId: 'cluster1' })).toThrow();
});
const invalid: [string, (value: any) => void][] = [
  ['missing person', v => delete v.personId], ['missing cluster', v => delete v.clusterId],
  ['empty person', v => v.personId = ''], ['email-like ID', v => v.personId = 'a@example.test'],
  ['numeric cluster', v => v.clusterId = 1], ['future schema', v => v.schemaVersion = 3],
  ['unknown fields', v => v.silentDrop = true], ['direction invented', v => v.direction = 'positive'],
  ['absence without observation', v => { v.observationStatus = 'confirmed_absent'; v.labelStatus = 'confirmed'; }],
  ['absence unreviewed', v => { v.observationStatus = 'confirmed_absent'; v.observedWindow = { start: '2024-02-01', endExclusive: '2024-03-01' }; }],
  ['coerced status array', v => v.observationStatus = ['unknown']], ['coerced confidence', v => v.date.confidence = ['certain']],
  ['invalid leap day', v => v.date.nominal = '2023-02-29'], ['invalid month', v => v.date.nominal = '2024-13-01'],
  ['precision mismatch', v => v.date.precision = 'month'], ['empty domains', v => v.domains = []],
  ['duplicate domains', v => v.domains = ['career', 'career']], ['unknown domain', v => v.domains = ['unknown']],
  ['invalid recorded date', v => v.recordedAt = '2024-02-30T00:00:00.000Z'],
  ['reversed window', v => v.observedWindow = { start: '2024-03-01', endExclusive: '2024-02-01' }],
  ['empty window', v => v.observedWindow = { start: '2024-02-29', endExclusive: '2024-02-29' }],
  ['exclusive endpoint', v => v.observedWindow = { start: '2024-02-01', endExclusive: '2024-02-29' }],
  ['unknown source', v => v.source.kind = 'magic'], ['coerced source', v => v.source.kind = ['synthetic']],
  ['unexpected legacy payload', v => v.legacyV1 = legacy()],
];
for (const [name, mutate] of invalid) test(`reject ${name}`, () => { const value = observation(); mutate(value); expect(() => readLifeObservationV2(value)).toThrow(); });
test('retained legacy projection cannot be relabeled, silently changed or invented timestamped', () => {
  for (const patch of [{ labelStatus: 'confirmed' }, { observationStatus: 'unknown' }, { recordedAt: '2024-01-01T00:00:00.000Z' }, { id: 'different' }, { domains: ['health'] }]) {
    const value = migrateLifeEventV1(legacy(), { personId: 'person1', clusterId: 'cluster1' });
    expect(() => readLifeObservationV2({ ...value, ...patch })).toThrow();
  }
});
test('nonlossless JSON fails closed, including accessors without executing them', () => {
  let calls = 0; const getter = Object.defineProperty({}, 'x', { enumerable: true, get() { calls++; return 1; } });
  const cyclic: any = {}; cyclic.self = cyclic;
  for (const value of [undefined, NaN, Infinity, -0, new Date(), () => 1, { x: undefined }, [undefined], Array(2), getter, cyclic, { [Symbol('x')]: 1 }]) expect(() => cloneObservationJson(value)).toThrow();
  expect(calls).toBe(0);
});
test('confirmed no-event needs an explicit bounded observed window and remains direction unknown', () => {
  const value = observation({ observationStatus: 'confirmed_absent', labelStatus: 'confirmed', observedWindow: { start: '2024-02-01', endExclusive: '2024-03-01' } });
  expect(value.direction).toBe('unknown'); expect(countObservationUnits([value]).confirmedAbsenceClusters).toBe(1);
});
test('domain duplication and multiple records never multiply caller-declared cluster units', () => {
  const a = observation({ labelStatus: 'confirmed' }), b = observation({ id: 'event2', domains: ['career'], labelStatus: 'confirmed' });
  const one = countObservationUnits([a]), two = countObservationUnits([a, b]);
  expect(one.clusterUnits).toBe(1); expect(two.clusterUnits).toBe(1); expect(two.confirmedEventClusters).toBe(1);
  expect(two.domainAnnotations).toBe(3); expect(two.clusterDomainUnits).toBe(2); expect(two.records).toBe(2); expect(two.persons).toBe(1);
});
test('unknown, disputed and unreviewed observations cannot manufacture confirmed negative/event counts', () => {
  const rows = [observation(), observation({ id: 'event2', observationStatus: 'unknown', labelStatus: 'confirmed' }), observation({ id: 'event3', labelStatus: 'disputed' })];
  expect(countObservationUnits(rows)).toMatchObject({ confirmedEventClusters: 0, confirmedAbsenceClusters: 0, unknownOrUnreviewedRecords: 3 });
});
test('duplicate identity and conflicting confirmed labels fail instead of silently deduplicating', () => {
  const a = observation({ labelStatus: 'confirmed' }); expect(() => countObservationUnits([a, a])).toThrow('Duplicate');
  const b = observation({ id: 'event2', labelStatus: 'confirmed', observationStatus: 'confirmed_absent', observedWindow: { start: '2024-02-01', endExclusive: '2024-03-01' } });
  expect(() => countObservationUnits([a, b])).toThrow('Contradictory');
});
test('valid person-disjoint train/tune/test reports counts only; ordering has no effect', () => {
  const partitions = { train: [observation()], tune: [observation({ personId: 'person2' })], test: [observation({ personId: 'person3' })] };
  const result = auditObservationDataset(partitions);
  expect(result.total.persons).toBe(3); expect(result.total.clusterUnits).toBe(3);
  expect(result.interpretation).toBe('data-partition-audit-only'); expect(result).not.toHaveProperty('pValue'); expect(result).not.toHaveProperty('weights');
  expect(auditObservationDataset({ test: partitions.test, train: partitions.train, tune: partitions.tune })).toEqual(result);
});
test.each(['tune', 'test'])('person or cluster reuse in %s leaks even at nonoverlapping dates', split => {
  for (const patch of [{}, { clusterId: 'other', date: { nominal: '2025-01-01', precision: 'day' as const, confidence: 'certain' as const } }]) {
    const partitions = { train: [observation()], tune: [] as unknown[], test: [] as unknown[] };
    partitions[split as 'tune' | 'test'] = [observation({ id: 'other', ...patch })];
    expect(() => auditObservationDataset(partitions)).toThrow('leakage');
  }
});
test('empty explicit partitions remain zero counts, never infer an unobserved negative', () => {
  const result = auditObservationDataset({ train: [], tune: [], test: [] });
  expect(result.total.clusterUnits).toBe(0); expect(result.total.confirmedAbsenceClusters).toBe(0);
});
test.each([{}, { train: [], test: [] }, { train: [], tune: [], test: [], validation: [] }, { train: null, tune: [], test: [] }])('incomplete or ambiguous split assignment fails closed', value => {
  expect(() => auditObservationDataset(value)).toThrow();
});

test('actual v2 object is excluded by the unchanged legacy scoring runner', () => {
  const timeline: BacktestTimeline = { schemaVersion: 1, asOf: '2024-12-31', fromYear: 2024, toYear: 2024,
    systems: ['bazi'], skippedSystems: [], systemWeights: { bazi: 1 }, ruleIds: [], cells: [] };
  // @ts-expect-error V2 is not a silently compatible legacy LifeEvent input.
  const result = runBacktest([observation()], timeline, { seed: 'synthetic', randomDraws: 0 });
  expect(result.events.used).toBe(0); expect(result.overall.all.n).toBe(0);
  expect(result.events.excluded[0]?.detail).toContain('schemaVersion');
});


test('array subclasses cannot override cloning or silently discard legacy values', () => {
  let calls = 0;
  class SubArray extends Array<string> { map(): never[] { calls++; return []; } }
  const value = new SubArray('retained?');
  expect(() => cloneObservationJson(value)).toThrow('plain');
  expect(() => migrateLifeEventV1({ ...legacy(), extra: value }, { personId: 'person1', clusterId: 'cluster1' })).toThrow('plain');
  expect(calls).toBe(0);
  const plain = ['retained?'];
  const migrated = migrateLifeEventV1({ ...legacy(), extra: plain }, { personId: 'person1', clusterId: 'cluster1' });
  expect(restoreLifeEventV1(migrated)).toEqual({ ...legacy(), extra: plain });
});
test.each([
  ['2024-02', '2024-02-01', '2024-03-01', true],
  ['2024-02', '2024-02-01', '2024-02-02', false],
  ['2024-02', '2024-02-15', '2024-03-01', false],
  ['2024-02', '2024-02-01', '2024-02-29', false],
  ['2023-02', '2023-02-01', '2023-03-01', true],
  ['2023-02', '2023-02-01', '2023-02-28', false],
  ['1900-02', '1900-02-01', '1900-03-01', true],
  ['2000-02', '2000-02-01', '2000-02-29', false],
  ['2024-04', '2024-04-01', '2024-05-01', true],
  ['2024-04', '2024-04-01', '2024-04-30', false],
  ['2024-12', '2024-12-01', '2025-01-01', true],
  ['2024-12', '2024-12-01', '2024-12-31', false],
  ['9999-11', '9999-11-01', '9999-12-01', true],
  ['9999-12', '9999-12-01', '9999-12-31', false],
  ['9999-12', '9999-12-01', '10000-01-01', false],
] as const)('month %s requires full precision coverage [%s, %s): %s', (nominal, start, endExclusive, accepted) => {
  const read = () => observation({ date: { nominal, precision: 'month', confidence: 'approx' }, observationStatus: 'confirmed_absent', labelStatus: 'confirmed', observedWindow: { start, endExclusive } });
  if (accepted) expect(read().date.nominal).toBe(nominal); else expect(read).toThrow();
});
test('day precision covers its entire day and upper-bound dates are never rolled over', () => {
  expect(observation({ observedWindow: { start: '2024-02-29', endExclusive: '2024-03-01' } }).date.nominal).toBe('2024-02-29');
  const date = { nominal: '9999-12-31', precision: 'day' as const, confidence: 'certain' as const };
  expect(observation({ date }).observedWindow).toBeNull();
  expect(() => observation({ date, observedWindow: { start: '9999-12-30', endExclusive: '9999-12-31' } })).toThrow();
  expect(() => observation({ date, observedWindow: { start: '9999-12-31', endExclusive: '10000-01-01' } })).toThrow();
});
