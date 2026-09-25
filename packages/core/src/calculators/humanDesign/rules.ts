/**
 * @fileoverview Human Design rule set (ARCHITECTURE-V2 §5, D-028). Minimal
 * natal signals: type / authority → trait weights, defined channels → domains
 * via the center table. All weights live in `catalog.json`; no 吉/凶 text.
 *
 * @module calculators/humanDesign/rules
 */

import { createSignal } from '../../signals/createSignal';
import type { Domain, Grain, Rule, Signal, SignalTemplate, SignalWindow, Trait } from '../../signals/types';
import type { Center } from './bodygraph';
import catalogData from './catalog.json';
import type { HumanDesignChart } from './calculator';

export type HdRuleStatus = 'active' | 'pending';

export interface HdCatalogEntry {
  id: string;
  version: number;
  scope: Grain;
  status: HdRuleStatus;
  description: string;
  source: string;
  params: Record<string, any>;
}

export interface HdCatalog {
  version: number;
  system: 'humanDesign';
  rules: HdCatalogEntry[];
}

export const HUMAN_DESIGN_CATALOG = catalogData as unknown as HdCatalog;

function entry(id: string): HdCatalogEntry {
  const e = HUMAN_DESIGN_CATALOG.rules.find((r) => r.id === id);
  if (!e) throw new Error(`humanDesign catalog: missing rule ${id}`);
  if (e.status !== 'active') throw new Error(`humanDesign catalog: rule ${id} is ${e.status}`);
  return e;
}

export interface HdHit {
  target: string;
  componentIds: string[];
  text: string;
  domain: Domain;
  trait: Trait;
  intensity: number;
  valence: number;
}

export interface HdRule extends Rule<HumanDesignChart> {
  match(chart: HumanDesignChart, window: SignalWindow): HdHit[];
}

function templateRule(id: string, key: 'type' | 'authority', componentId: string): HdRule {
  const e = entry(id);
  const table = e.params.traits as Record<string, SignalTemplate[]>;
  return {
    id,
    version: e.version,
    system: 'humanDesign',
    scope: e.scope,
    emits: Object.values(table).flat(),
    match(chart) {
      const v = chart[key];
      if (!v) return [];
      return (table[v] ?? []).map((t) => ({
        target: `${key}:${v}`,
        componentIds: [componentId],
        text: `${key} = ${v} → ${t.domain}.${t.trait}`,
        domain: t.domain,
        trait: t.trait,
        intensity: t.intensity,
        valence: t.valence,
      }));
    },
  };
}

function channelCentersRule(): HdRule {
  const e = entry('humanDesign.natal.channel_centers');
  const centers = e.params.centers as Record<Center, { domain: Domain; trait: Trait }>;
  const intensity = e.params.intensity as number;
  return {
    id: e.id,
    version: e.version,
    system: 'humanDesign',
    scope: e.scope,
    emits: Object.values(centers).map((c) => ({ ...c, intensity, valence: 0 })),
    match(chart) {
      return chart.channels.flatMap((ch) =>
        ch.centers.map((c) => ({
          target: `channel:${ch.id}:${c}`,
          componentIds: [`hd_channel_${ch.id}`, `hd_center_${c}`],
          text: `channel ${ch.id} defines ${c} → ${centers[c].domain}.${centers[c].trait}`,
          domain: centers[c].domain,
          trait: centers[c].trait,
          intensity,
          valence: 0,
        })),
      );
    },
  };
}

export const HUMAN_DESIGN_RULES: readonly HdRule[] = Object.freeze([
  templateRule('humanDesign.natal.type', 'type', 'hd_type'),
  templateRule('humanDesign.natal.authority', 'authority', 'hd_authority'),
  channelCentersRule(),
]);

/** Run the natal rules; deterministic, sorted by signal id; throws on a duplicate id. */
export function evaluateHumanDesignRules(
  chart: HumanDesignChart,
  window: SignalWindow,
  opts: { scopes?: readonly Grain[]; rules?: readonly HdRule[] } = {},
): Signal[] {
  const scopes = new Set<Grain>(opts.scopes ?? [window.grain]);
  const byId = new Map<string, Signal>();
  for (const rule of (opts.rules ?? HUMAN_DESIGN_RULES).filter((r) => scopes.has(r.scope))) {
    for (const hit of rule.match(chart, window)) {
      const s = createSignal({
        system: 'humanDesign',
        ruleId: rule.id,
        ruleVersion: rule.version,
        domain: hit.domain,
        trait: hit.trait,
        intensity: hit.intensity,
        valence: hit.valence,
        window,
        target: hit.target,
        evidence: { componentIds: hit.componentIds, text: hit.text, modifiers: [] },
      });
      if (byId.has(s.id)) throw new Error(`evaluateHumanDesignRules: duplicate signal id ${s.id}`);
      byId.set(s.id, s);
    }
  }
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
