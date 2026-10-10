/** Limited exact-claim/fact-set descriptor, not the general Signal evidenceGroup V2. */
import { interpretationBytes, interpretationData } from '../core/interpretationSpec';
import type { DeepReadonly } from '../core/calculationSpec';
import type { FactIdentity, NatalFact } from '../facts/types';
import { fnv1a64Hex } from '../signals/signalId';
import { assertOwnedFactAnalysis, type FactBoundAnalysis } from './boundAnalysis';
import type { SchoolAssessment, SchoolConclusion, SchoolPackRef } from './types';

type GroupKey = DeepReadonly<{ system: SchoolPackRef['system']; claimId: string; facts: readonly FactIdentity[] }>;
type Branch = DeepReadonly<{
  ref: SchoolPackRef;
  stance: SchoolConclusion['stance'];
  ruleSources: SchoolAssessment['ruleSources'];
  verification: SchoolAssessment['verification'];
}>;
export type FactProvenanceGroup = DeepReadonly<{
  groupId: string;
  key: GroupKey;
  facts: readonly NatalFact[];
  branches: readonly Branch[];
}>;
export type FactProvenance = DeepReadonly<{
  schemaVersion: 1;
  scope: 'exact-claim-fact-set';
  /** Complete owned analysis, not authentication by analysisId/snapshotId. */
  analysis: FactBoundAnalysis;
  independence: 'not-established';
  groups: readonly FactProvenanceGroup[];
  overlaps: readonly { groupIds: readonly [string, string]; sharedFacts: readonly NatalFact[] }[];
}>;
const owned = new WeakSet<object>();
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const semantic = ({ factId: _id, snapshotId: _snapshot, sourceRefs: _sources, ...identity }: NatalFact): FactIdentity => identity;

/** Only exact resolved semantic fact sets and exact propositions are duplicates.
 * No rule-name heuristics, transitive merging, natal-wide key or school maxing.
 */
export function describeFactProvenance(analysis: FactBoundAnalysis): FactProvenance {
  if (arguments.length !== 1) throw new TypeError('Provenance takes one owned analysis');
  assertOwnedFactAnalysis(analysis);
  const groups = new Map<string, { groupId: string; key: GroupKey; facts: readonly NatalFact[]; branches: Branch[] }>();
  const digests = new Map<string, string>();
  for (const assessment of analysis.assessments) {
    for (const conclusion of assessment.conclusions) {
      const facts = [...conclusion.facts].sort((a, b) => compare(interpretationBytes(semantic(a)), interpretationBytes(semantic(b))));
      const key: GroupKey = { system: assessment.ref.system, claimId: conclusion.claimId, facts: facts.map(semantic) };
      const bytes = interpretationBytes(key);
      const groupId = `ifpg1-${fnv1a64Hex(bytes)}`;
      if (digests.has(groupId) && digests.get(groupId) !== bytes) throw new TypeError('Conflicting provenance group digest');
      digests.set(groupId, bytes);
      const group = groups.get(bytes) ?? { groupId, key, facts, branches: [] };
      group.branches.push({ ref: assessment.ref, stance: conclusion.stance,
        ruleSources: assessment.ruleSources, verification: assessment.verification });
      groups.set(bytes, group);
    }
  }
  const ordered = [...groups.entries()].sort(([a], [b]) => compare(a, b)).map(([, group]) => ({ ...group,
    branches: group.branches.sort((a, b) => compare(interpretationBytes(a), interpretationBytes(b))),
  }));
  const overlaps: { groupIds: [string, string]; sharedFacts: readonly NatalFact[] }[] = [];
  for (let i = 0; i < ordered.length; i++) {
    for (let j = i + 1; j < ordered.length; j++) {
      const a = ordered[i]!, b = ordered[j]!;
      const other = new Set(b.key.facts.map(interpretationBytes));
      const sharedFacts = a.facts.filter(f => other.has(interpretationBytes(semantic(f))));
      if (sharedFacts.length) overlaps.push({ groupIds: [a.groupId, b.groupId], sharedFacts });
    }
  }
  // Preserve the original owned analysis capability rather than a transport clone.
  const data = interpretationData({ schemaVersion: 1 as const, scope: 'exact-claim-fact-set' as const,
    independence: 'not-established' as const, groups: ordered, overlaps });
  const result: FactProvenance = Object.freeze({ ...data, analysis });
  owned.add(result);
  return result;
}

/** Transport candidates are compared in full against a current owned descriptor. */
export function validateFactProvenance(candidate: unknown, expected: FactProvenance): FactProvenance {
  if (arguments.length !== 2 || !owned.has(expected)) throw new TypeError('Expected owned fact provenance');
  assertOwnedFactAnalysis(expected.analysis);
  if (interpretationBytes(candidate) !== interpretationBytes(expected)) throw new TypeError('Fact provenance full content mismatch');
  return expected;
}
