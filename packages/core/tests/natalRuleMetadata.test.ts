import { describe, expect, test, spyOn } from 'bun:test';
import { createCalculationSpec } from '../src/core/calculationSpec';
import { createChartSnapshotSession } from '../src/core/chartSnapshotSession';
import { describeNatalRuleMetadata, validateNatalRuleMetadata } from '../src/facts/natalRuleMetadata';
import { createNatalFactStore, resolveFactSource } from '../src/facts/natalFactStore';
import { interpretationBytes } from '../src/core/interpretationSpec';
import { BAZI_RULES } from '../src/rules/bazi/rules';
import { nativeHitMetadata } from '../src/rules/natalHitMetadata';
import { evaluateBaziRules } from '../src/rules/bazi/evaluate';
import { evaluateZiweiRules } from '../src/rules/ziwei/evaluate';
import { fromZiweiComponents } from '../src/rules/ziwei/chart';
import * as pillars from '../src/calculators/bazi/pillars';
const astro = require('iztro/lib/astro/astro') as typeof import('iztro/lib/astro/astro');
const input = { year: 1995, month: 5, day: 17, hour: 23, minute: 10, gender: 'female' as const,
  name: 'ALICE', birthplace: { label: 'Synthetic', lat: 23, lng: 120, timezone: 'Asia/Taipei' } };
const session = () => createChartSnapshotSession(createCalculationSpec(input));

