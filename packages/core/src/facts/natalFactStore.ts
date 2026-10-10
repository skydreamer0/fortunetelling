/** Fact-only, code-owned adapters over an existing owned snapshot. No recalculation. */
import { chartSnapshotRuntime, validateChartSnapshot, type ChartSnapshot } from '../core/chartSnapshot';
import { interpretationData, interpretationBytes, exactInterpretationKeys } from '../core/interpretationSpec';
import { fnv1a64Hex } from '../signals/signalId';
import type { AdapterCoverage, CalculationVersion, FactIdentity, FactSourceRef, FactSystem, NatalFact, NatalFactStore, PalaceLocation, StarGroup } from './types';

const owned = new WeakMap<NatalFactStore, { snapshot: ChartSnapshot; byId: ReadonlyMap<string, NatalFact>; sources: ReadonlyMap<string, unknown> }>();
const cmp = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const sourceKey = (source: FactSourceRef) => interpretationBytes(source);
const groups: readonly StarGroup[] = ['majorStars', 'minorStars', 'adjectiveStars'];

/** Identity projection only, not a validator or trust grant for caller facts. */
export function factIdentity(fact: NatalFact): FactIdentity {
  const { schemaVersion, adapterVersion, system, kind, chartVariant, nativePeriod, calculationVersion, payload } = interpretationData(fact);
  return interpretationData({ schemaVersion, adapterVersion, system, kind, chartVariant, nativePeriod, calculationVersion, payload }) as FactIdentity;
}

function context(store: NatalFactStore, snapshot: ChartSnapshot) {
  const runtime = owned.get(store);
  if (!runtime) throw new TypeError('Expected owned NatalFactStore');
  chartSnapshotRuntime(snapshot);
  // IDs are diagnostics only. Even equal sn1/cs1 collisions cannot replace bytes.
  validateChartSnapshot(snapshot, runtime.snapshot);
  return runtime;
}

function coverage(status: AdapterCoverage['status'], coveredKinds: FactIdentity['kind'][], uncovered: string[], omittedAlternativeCount: number): AdapterCoverage {
  return interpretationData({ status, coveredKinds: status === 'covered' ? coveredKinds.sort() : [], uncovered: uncovered.sort(), omittedAlternativeCount });
}

/** Both adapters cover primary natal data only. Unsupported data is declared,
 * never guessed as a period, alternative interpretation or independent evidence.
 */
export function createNatalFactStore(snapshot: ChartSnapshot): NatalFactStore {
  if (arguments.length !== 1) throw new TypeError('Natal fact adapters are code-owned');
  chartSnapshotRuntime(snapshot);
  const byId = new Map<string, NatalFact>(), sources = new Map<string, unknown>();
  function version(system: FactSystem): CalculationVersion {
    const versions = snapshot.identity.versions;
    return { core: versions.core, calculator: versions.calculators[system], dependencies: versions.dependencies, tzdb: versions.data.tzdb };
  }
  function source(system: FactSystem, path: string): FactSourceRef {
    // Paths are generated below, never supplied by callers. Traverse own DTO
    // properties only; keep the resolved immutable source for later validation.
    let value: unknown = snapshot;
    for (const key of path.slice(1).split('/')) {
      if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) throw new TypeError('Unresolvable fact source');
      value = (value as Record<string, unknown>)[key];
    }
    const ref = interpretationData({ snapshotId: snapshot.snapshotId, system, chartVariant: 'primary' as const, path });
    sources.set(sourceKey(ref), value);
    return ref;
  }
  function add(semantic: Pick<FactIdentity, 'system' | 'kind' | 'payload'>, refs: FactSourceRef[]) {
    const identity = interpretationData({ schemaVersion: 1, adapterVersion: 1, ...semantic,
      chartVariant: 'primary', nativePeriod: { kind: 'natal' }, calculationVersion: version(semantic.system) }) as FactIdentity;
    const factId = `f1-${fnv1a64Hex(interpretationBytes(identity))}`;
    if (byId.has(factId)) {
      const old = byId.get(factId)!;
      if (interpretationBytes(factIdentity(old)) !== interpretationBytes(identity)) throw new TypeError('Fact identity digest collision');
      throw new TypeError('Duplicate semantic fact');
    }
    const sorted = refs.sort((a,b) => cmp(sourceKey(a), sourceKey(b)));
    if (new Set(sorted.map(sourceKey)).size !== sorted.length) throw new TypeError('Duplicate fact source');
    byId.set(factId, interpretationData({ ...identity, factId, snapshotId: snapshot.snapshotId, sourceRefs: sorted }) as NatalFact);
  }
  const bazi = snapshot.natal.bazi;
  if (bazi.status === 'computed') {
    for (const pillar of ['year', 'month', 'day', 'hour'] as const) {
      const ganZhi = bazi.chart.pillars.pillars[pillar];
      add({ system: 'bazi', kind: 'bazi.pillar', payload: { pillar, ganZhi, stem: ganZhi[0]!, branch: ganZhi[1]! } },
        [source('bazi', `/natal/bazi/chart/pillars/pillars/${pillar}`)]);
    }
  }
  const ziwei = snapshot.natal.ziwei;
  if (ziwei.status === 'computed') {
    const chart = ziwei.chart.primary, root = '/natal/ziwei/chart/primary';
    const location = (p: typeof chart.palaces[number]): PalaceLocation => ({ index: p.index, name: p.name, stem: p.stem, branch: p.branch });
    chart.palaces.forEach((palace, p) => {
      for (const group of groups) palace[group].forEach((star, s) => {
        add({ system: 'ziwei', kind: 'ziwei.star-placement', payload: { palace: location(palace), group, star: { name: star.name, type: star.type } } },
          [source('ziwei', `${root}/palaces/${p}`), source('ziwei', `${root}/palaces/${p}/${group}/${s}`)]);
      });
    });
    chart.natalTransformations.forEach((change, t) => {
      const palacePositions = chart.palaces.flatMap((p,i) => p.index === change.palaceIndex && p.name === change.palace ? [i] : []);
      if (palacePositions.length !== 1) throw new TypeError('Unresolved natal transformation palace');
      const p = palacePositions[0]!, palace = chart.palaces[p]!;
      const matches = groups.flatMap(group => palace[group].flatMap((s,i) =>
        s.name === change.star && s.mutagen === change.mutagen ? [`${root}/palaces/${p}/${group}/${i}`] : []));
      if (matches.length !== 1) throw new TypeError('Unresolved natal transformation star');
      add({ system: 'ziwei', kind: 'ziwei.natal-transformation', payload: { palace: location(palace), star: change.star, mutagen: change.mutagen } },
        [source('ziwei', `${root}/natalTransformations/${t}`), source('ziwei', `${root}/palaces/${p}`), source('ziwei', matches[0]!)]);
    });
  }
  const store: NatalFactStore = Object.freeze({ schemaVersion: 1, scope: 'primary-sync-natal-facts', adapterVersion: 1,
    binding: Object.freeze({ snapshot }), facts: Object.freeze([...byId.values()].sort((a,b) => cmp(a.factId, b.factId))),
    coverage: interpretationData({
      bazi: coverage(bazi.status === 'computed' ? 'covered' : 'time_unknown', ['bazi.pillar'],
        ['alternative-charts', 'luck-cycles-and-flow-periods', 'relations-hidden-stems-and-rule-interpretations'],
        bazi.status === 'computed' ? bazi.chart.pillars.alternatives.length : 0),
      ziwei: coverage(ziwei.status === 'computed' ? 'covered' : 'time_unknown', ['ziwei.star-placement', 'ziwei.natal-transformation'],
        ['alternative-charts', 'decades-and-flow-periods', 'palace-relations-brightness-and-rule-interpretations'],
        ziwei.status === 'computed' ? ziwei.chart.alternatives.length : 0),
      otherSystems: ['humanDesign', 'jyotish', 'mingGua', 'numerology', 'tzolkin'],
    }),
  });
  chartSnapshotRuntime(snapshot);
  owned.set(store, { snapshot, byId, sources });
  return store;
}

