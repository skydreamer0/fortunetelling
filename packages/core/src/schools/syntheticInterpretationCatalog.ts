/** Fixed synthetic fixtures only. Never a production SchoolPack or validation evidence.
 * Semantic changes require a new catalog version/identity, never callback injection.
 */
import type { SchoolContext, SchoolConclusion, SchoolPack } from './types';
import { interpretationData } from '../core/interpretationSpec';

const fixture = (packId: string, changes: Partial<SchoolPack> = {}): SchoolPack => ({
  schemaVersion: 1, kind: 'contract', system: 'bazi', packId, packVersion: '1',
  claims: [{ claimId: 'synthetic-claim', description: 'Synthetic proposition only' }],
  requiredConditions: ['ready'], ruleSources: [{ sourceId: 'fixture', citation: 'Synthetic test, not a predictive rule' }],
  verification: { status: 'unknown', reason: 'Synthetic contract fixture only' }, ...changes,
});
export const SYNTHETIC_PACKS: readonly SchoolPack[] = interpretationData([
  fixture('a'), fixture('a', { packVersion: '0' }), fixture('a', { packVersion: '2' }),
  fixture('b'), fixture('c'), fixture('d'),
  fixture('different', { claims: [{ claimId: 'other', description: 'Another synthetic proposition' }] }),
  fixture('missing', { requiredConditions: ['absent'] }),
]);
/** Retained versions 1/2 deliberately disagree. Version 0 has metadata but no code. */
export function syntheticConclusion(pack: SchoolPack, context: SchoolContext): readonly SchoolConclusion[] {
  if (pack.packVersion === '0') throw new Error('No retained synthetic version 0');
  return [{ claimId: pack.claims[0]!.claimId,
    stance: pack.packId === 'b' || pack.packVersion === '2' ? 'oppose' : 'support',
    factIds: context.factIds.length ? [context.factIds[0]!] : [],
  }];
}
