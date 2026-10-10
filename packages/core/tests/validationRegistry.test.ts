import { describe, expect, test } from 'bun:test';
import { createValidationRegistry, DEFAULT_VALIDATION_REGISTRY, validationScopeKey, validationRefKey } from '../src/validation/registry';
import { createCapabilityRegistry, DEFAULT_CAPABILITY_REGISTRY } from '../src/validation/capabilities';
import { VALIDATION_AXES } from '../src/validation/types';
import { SYSTEM_IDS } from '../src/signals/types';
import type { ValidationRecord, ValidationScope, CapabilityRecord, ValidationSelection } from '../src/validation/types';
const scope: ValidationScope = { system: 'humanDesign', schoolId: 'default', schoolVersion: '1', ruleId: 'synthetic.test', ruleVersion: '1', questionId: 'synthetic-question', grain: 'month' };
const refs = (): ValidationSelection => ({ calculationValidation: null, ruleProvenance: null, numericalCalibration: null, predictiveValidation: null });
function evidence(axis: ValidationRecord['axis'], overrides: Partial<ValidationRecord> = {}): ValidationRecord {
  return { schemaVersion: 1, ref: { id: axis, version: '1' }, axis, scope, status: 'pending', result: 'not_assessed', reason: 'Synthetic fixture', sources: [], limitations: ['Synthetic only'], fields: [], settings: [], methodology: 'not assessed', sampleDescription: 'no sample', assessedOn: null, ...overrides };
}
function assessed(axis: ValidationRecord['axis'], overrides: Partial<ValidationRecord> = {}) {
  return evidence(axis, { status: 'assessed', result: 'supports', sources: [{ id: 'test', citation: 'Synthetic fixture, not real validation', sharedBasis: ['synthetic-oracle'] }], fields: ['synthetic-field'], assessedOn: '2026-10-10', ...overrides });
}
function capability(overrides: Partial<CapabilityRecord> = {}): CapabilityRecord {
  return { schemaVersion: 1, scope, calculation: 'available', direction: 'available', applicability: 'applicable', requiredInputs: ['birth-time'], reason: 'Synthetic descriptor', validationRefs: refs(), ...overrides };
}
describe('internal multi-axis validation contract', () => {
  test('calculation cannot promote any other axis or predictive permission', () => {
    const calc = assessed('calculationValidation'), v = createValidationRegistry([calc]);
    const c = createCapabilityRegistry([capability({ validationRefs: { ...refs(), calculationValidation: calc.ref } })], v);
    const result = c.assess(scope, ['birth-time'], 1);
    expect(result.calculation).toBe('available'); expect(result.directionalDescription).toBe('available');
    expect(result.predictiveUse).toBe('not_authorized'); expect(result.directionalVote).toBe('not_authorized');
    const axes: any = result.validation;
    expect(axes.calculationValidation.record.result).toBe('supports');
    for (const axis of VALIDATION_AXES.slice(1)) expect(axes[axis]).toEqual({ status: 'pending', reference: null, reason: 'no_reference' });
    expect(DEFAULT_VALIDATION_REGISTRY.list()).toEqual([]);
  });
  test('all unassessed statuses and negative results stay distinct', () => {
    for (const status of ['not_applicable', 'unsupported', 'insufficient_data', 'pending'] as const) {
      const r = evidence('predictiveValidation', { status });
      expect(createValidationRegistry([r]).resolve(r.ref, scope, r.axis)!.status).toBe(status);
    }
    for (const result of ['supports', 'does_not_support', 'inconclusive'] as const) {
      const r = assessed('predictiveValidation', { result }), v = createValidationRegistry([r]);
      expect(v.resolve(r.ref, scope, r.axis)!.result).toBe(result);
      expect(createCapabilityRegistry([capability({ validationRefs: { ...refs(), predictiveValidation: r.ref } })], v).assess(scope, ['birth-time'], 1).predictiveUse).toBe('not_authorized');
    }
  });
  test('retains exact versions, rejects cross-axis and never latest fallback', () => {
    const a = assessed('calculationValidation'), b = assessed('calculationValidation', { ref: { ...a.ref, version: '2' }, result: 'does_not_support' });
    const v = createValidationRegistry([b, a]);
    expect(v.resolve(a.ref, scope, a.axis)!.result).toBe('supports'); expect(v.resolve(b.ref, scope, b.axis)!.result).toBe('does_not_support');
    expect(v.resolve({ ...a.ref, version: 'latest' }, scope, a.axis)).toBeUndefined();
    expect(() => v.resolve(a.ref, scope, 'predictiveValidation')).toThrow('scope/axis');
    expect(() => createValidationRegistry([a, a])).toThrow('Duplicate');
    const missing: any = v.describe(scope, { ...refs(), calculationValidation: { ...a.ref, version: '0' } });
    expect(missing.calculationValidation.reason).toBe('unknown_exact_version');
  });
  test('binds all scope dimensions with collision-safe tuples', () => {
    const r = assessed('calculationValidation'), v = createValidationRegistry([r]);
    for (const [key, value] of Object.entries({ system: 'bazi', schoolId: 'other', schoolVersion: '2', ruleId: 'other', ruleVersion: '2', questionId: 'other', grain: 'day' })) expect(() => v.resolve(r.ref, { ...scope, [key]: value }, r.axis)).toThrow('scope/axis');
    expect(validationScopeKey({ ...scope, schoolId: 'a|b', schoolVersion: 'c' })).not.toBe(validationScopeKey({ ...scope, schoolId: 'a', schoolVersion: 'b|c' }));
    expect(validationRefKey({ id: 'a|b', version: 'c' })).not.toBe(validationRefKey({ id: 'a', version: 'b|c' }));
  });
  test('preserves shared upstream without inventing independence', () => {
    const r = assessed('calculationValidation', { sources: [{ id: 'a', citation: 'A', sharedBasis: ['same'] }, { id: 'b', citation: 'B', sharedBasis: ['same'] }] });
    const found = createValidationRegistry([r]).resolve(r.ref, scope, r.axis)!;
    expect(found.sources).toEqual(r.sources); expect(Object.keys(found)).not.toContain('independentEvidenceCount');
  });
  test('deep immutable snapshot and deterministic order', () => {
    const mutable: any = structuredClone(assessed('calculationValidation')), v = createValidationRegistry([mutable]);
    mutable.sources[0].citation = 'Changed'; mutable.scope.grain = 'year';
    const r = v.list()[0]!;
    expect(r.sources[0]!.citation).toBe('Synthetic fixture, not real validation'); expect(Object.isFrozen(r.sources[0]!.sharedBasis)).toBe(true); expect(Object.isFrozen(v.list())).toBe(true);
    const b = evidence('predictiveValidation'); expect(createValidationRegistry([r, b]).list()).toEqual(createValidationRegistry([b, r]).list());
  });
  test('rejects malformed evidence and executable inputs without invoking getters', () => {
    const changes: ((x: any) => void)[] = [x => x.schemaVersion = 2, x => x.axis = 'verified', x => x.result = 'true', x => x.status = 'verified', x => x.sources = [], x => x.fields = [], x => x.assessedOn = null, x => x.assessedOn = '2026-02-30', x => x.status = 'pending', x => x.result = 'not_assessed', x => x.scope.grain = 'hour', x => x.scope.system = 'unknown', x => x.scope.schoolId = '', x => x.sources[0].sharedBasis = ['a','a'], x => x.fields = ['a','a'], x => x.extra = true, x => x.ref.version = 1, x => x.sources.push(x.sources[0]), x => Object.defineProperty(x, 'secret', { value: 1 }), x => x.sources = new Array(1)];
    for (const change of changes) { const bad = structuredClone(assessed('calculationValidation')); change(bad); expect(() => createValidationRegistry([bad])).toThrow(); }
    let invoked = false; const getter = { get ref() { invoked = true; return {}; } };
    expect(() => createValidationRegistry([getter as any])).toThrow(); expect(invoked).toBe(false);
  });
});
describe('conservative capability consumer', () => {
  test('default excludes every system/grain without fabricated records', () => {
    for (const system of ['bazi','ziwei','numerology','tzolkin','mingGua','jyotish','humanDesign'] as const) for (const grain of ['natal','day','month','year','decade'] as const) {
      const r = DEFAULT_CAPABILITY_REGISTRY.assess({ ...scope, system, grain }, ['birth-time'], 1);
      expect(r.calculation).toBe('excluded'); expect(r.directionalDescription).toBe('excluded'); expect(r.directionalVote).toBe('not_authorized'); expect(r.reasons).toEqual(['unknown_exact_scope']);
    }
  });
  test('neutral valence is calculable not directional; missing input excludes', () => {
    const c = createCapabilityRegistry([capability()], DEFAULT_VALIDATION_REGISTRY), n = c.assess(scope, ['birth-time'], 0);
    expect(n.calculation).toBe('available'); expect(n.directionalDescription).toBe('excluded'); expect(n.reasons).toContain('neutral_valence_has_no_direction');
    const m = c.assess(scope, [], -1); expect(m.calculation).toBe('excluded'); expect(m.missingInputs).toEqual(['birth-time']); expect(m.directionalDescription).toBe('excluded');
    expect(c.assess({ ...scope, grain: 'year' }, ['birth-time'], 1).calculation).toBe('excluded');
  });
  test('successful evidence cannot override unavailable capability', () => {
    const r = assessed('calculationValidation'), v = createValidationRegistry([r]);
    for (const status of ['pending','unsupported'] as const) expect(createCapabilityRegistry([capability({ calculation: status, validationRefs: { ...refs(), calculationValidation: r.ref } })], v).assess(scope, ['birth-time'], 1).calculation).toBe('excluded');
    expect(createCapabilityRegistry([capability({ direction: 'unsupported' })], v).assess(scope, ['birth-time'], 1).directionalDescription).toBe('excluded');
  });
  test('rejects malformed references/scopes and invalid assessment arguments', () => {
    const r = assessed('calculationValidation'), v = createValidationRegistry([r]);
    expect(() => createCapabilityRegistry([capability({ validationRefs: { ...refs(), predictiveValidation: r.ref } })], v)).toThrow('scope/axis');
    expect(() => createCapabilityRegistry([capability({ validationRefs: { ...refs(), calculationValidation: { id: 'missing', version: '1' } } })], v)).toThrow('Unknown');
    expect(() => createCapabilityRegistry([capability(), capability()], v)).toThrow('Duplicate');
    const c = createCapabilityRegistry([capability()], v);
    for (const invalid of [NaN, Infinity, -1.1, 1.1, null, '0']) expect(() => c.assess(scope, [], invalid as any)).toThrow();
    expect(() => c.assess(scope, ['birth-time','birth-time'], 1)).toThrow(); expect(() => c.assess(scope, new Array(1), 1)).toThrow();
  });
});


