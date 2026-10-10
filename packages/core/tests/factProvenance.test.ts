import { describe, expect, test, spyOn } from 'bun:test';
import { createCalculationSpec } from '../src/core/calculationSpec';
import { createChartSnapshot } from '../src/core/chartSnapshot';
import { interpretationBytes } from '../src/core/interpretationSpec';
import { createNatalFactStore, resolveFactSource } from '../src/facts/natalFactStore';
import { createBoundSchoolRegistry, createSyntheticBoundSchoolRegistry } from '../src/schools/boundAnalysis';
import { describeFactProvenance, validateFactProvenance } from '../src/schools/factProvenance';
import * as fixtures from '../src/schools/syntheticInterpretationCatalog';
import * as ids from '../src/signals/signalId';
import * as pillars from '../src/calculators/bazi/pillars';
const astro = require('iztro/lib/astro/astro') as typeof import('iztro/lib/astro/astro');
const input = { year: 1990, month: 5, day: 17, hour: 23, minute: 10, gender: 'female' as const,
  name: 'ALICE', birthplace: { label: 'Synthetic', lat: 23, lng: 120, timezone: 'Asia/Taipei' } };
const snapshot = createChartSnapshot(createCalculationSpec(input));
const store = createNatalFactStore(snapshot);
const context = { factIds: store.facts.map(f => f.factId), availableConditions: ['ready'] };
const ref = (packId: string, packVersion = '1') => ({ system: 'bazi' as const, packId, packVersion });
const registry = createSyntheticBoundSchoolRegistry();
const run = (packs = ['a', 'b'], ctx = context) => registry.bindFacts(snapshot, registry.createSpec(packs.map(p => ref(p))), store, ctx).run();

