/** Internal exact pairwise dependencies. Never evidence equivalence or independence. */
import type { DeepReadonly } from '../core/calculationSpec';
import { interpretationBytes, interpretationData } from '../core/interpretationSpec';
import { validateNatalRuleMetadata, type NatalRuleMetadata } from './natalRuleMetadata';
import type { NatalFact } from './types';

type SharedFact = { fact: NatalFact; leftRoles: string[]; rightRoles: string[] };
type Pair = { leftRecord: number; rightRecord: number; sharedFacts: SharedFact[] };
export type NatalFactLinks = DeepReadonly<{
  schemaVersion: 1;
  scope: 'primary-natal-native-pairwise-fact-links';
  metadata: NatalRuleMetadata;
  independence: 'not-established';
  pairs: Pair[];
  coverage: { partialRecords: number[]; unresolvedRecords: number[] };
}>;
const owned = new WeakSet<object>();

export function describeNatalFactLinks(metadata: NatalRuleMetadata): NatalFactLinks {
  if (arguments.length !== 1) throw new TypeError('Fact links require one owned metadata context');
  validateNatalRuleMetadata(metadata, metadata);
  // Full resolved fact bytes, including binding/source references, are the key.
  // Short fact IDs, targets, domains and rule names never determine equality.
  const dependencies = metadata.records.map(record => {
    const byFact = new Map<string, { fact: NatalFact; roles: string[] }>();
    for (const { fact, role } of record.source.dependencies) {
      const key = interpretationBytes(fact);
      const entry = byFact.get(key) ?? { fact, roles: [] };
      entry.roles.push(role);
      byFact.set(key, entry);
    }
    for (const entry of byFact.values()) entry.roles.sort();
    return byFact;
  });
  const pairs: Pair[] = [];
  for (let leftRecord = 0; leftRecord < dependencies.length; leftRecord++) {
    const left = dependencies[leftRecord]!;
    for (let rightRecord = leftRecord + 1; rightRecord < dependencies.length; rightRecord++) {
      const right = dependencies[rightRecord]!;
      const sharedFacts = [...left.keys()].filter(key => right.has(key)).sort().map(key => ({
        fact: left.get(key)!.fact, leftRoles: left.get(key)!.roles, rightRoles: right.get(key)!.roles,
      }));
      if (sharedFacts.length) pairs.push({ leftRecord, rightRecord, sharedFacts });
    }
  }
  const result = interpretationData({ schemaVersion: 1 as const,
    scope: 'primary-natal-native-pairwise-fact-links' as const,
    independence: 'not-established' as const, pairs,
    coverage: {
      partialRecords: metadata.records.flatMap((r, i) => r.source.status === 'partial' ? [i] : []),
      unresolvedRecords: metadata.records.flatMap((r, i) => r.source.status === 'unresolved' ? [i] : []),
    },
  });
  // Preserve the complete original owned capability, not a transport clone.
  const output: NatalFactLinks = Object.freeze({ ...result, metadata });
  validateNatalRuleMetadata(metadata, metadata);
  owned.add(output);
  return output;
}

export function validateNatalFactLinks(candidate: unknown, expected: NatalFactLinks): NatalFactLinks {
  if (arguments.length !== 2 || !owned.has(expected)) throw new TypeError('Expected owned natal fact links');
  validateNatalRuleMetadata(expected.metadata, expected.metadata);
  if (interpretationBytes(candidate) !== interpretationBytes(expected)) throw new TypeError('Natal fact links full content mismatch');
  return expected;
}
