/** Internal Fact-only contract. Not Signal V2 or a public report schema. */
import type { CalculationIdentity, DeepReadonly } from '../core/calculationSpec';
import type { ChartSnapshot } from '../core/chartSnapshot';
import type { ZiweiMutagen } from '../calculators/ziwei/types';

export type FactSystem = 'bazi' | 'ziwei';
export type StarGroup = 'majorStars' | 'minorStars' | 'adjectiveStars';
export type PalaceLocation = { index: number; name: string; stem: string; branch: string };
export type CalculationVersion = {
  core: string;
  calculator: string;
  dependencies: CalculationIdentity['versions']['dependencies'];
  tzdb: string;
};
type SemanticFact =
  | { system: 'bazi'; kind: 'bazi.pillar'; payload: { pillar: 'year' | 'month' | 'day' | 'hour'; ganZhi: string; stem: string; branch: string } }
  | { system: 'ziwei'; kind: 'ziwei.star-placement'; payload: { palace: PalaceLocation; group: StarGroup; star: { name: string; type: string } } }
  | { system: 'ziwei'; kind: 'ziwei.natal-transformation'; payload: { palace: PalaceLocation; star: string; mutagen: ZiweiMutagen } };

/** Deliberately excludes name, snapshot/spec hashes and source array positions.
 * f1 is a non-cryptographic diagnostic, not authentication or anonymization.
 */
export type FactIdentity = DeepReadonly<SemanticFact & {
  schemaVersion: 1;
  adapterVersion: 1;
  chartVariant: 'primary';
  nativePeriod: { kind: 'natal' };
  calculationVersion: CalculationVersion;
}>;
export type FactSourceRef = DeepReadonly<{
  snapshotId: string;
  system: FactSystem;
  chartVariant: 'primary';
  /** Exact JSON pointer into the bound snapshot, not a legacy Signal component ID. */
  path: string;
}>;
export type NatalFact = DeepReadonly<FactIdentity & {
  factId: string;
  snapshotId: string;
  sourceRefs: readonly FactSourceRef[];
}>;
export type AdapterCoverage = DeepReadonly<{
  status: 'covered' | 'time_unknown';
  coveredKinds: readonly FactIdentity['kind'][];
  uncovered: readonly string[];
  omittedAlternativeCount: number;
}>;
export type NatalFactStore = DeepReadonly<{
  schemaVersion: 1;
  scope: 'primary-sync-natal-facts';
  adapterVersion: 1;
  /** Full binding is separate from fact identity. Contains private birth input. */
  binding: { snapshot: ChartSnapshot };
  facts: readonly NatalFact[];
  coverage: { bazi: AdapterCoverage; ziwei: AdapterCoverage; otherSystems: readonly string[] };
}>;
