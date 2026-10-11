/** Internal caller-declared traceability. Never school attribution or eligibility. */
import type { DeepReadonly } from '../core/calculationSpec';
import { exactInterpretationKeys, interpretationBytes, interpretationData } from '../core/interpretationSpec';
import { createValidationRegistry, validationScopeKey } from '../validation/registry';
import { VALIDATION_AXES } from '../validation/types';
import type { ValidationAxis, ValidationRecord, ValidationRef, ValidationScope, ValidationSelection } from '../validation/types';
import { validateNatalRuleMetadata, type NatalRuleMetadata } from './natalRuleMetadata';

export interface NatalValidationBinding {
  /** Position in this exact owned metadata, never a portable record identity. */
  readonly recordIndex: number;
  readonly scope: ValidationScope;
  readonly validationRefs: ValidationSelection;
}
type AxisLink = { status: 'resolved'; reference: ValidationRef; record: ValidationRecord } |
  { status: 'pending'; reference: ValidationRef | null; reason: 'no_reference' | 'unknown_exact_version' };
type Link = NatalValidationBinding & {
  scopeProvenance: 'caller-declared-not-verified';
  validation: Readonly<Record<ValidationAxis, AxisLink>>;
};
export type NatalValidationLinks = DeepReadonly<{
  schemaVersion: 1;
  scope: 'primary-natal-caller-declared-validation-links';
  metadata: NatalRuleMetadata;
  links: readonly Link[];
  coverage: { unboundRecords: readonly number[] };
  schoolQuestionAttribution: 'not-established';
  predictiveUse: 'not_authorized';
  directionalVote: 'not_authorized';
  independence: 'not-established';
}>;
const owned = new WeakSet<object>();
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** Scope declarations do not prove the school/question applies to a native rule.
 * The existing #16 registry validates supplied data and exact references. No
 * arbitrary registry methods execute, and no evidence is fabricated by default.
 */
export function describeNatalValidationLinks(
  metadata: NatalRuleMetadata,
  bindings: readonly NatalValidationBinding[] = [],
  validationRecords: readonly ValidationRecord[] = [],
): NatalValidationLinks {
  if (arguments.length < 1 || arguments.length > 3) throw new TypeError('Validation links require owned metadata and optional data declarations');
  validateNatalRuleMetadata(metadata, metadata);
  const declarations = interpretationData(bindings);
  if (!Array.isArray(declarations)) throw new TypeError('Validation bindings must be an array');
  const registry = createValidationRegistry(validationRecords);
  const seen = new Set<string>();
  const bound = new Set<number>();
  const links: Link[] = [];
  for (const binding of declarations as readonly NatalValidationBinding[]) {
    exactInterpretationKeys(binding, ['recordIndex', 'scope', 'validationRefs']);
    if (!Number.isSafeInteger(binding.recordIndex) || binding.recordIndex < 0 || binding.recordIndex >= metadata.records.length) {
      throw new TypeError('Unknown metadata record position');
    }
    const record = metadata.records[binding.recordIndex]!;
    const scopeKey = validationScopeKey(binding.scope);
    if (binding.scope.system !== record.system || binding.scope.ruleId !== record.ruleId ||
      binding.scope.ruleVersion !== String(record.ruleVersion) || binding.scope.grain !== 'natal') {
      throw new TypeError('Native validation scope mismatch');
    }
    const key = JSON.stringify([binding.recordIndex, scopeKey]);
    if (seen.has(key)) throw new TypeError('Duplicate native validation binding');
    seen.add(key);
    bound.add(binding.recordIndex);
    exactInterpretationKeys(binding.validationRefs, VALIDATION_AXES);
    const validation = Object.fromEntries(VALIDATION_AXES.map(axis => {
      const reference = binding.validationRefs[axis];
      const resolved = reference === null ? undefined : registry.resolve(reference, binding.scope, axis);
      const link: AxisLink = resolved ? { status: 'resolved', reference: reference!, record: resolved } :
        { status: 'pending', reference, reason: reference === null ? 'no_reference' : 'unknown_exact_version' };
      return [axis, link];
    })) as Record<ValidationAxis, AxisLink>;
    links.push({ ...binding, scopeProvenance: 'caller-declared-not-verified', validation });
  }
  links.sort((a, b) => a.recordIndex - b.recordIndex || compare(validationScopeKey(a.scope), validationScopeKey(b.scope)));
  const data = interpretationData({ schemaVersion: 1 as const,
    scope: 'primary-natal-caller-declared-validation-links' as const, links,
    coverage: { unboundRecords: metadata.records.flatMap((_, i) => bound.has(i) ? [] : [i]) },
    schoolQuestionAttribution: 'not-established' as const,
    predictiveUse: 'not_authorized' as const, directionalVote: 'not_authorized' as const,
    independence: 'not-established' as const,
  });
  // Preserve the owned capability and all source gaps, claims, roles and facts.
  const output: NatalValidationLinks = Object.freeze({ ...data, metadata });
  validateNatalRuleMetadata(metadata, metadata);
  owned.add(output);
  return output;
}

export function validateNatalValidationLinks(candidate: unknown, expected: NatalValidationLinks): NatalValidationLinks {
  if (arguments.length !== 2 || !owned.has(expected)) throw new TypeError('Expected owned natal validation links');
  validateNatalRuleMetadata(expected.metadata, expected.metadata);
  if (interpretationBytes(candidate) !== interpretationBytes(expected)) throw new TypeError('Natal validation links full content mismatch');
  return expected;
}
