import type { SystemId } from '../signals/types';

/** Internal contract only: no Signal/Report/specHash or production ranking wiring. */
export interface SchoolPackRef {
  readonly system: SystemId;
  readonly packId: string;
  readonly packVersion: string;
}
export interface SchoolClaim {
  /** Exact proposition identity. Different claims must never be compared as agreement. */
  readonly claimId: string;
  readonly description: string;
}
export interface RuleSource {
  readonly sourceId: string;
  readonly citation: string;
}
/** #16 owns future multi-axis evidence. A source is not proof of predictive validity. */
export interface SchoolVerification {
  readonly status: 'unknown';
  readonly reason: string;
}
export interface SchoolPack extends SchoolPackRef {
  readonly schemaVersion: 1;
  readonly kind: 'placeholder' | 'contract';
  readonly claims: readonly SchoolClaim[];
  readonly requiredConditions: readonly string[];
  readonly ruleSources: readonly RuleSource[];
  readonly verification: SchoolVerification;
}
export interface SchoolContext {
  /** Opaque references supplied by the caller; this module never invents Fact V2 IDs. */
  readonly factIds: readonly string[];
  readonly availableConditions: readonly string[];
}
export interface SchoolConclusion {
  readonly claimId: string;
  readonly stance: 'support' | 'oppose';
  readonly factIds: readonly string[];
}
export interface SchoolAssessment {
  readonly ref: SchoolPackRef;
  readonly status: 'concluded' | 'abstain';
  readonly conclusions: readonly SchoolConclusion[];
  readonly missingConditions: readonly string[];
  readonly reason: string;
  readonly ruleSources: readonly RuleSource[];
  readonly verification: SchoolVerification;
}
export type SchoolEvaluator = (context: SchoolContext) => readonly SchoolConclusion[];
export interface SchoolComparison {
  readonly system: SystemId;
  readonly claimId: string;
  readonly status: 'single' | 'agreement' | 'conflict';
  readonly supportingPacks: readonly SchoolPackRef[];
  readonly opposingPacks: readonly SchoolPackRef[];
  /** School counts are descriptive only, never independent system votes. */
}