describe('immutable validation allowlists', () => {
  test('axis mutation cannot widen create/resolve/describe boundaries', () => {
    const before = [...VALIDATION_AXES];
    const v = createValidationRegistry([assessed('calculationValidation')]);
    try {
      try { (VALIDATION_AXES as unknown as string[]).push('verified'); } catch { /* Frozen array rejects mutation. */ }
      expect(Object.isFrozen(VALIDATION_AXES)).toBe(true);
      expect([...VALIDATION_AXES]).toEqual(before);
      expect(() => createValidationRegistry([evidence('verified' as any)])).toThrow('axis');
      expect(() => v.resolve({ id: 'missing', version: '1' }, scope, 'verified' as any)).toThrow('axis');
      expect(Object.keys(v.describe(scope, refs())).sort()).toEqual([...before].sort());
    } finally {
      if (!Object.isFrozen(VALIDATION_AXES)) (VALIDATION_AXES as unknown as string[]).splice(0, VALIDATION_AXES.length, ...before);
    }
  });
  test('legacy system-array mutation cannot widen the new boundary', () => {
    const before = [...SYSTEM_IDS];
    const forged = { ...scope, system: 'forgedSystem' as any };
    expect(() => validationScopeKey(forged)).toThrow('system');
    try {
      (SYSTEM_IDS as unknown as string[]).push('forgedSystem');
      expect(() => validationScopeKey(forged)).toThrow('system');
      expect(() => createValidationRegistry([evidence('calculationValidation', { scope: forged })])).toThrow('system');
      expect(() => createCapabilityRegistry([capability({ scope: forged })], DEFAULT_VALIDATION_REGISTRY)).toThrow('system');
      expect(() => DEFAULT_CAPABILITY_REGISTRY.assess(forged, [], 1)).toThrow('system');
      expect(validationScopeKey(scope)).toBeDefined();
    } finally {
      (SYSTEM_IDS as unknown as string[]).splice(0, SYSTEM_IDS.length, ...before);
    }
  });
});
