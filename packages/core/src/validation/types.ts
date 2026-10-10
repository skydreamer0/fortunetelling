import type { SystemId } from '../signals/types';

/** Internal #16 contract. No public exports or production consensus authorization. */
export const VALIDATION_AXES = ['calculationValidation', 'ruleProvenance', 'numericalCalibration', 'predictiveValidation'] as const;
export type ValidationAxis = typeof VALIDATION_AXES[number];
/** day is explicit here, not an extension of the legacy Signal grain enum. */
export type CapabilityGrain = 'natal' | 'day' | 'month' | 'year' | 'decade';
export interface ValidationScope {
  readonly system: SystemId;
  readonly schoolId: string;
  readonly schoolVersion: string;
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly questionId: string;
  readonly grain: CapabilityGrain;
}
export interface ValidationRef { readonly id: string; readonly version: string }
export type ValidationStatus = 'pending' | 'unsupported' | 'not_applicable' | 'insufficient_data' | 'assessed';
export type ValidationResult = 'not_assessed' | 'supports' | 'does_not_support' | 'inconclusive';
export interface ValidationSource {
  readonly id: string;
  readonly citation: string;
  /** Shared upstream is disclosed, never inferred as independent evidence. */
  readonly sharedBasis: readonly string[];
}
export interface ValidationRecord {
  readonly schemaVersion: 1;
  readonly ref: ValidationRef;
  readonly axis: ValidationAxis;
  readonly scope: ValidationScope;
  readonly status: ValidationStatus;
  readonly result: ValidationResult;
  readonly reason: string;
  readonly sources: readonly ValidationSource[];
  readonly limitations: readonly string[];
  /** Exact reviewed field names and explicit settings/tolerance/design, not all-system verification. */
  readonly fields: readonly string[];
  readonly settings: readonly string[];
  readonly methodology: string;
  readonly sampleDescription: string;
  readonly assessedOn: string | null;
}
export type ValidationSelection = Readonly<Record<ValidationAxis, ValidationRef | null>>;
export interface CapabilityRecord {
  readonly schemaVersion: 1;
  readonly scope: ValidationScope;
  readonly calculation: 'available' | 'pending' | 'unsupported';
  readonly direction: 'available' | 'pending' | 'unsupported';
  readonly applicability: 'applicable' | 'pending' | 'unsupported';
  readonly requiredInputs: readonly string[];
  readonly reason: string;
  readonly validationRefs: ValidationSelection;
}
