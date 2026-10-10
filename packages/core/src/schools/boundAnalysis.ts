/** Internal sync snapshot + interpretation binding. No persistence or public API. */
import type { ChartSnapshot } from '../core/chartSnapshot';
import { chartSnapshotRuntime } from '../core/chartSnapshot';
import type { DeepReadonly } from '../core/calculationSpec';
import { canonicalSchoolContext, interpretationData, interpretationBytes, type InterpretationSpec } from '../core/interpretationSpec';
import { fnv1a64Hex } from '../signals/signalId';
import { createSchoolPackRegistry, DEFAULT_SCHOOL_PACKS, schoolPackKey, compareSchoolAssessments } from './registry';
import type { SchoolPack, SchoolPackRef, SchoolContext, SchoolEvaluator, SchoolAssessment, SchoolComparison } from './types';
import { SYNTHETIC_PACKS, syntheticConclusion } from './syntheticInterpretationCatalog';
import { resolveFactReferences } from '../facts/natalFactStore';
import type { NatalFact, NatalFactStore } from '../facts/types';

const syncSystems = ['bazi', 'ziwei', 'numerology', 'tzolkin', 'mingGua'] as const;
const ownedFactResults = new WeakSet<object>();
type Unavailable = { ref: SchoolPackRef; reason: 'time_unknown' };
export type BoundAnalysisIdentity = DeepReadonly<{
  schemaVersion: 1;
  scope: 'sync-natal' | 'synthetic-sync-natal';
  snapshot: ChartSnapshot;
  interpretation: InterpretationSpec;
  context: SchoolContext;
}>;
export type BoundAnalysis = DeepReadonly<{
  analysisId: string;
  identity: BoundAnalysisIdentity;
  assessments: readonly SchoolAssessment[];
  unavailable: readonly Unavailable[];
  comparisons: readonly SchoolComparison[];
}>;
/** Separate internal contract: legacy ia1/opaque references are not upgraded. */
export type FactSchoolContext = SchoolContext & { readonly facts: readonly NatalFact[] };
export type FactBoundAnalysisIdentity = DeepReadonly<{
  schemaVersion: 1;
  scope: 'fact-backed-sync-natal' | 'synthetic-fact-backed-sync-natal';
  snapshot: ChartSnapshot;
  interpretation: InterpretationSpec;
  factStore: NatalFactStore;
  context: FactSchoolContext;
}>;
export type FactBoundAnalysis = DeepReadonly<{
  analysisId: string;
  identity: FactBoundAnalysisIdentity;
  assessments: readonly (SchoolAssessment & {
    conclusions: readonly (SchoolAssessment['conclusions'][number] & { facts: readonly NatalFact[] })[];
  })[];
  unavailable: readonly Unavailable[];
  comparisons: readonly SchoolComparison[];
}>;
/** Internal provenance capability. Does not weaken registry-local validation. */
export function assertOwnedFactAnalysis(result: FactBoundAnalysis): void {
  if (arguments.length !== 1 || !ownedFactResults.has(result)) throw new TypeError('Expected owned fact-backed analysis');
  const { factStore, snapshot, context } = result.identity;
  resolveFactReferences(factStore, snapshot, context.factIds);
  for (const assessment of result.assessments) {
    for (const conclusion of assessment.conclusions) resolveFactReferences(factStore, snapshot, conclusion.factIds);
  }
}
const reference = (p: SchoolPack): SchoolPackRef => ({ system: p.system, packId: p.packId, packVersion: p.packVersion });

