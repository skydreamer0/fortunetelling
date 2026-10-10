/** Limited source metadata for existing native natal matchers, not EvidenceGroup V2. */
import { chartSnapshotRuntime, type ChartSnapshot } from '../core/chartSnapshot';
import type { DeepReadonly } from '../core/calculationSpec';
import { interpretationBytes, interpretationData } from '../core/interpretationSpec';
import { BAZI_RULES, BAZI_CATALOG } from '../rules/bazi/rules';
import { fromZiweiComponents } from '../rules/ziwei/chart';
import { ZIWEI_RULES } from '../rules/ziwei/rules';
import ziweiCatalog from '../rules/ziwei/catalog.json';
import { ZIWEI_MODIFIERS, ZIWEI_TRAITS } from '../rules/ziwei/traitSignals';
import { nativeHitMetadata, type NativeHitMetadata } from '../rules/natalHitMetadata';
import type { Domain, Trait, SignalWindow } from '../signals/types';
import { resolveFactReferences } from './natalFactStore';
import type { NatalFact, NatalFactStore } from './types';

type RuleRef = { system: 'bazi' | 'ziwei'; ruleId: string; ruleVersion: number };
type Dependency = { role: string; fact: NatalFact };
type Record = RuleRef & {
  domain: Domain; trait: Trait;
  /** Diagnostic only. Never parsed for semantic identity. */
  target: string;
  claim: { status: 'unresolved'; reason: 'no-registered-claim-mapping' };
  source: { status: 'unresolved'; reason: 'unmapped-rule'; dependencies: Dependency[] } | {
    status: 'resolved' | 'partial'; trigger: NativeHitMetadata; dependencies: Dependency[]; gaps: string[];
  };
};
export type NatalRuleMetadata = DeepReadonly<{
  schemaVersion: 1; adapterVersion: 1; scope: 'primary-natal-native-rule-metadata';
  binding: { snapshot: ChartSnapshot; factStore: NatalFactStore };
  catalogVersions: { bazi: number; ziwei: number; ziweiTraits: number; ziweiModifiers: number };
  independence: 'not-established'; records: Record[];
  coverage: { mappedRules: RuleRef[]; unmappedRules: RuleRef[]; unavailableSystems: string[]; uncovered: string[] };
}>;
const owned = new WeakSet<object>();
const mapped = new Set(['bazi|bazi.stem.control|1', 'ziwei|ziwei.star.tianma|1', 'ziwei|ziwei.natal.star_traits|1']);
const isMapped = (rule: RuleRef) => mapped.has([rule.system, rule.ruleId, rule.ruleVersion].join('|'));
const compare = (a: unknown, b: unknown) => { const x = interpretationBytes(a), y = interpretationBytes(b); return x < y ? -1 : x > y ? 1 : 0; };

