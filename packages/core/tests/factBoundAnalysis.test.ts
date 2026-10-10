import { describe, expect, test, spyOn } from 'bun:test';
import { createCalculationSpec } from '../src/core/calculationSpec';
import { createChartSnapshot } from '../src/core/chartSnapshot';
import { interpretationBytes } from '../src/core/interpretationSpec';
import { createNatalFactStore, resolveFactReferences, resolveFactSource } from '../src/facts/natalFactStore';
import { createBoundSchoolRegistry, createSyntheticBoundSchoolRegistry } from '../src/schools/boundAnalysis';
import { compareSchoolAssessments } from '../src/schools/registry';
import * as pillars from '../src/calculators/bazi/pillars';
import * as ids from '../src/signals/signalId';
const astro = require('iztro/lib/astro/astro') as typeof import('iztro/lib/astro/astro');

const input = { year: 1990, month: 5, day: 17, hour: 23, minute: 10, gender: 'female' as const,
  name: 'ALICE', birthplace: { label: 'Synthetic', lat: 23, lng: 120, timezone: 'Asia/Taipei' } };
const snapshot = createChartSnapshot(createCalculationSpec(input));
const store = createNatalFactStore(snapshot);
const context = { factIds: store.facts.map(f => f.factId), availableConditions: ['ready', 'other'] };
const ref = (packId = 'a', packVersion = '1') => ({ system: 'bazi' as const, packId, packVersion });
const setup = () => {
  const registry = createSyntheticBoundSchoolRegistry();
  return { registry, spec: (packId = 'a', packVersion = '1') => registry.createSpec([ref(packId, packVersion)]) };
};

