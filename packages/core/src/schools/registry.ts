import { SYSTEM_IDS } from '../signals/types';
import type {
  SchoolPack, SchoolPackRef, SchoolContext, SchoolEvaluator, SchoolAssessment,
  SchoolComparison,
} from './types';

const assessed = new WeakMap<object, string>();
function fail(message: string): never { throw new TypeError(`SchoolPack: ${message}`); }
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
function dense(value: unknown): value is unknown[] {
  return Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype &&
    Reflect.ownKeys(value).length === value.length + 1 &&
    Array.from({ length: value.length }, (_, i) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, i);
      return descriptor?.enumerable && 'value' in descriptor;
    }).every(Boolean);
}
function strings(value: unknown, name: string): asserts value is string[] {
  if (!dense(value) || value.some(item => !text(item)) || new Set(value).size !== value.length) fail(`invalid ${name}`);
}
function object(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) fail('invalid object shape');
}
function ref(value: unknown): asserts value is SchoolPackRef {
  object(value, ['system', 'packId', 'packVersion']);
  if (!(SYSTEM_IDS as readonly unknown[]).includes(value.system) || !text(value.packId) || !text(value.packVersion)) fail('invalid reference');
}
/** Tuple encoding avoids separator collisions. Versions are opaque, never coerced/latest. */
export function schoolPackKey(value: SchoolPackRef): string {
  const snapshot = cloneData(value);
  ref(snapshot);
  return JSON.stringify([snapshot.system, snapshot.packId, snapshot.packVersion]);
}
function packRef(pack: SchoolPack): SchoolPackRef {
  return { system: pack.system, packId: pack.packId, packVersion: pack.packVersion };
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
/** Snapshot data without invoking getters/toJSON or accepting hidden payload fields. */
function cloneData<T>(value: T, ancestors = new Set<object>()): T {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object') fail('non-data value');
  if (ancestors.has(value)) fail('cyclic data');
  const array = Array.isArray(value);
  if (!array && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('non-plain data');
  if (array && !dense(value)) fail('sparse array');
  ancestors.add(value);
  const output: Record<string, unknown> | unknown[] = array ? [] : {};
  for (const key of Reflect.ownKeys(value)) {
    if (array && key === 'length') continue;
    if (typeof key !== 'string') fail('symbol property');
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!descriptor.enumerable || !('value' in descriptor)) fail('hidden/accessor property');
    if (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= (value as unknown[]).length)) fail('extra array property');
    Object.defineProperty(output, key, { value: cloneData(descriptor.value, ancestors), enumerable: true, configurable: true, writable: true });
  }
  ancestors.delete(value);
  return output as T;
}
function copy<T>(value: T): T { return freeze(cloneData(value)); }
function validatePack(pack: SchoolPack) {
  object(pack, ['schemaVersion', 'kind', 'system', 'packId', 'packVersion', 'claims', 'requiredConditions', 'ruleSources', 'verification']);
  ref(packRef(pack));
  if (pack.schemaVersion !== 1 || !['placeholder', 'contract'].includes(pack.kind)) fail('invalid schema/kind');
  strings(pack.requiredConditions, 'conditions');
  if (!dense(pack.claims) || !dense(pack.ruleSources)) fail('invalid claims/sources');
  const ids: string[] = [];
  for (const claim of pack.claims) {
    object(claim, ['claimId', 'description']);
    if (!text(claim.claimId) || !text(claim.description)) fail('invalid claim');
    ids.push(claim.claimId);
  }
  strings(ids, 'claim IDs');
  const sources: string[] = [];
  for (const source of pack.ruleSources) {
    object(source, ['sourceId', 'citation']);
    if (!text(source.sourceId) || !text(source.citation)) fail('invalid source');
    sources.push(source.sourceId);
  }
  strings(sources, 'source IDs');
  object(pack.verification, ['status', 'reason']);
  if (pack.verification.status !== 'unknown' || !text(pack.verification.reason)) fail('unsupported verification');
  if (pack.kind === 'placeholder' && (pack.claims.length || pack.requiredConditions.length || pack.ruleSources.length)) fail('placeholder cannot claim capabilities');
}

