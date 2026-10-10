import { describe, expect, test, spyOn } from 'bun:test';
import { createCalculationSpec } from '../src/core/calculationSpec';
import { createChartSnapshot, type ChartSnapshot } from '../src/core/chartSnapshot';
import { interpretationBytes } from '../src/core/interpretationSpec';
import * as pillars from '../src/calculators/bazi/pillars';
import * as ids from '../src/signals/signalId';
const astro = require('iztro/lib/astro/astro') as typeof import('iztro/lib/astro/astro');
const api = await import('../src/facts/natalFactStore');
const input = { year: 1990, month: 5, day: 17, hour: 23, minute: 10, gender: 'female' as const,
  name: 'ALICE', birthplace: { label: 'Synthetic test', lat: 23, lng: 120, timezone: 'Asia/Taipei' } };
const snapshot = createChartSnapshot(createCalculationSpec(input));
const build = () => api.createNatalFactStore(snapshot);

describe('internal primary natal FactStore', () => {
  test('real four pillars retain their exact structured values and resolvable sources', () => {
    const store = build(); if (snapshot.natal.bazi.status !== 'computed') throw new Error('expected chart');
    const facts = store.facts.filter(f => f.system === 'bazi'); expect(facts).toHaveLength(4);
    for (const fact of facts) {
      if (fact.kind !== 'bazi.pillar') throw new Error('expected pillar');
      const expected = snapshot.natal.bazi.chart.pillars.pillars[fact.payload.pillar];
      expect(fact.payload).toEqual({ pillar: fact.payload.pillar, ganZhi: expected, stem: expected[0], branch: expected[1] });
      expect(api.resolveFactSource(store, snapshot, fact.sourceRefs[0]!)).toBe(expected);
      expect(fact.calculationVersion.calculator).toBe(snapshot.identity.versions.calculators.bazi);
    }
  });
  test('real Ziwei placements and all natal transformations match primary iztro data', () => {
    const store = build(); if (snapshot.natal.ziwei.status !== 'computed') throw new Error('expected chart');
    const chart = snapshot.natal.ziwei.chart.primary;
    const placements = store.facts.filter(f => f.kind === 'ziwei.star-placement');
    expect(placements.length).toBe(chart.palaces.reduce((n,p) => n + p.majorStars.length + p.minorStars.length + p.adjectiveStars.length, 0));
    for (const fact of placements) {
      if (fact.kind !== 'ziwei.star-placement') throw new Error('expected placement');
      const palace = chart.palaces.find(p => p.index === fact.payload.palace.index)!;
      const star = palace[fact.payload.group].find(s => s.name === fact.payload.star.name)!;
      expect(fact.payload.star).toEqual({ name: star.name, type: star.type });
      expect(fact.payload.palace).toEqual({ index: palace.index, name: palace.name, stem: palace.stem, branch: palace.branch });
      expect(fact.sourceRefs.map(r => api.resolveFactSource(store, snapshot, r))).toContainEqual(star);
    }
    const changes = store.facts.filter(f => f.kind === 'ziwei.natal-transformation');
    expect(changes.length).toBe(chart.natalTransformations.length); expect(changes.length).toBe(4);
    for (const fact of changes) {
      if (fact.kind !== 'ziwei.natal-transformation') throw new Error('expected transformation');
      expect(chart.natalTransformations).toContainEqual({ star: fact.payload.star, mutagen: fact.payload.mutagen,
        palace: fact.payload.palace.name, palaceIndex: fact.payload.palace.index });
      expect(fact.sourceRefs).toHaveLength(3);
      for (const ref of fact.sourceRefs) expect(api.resolveFactSource(store, snapshot, ref)).toBeDefined();
    }
  });
  test('primary-only scope and omitted alternatives are explicit, never fabricated periods', () => {
    const store = build(); expect(store.coverage.bazi.omittedAlternativeCount).toBeGreaterThan(0);
    expect(store.coverage.ziwei.omittedAlternativeCount).toBeGreaterThan(0);
    for (const fact of store.facts) {
      expect(fact.chartVariant).toBe('primary'); expect(fact.nativePeriod).toEqual({ kind: 'natal' });
      for (const ref of fact.sourceRefs) expect(ref.path).not.toContain('alternatives');
      expect(fact).not.toHaveProperty('start'); expect(fact).not.toHaveProperty('end');
    }
    expect(store.coverage.bazi.uncovered).toContain('luck-cycles-and-flow-periods');
    expect(store.coverage.ziwei.uncovered).toContain('alternative-charts');
    expect(store.coverage.otherSystems).toEqual(['humanDesign', 'jyotish', 'mingGua', 'numerology', 'tzolkin']);
  });
  test('missing time emits no Bazi/Ziwei facts, no noon substitute', () => {
    const unknown = createChartSnapshot(createCalculationSpec({ ...input, timeKnown: false }));
    const store = api.createNatalFactStore(unknown); expect(store.facts).toEqual([]);
    expect(store.coverage.bazi.status).toBe('time_unknown'); expect(store.coverage.ziwei.status).toBe('time_unknown');
    expect(store.coverage.bazi.coveredKinds).toEqual([]); expect(store.coverage.ziwei.coveredKinds).toEqual([]);
  });
  test('A to B to A is stable and all operations reuse snapshots without calculation', () => {
    const other = createChartSnapshot(createCalculationSpec({ ...input, day: 18 }));
    const bazi = spyOn(pillars, 'computePillars'), luck = spyOn(pillars, 'luckCycles'), ziwei = spyOn(astro, 'bySolar');
    try {
      const a = build(), b = api.createNatalFactStore(other), again = build();
      expect(interpretationBytes(a)).toBe(interpretationBytes(again)); expect(a).not.toEqual(b);
      api.validateNatalFactStore(JSON.parse(JSON.stringify(a)), a);
      api.resolveFactReferences(a, snapshot, a.facts.map(f => f.factId));
      expect(bazi).not.toHaveBeenCalled(); expect(luck).not.toHaveBeenCalled(); expect(ziwei).not.toHaveBeenCalled();
    } finally { bazi.mockRestore(); luck.mockRestore(); ziwei.mockRestore(); }
  });
  test('name is excluded from fact identity but snapshot binding remains separate', () => {
    const renamed = createChartSnapshot(createCalculationSpec({ ...input, name: 'BOB' }));
    const a = build(), b = api.createNatalFactStore(renamed);
    expect(a.facts.map(f => f.factId)).toEqual(b.facts.map(f => f.factId)); expect(snapshot.snapshotId).not.toBe(renamed.snapshotId);
    for (const f of a.facts) expect(interpretationBytes(api.factIdentity(f))).not.toContain('ALICE');
    expect(() => api.resolveFactReferences(a, renamed, [b.facts[0]!.factId])).toThrow();
    expect(() => api.resolveFactSource(a, renamed, b.facts[0]!.sourceRefs[0]!)).toThrow();
  });
  test('unknown, duplicate, foreign and malformed references fail', () => {
    const store = build(), first = store.facts[0]!;
    expect(() => api.resolveFactReferences(store, snapshot, ['f1-missing'])).toThrow();
    expect(() => api.resolveFactReferences(store, snapshot, [first.factId, first.factId])).toThrow();
    expect(() => api.resolveFactReferences(store, structuredClone(snapshot), [first.factId])).toThrow();
    expect(() => api.resolveFactReferences(store, snapshot, [undefined] as any)).toThrow();
    expect(() => api.resolveFactSource(store, snapshot, { ...first.sourceRefs[0]!, path: '/identity/input/name' })).toThrow();
    expect(() => api.resolveFactSource(store, snapshot, { ...first.sourceRefs[0]!, snapshotId: 'sn1-foreign' })).toThrow();
    expect(() => api.resolveFactSource(store, snapshot, { ...first.sourceRefs[0]!, path: '/natal/ziwei/chart/primary/palaces/999' })).toThrow();
  });
  test('serialized validation rejects nonexistent sources, missing facts and same ID different content', () => {
    const store = build(); const clone = () => structuredClone(store) as any;
    const mutations = [
      (x: any) => { x.facts[0].payload.extra = true; },
      (x: any) => { x.facts[0].sourceRefs[0].path += '/missing'; },
      (x: any) => { x.facts[0].snapshotId = 'foreign'; },
      (x: any) => { x.facts[0].calculationVersion.calculator = 'future'; },
      (x: any) => { x.facts.pop(); },
      (x: any) => { x.facts.push({ ...x.facts[0], payload: {} }); },
      (x: any) => { x.binding.snapshot.natal.bazi.chart.pillars.pillars.day = '甲子'; },
      (x: any) => { x.schemaVersion = 2; },
    ];
    for (const mutate of mutations) { const bad = clone(); mutate(bad); expect(() => api.validateNatalFactStore(bad, store)).toThrow(); }
    expect(() => api.validateNatalFactStore(store, clone())).toThrow();
    expect(() => api.createNatalFactStore(structuredClone(snapshot))).toThrow();
  });
  test('canonical fact/source/reference ordering is stable and duplicates rejected', () => {
    const store = build(); const candidate = structuredClone(store) as any;
    candidate.facts.reverse(); for (const fact of candidate.facts) fact.sourceRefs.reverse();
    expect(api.validateNatalFactStore(candidate, store)).toBe(store);
    const refs = store.facts.map(f => f.factId);
    expect(api.resolveFactReferences(store, snapshot, [...refs].reverse())).toEqual(api.resolveFactReferences(store, snapshot, refs));
    candidate.facts[0].sourceRefs.push(candidate.facts[0].sourceRefs[0]);
    expect(() => api.validateNatalFactStore(candidate, store)).toThrow();
  });
  test('data is immutable, no accessor/toJSON/hidden/sparse content is silently dropped', () => {
    const store = build(); let reads = 0;
    const accessor = { ...store }; Object.defineProperty(accessor, 'facts', { enumerable: true, get() { reads++; return []; } });
    const hidden = { ...store }; Object.defineProperty(hidden, 'hidden', { value: true });
    const bad = [{ ...store, toJSON() { reads++; return {}; } }, accessor, hidden, { ...store, [Symbol('x')]: true }, { ...store, facts: new Array(1) }];
    for (const candidate of bad) expect(() => api.validateNatalFactStore(candidate, store)).toThrow();
    const forgedExpected = { get binding() { reads++; return store.binding; } } as any;
    expect(() => api.validateNatalFactStore(store, forgedExpected)).toThrow();
    expect(() => api.resolveFactReferences(store, undefined as any, [])).toThrow();
    expect(reads).toBe(0); expect(Object.isFrozen(store.facts[0]!.payload)).toBe(true);
    expect(() => (store.facts as any).push({})).toThrow();
    expect(() => (api.createNatalFactStore as any)(snapshot, { adapter: () => [] })).toThrow();
  });
  test('digest collisions cannot admit conflicting facts or cross-snapshot binding', () => {
    let a: ChartSnapshot, b: ChartSnapshot;
    const hash = spyOn(ids, 'fnv1a64Hex').mockReturnValue('0000000000000000');
    try {
      a = createChartSnapshot(createCalculationSpec(input)); b = createChartSnapshot(createCalculationSpec({ ...input, name: 'BOB' }));
      expect(a.snapshotId).toBe(b.snapshotId); expect(a.specHash).toBe(b.specHash);
      expect(() => api.createNatalFactStore(a)).toThrow('collision');
    } finally { hash.mockRestore(); }
    const store = api.createNatalFactStore(a!);
    expect(() => api.resolveFactReferences(store, b!, [store.facts[0]!.factId])).toThrow();
    expect(() => api.resolveFactSource(store, b!, store.facts[0]!.sourceRefs[0]!)).toThrow();
  });
});
