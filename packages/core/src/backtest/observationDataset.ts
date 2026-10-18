/** Explicit grouped research-data audit, not a predictor or legacy score adapter. */
import { readLifeObservationV2, type LifeObservationV2 } from './observationsV2';

export const OBSERVATION_SPLITS = ['train', 'tune', 'test'] as const;
export type ObservationSplit = typeof OBSERVATION_SPLITS[number];
export interface ObservationCounts {
  persons: number;
  /** Distinct caller-declared (person, cluster) units, not proven independence. */
  clusterUnits: number;
  records: number;
  nominalPersonPeriods: number;
  domainAnnotations: number;
  clusterDomainUnits: number;
  confirmedEventClusters: number;
  confirmedAbsenceClusters: number;
  unknownOrUnreviewedRecords: number;
}
const key = (...parts: string[]) => JSON.stringify(parts);
export function countObservationUnits(input: readonly unknown[]): ObservationCounts {
  const rows = input.map(readLifeObservationV2);
  const ids = new Set<string>(), persons = new Set<string>(), clusters = new Set<string>(), periods = new Set<string>(), domainUnits = new Set<string>();
  const events = new Set<string>(), absences = new Set<string>();
  const confirmedTargets = new Map<string, string>();
  let domainAnnotations = 0, unknownOrUnreviewedRecords = 0;
  for (const row of rows) {
    const id = key(row.personId, row.id), cluster = key(row.personId, row.clusterId);
    if (ids.has(id)) throw new TypeError('Duplicate observation identity');
    ids.add(id); persons.add(row.personId); clusters.add(cluster);
    periods.add(key(row.personId, row.date.precision, row.date.nominal));
    domainAnnotations += row.domains.length;
    for (const domain of row.domains) domainUnits.add(key(row.personId, row.clusterId, domain));
    if (row.labelStatus !== 'confirmed' || row.observationStatus === 'unknown') { unknownOrUnreviewedRecords++; continue; }
    const target = key(row.personId, row.clusterId, row.eventType);
    const prior = confirmedTargets.get(target);
    if (prior && prior !== row.observationStatus) throw new TypeError('Contradictory confirmed labels in one target cluster');
    confirmedTargets.set(target, row.observationStatus);
    if (row.observationStatus === 'event_recorded') events.add(cluster);
    else if (row.observationStatus === 'confirmed_absent') absences.add(cluster);
  }
  return { persons: persons.size, clusterUnits: clusters.size, records: rows.length, nominalPersonPeriods: periods.size,
    domainAnnotations, clusterDomainUnits: domainUnits.size, confirmedEventClusters: events.size,
    confirmedAbsenceClusters: absences.size, unknownOrUnreviewedRecords };
}
export interface ObservationDatasetAudit {
  schemaVersion: 1;
  method: 'person-disjoint-observation-audit-v1';
  /** No accuracy, p-value, automatic weights or claim that groups are independent. */
  interpretation: 'data-partition-audit-only';
  bySplit: Record<ObservationSplit, ObservationCounts>;
  total: ObservationCounts;
}
export function auditObservationDataset(input: unknown): ObservationDatasetAudit {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Expected explicit train/tune/test partitions');
  const partitions = input as Record<string, unknown>;
  if (Object.keys(partitions).sort().join(',') !== [...OBSERVATION_SPLITS].sort().join(',')) throw new TypeError('Exactly train/tune/test partitions required');
  const owner = new Map<string, ObservationSplit>(), clusterOwner = new Map<string, ObservationSplit>();
  const all: LifeObservationV2[] = [];
  const bySplit = {} as Record<ObservationSplit, ObservationCounts>;
  for (const split of OBSERVATION_SPLITS) {
    const raw = partitions[split];
    if (!Array.isArray(raw)) throw new TypeError('Each partition must be an observation array');
    const rows = raw.map(readLifeObservationV2);
    for (const row of rows) {
      const cluster = key(row.personId, row.clusterId);
      if (clusterOwner.has(cluster) && clusterOwner.get(cluster) !== split) throw new TypeError('Cluster leakage across splits');
      if (owner.has(row.personId) && owner.get(row.personId) !== split) throw new TypeError('Person leakage across splits');
      clusterOwner.set(cluster, split); owner.set(row.personId, split);
    }
    bySplit[split] = countObservationUnits(rows);
    all.push(...rows);
  }
  return { schemaVersion: 1, method: 'person-disjoint-observation-audit-v1', interpretation: 'data-partition-audit-only', bySplit, total: countObservationUnits(all) };
}
