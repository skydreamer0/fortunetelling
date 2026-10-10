import { describe, expect, test } from 'bun:test';
import { SYSTEM_IDS } from '../src/signals/types';
import type { SchoolPack, SchoolPackRef, SchoolContext, SchoolAssessment } from '../src/schools/types';
import { createSchoolPackRegistry, DEFAULT_SCHOOL_REGISTRY, compareSchoolAssessments, schoolPackKey } from '../src/schools/registry';
const make = (packId: string, changes: Partial<SchoolPack> = {}): SchoolPack => ({
  schemaVersion: 1, system: 'bazi', packId, packVersion: '1', kind: 'contract',
  claims: [{ claimId: 'synthetic-claim', description: 'Synthetic proposition, not a real rule' }],
  requiredConditions: ['condition'], ruleSources: [{ sourceId: 'fixture', citation: 'Synthetic test only' }],
  verification: { status: 'unknown', reason: 'Not assessed by ValidationRegistry' }, ...changes,
});
const ref = (p: SchoolPack): SchoolPackRef => ({ system: p.system, packId: p.packId, packVersion: p.packVersion });
const context: SchoolContext = { factIds: ['synthetic-fact'], availableConditions: ['condition'] };
function setup(packs = [make('a'), make('b'), make('c')]) {
  const registry = createSchoolPackRegistry(packs);
  const assess = (i: number, stance: 'support' | 'oppose' = 'support', input = context) => registry.assess(ref(packs[i]!), input,
    () => [{ claimId: packs[i]!.claims[0]!.claimId, stance, factIds: ['synthetic-fact'] }]);
  return { packs, registry, assess };
}
describe('SchoolPack internal contract, without production ranking wiring', () => {
  test('seven defaults have unknown verification, no capabilities and always abstain', () => {
    expect(DEFAULT_SCHOOL_REGISTRY.list().map(p => p.system).sort()).toEqual([...SYSTEM_IDS].sort());
    for (const pack of DEFAULT_SCHOOL_REGISTRY.list()) {
      expect(pack.packId).toBe('default');
      let invoked = false;
      const result = DEFAULT_SCHOOL_REGISTRY.assess(ref(pack), context, () => { invoked = true; return []; });
      expect(invoked).toBe(false);
      expect(result.status).toBe('abstain');
      expect(result.reason).toBe('default_placeholder_no_rules');
      expect(result.verification.status).toBe('unknown');
      expect(result.conclusions).toEqual([]);
    }
  });
  test('retains exact versions, rejects latest and other systems; deterministic order and JSON', () => {
    const a = make('a'), b = make('a', { packVersion: '2', requiredConditions: ['new'] });
    const registry = createSchoolPackRegistry([b, a]);
    expect(registry.resolve(ref(a))).toEqual(a);
    expect(registry.resolve(ref(b))).toEqual(b);
    expect(registry.resolve({ ...ref(a), packVersion: 'latest' })).toBeUndefined();
    expect(registry.resolve({ ...ref(a), system: 'ziwei' })).toBeUndefined();
    expect(() => registry.assess({ ...ref(a), packVersion: '3' }, context)).toThrow('unknown exact version');
    expect(createSchoolPackRegistry([a, b]).list()).toEqual(registry.list());
    expect(JSON.parse(JSON.stringify(registry.resolve(ref(a))))).toEqual(a);
    expect(schoolPackKey({ ...ref(a), packId: 'a|b' })).not.toBe(schoolPackKey({ ...ref(a), packId: 'a', packVersion: 'b|1' }));
  });
  test('rejects duplicate/conflicting versions and malformed registrations', () => {
    const a = make('a');
    expect(() => createSchoolPackRegistry([a, a])).toThrow('duplicate exact version');
    expect(() => createSchoolPackRegistry([a, { ...a, requiredConditions: [] }])).toThrow();
    for (const change of [{ packVersion: '' }, { system: 'fake' }, { schemaVersion: 2 }, { kind: 'placeholder' },
      { verification: { status: 'verified', reason: 'calculation only' } }, { requiredConditions: ['x', 'x'] },
      { claims: [...a.claims, ...a.claims] }, { ruleSources: [{ sourceId: 'x', citation: '' }] }, { unexpected: true }]) {
      expect(() => createSchoolPackRegistry([{ ...a, ...change } as SchoolPack])).toThrow();
    }
    expect(() => schoolPackKey({ system: 'bazi', packId: 'x' } as SchoolPackRef)).toThrow();
  });
  test('deeply frozen copies keep original facts/conditions unchanged on switching packs', () => {
    const a = make('a'), registry = createSchoolPackRegistry([a, make('b')]);
    (a.requiredConditions as string[]).push('later');
    expect(registry.resolve(ref(a))!.requiredConditions).toEqual(['condition']);
    const input = { factIds: ['synthetic-fact'], availableConditions: ['condition'] };
    const before = JSON.stringify(input);
    for (const pack of registry.list()) {
      const result = registry.assess(ref(pack), input, received => {
        expect(received).not.toBe(input);
        expect(Object.isFrozen(received.factIds)).toBe(true);
        expect(() => (received.factIds as string[]).push('invented')).toThrow();
        return [{ claimId: 'synthetic-claim', stance: 'support', factIds: ['synthetic-fact'] }];
      });
      expect(Object.isFrozen(result.conclusions[0]!.factIds)).toBe(true);
    }
    expect(JSON.stringify(input)).toBe(before);
    expect(Object.isFrozen(registry.list())).toBe(true);
    expect(Object.isFrozen(registry.resolve(ref(a))!.verification)).toBe(true);
  });
  test('missing conditions abstain before evaluator; missing evaluator/empty results abstain', () => {
    const { registry, packs } = setup(); let invoked = false;
    const result = registry.assess(ref(packs[0]!), { factIds: [], availableConditions: [] }, () => { invoked = true; return []; });
    expect(invoked).toBe(false); expect(result.status).toBe('abstain');
    expect(result.missingConditions).toEqual(['condition']);
    expect(registry.assess(ref(packs[0]!), context).reason).toBe('no_evaluator');
    expect(registry.assess(ref(packs[0]!), context, () => []).reason).toBe('no_conclusion');
  });
  test('rejects unknown claims and missing/unknown/duplicate fact references', () => {
    const { registry, packs } = setup();
    const conclusion = { claimId: 'synthetic-claim', stance: 'support' as const, factIds: ['synthetic-fact'] };
    for (const changed of [{ claimId: 'unknown' }, { stance: 'neutral' }, { factIds: [] }, { factIds: ['invented'] }, { factIds: ['synthetic-fact', 'synthetic-fact'] }]) {
      expect(() => registry.assess(ref(packs[0]!), context, () => [{ ...conclusion, ...changed }] as any)).toThrow();
    }
    expect(() => registry.assess(ref(packs[0]!), context, () => [conclusion, conclusion])).toThrow();
  });
  test('two opposite packs for the same proposition conflict', () => {
    const { assess } = setup(); const result = compareSchoolAssessments([assess(0), assess(1, 'oppose')]);
    expect(result).toHaveLength(1); expect(result[0]!.status).toBe('conflict');
    expect(result[0]!.supportingPacks.map(p => p.packId)).toEqual(['a']);
    expect(result[0]!.opposingPacks.map(p => p.packId)).toEqual(['b']);
  });
  test('three aligned packs remain one system comparison, not three consensus votes', () => {
    const { assess } = setup(); const results = [assess(0), assess(1), assess(2)];
    const compared = compareSchoolAssessments(results);
    expect(compared).toHaveLength(1); expect(compared[0]!.system).toBe('bazi');
    expect(compared[0]!.status).toBe('agreement'); expect(compared[0]!.supportingPacks).toHaveLength(3);
    expect(compared[0]).not.toHaveProperty('votes'); expect(compared[0]).not.toHaveProperty('highConsensus');
    expect(compareSchoolAssessments([...results].reverse())).toEqual(compared);
  });
  test('different propositions and different systems stay separate', () => {
    const { assess } = setup([make('a'), make('b', { claims: [{ claimId: 'other', description: 'Other synthetic proposition' }] }), make('c', { system: 'ziwei' })]);
    const compared = compareSchoolAssessments([assess(0), assess(1, 'oppose'), assess(2)]);
    expect(compared).toHaveLength(3); expect(compared.every(g => g.status === 'single')).toBe(true);
  });
  test('one applicable pack is single; abstention cannot count as agreement', () => {
    const { assess } = setup([make('a'), make('b', { requiredConditions: ['missing'] })]); const compared = compareSchoolAssessments([assess(0), assess(1)]);
    expect(compared).toHaveLength(1); expect(compared[0]!.status).toBe('single'); expect(compareSchoolAssessments([])).toEqual([]);
  });
  test('rejects sparse arrays and mixed input bases', () => {
    expect(() => createSchoolPackRegistry(new Array(1))).toThrow();
    expect(() => createSchoolPackRegistry([make('a', { requiredConditions: new Array(1) })])).toThrow();
    const { registry, packs, assess } = setup();
    expect(() => registry.assess(ref(packs[0]!), context, () => new Array(1))).toThrow();
    const other = registry.assess(ref(packs[1]!), { factIds: ['other'], availableConditions: ['condition'] });
    expect(() => compareSchoolAssessments([assess(0), other])).toThrow('mixed assessment contexts');
    expect(() => compareSchoolAssessments(new Array(1))).toThrow();
  });
  test('rejects hidden toJSON transformations at pack, verification and conclusion boundaries', () => {
    for (const target of ['pack', 'verification'] as const) {
      const pack = make('a'); let called = false;
      Object.defineProperty(target === 'pack' ? pack : pack.verification, 'toJSON', {
        value: () => { called = true; return target === 'pack' ? { ...make('forged') } : { status: 'verified', reason: 'forged' }; },
      });
      expect(() => createSchoolPackRegistry([pack])).toThrow(); expect(called).toBe(false);
    }
    const { registry, packs } = setup(); let called = false;
    const conclusion = { claimId: 'synthetic-claim', stance: 'support' as const, factIds: ['synthetic-fact'] };
    Object.defineProperty(conclusion, 'toJSON', { value: () => { called = true; return { ...conclusion, factIds: ['invented'] }; } });
    expect(() => registry.assess(ref(packs[0]!), context, () => [conclusion])).toThrow(); expect(called).toBe(false);
  });
  test('rejects getters without reading them and rejects hidden/symbol/array metadata', () => {
    const pack = make('a'); let reads = 0;
    Object.defineProperty(pack, 'packId', { enumerable: true, get: () => { reads++; return reads === 1 ? 'a' : 'forged'; } });
    expect(() => createSchoolPackRegistry([pack])).toThrow(); expect(reads).toBe(0);
    const reference = ref(make('a'));
    Object.defineProperty(reference, 'packVersion', { enumerable: true, get: () => { reads++; return '1'; } });
    expect(() => schoolPackKey(reference)).toThrow(); expect(reads).toBe(0);
    const symbolPack = make('a'); Object.defineProperty(symbolPack, Symbol('hidden'), { value: true });
    expect(() => createSchoolPackRegistry([symbolPack])).toThrow();
    const array = [make('a')]; Object.defineProperty(array, '0', { get: () => { reads++; return make('a'); } });
    expect(() => createSchoolPackRegistry(array)).toThrow(); expect(reads).toBe(0);
  });
  test('rejects forged/transported assessments, duplicate packs and mixed versions', () => {
    const { assess } = setup(); const result = assess(0);
    expect(() => compareSchoolAssessments([result, result])).toThrow();
    expect(() => compareSchoolAssessments([JSON.parse(JSON.stringify(result))])).toThrow('untrusted assessment');
    expect(() => compareSchoolAssessments([{} as SchoolAssessment])).toThrow();
    const versions = setup([make('a'), make('a', { packVersion: '2' })]);
    expect(() => compareSchoolAssessments([versions.assess(0), versions.assess(1)])).toThrow();
  });
});