/** Immutable descriptor registry, with no mutable global registration or evaluator state. */
export function createSchoolPackRegistry(entries: readonly SchoolPack[]) {
  if (!dense(entries)) fail('entries must be an array');
  const records = new Map<string, SchoolPack>();
  for (const original of entries) {
    const entry = cloneData(original) as SchoolPack;
    validatePack(entry);
    const key = schoolPackKey(packRef(entry));
    if (records.has(key)) fail('duplicate exact version');
    records.set(key, copy(entry));
  }
  const all = freeze([...records.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, value]) => value));
  function resolve(reference: SchoolPackRef): SchoolPack | undefined {
    return records.get(schoolPackKey(reference));
  }
  function assess(reference: SchoolPackRef, context: SchoolContext, evaluator?: SchoolEvaluator): SchoolAssessment {
    const pack = resolve(reference);
    if (!pack) fail('unknown exact version');
    const input = cloneData(context);
    object(input, ['factIds', 'availableConditions']);
    strings(input.factIds, 'context fact IDs');
    strings(input.availableConditions, 'available conditions');
    freeze(input);
    const basis = JSON.stringify([[...input.factIds].sort(), [...input.availableConditions].sort()]);
    const missingConditions = pack.requiredConditions.filter(item => !input.availableConditions.includes(item));
    const base = { ref: packRef(pack), missingConditions, ruleSources: pack.ruleSources, verification: pack.verification };
    const result = (status: SchoolAssessment['status'], conclusions: SchoolAssessment['conclusions'], reason: string): SchoolAssessment => {
      const value = copy({ ...base, status, conclusions, reason });
      assessed.set(value, basis);
      return value;
    };
    const abstain = (reason: string): SchoolAssessment => result('abstain', [], reason);
    if (pack.kind === 'placeholder') return abstain('default_placeholder_no_rules');
    if (missingConditions.length) return abstain('missing_conditions');
    if (!evaluator) return abstain('no_evaluator');
    const conclusions = cloneData(evaluator(input));
    if (!dense(conclusions)) fail('invalid evaluator result');
    const claims = new Set<string>();
    for (const conclusion of conclusions) {
      object(conclusion, ['claimId', 'stance', 'factIds']);
      if (!text(conclusion.claimId)) fail('invalid conclusion claim');
      if (!pack.claims.some(claim => claim.claimId === conclusion.claimId) || claims.has(conclusion.claimId)) fail('unknown/duplicate conclusion claim');
      claims.add(conclusion.claimId);
      if (conclusion.stance !== 'support' && conclusion.stance !== 'oppose') fail('invalid stance');
      strings(conclusion.factIds, 'conclusion fact IDs');
      if (!conclusion.factIds.length || conclusion.factIds.some(id => !input.factIds.includes(id))) fail('missing/unknown fact reference');
    }
    if (!conclusions.length) return abstain('no_conclusion');
    return result('concluded', conclusions, 'contract_evaluation_only');
  }
  return Object.freeze({ resolve, list: () => all, assess });
}

export const DEFAULT_SCHOOL_PACKS: readonly SchoolPack[] = freeze(SYSTEM_IDS.map(system => ({
  schemaVersion: 1 as const, system, packId: 'default', packVersion: '1', kind: 'placeholder' as const,
  claims: [], requiredConditions: [], ruleSources: [],
  verification: { status: 'unknown' as const, reason: 'Contract placeholder; no rules or validation evidence registered.' },
})));
export const DEFAULT_SCHOOL_REGISTRY = createSchoolPackRegistry(DEFAULT_SCHOOL_PACKS);

/** Pure within-system proposition comparison, deliberately not a consensus/voting API.
 * Assessments must originate from this registry's assess operation; raw transport DTOs
 * are not accepted here. Use a fresh assessment after resolving a serialized exact ref.
 */
export function compareSchoolAssessments(assessments: readonly SchoolAssessment[]): readonly SchoolComparison[] {
  const seen = new Set<string>();
  const groups = new Map<string, { system: SchoolPackRef['system']; claimId: string; supportingPacks: SchoolPackRef[]; opposingPacks: SchoolPackRef[] }>();
  if (!dense(assessments)) fail('invalid assessments');
  let basis: string | undefined;
  for (const assessment of assessments) {
    if (!assessment || !assessed.has(assessment)) fail('untrusted assessment');
    const currentBasis = assessed.get(assessment);
    if (basis !== undefined && currentBasis !== basis) fail('mixed assessment contexts');
    basis = currentBasis;
    const key = JSON.stringify([assessment.ref.system, assessment.ref.packId]);
    if (seen.has(key)) fail('duplicate assessment');
    seen.add(key);
    if (assessment.status === 'abstain') continue;
    for (const conclusion of assessment.conclusions) {
      const groupKey = JSON.stringify([assessment.ref.system, conclusion.claimId]);
      const group = groups.get(groupKey) ?? { system: assessment.ref.system, claimId: conclusion.claimId, supportingPacks: [], opposingPacks: [] };
      (conclusion.stance === 'support' ? group.supportingPacks : group.opposingPacks).push(assessment.ref);
      groups.set(groupKey, group);
    }
  }
  const sortedRefs = (refs: SchoolPackRef[]) => refs.sort((a, b) => schoolPackKey(a) < schoolPackKey(b) ? -1 : 1);
  return copy([...groups.entries()].sort(([a], [b]) => a < b ? -1 : 1).map(([, group]) => ({
    ...group, supportingPacks: sortedRefs(group.supportingPacks), opposingPacks: sortedRefs(group.opposingPacks),
    status: group.supportingPacks.length && group.opposingPacks.length ? 'conflict' as const :
      group.supportingPacks.length + group.opposingPacks.length === 1 ? 'single' as const : 'agreement' as const,
  })));
}