export function describeNatalRuleMetadata(snapshot: ChartSnapshot, factStore: NatalFactStore): NatalRuleMetadata {
  if (arguments.length !== 2) throw new TypeError('Native metadata requires an owned snapshot and FactStore');
  chartSnapshotRuntime(snapshot);
  const facts = resolveFactReferences(factStore, snapshot, factStore.facts.map(f => f.factId));
  const records: Record[] = [];
  const unique = (matches: readonly NatalFact[]) => {
    if (matches.length !== 1) throw new TypeError('Native metadata source must resolve exactly once');
    return matches[0]!;
  };
  const placement = (palace: number, star: string) => unique(facts.filter(f => f.kind === 'ziwei.star-placement' &&
    f.payload.palace.index === palace && f.payload.star.name === star && f.payload.group !== 'adjectiveStars'));
  function source(rule: RuleRef, hit: object): Record['source'] {
    const trigger = nativeHitMetadata(hit);
    if (!isMapped(rule) || !trigger) return { status: 'unresolved', reason: 'unmapped-rule', dependencies: [] };
    if (trigger.kind === 'bazi.stemControl') {
      const pillar = (name: string) => unique(facts.filter(f => f.kind === 'bazi.pillar' && f.payload.pillar === name));
      return { status: 'resolved', trigger, dependencies: [
        { role: 'controller', fact: pillar(trigger.controller) }, { role: 'controlled', fact: pillar(trigger.controlled) },
      ], gaps: [] };
    }
    const dependencies: Dependency[] = [{ role: 'primary-placement', fact: placement(trigger.sourcePalace, trigger.star) }];
    for (const dependency of trigger.dependencies) {
      const fact = dependency.mutagen ? unique(facts.filter(f => f.kind === 'ziwei.natal-transformation' &&
        f.payload.palace.index === dependency.palace && f.payload.star === dependency.star && f.payload.mutagen === dependency.mutagen)) :
        placement(dependency.palace, dependency.star);
      dependencies.push({ role: dependency.role, fact });
    }
    return { status: 'partial', trigger, dependencies: dependencies.sort(compare), gaps: [
      'palace-relations-not-facts', 'absence-conditions-not-facts',
      ...(rule.ruleId === 'ziwei.natal.star_traits' ? ['brightness-not-fact'] : []),
    ].sort() };
  }
  function add(rule: RuleRef, hit: { target: string }, domain: Domain, trait: Trait) {
    records.push({ ...rule, domain, trait, target: hit.target,
      claim: { status: 'unresolved', reason: 'no-registered-claim-mapping' }, source: source(rule, hit) });
  }
  // Natal matchers ignore start/end; no invented native time interval is exported.
  const window: SignalWindow = { grain: 'natal', start: snapshot.identity.input.date, end: snapshot.identity.input.date };
  if (snapshot.natal.bazi.status === 'computed') {
    const chart = { pillars: { ...snapshot.natal.bazi.chart.pillars.pillars }, luckCycles: [] };
    for (const rule of BAZI_RULES.filter(r => r.scope === 'natal')) {
      for (const hit of rule.match(chart, window)) for (const template of rule.templatesFor(hit)) {
        add({ system: 'bazi', ruleId: rule.id, ruleVersion: rule.version }, hit, template.domain, template.trait);
      }
    }
  }
  if (snapshot.natal.ziwei.status === 'computed') {
    // Reuse the production pure converter. Preserve major/minor grouping and raw
    // brightness/score/mutagen. Adjective stars are intentionally excluded by it.
    const components = snapshot.natal.ziwei.chart.primary.palaces.map(p => ({
      id: `palace_${p.index}`, category: 'palaces', value: { ...p, earthlyBranch: p.branch },
    }));
    const chart = fromZiweiComponents(components);
    for (const rule of ZIWEI_RULES.filter(r => r.scope === 'natal')) {
      for (const hit of rule.match(chart, window)) add({ system: 'ziwei', ruleId: rule.id, ruleVersion: rule.version }, hit, hit.domain, hit.trait);
    }
  }
  const rules = [...BAZI_RULES, ...ZIWEI_RULES].filter(r => r.scope === 'natal').map(r =>
    ({ system: r.system as 'bazi' | 'ziwei', ruleId: r.id, ruleVersion: r.version }));
  const result: NatalRuleMetadata = interpretationData({ schemaVersion: 1, adapterVersion: 1,
    scope: 'primary-natal-native-rule-metadata', binding: { snapshot, factStore },
    catalogVersions: { bazi: BAZI_CATALOG.schemaVersion, ziwei: ziweiCatalog.version,
      ziweiTraits: ZIWEI_TRAITS.version, ziweiModifiers: ZIWEI_MODIFIERS.version },
    independence: 'not-established', records: records.sort(compare), coverage: {
      mappedRules: rules.filter(r => isMapped(r)).sort(compare),
      unmappedRules: rules.filter(r => !isMapped(r)).sort(compare),
      unavailableSystems: ['bazi', 'ziwei'].filter(s => snapshot.natal[s as 'bazi' | 'ziwei'].status === 'skipped'),
      uncovered: ['alternative-charts', 'flow-periods', 'other-systems', 'claim-equivalence', 'general-evidence-groups'],
    } });
  // Keep the original owned capabilities, never their transport clones.
  const output = Object.freeze({ ...result, binding: Object.freeze({ snapshot, factStore }) });
  resolveFactReferences(factStore, snapshot, facts.map(f => f.factId));
  owned.add(output);
  return output;
}
export function validateNatalRuleMetadata(candidate: unknown, expected: NatalRuleMetadata): NatalRuleMetadata {
  if (arguments.length !== 2 || !owned.has(expected)) throw new TypeError('Expected owned natal rule metadata');
  resolveFactReferences(expected.binding.factStore, expected.binding.snapshot, expected.binding.factStore.facts.map(f => f.factId));
  if (interpretationBytes(candidate) !== interpretationBytes(expected)) throw new TypeError('Native metadata full content mismatch');
  return expected;
}
