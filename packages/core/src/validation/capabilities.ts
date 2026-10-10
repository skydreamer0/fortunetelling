/** Internal #16 gate. Next: #30 scoped eligibility, then Web/MCP/export/backtest.
 * Not wired to legacy verifiedOnly/scoring: descriptors cannot authorize prediction. */
import { interpretationData, exactInterpretationKeys } from '../core/interpretationSpec';
import { VALIDATION_AXES } from './types';
import type { CapabilityRecord, ValidationScope } from './types';
import { DEFAULT_VALIDATION_REGISTRY, validationScopeKey, validationStrings, validationText } from './registry';
import type { ValidationRegistry } from './registry';
export function createCapabilityRegistry(entries: readonly CapabilityRecord[], validation: ValidationRegistry) {
  const data = interpretationData(entries);
  if (!Array.isArray(data)) throw new TypeError('Capability entries must be an array');
  const records = new Map<string, CapabilityRecord>();
  for (const entry of data as readonly CapabilityRecord[]) {
    exactInterpretationKeys(entry, ['schemaVersion', 'scope', 'calculation', 'direction', 'applicability', 'requiredInputs', 'reason', 'validationRefs']);
    const key = validationScopeKey(entry.scope);
    if (entry.schemaVersion !== 1 || !['available', 'pending', 'unsupported'].includes(entry.calculation) ||
      !['available', 'pending', 'unsupported'].includes(entry.direction) || !['applicable', 'pending', 'unsupported'].includes(entry.applicability)) throw new TypeError('Invalid capability status');
    validationStrings(entry.requiredInputs); validationText(entry.reason);
    exactInterpretationKeys(entry.validationRefs, VALIDATION_AXES);
    for (const axis of VALIDATION_AXES) {
      const ref = entry.validationRefs[axis];
      if (ref !== null && !validation.resolve(ref, entry.scope, axis)) throw new TypeError('Unknown exact capability validation reference');
    }
    if (records.has(key)) throw new TypeError('Duplicate exact capability scope');
    records.set(key, entry);
  }
  const all = Object.freeze([...records.entries()].sort(([a], [b]) => a < b ? -1 : 1).map(([, v]) => v));
  function resolve(scope: ValidationScope) { return records.get(validationScopeKey(scope)); }
  function assess(scope: ValidationScope, availableInputs: readonly string[], valence: number) {
    const inputs = interpretationData(availableInputs);
    validationStrings(inputs);
    if (typeof valence !== 'number' || !Number.isFinite(valence) || valence < -1 || valence > 1) throw new TypeError('Invalid capability valence');
    const record = resolve(scope);
    const missingInputs = record ? record.requiredInputs.filter(input => !inputs.includes(input)) : [];
    const reasons: string[] = [];
    if (!record) reasons.push('unknown_exact_scope');
    if (record && record.calculation !== 'available') reasons.push(`calculation_${record.calculation}`);
    if (record && record.applicability !== 'applicable') reasons.push(`applicability_${record.applicability}`);
    if (missingInputs.length) reasons.push('missing_required_inputs');
    const calculationAvailable = reasons.length === 0;
    if (record && record.direction !== 'available') reasons.push(`direction_${record.direction}`);
    if (valence === 0) reasons.push('neutral_valence_has_no_direction');
    return interpretationData({ scope, record: record ?? null, missingInputs,
      calculation: calculationAvailable ? 'available' : 'excluded',
      directionalDescription: reasons.length === 0 ? 'available' : 'excluded',
      predictiveUse: 'not_authorized', directionalVote: 'not_authorized',
      authorizationReason: 'production_eligibility_policy_not_bound', reasons,
      validation: record ? validation.describe(scope, record.validationRefs) : null,
    });
  }
  return Object.freeze({ resolve, assess, list: () => all });
}
/** No invented evidence from whole-system VERIFIED labels or seven default votes. */
export const DEFAULT_CAPABILITY_REGISTRY = createCapabilityRegistry([], DEFAULT_VALIDATION_REGISTRY);