/** Normalize only declared set order. Nothing may be dropped or overwritten. */
function canonicalStore(candidate: unknown): unknown {
  const copy = interpretationData(candidate);
  exactInterpretationKeys(copy, ['schemaVersion', 'scope', 'adapterVersion', 'binding', 'facts', 'coverage']);
  if (!Array.isArray(copy.facts)) throw new TypeError('Expected fact list');
  const seen = new Set<string>();
  const facts = copy.facts.map((fact: NatalFact) => {
    if (!fact || typeof fact.factId !== 'string' || seen.has(fact.factId) || !Array.isArray(fact.sourceRefs)) throw new TypeError('Invalid or duplicate fact ID');
    seen.add(fact.factId);
    const refs = [...fact.sourceRefs].sort((a,b) => cmp(sourceKey(a), sourceKey(b)));
    if (new Set(refs.map(sourceKey)).size !== refs.length) throw new TypeError('Duplicate fact source');
    return { ...fact, sourceRefs: refs };
  }).sort((a,b) => cmp(a.factId, b.factId));
  return { ...copy, facts };
}

/** Serialized candidates are checked against an owned current store in full,
 * including snapshot, coverage, version, fact payload and exact source content.
 * This is not a persisted/historical replay API or a hash-only cache hit.
 */
export function validateNatalFactStore(candidate: unknown, expected: NatalFactStore): NatalFactStore {
  if (arguments.length !== 2) throw new TypeError('Expected candidate and owned store');
  const runtime = owned.get(expected);
  if (!runtime) throw new TypeError("Expected owned NatalFactStore");
  context(expected, runtime.snapshot);
  if (interpretationBytes(canonicalStore(candidate)) !== interpretationBytes(expected)) throw new TypeError('NatalFactStore full content mismatch');
  return expected;
}

/** A reference set always travels with its full owned snapshot context.
 * Never resolve a naked f1 or sn1 label as if it authenticated a chart.
 */
export function resolveFactReferences(store: NatalFactStore, snapshot: ChartSnapshot, factIds: readonly string[]): readonly NatalFact[] {
  if (arguments.length !== 3) throw new TypeError('Fact references require store, snapshot and IDs');
  const runtime = context(store, snapshot), ids = interpretationData(factIds);
  if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) throw new TypeError('Invalid or duplicate fact references');
  return Object.freeze([...ids].sort().map(id => {
    const fact = runtime.byId.get(id);
    if (!fact) throw new TypeError('Nonexistent fact reference');
    return fact;
  }));
}

export function resolveFactSource(store: NatalFactStore, snapshot: ChartSnapshot, reference: FactSourceRef): unknown {
  if (arguments.length !== 3) throw new TypeError('Source references require store, snapshot and source');
  const runtime = context(store, snapshot), key = interpretationBytes(reference);
  if (!runtime.sources.has(key)) throw new TypeError('Nonexistent or cross-snapshot fact source');
  return runtime.sources.get(key);
}