/** Private constructor: callers cannot register or replace executable code. */
function createRegistry(synthetic: boolean) {
  const scope = synthetic ? 'synthetic-sync-natal' as const : 'sync-natal' as const;
  const descriptors = createSchoolPackRegistry(synthetic ? SYNTHETIC_PACKS : DEFAULT_SCHOOL_PACKS);
  const implementations = new Map<string, SchoolEvaluator>();
  for (const pack of descriptors.list()) {
    if (pack.kind === 'placeholder') implementations.set(schoolPackKey(reference(pack)), () => []);
    else if (synthetic && pack.packVersion !== '0') implementations.set(schoolPackKey(reference(pack)), context => syntheticConclusion(pack, context));
  }
  const specs = new WeakSet<object>();
  const results = new WeakSet<object>();
  const factResults = new WeakSet<object>();
  function createSpec(requested: readonly SchoolPackRef[]): InterpretationSpec {
    if (arguments.length !== 1) throw new TypeError('Interpretation selection takes exact references only');
    const copied = interpretationData(requested);
    if (!Array.isArray(copied) || copied.length === 0) throw new TypeError('Explicit nonempty pack selection required');
    const selected = new Set<string>();
    const packs = copied.map(r => {
      const key = schoolPackKey(r);
      if (!(syncSystems as readonly string[]).includes(r.system)) throw new TypeError('Interpretation requires five-system sync natal scope');
      const group = JSON.stringify([r.system, r.packId]);
      if (selected.has(group)) throw new TypeError('Duplicate pack or mixed selected versions');
      selected.add(group);
      if (!descriptors.resolve(r)) throw new TypeError('Unknown exact SchoolPack version');
      if (!implementations.has(key)) throw new TypeError('Missing exact retained SchoolPack implementation');
      return r;
    }).sort((a, b) => schoolPackKey(a) < schoolPackKey(b) ? -1 : 1);
    const spec: InterpretationSpec = interpretationData({ schemaVersion: 1, scope,
      implementationCatalog: { id: synthetic ? 'synthetic-contract-fixtures-v1' : 'default-placeholders-v1', version: 1 },
      interpretationVersion: 1, comparisonVersion: 1, packs });
    specs.add(spec);
    return spec;
  }
  function validateSpec(candidate: unknown, expected: InterpretationSpec): InterpretationSpec {
    if (arguments.length !== 2 || !specs.has(expected)) throw new TypeError('Expected owned InterpretationSpec');
    if (interpretationBytes(candidate) !== interpretationBytes(expected)) throw new TypeError('InterpretationSpec content mismatch');
    return expected;
  }
  function bind(snapshot: ChartSnapshot, interpretation: InterpretationSpec, requestedContext: SchoolContext) {
    if (arguments.length !== 3) throw new TypeError('No evaluator or identity overrides allowed');
    // The runtime capability checks complete owned snapshot provenance and current environment.
    chartSnapshotRuntime(snapshot);
    if (!specs.has(interpretation)) throw new TypeError('Expected owned InterpretationSpec from this catalog');
    const context = canonicalSchoolContext(requestedContext);
    // Snapshot occurs once. Calculation identity/specHash/snapshotId derive from it.
    const identity: BoundAnalysisIdentity = Object.freeze({ schemaVersion: 1, scope, snapshot, interpretation, context });
    const analysisId = `ia1-${fnv1a64Hex(interpretationBytes(identity))}`;
    function run(): BoundAnalysis {
      if (arguments.length) throw new TypeError('No evaluator or context overrides allowed');
      chartSnapshotRuntime(snapshot);
      const assessments: SchoolAssessment[] = [];
      const unavailable: Unavailable[] = [];
      for (const selected of interpretation.packs) {
        const natal = snapshot.natal[selected.system as typeof syncSystems[number]];
        if (natal.status === 'skipped') {
          unavailable.push({ ref: selected, reason: natal.reason });
          continue;
        }
        const evaluate = implementations.get(schoolPackKey(selected));
        if (!evaluate) throw new TypeError('Missing exact retained SchoolPack implementation');
        // Registry validates conclusions; retained code receives these exact canonical,
        // immutable sets, never original caller order or caller-owned input objects.
        assessments.push(descriptors.assess(selected, context, () => evaluate(context)));
        chartSnapshotRuntime(snapshot);
      }
      const comparisons = compareSchoolAssessments(assessments);
      const output: BoundAnalysis = Object.freeze({ analysisId, identity,
        // Do not leak the older context-only comparison capability. These DTOs
        // can only be compared as part of this full snapshot-bound operation.
        assessments: interpretationData(assessments), unavailable: interpretationData(unavailable), comparisons });
      results.add(output);
      return output;
    }
    return Object.freeze({ analysisId, identity, run });
  }
  function validate(candidate: unknown, expected: BoundAnalysis): BoundAnalysis {
    if (arguments.length !== 2 || !results.has(expected)) throw new TypeError('Expected owned bound analysis');
    // Never accept a hash or assessment brand alone as evidence of chart/context identity.
    if (interpretationBytes(candidate) !== interpretationBytes(expected)) throw new TypeError('Bound analysis full content mismatch');
    return expected;
  }
  /** Internal consumer seam. Every input and conclusion is resolved against
   * the same owned store and complete snapshot, before any result is returned.
   * Production packs remain placeholders; this does not create real rules.
   */
  function bindFacts(snapshot: ChartSnapshot, interpretation: InterpretationSpec, factStore: NatalFactStore, requestedContext: SchoolContext) {
    if (arguments.length !== 4) throw new TypeError('Fact binding requires snapshot, interpretation, owned store and context');
    if (!specs.has(interpretation)) throw new TypeError('Expected owned InterpretationSpec from this catalog');
    const requested = canonicalSchoolContext(requestedContext);
    const facts = resolveFactReferences(factStore, snapshot, requested.factIds);
    const context: FactSchoolContext = Object.freeze({ ...requested, facts });
    const identity: FactBoundAnalysisIdentity = Object.freeze({ schemaVersion: 1,
      scope: synthetic ? 'synthetic-fact-backed-sync-natal' : 'fact-backed-sync-natal',
      snapshot, interpretation, factStore, context });
    const analysisId = `ifa1-${fnv1a64Hex(interpretationBytes(identity))}`;
    function run(): FactBoundAnalysis {
      if (arguments.length) throw new TypeError('No evaluator or context overrides allowed');
      resolveFactReferences(factStore, snapshot, context.factIds);
      const assessments: SchoolAssessment[] = [], unavailable: Unavailable[] = [];
      for (const selected of interpretation.packs) {
        const natal = snapshot.natal[selected.system as typeof syncSystems[number]];
        if (natal.status === 'skipped') {
          unavailable.push({ ref: selected, reason: natal.reason });
          continue;
        }
        const evaluate = implementations.get(schoolPackKey(selected));
        if (!evaluate) throw new TypeError('Missing exact retained SchoolPack implementation');
        // These finite adapters are system-local. Never let a Bazi fixture cite
        // a Ziwei fact merely because its diagnostic ID sorts first.
        const systemFacts = Object.freeze(facts.filter(f => f.system === selected.system));
        const evaluatorContext: FactSchoolContext = Object.freeze({
          availableConditions: context.availableConditions,
          factIds: Object.freeze(systemFacts.map(f => f.factId)), facts: systemFacts,
        });
        assessments.push(descriptors.assess(selected, requested, () => systemFacts.length ? evaluate(evaluatorContext) : []));
      }
      const comparisons = compareSchoolAssessments(assessments);
      const resolvedAssessments = assessments.map(assessment => ({ ...assessment,
        conclusions: assessment.conclusions.map(conclusion => ({ ...conclusion,
          facts: resolveFactReferences(factStore, snapshot, conclusion.factIds),
        })),
      }));
      // Recheck even when all selected systems were unavailable or abstained.
      resolveFactReferences(factStore, snapshot, context.factIds);
      const output: FactBoundAnalysis = Object.freeze({ analysisId, identity,
        assessments: interpretationData(resolvedAssessments), unavailable: interpretationData(unavailable), comparisons });
      factResults.add(output);
      ownedFactResults.add(output);
      return output;
    }
    return Object.freeze({ analysisId, identity, run });
  }
  function validateFacts(candidate: unknown, expected: FactBoundAnalysis): FactBoundAnalysis {
    if (arguments.length !== 2 || !factResults.has(expected)) throw new TypeError('Expected owned fact-backed analysis');
    resolveFactReferences(expected.identity.factStore, expected.identity.snapshot, expected.identity.context.factIds);
    if (interpretationBytes(candidate) !== interpretationBytes(expected)) throw new TypeError('Fact-backed analysis full content mismatch');
    return expected;
  }
  return Object.freeze({ createSpec, validateSpec, bind, validate, bindFacts, validateFacts });
}

/** Production catalog remains placeholders only; no caller-owned registration. */
export function createBoundSchoolRegistry() {
  if (arguments.length) throw new TypeError('The production implementation catalog is code-owned');
  return createRegistry(false);
}
/** Isolated fixed synthetic catalog for contract verification, never real interpretation.
 * Its scope/catalog identity cannot be accepted by the production factory.
 */
export function createSyntheticBoundSchoolRegistry() {
  if (arguments.length) throw new TypeError('The synthetic implementation catalog is fixed');
  return createRegistry(true);
}