describe('owned native natal rule metadata', () => {
  test('real session consumes both native adapters with fact-resolved roles and conservative coverage', () => {
    const result = session().natalRuleMetadata();
    expect(result.records.length).toBeGreaterThan(0);
    expect(result.coverage.mappedRules.map(r => r.ruleId).sort()).toEqual(['bazi.stem.control', 'ziwei.natal.star_traits', 'ziwei.star.tianma']);
    expect(result.coverage.unmappedRules.length).toBeGreaterThan(0);
    expect(result.records.every(r => r.claim.status === 'unresolved')).toBe(true);
    const controls = result.records.filter(r => r.ruleId === 'bazi.stem.control');
    expect(controls.length).toBeGreaterThan(0);
    expect(controls.every(r => r.source.status === 'resolved' && r.source.trigger.kind === 'bazi.stemControl' && r.source.trigger.directed)).toBe(true);
    const tianma = result.records.filter(r => r.ruleId === 'ziwei.star.tianma');
    expect(tianma.length).toBeGreaterThan(0);
    expect(tianma.every(r => r.source.status === 'partial')).toBe(true);
    const generic = result.records.filter(r => r.ruleId === 'ziwei.natal.star_traits');
    expect(generic.every(r => r.source.status === 'partial' && r.source.gaps.includes('brightness-not-fact'))).toBe(true);
    for (const record of result.records) for (const dependency of record.source.dependencies) {
      for (const ref of dependency.fact.sourceRefs) expect(resolveFactSource(result.binding.factStore, result.binding.snapshot, ref)).toBeDefined();
    }
    expect(Object.isFrozen(result.records)).toBe(true);
    expect(validateNatalRuleMetadata(structuredClone(result), result)).toBe(result);
  });
  test('a changed rule version is explicitly unmapped', () => {
    const rule = BAZI_RULES.find(r => r.id === 'bazi.stem.control' && r.scope === 'natal')!;
    const version = rule.version;
    try {
      rule.version = 2;
      const result = session().natalRuleMetadata();
      expect(result.records.filter(r => r.ruleId === rule.id).every(r => r.source.status === 'unresolved')).toBe(true);
      expect(result.coverage.unmappedRules).toContainEqual({ system: 'bazi', ruleId: rule.id, ruleVersion: 2 });
      expect(result.coverage.mappedRules.some(r => r.ruleId === rule.id)).toBe(false);
    } finally { rule.version = version; }
  });
  test('directed raw roles survive canonical target ordering and domains stay separate', () => {
    const chart = { pillars: { year: '甲子', month: null, day: '戊辰', hour: null }, luckCycles: [] };
    const rule = BAZI_RULES.find(r => r.id === 'bazi.stem.control' && r.scope === 'natal')!;
    const hit = rule.match(chart, { grain: 'natal', start: '2000-01-01', end: '2000-01-01' })[0]!;
    expect(nativeHitMetadata(hit)).toEqual({ kind: 'bazi.stemControl', directed: true, complete: true, controller: 'year', controlled: 'day' });
    expect(rule.templatesFor(hit).map(t => t.domain).sort()).toEqual(['family', 'self']);
    const reverse = rule.match({ ...chart, pillars: { ...chart.pillars, year: '戊辰', day: '甲子' } }, { grain: 'natal', start: '2000-01-01', end: '2000-01-01' })[0]!;
    expect(nativeHitMetadata(reverse)).toMatchObject({ controller: 'day', controlled: 'year' });
    expect(Object.keys(hit)).not.toContain('metadata');
  });
  test('native matcher outputs retain legacy signals and record emitted domains/traits', () => {
    const s = session(), result = s.natalRuleMetadata(), natal = s.snapshot.natal;
    if (natal.bazi.status !== 'computed' || natal.ziwei.status !== 'computed') throw Error('fixture');
    const window = { grain: 'natal' as const, start: input.year + '-05-17', end: input.year + '-05-17' };
    const bazi = { pillars: { ...natal.bazi.chart.pillars.pillars }, luckCycles: [] };
    const ziwei = fromZiweiComponents(natal.ziwei.chart.primary.palaces.map(p => ({ id: `palace_${p.index}`, category: 'palaces', value: { ...p, earthlyBranch: p.branch } })));
    const before = interpretationBytes([evaluateBaziRules(bazi, window), evaluateZiweiRules(ziwei, window)]);
    s.natalRuleMetadata();
    expect(interpretationBytes([evaluateBaziRules(bazi, window), evaluateZiweiRules(ziwei, window)])).toBe(before);
    const expected = [...evaluateBaziRules(bazi, window), ...evaluateZiweiRules(ziwei, window)].map(r => [r.ruleId, r.domain, r.trait, r.target ?? ""]).sort();
    expect(result.records.map(r => [r.ruleId, r.domain, r.trait, r.target ?? ""]).sort()).toEqual(expected);
  });
  test('unowned capabilities, cross snapshot and modified full content are rejected', () => {
    const s = session(), result = s.natalRuleMetadata();
    expect(() => describeNatalRuleMetadata(structuredClone(s.snapshot), result.binding.factStore)).toThrow();
    expect(() => describeNatalRuleMetadata(s.snapshot, structuredClone(result.binding.factStore))).toThrow();
    const other = createChartSnapshotSession(createCalculationSpec({ ...input, name: 'BOB' }));
    expect(() => describeNatalRuleMetadata(other.snapshot, result.binding.factStore)).toThrow();
    expect(() => validateNatalRuleMetadata(result, structuredClone(result))).toThrow('owned');
    const changes = [
      (x:any) => x.records.reverse(), (x:any) => x.records[0].domain = 'invented',
      (x:any) => x.records.find((r:any) => r.source.status === 'partial').source.gaps = [],
      (x:any) => x.records.find((r:any) => r.source.status === 'resolved').source.trigger.controller = 'forged',
      (x:any) => x.records.find((r:any) => r.source.dependencies.length).source.dependencies.push(x.records.find((r:any) => r.source.dependencies.length).source.dependencies[0]),
      (x:any) => x.binding.snapshot.identity.input.name = 'changed',
    ];
    for (const change of changes) { const bad = structuredClone(result); change(bad); expect(() => validateNatalRuleMetadata(bad, result)).toThrow(); }
  });
  test('deterministic, zero natal recalculation, unavailable time and stale environment', () => {
    const s = session(), a = s.natalRuleMetadata();
    const bazi = spyOn(pillars, 'computePillars'), ziwei = spyOn(astro, 'bySolar');
    try { expect(s.natalRuleMetadata()).toEqual(a); expect(bazi).not.toHaveBeenCalled(); expect(ziwei).not.toHaveBeenCalled(); }
    finally { bazi.mockRestore(); ziwei.mockRestore(); }
    const missing = createChartSnapshotSession(createCalculationSpec({ ...input, timeKnown: false })).natalRuleMetadata();
    expect(missing.records).toEqual([]); expect(missing.coverage.unavailableSystems).toEqual(['bazi', 'ziwei']);
    expect(() => (s.natalRuleMetadata as any)({})).toThrow();
    const config = astro.getConfig();
    try { astro.config({ horoscopeDivide: 'exact' }); expect(() => s.natalRuleMetadata()).toThrow(); expect(() => validateNatalRuleMetadata(a, a)).toThrow(); }
    finally { astro.config({ horoscopeDivide: config.horoscopeDivide }); }
    expect(s.natalRuleMetadata()).toEqual(a);
    expect(describeNatalRuleMetadata(s.snapshot, createNatalFactStore(s.snapshot))).toEqual(a);
  });
});
