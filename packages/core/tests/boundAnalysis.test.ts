import { describe, expect, test, spyOn } from 'bun:test';
import * as pillars from '../src/calculators/bazi/pillars';
const astro = require('iztro/lib/astro/astro') as typeof import('iztro/lib/astro/astro');
import { createCalculationSpec } from '../src/core/calculationSpec';
import { createChartSnapshot } from '../src/core/chartSnapshot';
import { DEFAULT_SCHOOL_PACKS, compareSchoolAssessments } from '../src/schools/registry';
import { interpretationBytes } from '../src/core/interpretationSpec';
import type { SchoolPack, SchoolPackRef } from '../src/schools/types';

// Preserve a runnable tests-first checkpoint before the internal module exists.
const api = await import('../src/schools/boundAnalysis');
const input = { year: 1990, month: 5, day: 17, hour: 23, minute: 10, gender: 'female' as const,
  name: 'ALICE', birthplace: { label: 'Synthetic', lat: 23, lng: 120, timezone: 'Asia/Taipei' } };
const snapshot = createChartSnapshot(createCalculationSpec(input));
const pack = (packId: string, changes: Partial<SchoolPack> = {}): SchoolPack => ({
  schemaVersion: 1, kind: 'contract', system: 'bazi', packId, packVersion: '1',
  claims: [{ claimId: 'synthetic-claim', description: 'Test only' }], requiredConditions: ['ready'],
  ruleSources: [{ sourceId: 'fixture', citation: 'Synthetic, not predictive evidence' }],
  verification: { status: 'unknown', reason: 'Synthetic only' }, ...changes,
});
const ref = (p: SchoolPack): SchoolPackRef => ({ system: p.system, packId: p.packId, packVersion: p.packVersion });
const context = { factIds: ['z', 'a'], availableConditions: ['ready', 'other'] };
function setup(ids = ['a', 'b', 'c']) {
  const registry = api.createSyntheticBoundSchoolRegistry();
  const packs = ids.map(id => pack(id));
  return { registry, packs, spec: (indices = [0]) => registry.createSpec(indices.map(i => ref(packs[i]!))) };
}
describe('internal snapshot-bound interpretation identity', () => {
  test('switching packs performs zero further real natal calculations', () => {
    const bazi = spyOn(pillars, 'computePillars'), luck = spyOn(pillars, 'luckCycles'), ziwei = spyOn(astro, 'bySolar');
    try {
      const natal = createChartSnapshot(createCalculationSpec(input));
      expect(bazi).toHaveBeenCalledTimes(1); expect(luck).toHaveBeenCalledTimes(1);
      const count = ziwei.mock.calls.length; expect(count).toBeGreaterThan(0);
      const { registry, spec } = setup();
      for (const selected of [spec(), spec([1]), spec()]) registry.bind(natal, selected, context).run();
      expect(bazi).toHaveBeenCalledTimes(1); expect(luck).toHaveBeenCalledTimes(1);
      expect(ziwei.mock.calls.length).toBe(count);
    } finally { bazi.mockRestore(); luck.mockRestore(); ziwei.mockRestore(); }
  });
  test('A to B to A changes interpretation identity without altering natal bytes', () => {
    const { registry, spec } = setup(); const before = JSON.stringify(snapshot);
    const a = registry.bind(snapshot, spec(), context).run();
    const b = registry.bind(snapshot, spec([1]), context).run();
    const again = registry.bind(snapshot, spec(), context).run();
    expect(a).toEqual(again); expect(a.analysisId).not.toBe(b.analysisId);
    expect(a.identity.snapshot).toBe(snapshot); expect(JSON.stringify(snapshot)).toBe(before);
    expect(a.identity.snapshot.specHash).toBe(snapshot.specHash);
  });
  test('context sets are normalized before identity and actual evaluator use', () => {
    const { registry, spec } = setup();
    const a = registry.bind(snapshot, spec(), context).run();
    expect(a.identity.context.factIds).toEqual(['a', 'z']); expect(a.identity.context.availableConditions).toEqual(['other', 'ready']);
    expect(Object.isFrozen(a.identity.context.factIds)).toBe(true);
    expect(a.assessments[0]!.conclusions[0]!.factIds).toEqual(['a']);
    const b = registry.bind(snapshot, spec(), { factIds: ['a', 'z'], availableConditions: ['other', 'ready'] }).run();
    expect(b).toEqual(a);
    expect(registry.bind(snapshot, spec(), { ...context, factIds: ['different'] }).run().analysisId).not.toBe(a.analysisId);
    expect(() => registry.bind(snapshot, spec(), { ...context, factIds: ['a', 'a'] })).toThrow();
  });
  test('rejects unknown/latest/exact historical implementations and mixed selected versions', () => {
    const p = pack('a'), old = pack('a', { packVersion: '0' });
    const registry = api.createSyntheticBoundSchoolRegistry();
    for (const refs of [[{ ...ref(p), packVersion: 'latest' }], [ref(old)], [ref(p), ref(old)], [ref(p), ref(p)]]) {
      expect(() => registry.createSpec(refs)).toThrow();
    }
    expect(() => (api.createBoundSchoolRegistry as any)([p], [{ ref: ref(p), evaluate: () => [] }])).toThrow();
  });
  test('same hashes or opaque facts never admit wrong chart bytes or forged results', () => {
    const { registry, spec } = setup(); const selection = spec();
    const a = registry.bind(snapshot, selection, context).run();
    const other = createChartSnapshot(createCalculationSpec({ ...input, day: 18 }));
    expect(registry.bind(other, selection, context).run().analysisId).not.toBe(a.analysisId);
    expect(() => registry.bind(structuredClone(snapshot), selection, context)).toThrow();
    const forged: any = structuredClone(a); forged.identity.snapshot.natal.bazi.chart.pillars = {};
    expect(() => registry.validate(forged, a)).toThrow();
    const wrong: any = structuredClone(registry.bind(other, selection, context).run()); wrong.analysisId = a.analysisId;
    expect(() => registry.validate(wrong, a)).toThrow();
    expect(registry.validate(JSON.parse(JSON.stringify(a)), a)).toBe(a);
    expect(() => registry.validate(a, structuredClone(a))).toThrow();
    expect(() => compareSchoolAssessments(a.assessments)).toThrow('untrusted');
    const forgedAssessment: any = structuredClone(a); forgedAssessment.assessments[0].conclusions[0].stance = 'oppose';
    expect(() => registry.validate(forgedAssessment, a)).toThrow();
  });
  test('rejects malformed data without invoking getters or toJSON', () => {
    const { registry, spec } = setup(); const selection = spec(); let read = 0;
    const cases: any[] = [{ ...context, extra: true }, { ...context, generatedAt: 'hidden?' }, { ...context, factIds: ['a', undefined] },
      { ...context, factIds: new Array(2) }, { ...context, toJSON() { read++; return context; } }];
    const accessor = { ...context }; Object.defineProperty(accessor, 'factIds', { enumerable: true, get() { read++; return ['a']; } }); cases.push(accessor);
    const hidden = { ...context }; Object.defineProperty(hidden, 'hidden', { value: 1 }); cases.push(hidden);
    const symbol = { ...context, [Symbol('x')]: 1 }; cases.push(symbol);
    for (const bad of cases) expect(() => registry.bind(snapshot, selection, bad)).toThrow();
    expect(read).toBe(0);
    const proto = JSON.parse('{"__proto__":{"polluted":true}}');
    expect(interpretationBytes(proto)).toBe('{"__proto__":{"polluted":true}}');
    expect(() => registry.bind(snapshot, selection, { ...context, ...proto })).toThrow();
  });
  test('retains code-owned tuple implementation, rejects runtime substitution and foreign specs', () => {
    const { registry, spec } = setup(); const selected = spec();
    expect(() => (registry.bind as any)(snapshot, selected, context, () => [])).toThrow();
    expect(() => registry.bind(snapshot, structuredClone(selected), context)).toThrow();
    const other = setup().registry;
    expect(() => other.bind(snapshot, selected, context)).toThrow();
  });
  test('defaults abstain; async selections reject; missing birth time is explicitly unavailable', () => {
    const registry = api.createBoundSchoolRegistry();
    const sync = DEFAULT_SCHOOL_PACKS.filter(p => !['jyotish', 'humanDesign'].includes(p.system));
    const selection = registry.createSpec(sync.map(ref));
    const a = registry.bind(snapshot, selection, context).run();
    expect(a.assessments).toHaveLength(5); expect(a.assessments.every((a: any) => a.status === 'abstain' && a.verification.status === 'unknown')).toBe(true);
    expect(a.comparisons).toEqual([]);
    for (const p of DEFAULT_SCHOOL_PACKS.filter(p => !sync.includes(p))) expect(() => registry.createSpec([ref(p)])).toThrow();
    const unknown = createChartSnapshot(createCalculationSpec({ ...input, timeKnown: false }));
    const result = registry.bind(unknown, selection, context).run();
    expect(result.unavailable.map((x: any) => x.ref.system)).toEqual(['bazi', 'ziwei']);
    expect(result.unavailable.every((x: any) => x.reason === 'time_unknown')).toBe(true);
  });
  test('comparisons are proposition-local and abstentions never add agreement or system votes', () => {
    const { registry, spec } = setup();
    expect(registry.bind(snapshot, spec([0, 1]), context).run().comparisons[0]!.status).toBe('conflict');
    const all = setup(['a', 'c', 'd']);
    const result = all.registry.bind(snapshot, all.spec([0, 1, 2]), context).run();
    expect(result.comparisons).toHaveLength(1); expect(result.comparisons[0]!.status).toBe('agreement');
    expect(result.comparisons[0]).not.toHaveProperty('votes');
    const different = setup(['a', 'different']);
    expect(different.registry.bind(snapshot, different.spec([0, 1]), context).run().comparisons).toHaveLength(2);
    const missing = setup(['a', 'missing']);
    expect(missing.registry.bind(snapshot, missing.spec([0, 1]), context).run().comparisons[0]!.status).toBe('single');
  });
  test('selection order is canonical, retained versions change identity, and old code never falls back', () => {
    const { registry, spec } = setup();
    expect(spec([1, 0])).toEqual(spec([0, 1]));
    const current = registry.bind(snapshot, spec(), context).run();
    const later = registry.createSpec([{ ...ref(pack('a')), packVersion: '2' }]);
    const changed = registry.bind(snapshot, later, context).run();
    expect(changed.analysisId).not.toBe(current.analysisId);
    expect(changed.assessments[0]!.conclusions[0]!.stance).toBe('oppose');
    expect(registry.validateSpec(JSON.parse(JSON.stringify(later)), later)).toBe(later);
    for (const changes of [{ comparisonVersion: 2 }, { interpretationVersion: 2 }, { schemaVersion: 2 }, { extra: 1 }]) {
      expect(() => registry.validateSpec({ ...later, ...changes }, later)).toThrow();
    }
    const rebuild = setup();
    expect(rebuild.registry.bind(snapshot, rebuild.spec(), context).run()).toEqual(current);
    const production = api.createBoundSchoolRegistry();
    expect(() => production.bind(snapshot, spec(), context)).toThrow();
    expect(() => (api.createSyntheticBoundSchoolRegistry as any)(() => [])).toThrow();
  });
  test('bound data owns copies and forbids hidden mutation or evaluator replacement', () => {
    const { registry, spec } = setup(); const original = { factIds: ['z', 'a'], availableConditions: ['ready'] };
    const bound = registry.bind(snapshot, spec(), original); const before = bound.run();
    original.factIds.push('changed'); original.availableConditions.length = 0;
    expect(bound.run()).toEqual(before);
    expect(() => (bound.run as any)(() => [])).toThrow();
    expect(() => (before.identity.context.factIds as string[]).push('changed')).toThrow();
    const malformed: any = [ref(pack('a'))]; let calls = 0;
    Object.defineProperty(malformed, '0', { enumerable: true, get() { calls++; return ref(pack('a')); } });
    expect(() => registry.createSpec(malformed)).toThrow(); expect(calls).toBe(0);
    expect(() => registry.createSpec([])).toThrow();
    expect(() => registry.createSpec([{ ...ref(pack('a')), packId: 'a|b' }])).toThrow();
  });
});