describe('owned FactStore to internal interpretation consumer', () => {
  test('resolves real immutable input facts and every conclusion back to original sources', () => {
    const { registry, spec } = setup();
    const result = registry.bindFacts(snapshot, spec(), store, context).run();
    expect(result.analysisId).toStartWith('ifa1-');
    expect(result.identity.scope).toBe('synthetic-fact-backed-sync-natal');
    expect(result.identity.factStore).toBe(store); expect(result.identity.snapshot).toBe(snapshot);
    expect(result.identity.context.facts).toEqual(store.facts);
    expect(result.identity.context.facts[0]).toBe(store.facts[0]);
    const conclusion = result.assessments[0]!.conclusions[0]!;
    expect(conclusion.facts).toEqual(resolveFactReferences(store, snapshot, conclusion.factIds));
    expect(conclusion.facts.length).toBeGreaterThan(0);
    for (const fact of conclusion.facts) {
      expect(fact.system).toBe('bazi');
      for (const source of fact.sourceRefs) expect(resolveFactSource(store, snapshot, source)).toBeDefined();
      expect(Object.isFrozen(fact.payload)).toBe(true);
    }
    expect(Object.isFrozen(result.identity.context.facts)).toBe(true);
    expect(() => compareSchoolAssessments(result.assessments)).toThrow('untrusted');
  });
  test('canonical ordering and interpretation A to B to A are stable', () => {
    const { registry, spec } = setup(); const before = interpretationBytes(store);
    const a = registry.bindFacts(snapshot, spec(), store, context).run();
    const b = registry.bindFacts(snapshot, spec('b'), store, context).run();
    const again = registry.bindFacts(snapshot, spec(), store,
      { factIds: [...context.factIds].reverse(), availableConditions: ['other', 'ready'] }).run();
    expect(a).toEqual(again); expect(a.analysisId).not.toBe(b.analysisId);
    expect(interpretationBytes(store)).toBe(before);
    const both = registry.bindFacts(snapshot, registry.createSpec([ref('a'), ref('b')]), store, context).run();
    expect(both.comparisons[0]!.status).toBe('conflict');
    expect(both.assessments).toHaveLength(2);
    expect(both).toEqual(registry.bindFacts(snapshot, registry.createSpec([ref('b'), ref('a')]), store, context).run());
  });
  test('fact-backed identity and validation never accept legacy opaque bindings', () => {
    const { registry, spec } = setup(); const selection = spec();
    const legacy = registry.bind(snapshot, selection, context).run();
    const result = registry.bindFacts(snapshot, selection, store, context).run();
    expect(legacy.analysisId).toStartWith('ia1-'); expect(result.analysisId).not.toBe(legacy.analysisId);
    expect(() => registry.validateFacts(legacy, result)).toThrow();
    expect(() => registry.validateFacts(result, legacy as any)).toThrow();
    expect(() => registry.validate(result, result as any)).toThrow();
    expect(registry.validateFacts(JSON.parse(JSON.stringify(result)), result)).toBe(result);
    expect(() => registry.validateFacts(result, structuredClone(result))).toThrow();
  });
  test('missing, duplicate, malformed and caller-forged facts fail before evaluation', () => {
    const { registry, spec } = setup(); const selection = spec();
    for (const factIds of [['missing'], [context.factIds[0]!, context.factIds[0]!], [undefined], new Array(2)]) {
      expect(() => registry.bindFacts(snapshot, selection, store, { ...context, factIds } as any)).toThrow();
    }
    const forged: any = structuredClone(store); forged.facts[0].payload = { forged: true };
    expect(() => registry.bindFacts(snapshot, selection, forged, context)).toThrow('owned');
    expect(() => registry.bindFacts(snapshot, selection, structuredClone(store), context)).toThrow('owned');
    expect(() => registry.bindFacts(structuredClone(snapshot), selection, store, context)).toThrow();
    expect(() => registry.bindFacts(snapshot, selection, store, { ...context, facts: store.facts } as any)).toThrow();
  });
  test('same IDs on another named chart do not authorize foreign snapshot or store', () => {
    const other = createChartSnapshot(createCalculationSpec({ ...input, name: 'BOB' }));
    const otherStore = createNatalFactStore(other); const { registry, spec } = setup(); const selection = spec();
    expect(otherStore.facts.map(f => f.factId)).toEqual(context.factIds);
    expect(() => registry.bindFacts(other, selection, store, context)).toThrow();
    expect(() => registry.bindFacts(snapshot, selection, otherStore, context)).toThrow();
    const a = registry.bindFacts(snapshot, selection, store, context).run();
    const b = registry.bindFacts(other, selection, otherStore, context).run();
    expect(a.analysisId).not.toBe(b.analysisId);
    const forged: any = structuredClone(b); forged.analysisId = a.analysisId;
    expect(() => registry.validateFacts(forged, a)).toThrow();
  });
  test('full result validation rejects equal ID with altered payload/source/store/assessment', () => {
    const { registry, spec } = setup(); const a = registry.bindFacts(snapshot, spec(), store, context).run();
    const changes = [
      (x: any) => { x.identity.context.facts[0].payload = {}; },
      (x: any) => { x.identity.factStore.facts[0].payload = {}; },
      (x: any) => { x.identity.factStore.coverage.bazi.omittedAlternativeCount++; },
      (x: any) => { x.assessments[0].conclusions[0].facts[0].sourceRefs[0].path += '/missing'; },
      (x: any) => { x.assessments[0].conclusions[0].facts[0].payload = {}; },
      (x: any) => { x.assessments[0].conclusions[0].factIds.push('missing'); },
      (x: any) => { x.assessments[0].conclusions[0].facts.push(x.assessments[0].conclusions[0].facts[0]); },
      (x: any) => { x.assessments[0].conclusions[0].stance = 'oppose'; },
    ];
    for (const change of changes) { const bad = structuredClone(a); change(bad); expect(() => registry.validateFacts(bad, a)).toThrow(); }
  });
  test('no facts means abstention; foreign-system facts are never silently cited', () => {
    const { registry, spec } = setup(); const selection = spec();
    for (const factIds of [[], store.facts.filter(f => f.system === 'ziwei').map(f => f.factId)]) {
      const a = registry.bindFacts(snapshot, selection, store, { ...context, factIds }).run();
      expect(a.assessments[0]!.status).toBe('abstain'); expect(a.assessments[0]!.conclusions).toEqual([]);
    }
  });
  test('production remains placeholders across all five systems, without invented rules', () => {
    const registry = createBoundSchoolRegistry();
    const selection = registry.createSpec(['bazi', 'ziwei', 'numerology', 'tzolkin', 'mingGua'].map(system => ({ system, packId: 'default', packVersion: '1' })) as any);
    const a = registry.bindFacts(snapshot, selection, store, context).run();
    expect(a.identity.scope).toBe('fact-backed-sync-natal'); expect(a.assessments).toHaveLength(5);
    for (const assessment of a.assessments) { expect(assessment.reason).toBe('default_placeholder_no_rules'); expect(assessment.conclusions).toEqual([]); }
    expect(a.comparisons).toEqual([]);
  });
  test('missing time stays unavailable and does not invent noon facts', () => {
    const unknown = createChartSnapshot(createCalculationSpec({ ...input, timeKnown: false }));
    const empty = createNatalFactStore(unknown); const { registry, spec } = setup();
    const a = registry.bindFacts(unknown, spec(), empty, { ...context, factIds: [] }).run();
    expect(a.identity.context.facts).toEqual([]); expect(a.assessments).toEqual([]);
    expect(a.unavailable).toEqual([{ ref: ref(), reason: 'time_unknown' }]);
    expect(() => registry.bindFacts(unknown, spec(), empty, context)).toThrow();
  });
  test('binding, switching packs, running and validating perform zero natal calculations', () => {
    const bazi = spyOn(pillars, 'computePillars'), luck = spyOn(pillars, 'luckCycles'), ziwei = spyOn(astro, 'bySolar');
    try {
      const { registry, spec } = setup();
      for (const selected of [spec(), spec('b'), spec(), spec('a', '2')]) {
        const a = registry.bindFacts(snapshot, selected, store, context).run();
        registry.validateFacts(JSON.parse(JSON.stringify(a)), a);
      }
      expect(bazi).not.toHaveBeenCalled(); expect(luck).not.toHaveBeenCalled(); expect(ziwei).not.toHaveBeenCalled();
    } finally { bazi.mockRestore(); luck.mockRestore(); ziwei.mockRestore(); }
  });
  test('forced identity collisions cannot bypass complete snapshot and result comparison', () => {
    const hash = spyOn(ids, 'fnv1a64Hex').mockReturnValue('0000000000000000');
    let a: ReturnType<typeof createChartSnapshot>, b: ReturnType<typeof createChartSnapshot>;
    try {
      a = createChartSnapshot(createCalculationSpec(input)); b = createChartSnapshot(createCalculationSpec({ ...input, name: 'BOB' }));
    } finally { hash.mockRestore(); }
    const aStore = createNatalFactStore(a!), { registry, spec } = setup();
    expect(a!.snapshotId).toBe(b!.snapshotId);
    expect(() => registry.bindFacts(b!, spec(), aStore, context)).toThrow();
    const collide = spyOn(ids, 'fnv1a64Hex').mockReturnValue('0000000000000000');
    try {
      const one = registry.bindFacts(snapshot, spec(), store, context).run();
      const two = registry.bindFacts(snapshot, spec('b'), store, context).run();
      expect(one.analysisId).toBe(two.analysisId); expect(() => registry.validateFacts(two, one)).toThrow();
    } finally { collide.mockRestore(); }
  });
  test('stale calculator environment blocks bind, run and validation without recalculation', () => {
    const { registry, spec } = setup(); const selection = spec();
    const bound = registry.bindFacts(snapshot, selection, store, context), result = bound.run();
    const original = astro.getConfig();
    try {
      astro.config({ horoscopeDivide: 'exact' });
      expect(() => registry.bindFacts(snapshot, selection, store, context)).toThrow();
      expect(() => bound.run()).toThrow(); expect(() => registry.validateFacts(result, result)).toThrow();
    } finally { astro.config({ horoscopeDivide: original.horoscopeDivide }); }
  });
  test('rejects accessor/context/code injection and foreign specs without invoking getters', () => {
    const { registry, spec } = setup(); const selection = spec(); let reads = 0;
    const bad: any = { ...context }; Object.defineProperty(bad, 'factIds', { enumerable: true, get() { reads++; return context.factIds; } });
    expect(() => registry.bindFacts(snapshot, selection, store, bad)).toThrow();
    expect(() => (registry.bindFacts as any)(snapshot, selection, store, context, () => [])).toThrow();
    expect(() => registry.bindFacts(snapshot, setup().spec(), store, context)).toThrow();
    expect(() => (registry.bindFacts(snapshot, selection, store, context).run as any)(context)).toThrow();
    expect(() => registry.validateFacts({}, { get identity() { reads++; return {}; } } as any)).toThrow();
    expect(reads).toBe(0);
  });
});
