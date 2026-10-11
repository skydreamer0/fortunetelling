import { describe, expect, spyOn, test } from 'bun:test';
import { createCalculationSpec } from '../src/core/calculationSpec';
import { createChartSnapshotSession } from '../src/core/chartSnapshotSession';
import { interpretationBytes } from '../src/core/interpretationSpec';
import { describeNatalValidationLinks, validateNatalValidationLinks, type NatalValidationBinding } from '../src/facts/natalValidationLinks';
import { VALIDATION_AXES } from '../src/validation/types';
import type { ValidationRecord, ValidationScope, ValidationSelection } from '../src/validation/types';
import * as pillars from '../src/calculators/bazi/pillars';
const astro = require('iztro/lib/astro/astro') as typeof import('iztro/lib/astro/astro');
const input = { year: 1995, month: 5, day: 17, hour: 23, minute: 10, gender: 'female' as const,
  name: 'ALICE', birthplace: { label: 'Synthetic', lat: 23, lng: 120, timezone: 'Asia/Taipei' } };
const metadata = () => createChartSnapshotSession(createCalculationSpec(input)).natalRuleMetadata();
const emptyRefs = (): ValidationSelection => ({ calculationValidation: null, ruleProvenance: null, numericalCalibration: null, predictiveValidation: null });
function setup() {
  const source = metadata(), recordIndex = source.records.findIndex(r => r.system === 'bazi');
  const native = source.records[recordIndex]!;
  const scope: ValidationScope = { system: native.system, ruleId: native.ruleId, ruleVersion: String(native.ruleVersion),
    grain: 'natal', schoolId: 'synthetic-school', schoolVersion: '1', questionId: 'synthetic-question' };
  const binding: NatalValidationBinding = { recordIndex, scope, validationRefs: emptyRefs() };
  return { source, binding };
}
function evidence(scope: ValidationScope, axis: ValidationRecord['axis'] = 'calculationValidation', version = '1'): ValidationRecord {
  return { schemaVersion: 1, ref: { id: `synthetic-${axis}`, version }, scope, axis,
    status: 'assessed', result: 'supports', reason: 'Synthetic contract probe only',
    sources: [{ id: 'fixture', citation: 'Synthetic fixture, not real validation', sharedBasis: ['same-synthetic-upstream'] }],
    limitations: ['No production evidence'], fields: ['synthetic-field'], settings: [], methodology: 'Synthetic only',
    sampleDescription: 'No real validation sample', assessedOn: '2026-10-11' };
}
describe('owned natal validation reference traceability', () => {
  test('default is entirely unbound and cannot grant school attribution or predictive authority', () => {
    const source = metadata(), before = interpretationBytes(source), out = describeNatalValidationLinks(source);
    expect(out.metadata).toBe(source); expect(interpretationBytes(source)).toBe(before);
    expect(out.links).toEqual([]);
    expect(out.coverage.unboundRecords).toEqual(source.records.map((_, i) => i));
    expect(out.schoolQuestionAttribution).toBe('not-established');
    expect(out.predictiveUse).toBe('not_authorized'); expect(out.directionalVote).toBe('not_authorized');
    expect(out.independence).toBe('not-established');
    expect(out.metadata.records.every(r => r.claim.status === 'unresolved')).toBe(true);
    expect(out.metadata.binding.factStore.facts.map(f => f.factId)).toEqual(source.binding.factStore.facts.map(f => f.factId));
  });
  test('exact records retain source limitations and do not promote other axes or scope attribution', () => {
    const { source, binding } = setup(), e = evidence(binding.scope);
    const out = describeNatalValidationLinks(source, [{ ...binding, validationRefs: { ...emptyRefs(), calculationValidation: e.ref } }], [e]);
    const link = out.links[0]!;
    expect(link.validation.calculationValidation).toEqual({ status: 'resolved', reference: e.ref, record: e });
    for (const axis of VALIDATION_AXES.slice(1)) expect(link.validation[axis]).toEqual({ status: 'pending', reference: null, reason: 'no_reference' });
    expect(link.scopeProvenance).toBe('caller-declared-not-verified');
    expect(out.schoolQuestionAttribution).toBe('not-established'); expect(out.predictiveUse).toBe('not_authorized');
    expect(out.directionalVote).toBe('not_authorized');
    expect(out.metadata).toBe(source);
    expect(out.coverage.unboundRecords).not.toContain(binding.recordIndex);
  });
  test('unknown versions are pending and even synthetic predictive support grants no authority', () => {
    const { source, binding } = setup(), e = evidence(binding.scope, 'predictiveValidation');
    const out = describeNatalValidationLinks(source, [{ ...binding, validationRefs: { ...emptyRefs(), predictiveValidation: { ...e.ref, version: 'latest' } } }], [e]);
    expect(out.links[0]!.validation.predictiveValidation).toEqual({ status: 'pending', reference: { ...e.ref, version: 'latest' }, reason: 'unknown_exact_version' });
    const resolved = describeNatalValidationLinks(source, [{ ...binding, validationRefs: { ...emptyRefs(), predictiveValidation: e.ref } }], [e]);
    expect(resolved.links[0]!.validation.predictiveValidation.status).toBe('resolved');
    expect(resolved.predictiveUse).toBe('not_authorized'); expect(resolved.directionalVote).toBe('not_authorized');
    expect(resolved.schoolQuestionAttribution).toBe('not-established');
  });
  test('rejects native tuple mismatches and every registry scope or axis mismatch', () => {
    const { source, binding } = setup(), e = evidence(binding.scope);
    for (const [key, value] of Object.entries({ system: 'ziwei', ruleId: 'other', ruleVersion: '01', grain: 'year' })) {
      expect(() => describeNatalValidationLinks(source, [{ ...binding, scope: { ...binding.scope, [key]: value } }])).toThrow('scope mismatch');
    }
    for (const [key, value] of Object.entries({ system: 'ziwei', schoolId: 'other', schoolVersion: '2', ruleId: 'other', ruleVersion: '2', questionId: 'other', grain: 'year' })) {
      const wrong = { ...e, scope: { ...e.scope, [key]: value } };
      expect(() => describeNatalValidationLinks(source, [{ ...binding, validationRefs: { ...emptyRefs(), calculationValidation: e.ref } }], [wrong])).toThrow('scope/axis');
    }
    expect(() => describeNatalValidationLinks(source, [{ ...binding, validationRefs: { ...emptyRefs(), ruleProvenance: e.ref } }], [e])).toThrow('scope/axis');
  });
  test('multiple declared school/question branches survive with deterministic order and exact versions', () => {
    const { source, binding } = setup(), a = evidence(binding.scope), b = evidence(binding.scope, 'calculationValidation', '2');
    const second = { ...binding, scope: { ...binding.scope, schoolId: 'other-synthetic-school' } };
    const first = { ...binding, validationRefs: { ...emptyRefs(), calculationValidation: b.ref } };
    const out = describeNatalValidationLinks(source, [first, second], [a, b]);
    expect(out).toEqual(describeNatalValidationLinks(source, [second, first], [b, a]));
    expect(out.links.length).toBe(2);
    const resolved = out.links.find(l => l.scope.schoolId === binding.scope.schoolId)!.validation.calculationValidation;
    expect(resolved.status === 'resolved' && resolved.record.ref.version).toBe('2');
    expect(() => describeNatalValidationLinks(source, [binding, binding])).toThrow('Duplicate');
  });
  test('deep immutable copies reject malformed declarations, references, duplicates and getters', () => {
    const { source, binding } = setup(), mutable = structuredClone(binding), e = evidence(binding.scope);
    const records = [structuredClone(e)], out = describeNatalValidationLinks(source, [mutable], records);
    (mutable.scope as { schoolId: string }).schoolId = 'changed';
    expect(out.links[0]!.scope.schoolId).toBe(binding.scope.schoolId);
    expect(Object.isFrozen(out.links[0]!.validation)).toBe(true);
    expect(Object.isFrozen(out.coverage.unboundRecords)).toBe(true);
    for (const recordIndex of [-1, 0.5, source.records.length, NaN, Infinity]) expect(() => describeNatalValidationLinks(source, [{ ...binding, recordIndex }])).toThrow();
    expect(() => describeNatalValidationLinks(source, [binding], [e, e])).toThrow('Duplicate');
    const malformed: unknown[] = [null, {}, new Array(1), [{ ...binding, extra: true }], [{ ...binding, validationRefs: {} }],
      [{ ...binding, validationRefs: { ...emptyRefs(), calculationValidation: { id: 'x', version: 1 } } }]];
    for (const bad of malformed) expect(() => describeNatalValidationLinks(source, bad as NatalValidationBinding[])).toThrow();
    let invoked = false;
    const getter = { get recordIndex() { invoked = true; return 0; }, scope: binding.scope, validationRefs: emptyRefs() };
    expect(() => describeNatalValidationLinks(source, [getter])).toThrow(); expect(invoked).toBe(false);
  });
  test('rejects cloned ownership, cross-snapshot candidates and full-content tampering', () => {
    const { source, binding } = setup(), e = evidence(binding.scope);
    const out = describeNatalValidationLinks(source, [{ ...binding, validationRefs: { ...emptyRefs(), calculationValidation: e.ref } }], [e]);
    expect(() => describeNatalValidationLinks(structuredClone(source))).toThrow('owned');
    expect(() => validateNatalValidationLinks(out, structuredClone(out))).toThrow('owned');
    expect(validateNatalValidationLinks(structuredClone(out), out)).toBe(out);
    const other = createChartSnapshotSession(createCalculationSpec({ ...input, name: 'BOB' })).natalRuleMetadata();
    expect(() => validateNatalValidationLinks(describeNatalValidationLinks(other), out)).toThrow();
    const changes: ((x: any) => void)[] = [x => x.metadata = other, x => x.links[0].recordIndex++,
      x => x.links[0].scope.questionId = 'changed', x => x.links[0].validation.calculationValidation.record.sources = [],
      x => x.links[0].validation.calculationValidation.reference.version = '2', x => x.links[0].scopeProvenance = 'verified',
      x => x.coverage.unboundRecords = [], x => x.predictiveUse = 'authorized', x => x.metadata.binding.factStore.facts[0].factId = 'forged'];
    for (const change of changes) { const bad = structuredClone(out); change(bad); expect(() => validateNatalValidationLinks(bad, out)).toThrow(); }
  });
  test('zero chart recalculation and stale environment rejection with A to B to A recovery', () => {
    const source = metadata(), before = interpretationBytes(source);
    const bazi = spyOn(pillars, 'computePillars'), ziwei = spyOn(astro, 'bySolar');
    let out;
    try { out = describeNatalValidationLinks(source); expect(bazi).not.toHaveBeenCalled(); expect(ziwei).not.toHaveBeenCalled(); }
    finally { bazi.mockRestore(); ziwei.mockRestore(); }
    expect(interpretationBytes(source)).toBe(before);
    const config = astro.getConfig();
    try { astro.config({ horoscopeDivide: 'exact' }); expect(() => describeNatalValidationLinks(source)).toThrow(); expect(() => validateNatalValidationLinks(out, out)).toThrow(); }
    finally { astro.config({ horoscopeDivide: config.horoscopeDivide }); }
    expect(validateNatalValidationLinks(out, out)).toBe(out);
    expect(describeNatalValidationLinks(source)).toEqual(out);
  });
  test('missing birth time keeps empty real coverage and rejects fabricated positions', () => {
    const source = createChartSnapshotSession(createCalculationSpec({ ...input, timeKnown: false })).natalRuleMetadata();
    const out = describeNatalValidationLinks(source);
    expect(source.records).toEqual([]); expect(out.links).toEqual([]); expect(out.coverage.unboundRecords).toEqual([]);
    expect(source.coverage.unavailableSystems).toEqual(['bazi', 'ziwei']);
    expect(() => describeNatalValidationLinks(source, [setup().binding])).toThrow('position');
  });
});
