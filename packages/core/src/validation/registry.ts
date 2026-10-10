import { interpretationData, exactInterpretationKeys } from '../core/interpretationSpec';
import { SYSTEM_IDS } from '../signals/types';
import { VALIDATION_AXES } from './types';
import type { ValidationRecord, ValidationRef, ValidationScope, ValidationSelection } from './types';

export function validationText(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError('Validation requires nonempty text');
}
export function validationStrings(value: unknown): asserts value is readonly string[] {
  if (!Array.isArray(value)) throw new TypeError('Validation requires an array');
  value.forEach(validationText);
  if (new Set(value).size !== value.length) throw new TypeError('Duplicate validation members');
}
/** Exact tuple matching; no null wildcard, school fallback, latest version or scope widening. */
export function validationScopeKey(scope: ValidationScope): string {
  const s = interpretationData(scope);
  exactInterpretationKeys(s, ['system', 'schoolId', 'schoolVersion', 'ruleId', 'ruleVersion', 'questionId', 'grain']);
  if (!(SYSTEM_IDS as readonly unknown[]).includes(s.system) || !['natal', 'day', 'month', 'year', 'decade'].includes(s.grain as string)) throw new TypeError('Invalid validation system/grain');
  for (const k of ['schoolId', 'schoolVersion', 'ruleId', 'ruleVersion', 'questionId'] as const) validationText(s[k]);
  return JSON.stringify([s.system, s.schoolId, s.schoolVersion, s.ruleId, s.ruleVersion, s.questionId, s.grain]);
}
export function validationRefKey(ref: ValidationRef): string {
  const r = interpretationData(ref);
  exactInterpretationKeys(r, ['id', 'version']);
  validationText(r.id); validationText(r.version);
  return JSON.stringify([r.id, r.version]);
}
export function createValidationRegistry(entries: readonly ValidationRecord[]) {
  const data = interpretationData(entries);
  if (!Array.isArray(data)) throw new TypeError('Validation entries must be an array');
  const records = new Map<string, ValidationRecord>();
  for (const entry of data as readonly ValidationRecord[]) {
    exactInterpretationKeys(entry, ['schemaVersion', 'ref', 'axis', 'scope', 'status', 'result', 'reason', 'sources', 'limitations', 'fields', 'settings', 'methodology', 'sampleDescription', 'assessedOn']);
    const key = validationRefKey(entry.ref);
    validationScopeKey(entry.scope);
    if (entry.schemaVersion !== 1 || !(VALIDATION_AXES as readonly unknown[]).includes(entry.axis)) throw new TypeError('Invalid validation schema/axis');
    if (!['pending', 'unsupported', 'not_applicable', 'insufficient_data', 'assessed'].includes(entry.status)) throw new TypeError('Invalid validation status');
    if (!['not_assessed', 'supports', 'does_not_support', 'inconclusive'].includes(entry.result)) throw new TypeError('Invalid validation result');
    if ((entry.status === 'assessed') !== (entry.result !== 'not_assessed')) throw new TypeError('Assessment/result mismatch');
    for (const value of [entry.reason, entry.methodology, entry.sampleDescription]) validationText(value);
    for (const value of [entry.limitations, entry.fields, entry.settings]) validationStrings(value);
    if (!Array.isArray(entry.sources)) throw new TypeError('Invalid validation sources');
    const sourceIds: string[] = [];
    for (const source of entry.sources) {
      exactInterpretationKeys(source, ['id', 'citation', 'sharedBasis']);
      validationText(source.id); validationText(source.citation); validationStrings(source.sharedBasis);
      sourceIds.push(source.id);
    }
    validationStrings(sourceIds);
    if (entry.assessedOn !== null && (typeof entry.assessedOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.assessedOn) || new Date(entry.assessedOn).toISOString().slice(0, 10) !== entry.assessedOn)) throw new TypeError('Invalid assessment date');
    if (entry.status === 'assessed' && (!entry.sources.length || !entry.fields.length || !entry.assessedOn)) throw new TypeError('Assessed validation requires sources, fields and date');
    if (entry.status !== 'assessed' && entry.assessedOn !== null) throw new TypeError('Unassessed validation cannot claim assessment date');
    if (records.has(key)) throw new TypeError('Duplicate exact validation version');
    records.set(key, entry);
  }
  const all = Object.freeze([...records.entries()].sort(([a], [b]) => a < b ? -1 : 1).map(([, v]) => v));
  function resolve(ref: ValidationRef, scope: ValidationScope, axis: typeof VALIDATION_AXES[number]): ValidationRecord | undefined {
    if (!(VALIDATION_AXES as readonly unknown[]).includes(axis)) throw new TypeError('Invalid validation axis');
    const expectedScope = validationScopeKey(scope);
    const record = records.get(validationRefKey(ref));
    if (record && (validationScopeKey(record.scope) !== expectedScope || record.axis !== axis)) throw new TypeError('Validation reference scope/axis mismatch');
    return record;
  }
  function describe(scope: ValidationScope, refs: ValidationSelection) {
    validationScopeKey(scope);
    const selection = interpretationData(refs);
    exactInterpretationKeys(selection, VALIDATION_AXES);
    return interpretationData(Object.fromEntries(VALIDATION_AXES.map(axis => {
      const reference = selection[axis];
      const record = reference === null ? undefined : resolve(reference, scope, axis);
      return [axis, record ? { status: 'resolved', record } : { status: 'pending', reference, reason: reference === null ? 'no_reference' : 'unknown_exact_version' }];
    })));
  }
  return Object.freeze({ resolve, describe, list: () => all });
}
export type ValidationRegistry = ReturnType<typeof createValidationRegistry>;
/** No evidence records are invented from legacy whole-system VERIFIED labels. */
export const DEFAULT_VALIDATION_REGISTRY = createValidationRegistry([]);
