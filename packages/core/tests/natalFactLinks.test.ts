import { describe, expect, test, spyOn } from 'bun:test';
import { createCalculationSpec } from '../src/core/calculationSpec';
import { createChartSnapshotSession } from '../src/core/chartSnapshotSession';
import { interpretationBytes } from '../src/core/interpretationSpec';
import { describeNatalFactLinks, validateNatalFactLinks } from '../src/facts/natalFactLinks';
import * as pillars from '../src/calculators/bazi/pillars';
const astro = require('iztro/lib/astro/astro') as typeof import('iztro/lib/astro/astro');
const input = { year: 1995, month: 5, day: 17, hour: 23, minute: 10, gender: 'female' as const,
  name: 'ALICE', birthplace: { label: 'Synthetic', lat: 23, lng: 120, timezone: 'Asia/Taipei' } };
const session = () => createChartSnapshotSession(createCalculationSpec(input));

describe('owned natal pairwise exact fact links', () => {
  test('all and only exact intersections, complete endpoint roles and canonical original positions', () => {
    const metadata = session().natalRuleMetadata(), before = interpretationBytes(metadata);
    const result = describeNatalFactLinks(metadata), records = metadata.records;
    expect(result.metadata).toBe(metadata);
    expect(interpretationBytes(metadata)).toBe(before);
    expect(result.independence).toBe('not-established');
    const expected = [];
    for (let leftRecord = 0; leftRecord < records.length; leftRecord++) {
      for (let rightRecord = leftRecord + 1; rightRecord < records.length; rightRecord++) {
        const left = records[leftRecord]!.source.dependencies, right = records[rightRecord]!.source.dependencies;
        const facts = [...new Set(left.map(d => interpretationBytes(d.fact)))].filter(key => right.some(d => interpretationBytes(d.fact) === key)).sort();
        if (!facts.length) continue;
        expected.push({ leftRecord, rightRecord, sharedFacts: facts.map(key => ({
          fact: left.find(d => interpretationBytes(d.fact) === key)!.fact,
          leftRoles: left.filter(d => interpretationBytes(d.fact) === key).map(d => d.role).sort(),
          rightRoles: right.filter(d => interpretationBytes(d.fact) === key).map(d => d.role).sort(),
        })) });
      }
    }
    expect(result.pairs).toEqual(expected);
    expect(Object.isFrozen(result.pairs[0]!.sharedFacts[0]!.leftRoles)).toBe(true);
    expect(describeNatalFactLinks(metadata)).toEqual(result);
  });
  test('real tianma and star_traits share exact placement without merging rules or domains', () => {
    const result = session().natalFactLinks(), records = result.metadata.records;
    const tianma = result.pairs.filter(p => {
      const ids = [records[p.leftRecord]!.ruleId, records[p.rightRecord]!.ruleId];
      return ids.includes('ziwei.star.tianma') && ids.includes('ziwei.natal.star_traits');
    });
    expect(tianma.some(p => p.sharedFacts.some(s => s.fact.kind === 'ziwei.star-placement' && s.fact.payload.star.name === '天馬' && s.leftRoles.includes('primary-placement') && s.rightRoles.includes('primary-placement')))).toBe(true);
    expect(result.pairs.some(p => records[p.leftRecord]!.system === 'bazi' && records[p.rightRecord]!.system === 'bazi' && records[p.leftRecord]!.domain !== records[p.rightRecord]!.domain && p.sharedFacts.length === 2)).toBe(true);
    expect(result.coverage.partialRecords).toEqual(records.flatMap((r, i) => r.source.status === 'partial' ? [i] : []));
    expect(result.coverage.unresolvedRecords).toEqual(records.flatMap((r, i) => r.source.status === 'unresolved' ? [i] : []));
    expect(result.coverage.unresolvedRecords.length).toBeGreaterThan(0);
    expect(records.every(r => r.claim.status === 'unresolved')).toBe(true);
    const hasPair = (a: number, b: number) => result.pairs.some(p => p.leftRecord === Math.min(a,b) && p.rightRecord === Math.max(a,b));
    const chain = result.pairs.find(ab => result.pairs.some(bc => ab.rightRecord === bc.leftRecord && !hasPair(ab.leftRecord, bc.rightRecord)));
    expect(chain).toBeDefined(); // No transitive closure or connected-component union.
    expect(result.pairs.every(p => records[p.leftRecord]!.system === records[p.rightRecord]!.system)).toBe(true);
  });
  test('full metadata retains extra lucun, sha and transformation dependencies', () => {
    const roles = new Set<string>();
    for (const year of [1995, 1996, 1997, 1998, 1999, 2000]) {
      const metadata = createChartSnapshotSession(createCalculationSpec({ ...input, year })).natalRuleMetadata();
      const result = describeNatalFactLinks(metadata);
      expect(result.metadata).toBe(metadata);
      for (const r of result.metadata.records) for (const d of r.source.dependencies) roles.add(d.role);
    }
    expect([...roles].some(r => r.startsWith('lucun-'))).toBe(true);
    expect(roles.has('same-palace-sha')).toBe(true);
    expect(roles.has('natal-transformation')).toBe(true);
  });
  test('rejects unowned, mixed contexts, reordered and tampered transport data', () => {
    const metadata = session().natalRuleMetadata(), result = describeNatalFactLinks(metadata);
    expect(() => describeNatalFactLinks(structuredClone(metadata))).toThrow('owned');
    expect(() => (describeNatalFactLinks as any)(metadata, metadata)).toThrow();
    expect(() => validateNatalFactLinks(result, structuredClone(result))).toThrow('owned');
    expect(validateNatalFactLinks(structuredClone(result), result)).toBe(result);
    const other = createChartSnapshotSession(createCalculationSpec({ ...input, name: 'BOB' })).natalFactLinks();
    expect(() => validateNatalFactLinks(other, result)).toThrow();
    const changes = [
      (x:any) => x.pairs.reverse(), (x:any) => x.pairs[0].leftRecord = x.pairs[0].rightRecord,
      (x:any) => x.pairs[0].sharedFacts[0].leftRoles = ['forged'],
      (x:any) => x.pairs[0].sharedFacts[0].fact.sourceRefs = [],
      (x:any) => x.pairs[0].sharedFacts[0].fact.payload = {},
      (x:any) => x.metadata.records.reverse(), (x:any) => x.coverage.partialRecords = [],
      (x:any) => x.metadata.binding = structuredClone(other.metadata.binding),
      (x:any) => x.independence = 'independent',
    ];
    for (const change of changes) { const bad = structuredClone(result); change(bad); expect(() => validateNatalFactLinks(bad, result)).toThrow(); }
  });
  test('session consumer has zero chart regeneration, no overrides and stale environment rejection', () => {
    const s = session(), metadataBefore = interpretationBytes(s.natalRuleMetadata());
    const bazi = spyOn(pillars, 'computePillars'), ziwei = spyOn(astro, 'bySolar');
    let result;
    try { result = s.natalFactLinks(); expect(bazi).not.toHaveBeenCalled(); expect(ziwei).not.toHaveBeenCalled(); }
    finally { bazi.mockRestore(); ziwei.mockRestore(); }
    expect(interpretationBytes(result.metadata)).toBe(metadataBefore);
    expect(() => (s.natalFactLinks as any)({})).toThrow();
    const config = astro.getConfig();
    try { astro.config({ horoscopeDivide: 'exact' }); expect(() => s.natalFactLinks()).toThrow(); expect(() => validateNatalFactLinks(result, result)).toThrow(); }
    finally { astro.config({ horoscopeDivide: config.horoscopeDivide }); }
    expect(validateNatalFactLinks(result, result)).toBe(result);
    const missing = createChartSnapshotSession(createCalculationSpec({ ...input, timeKnown: false })).natalFactLinks();
    expect(missing.pairs).toEqual([]); expect(missing.metadata.coverage.unavailableSystems).toEqual(['bazi', 'ziwei']);
    expect(missing.independence).toBe('not-established');
  });
});