describe('limited exact-claim/fact-set provenance', () => {
  test('same fact reuse groups opposing schools without dropping branches or sources', () => {
    const analysis = run(); const before = interpretationBytes(analysis);
    const result = describeFactProvenance(analysis);
    expect(result.analysis).toBe(analysis); expect(result.groups).toHaveLength(1);
    expect(result.independence).toBe('not-established'); expect(result.overlaps).toEqual([]);
    expect(result.groups[0]!.branches.map(b => b.stance).sort()).toEqual(['oppose', 'support']);
    expect(result.groups[0]!.branches.map(b => b.ref.packId).sort()).toEqual(['a', 'b']);
    for (const branch of result.groups[0]!.branches) {
      expect(branch.ref.packVersion).toBe('1'); expect(branch.ruleSources).toHaveLength(1);
      expect(branch.verification.status).toBe('unknown');
    }
    for (const fact of result.groups[0]!.facts) for (const source of fact.sourceRefs) expect(resolveFactSource(store, snapshot, source)).toBeDefined();
    expect(interpretationBytes(analysis)).toBe(before);
    expect(Object.isFrozen(result.groups[0]!.branches)).toBe(true);
  });
  test('exact claims stay separate with shared fact metadata and no independent vote claim', () => {
    const result = describeFactProvenance(run(['a', 'b', 'different']));
    expect(result.groups).toHaveLength(2); expect(result.overlaps).toHaveLength(1);
    expect(result.overlaps[0]!.sharedFacts).toHaveLength(1);
    expect(new Set(result.overlaps[0]!.groupIds)).toEqual(new Set(result.groups.map(g => g.groupId)));
    expect(result.groups.map(g => g.key.claimId).sort()).toEqual(['other', 'synthetic-claim']);
  });
  test('partial overlap is pairwise, never a transitive union or natal-wide merge', () => {
    // Test-only contract fixtures. Retained catalog semantics are unchanged.
    const mock = spyOn(fixtures, 'syntheticConclusion').mockImplementation((pack, ctx) => [{
      claimId: pack.claims[0]!.claimId, stance: pack.packId === 'b' ? 'oppose' : 'support',
      factIds: pack.packId === 'a' ? ctx.factIds.slice(0, 2) : pack.packId === 'b' ? ctx.factIds.slice(1, 3) : ctx.factIds.slice(2, 4),
    }]);
    try {
      const result = describeFactProvenance(run(['a', 'b', 'c']));
      expect(result.groups).toHaveLength(3); expect(result.overlaps).toHaveLength(2);
      expect(result.groups.every(g => g.facts.length === 2 && g.branches.length === 1)).toBe(true);
      expect(result.overlaps.every(o => o.sharedFacts.length === 1)).toBe(true);
      const counts = new Map<string, number>();
      for (const o of result.overlaps) for (const id of o.groupIds) counts.set(id, (counts.get(id) ?? 0) + 1);
      expect([...counts.values()].sort()).toEqual([1, 1, 2]);
    } finally { mock.mockRestore(); }
  });
  test('canonical input/pack ordering, A to B to A, and conclusion fact ordering are deterministic', () => {
    const a = describeFactProvenance(run(['different', 'a', 'b']));
    describeFactProvenance(run(['c']));
    expect(describeFactProvenance(run(['b', 'a', 'different'], { ...context, factIds: [...context.factIds].reverse() }))).toEqual(a);
    let reverse = false;
    const mock = spyOn(fixtures, 'syntheticConclusion').mockImplementation((pack, ctx) => [{ claimId: pack.claims[0]!.claimId,
      stance: 'support', factIds: reverse ? ctx.factIds.slice(0, 2).reverse() : ctx.factIds.slice(0, 2) }]);
    try {
      const first = describeFactProvenance(run(['a'])); reverse = true;
      const second = describeFactProvenance(run(['a']));
      expect(second.groups).toEqual(first.groups); expect(second.overlaps).toEqual(first.overlaps);
    } finally { mock.mockRestore(); }
  });
  test('group identity excludes school/version/stance but preserves their branches', () => {
    const a = describeFactProvenance(run(['a']));
    const b = describeFactProvenance(registry.bindFacts(snapshot, registry.createSpec([ref('a', '2')]), store, context).run());
    expect(a.groups[0]!.groupId).toBe(b.groups[0]!.groupId);
    expect(a.groups[0]!.branches[0]!.stance).toBe('support'); expect(b.groups[0]!.branches[0]!.stance).toBe('oppose');
    expect(b.groups[0]!.branches[0]!.ref.packVersion).toBe('2');
  });
  test('group keys exclude direct name, diagnostic IDs and source pointers; full binding remains', () => {
    const otherSnapshot = createChartSnapshot(createCalculationSpec({ ...input, name: 'BOB' }));
    const otherStore = createNatalFactStore(otherSnapshot);
    const other = registry.bindFacts(otherSnapshot, registry.createSpec([ref('a'), ref('b')]), otherStore, context).run();
    const a = describeFactProvenance(run()), b = describeFactProvenance(other);
    expect(a.groups.map(g => g.key)).toEqual(b.groups.map(g => g.key));
    expect(a.groups.map(g => g.groupId)).toEqual(b.groups.map(g => g.groupId));
    expect(a.analysis.identity.snapshot).not.toEqual(b.analysis.identity.snapshot);
    expect(() => validateFactProvenance(b, a)).toThrow();
    const key = interpretationBytes(a.groups[0]!.key);
    for (const field of ['factId', 'snapshotId', 'sourceRefs', 'ALICE', 'BOB']) expect(key).not.toContain(field);
  });
  test('unowned and legacy analyses and descriptor lookalikes are rejected', () => {
    const analysis = run(), result = describeFactProvenance(analysis);
    expect(() => describeFactProvenance(structuredClone(analysis))).toThrow('owned');
    const legacy = registry.bind(snapshot, registry.createSpec([ref('a')]), context).run();
    expect(() => describeFactProvenance(legacy as any)).toThrow('owned');
    expect(() => validateFactProvenance(result, structuredClone(result))).toThrow('owned');
    expect(validateFactProvenance(structuredClone(result), result)).toBe(result);
    expect(() => createSyntheticBoundSchoolRegistry().validateFacts(analysis, analysis)).toThrow('owned');
  });
  test('full validation detects forged references, groups, branches, overlaps and binding', () => {
    const result = describeFactProvenance(run(['a', 'b', 'different']));
    const changes = [
      (x: any) => { x.groups[0].facts[0].payload = {}; },
      (x: any) => { x.groups[0].facts[0].sourceRefs[0].path += '/missing'; },
      (x: any) => { x.groups[0].key.facts = []; },
      (x: any) => { x.groups[0].branches = []; },
      (x: any) => { x.groups[0].groupId = x.groups[1].groupId; },
      (x: any) => { x.overlaps[0].sharedFacts = []; },
      (x: any) => { x.independence = 'independent'; },
      (x: any) => { x.analysis.identity.factStore.coverage.bazi.omittedAlternativeCount++; },
    ];
    for (const change of changes) { const bad = structuredClone(result); change(bad); expect(() => validateFactProvenance(bad, result)).toThrow(); }
  });
  test('forced short digest collisions cannot combine different claims or fact sets', () => {
    const analysis = run(['a', 'different']);
    const mock = spyOn(ids, 'fnv1a64Hex').mockReturnValue('collision');
    try { expect(() => describeFactProvenance(analysis)).toThrow('digest'); }
    finally { mock.mockRestore(); }
  });
  test('placeholder and unknown-time consumers yield no invented provenance', () => {
    const prod = createBoundSchoolRegistry();
    const spec = prod.createSpec([{ system: 'bazi', packId: 'default', packVersion: '1' }]);
    const normal = describeFactProvenance(prod.bindFacts(snapshot, spec, store, context).run());
    expect(normal.groups).toEqual([]); expect(normal.overlaps).toEqual([]);
    const missing = createChartSnapshot(createCalculationSpec({ ...input, timeKnown: false }));
    const result = describeFactProvenance(prod.bindFacts(missing, spec, createNatalFactStore(missing), { ...context, factIds: [] }).run());
    expect(result.groups).toEqual([]); expect(result.analysis.unavailable).toHaveLength(1);
  });
  test('describing and validating never recompute natal charts', () => {
    const analysis = run(); const bazi = spyOn(pillars, 'computePillars'); const ziwei = spyOn(astro, 'bySolar');
    try { const result = describeFactProvenance(analysis); validateFactProvenance(result, result);
      expect(bazi).not.toHaveBeenCalled(); expect(ziwei).not.toHaveBeenCalled();
    } finally { bazi.mockRestore(); ziwei.mockRestore(); }
  });
  test('stale calculator environment invalidates descriptions and validation', () => {
    const analysis = run(), result = describeFactProvenance(analysis), original = astro.getConfig();
    try {
      astro.config({ horoscopeDivide: 'exact' });
      expect(() => describeFactProvenance(analysis)).toThrow();
      expect(() => validateFactProvenance(result, result)).toThrow();
    } finally { astro.config({ horoscopeDivide: original.horoscopeDivide }); }
    expect(validateFactProvenance(result, result)).toBe(result);
  });
});
