/**
 * @fileoverview Jyotish rules (V2-03, ARCHITECTURE-V2 §5): catalog.json data +
 * small pure matchers, plus `evaluateJyotishRules` (chart × window → Signal[]).
 *
 * Every domain / trait / intensity / valence / factor comes from catalog.json
 * (D-028); code only decides which houses a dasha lord or transit activates.
 * A catalog rule with several `scopes` expands to one `Rule` per grain.
 *
 * Transit rules sample the sky at the window midpoint (00:00 UT of the middle
 * day) — deterministic, but the ephemeris must be initialised. A slow planet
 * that changes sign inside a long window is reported for the midpoint sign only.
 *
 * @module calculators/jyotish/rules
 */

import { createSignal } from '../../signals/createSignal';
import {
  DOMAINS,
  TRAITS,
  type Domain,
  type Grain,
  type Modifier,
  type Rule,
  type RuleHit,
  type Signal,
  type SignalTemplate,
  type SignalWindow,
  type Trait,
} from '../../signals/types';
import type { JyotishChart } from './calculator';
import catalogJson from './catalog.json';
import {
  dashasOverlapping,
  housesRuledBy,
  isoToJd,
  transitSnapshot,
  type DashaPeriod,
  type Dignity,
  type Graha,
  type SadeSatiPhase,
} from './jyotish';

// ─── Catalog typing ──────────────────────────────────────────────────────────

export interface JyotishCatalogRule {
  id: string;
  version: number;
  scopes: Grain[];
  description: string;
  source: string;
  params: Record<string, any>;
}

export interface JyotishCatalog {
  schemaVersion: number;
  system: 'jyotish';
  conventions: Record<string, string>;
  labels: { domains: Record<Domain, string>; grahas: Record<Graha, string> };
  houseSignals: Record<string, SignalTemplate[]>;
  rules: JyotishCatalogRule[];
}

export const JYOTISH_CATALOG = catalogJson as unknown as JyotishCatalog;

function catalogRule(id: string): JyotishCatalogRule {
  const r = JYOTISH_CATALOG.rules.find((x) => x.id === id);
  if (!r) throw new Error(`jyotish catalog: missing rule ${id}`);
  return r;
}

export function houseSignals(house: number): SignalTemplate[] {
  return JYOTISH_CATALOG.houseSignals[String(house)] ?? [];
}

const dl = (d: Domain) => JYOTISH_CATALOG.labels.domains[d];
const gl = (g: Graha) => JYOTISH_CATALOG.labels.grahas[g];

// ─── Rule shape ──────────────────────────────────────────────────────────────

/** A hit that carries its own (already domain-resolved) templates. */
export interface JyotishHit extends RuleHit {
  templates: SignalTemplate[];
}

export interface JyotishRule extends Rule<JyotishChart> {
  match(chart: JyotishChart, window: SignalWindow): JyotishHit[];
  /** Where emitted templates come from when `emits` is not static. */
  emitsFrom?: string;
}

/** Window → [startJd, endJd) covering whole UTC days. */
export function windowJd(w: SignalWindow): { startJd: number; endJd: number; midJd: number } {
  const startJd = isoToJd(`${w.start.slice(0, 10)}T00:00:00Z`);
  const endJd = isoToJd(`${w.end.slice(0, 10)}T00:00:00Z`) + 1;
  const midJd = Math.floor((startJd + endJd) / 2 - 0.5) + 0.5; // 00:00 UT of the middle day
  return { startJd, endJd, midJd };
}

// ─── Dasha rules ─────────────────────────────────────────────────────────────

interface DashaParams {
  periodFactor: number;
  relationFactors: { rules: number; occupies: number };
  dignityFactors: Record<Dignity, number>;
}

function dashaLordHits(
  chart: JyotishChart,
  period: DashaPeriod,
  kind: 'maha' | 'antar',
  targetPrefix: string,
  componentId: string,
  p: DashaParams,
): JyotishHit[] {
  const lagnaSign = chart.lagna!.sign;
  const lordPos = chart.planets.find((g) => g.graha === period.lord)!;
  const label = kind === 'maha' ? '大運' : '小運';
  const span = `${period.start.slice(0, 10)}～${period.end.slice(0, 10)}`;
  const dignityFactor = p.dignityFactors[lordPos.dignity] ?? 1;
  const relations: { rel: 'rules' | 'occupies'; house: number }[] = [
    ...housesRuledBy(period.lord, lagnaSign).map((house) => ({ rel: 'rules' as const, house })),
    { rel: 'occupies', house: lordPos.house! },
  ];
  const hits: JyotishHit[] = [];
  for (const { rel, house } of relations) {
    const templates = houseSignals(house);
    if (templates.length === 0) continue;
    const modifiers: Modifier[] = [
      { id: `period.${kind}`, factor: p.periodFactor, reason: `${label}期間因子 ${p.periodFactor}` },
      {
        id: `relation.${rel}`,
        factor: p.relationFactors[rel],
        reason: `${gl(period.lord)}${rel === 'rules' ? '主管' : '落在'}第 ${house} 宮（因子 ${p.relationFactors[rel]}）`,
      },
      {
        id: `dignity.${lordPos.dignity}`,
        factor: dignityFactor,
        reason: `${gl(period.lord)}本命尊貴狀態 ${lordPos.dignity}（因子 ${dignityFactor}）`,
      },
    ];
    hits.push({
      target: `${targetPrefix}:${rel}:H${house}`,
      componentIds: [componentId, `graha_${period.lord}`, `house_${house}`],
      text:
        `${gl(period.lord)}${label}（${span}）：${gl(period.lord)}${rel === 'rules' ? '主管' : '落在'}第 ${house} 宮，` +
        `啟動${templates.map((t) => `${dl(t.domain)}領域的「${t.trait}」特徵`).join('、')}`,
      modifiers,
      templates,
    });
  }
  return hits;
}

function mahaRule(scope: Grain): JyotishRule {
  const e = catalogRule('jyotish.dasha.maha');
  return {
    id: e.id,
    version: e.version,
    system: 'jyotish',
    scope,
    emits: [],
    emitsFrom: 'catalog houseSignals of the houses the mahadasha lord rules / occupies',
    match(chart, window) {
      if (!chart.timeKnown || !chart.dasha) return [];
      const { startJd, endJd } = windowJd(window);
      return dashasOverlapping(chart.dasha, startJd, endJd).maha.flatMap((m) =>
        dashaLordHits(chart, m, 'maha', `maha:${m.index}:${m.lord}`, `mahadasha_${m.index % 9}`, e.params as DashaParams),
      );
    },
  };
}

function antarRule(scope: Grain): JyotishRule {
  const e = catalogRule('jyotish.dasha.antar');
  return {
    id: e.id,
    version: e.version,
    system: 'jyotish',
    scope,
    emits: [],
    emitsFrom: 'catalog houseSignals of the houses the antardasha lord rules / occupies',
    match(chart, window) {
      if (!chart.timeKnown || !chart.dasha) return [];
      const { startJd, endJd } = windowJd(window);
      const { maha } = dashasOverlapping(chart.dasha, startJd, endJd);
      return maha.flatMap((m) =>
        m.antardashas
          .filter((a) => a.startJd < endJd && a.endJd > startJd)
          .flatMap((a) =>
            dashaLordHits(
              chart,
              a,
              'antar',
              `antar:${m.index}:${m.lord}/${a.lord}`,
              `mahadasha_${m.index % 9}`,
              e.params as DashaParams,
            ),
          ),
      );
    },
  };
}

// ─── Transit rules ───────────────────────────────────────────────────────────

function natalRefs(chart: JyotishChart): { moonSign: number; lagnaSign: number } | null {
  if (!chart.timeKnown || !chart.lagna) return null;
  const moon = chart.planets.find((p) => p.graha === 'moon');
  return moon ? { moonSign: moon.sign, lagnaSign: chart.lagna.sign } : null;
}

function snapshotFor(chart: JyotishChart, window: SignalWindow) {
  const refs = natalRefs(chart);
  if (!refs) return null;
  const { midJd } = windowJd(window);
  return transitSnapshot(midJd, refs, { ayanamsa: chart.settings.ayanamsa, node: chart.settings.node });
}

interface SlowTransitParams {
  houses: number[];
  referenceFactors: { lagna: number; moon: number };
  planets: Record<'jupiter' | 'saturn', { trait: Trait; intensity: number; valence: number }>;
}

function slowTransitRule(scope: Grain): JyotishRule {
  const e = catalogRule('jyotish.transit.slow');
  const p = e.params as SlowTransitParams;
  return {
    id: e.id,
    version: e.version,
    system: 'jyotish',
    scope,
    emits: [],
    emitsFrom: 'domains from catalog houseSignals of the transited house; trait from params.planets',
    match(chart, window) {
      const snap = snapshotFor(chart, window);
      if (!snap) return [];
      const hits: JyotishHit[] = [];
      for (const planet of ['jupiter', 'saturn'] as const) {
        const pos = snap.planets.find((x) => x.graha === planet)!;
        const tpl = p.planets[planet];
        for (const ref of ['lagna', 'moon'] as const) {
          const house = ref === 'lagna' ? pos.houseFromLagna! : pos.houseFromMoon;
          if (!p.houses.includes(house)) continue;
          const domains: Domain[] = [];
          for (const t of houseSignals(house)) if (!domains.includes(t.domain)) domains.push(t.domain);
          if (domains.length === 0) continue;
          const factor = p.referenceFactors[ref];
          const refLabel = ref === 'lagna' ? '上升（Lagna）' : '本命月亮';
          hits.push({
            target: `transit:${planet}:${ref}:H${house}`,
            componentIds: ['transits', ref === 'lagna' ? 'lagna' : 'graha_moon', `house_${house}`],
            text:
              `${snap.date.slice(0, 10)} ${gl(planet)}過境 ${pos.signName}，自${refLabel}起算第 ${house} 宮，` +
              `${domains.map(dl).join('、')}領域的「${tpl.trait}」特徵`,
            modifiers: [{ id: `reference.${ref}`, factor, reason: `自${refLabel}起算（因子 ${factor}）` }],
            templates: domains.map((domain) => ({ domain, trait: tpl.trait, intensity: tpl.intensity, valence: tpl.valence })),
          });
        }
      }
      return hits;
    },
  };
}

interface SadeSatiParams {
  phaseFactors: Record<SadeSatiPhase, number>;
  templates: SignalTemplate[];
}

function sadeSatiRule(scope: Grain): JyotishRule {
  const e = catalogRule('jyotish.transit.sade_sati');
  const p = e.params as SadeSatiParams;
  return {
    id: e.id,
    version: e.version,
    system: 'jyotish',
    scope,
    emits: p.templates,
    match(chart, window) {
      const snap = snapshotFor(chart, window);
      if (!snap || !snap.sadeSati.active) return [];
      const phase = snap.sadeSati.phase!;
      const saturn = snap.planets.find((x) => x.graha === 'saturn')!;
      return [
        {
          target: `sade_sati:${phase}`,
          componentIds: ['transits', 'graha_moon'],
          text: `${snap.date.slice(0, 10)} 土星過境 ${saturn.signName}，位於本命月亮起算第 ${saturn.houseFromMoon} 宮（Sade Sati ${phase} 階段）`,
          modifiers: [{ id: `phase.${phase}`, factor: p.phaseFactors[phase], reason: `Sade Sati ${phase} 階段因子 ${p.phaseFactors[phase]}` }],
          templates: p.templates,
        },
      ];
    },
  };
}

// ─── Registry & evaluation ───────────────────────────────────────────────────

const BUILDERS: Record<string, (scope: Grain) => JyotishRule> = {
  'jyotish.dasha.maha': mahaRule,
  'jyotish.dasha.antar': antarRule,
  'jyotish.transit.slow': slowTransitRule,
  'jyotish.transit.sade_sati': sadeSatiRule,
};

/** All jyotish rules, one per (catalog rule × scope), in catalog order. */
export const JYOTISH_RULES: readonly JyotishRule[] = Object.freeze(
  JYOTISH_CATALOG.rules.flatMap((r) => {
    const build = BUILDERS[r.id];
    if (!build) throw new Error(`jyotish catalog: no matcher for ${r.id}`);
    return r.scopes.map(build);
  }),
);

export interface EvaluateJyotishOptions {
  ruleIds?: readonly string[];
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const round4 = (x: number) => Math.round(x * 10000) / 10000;

/**
 * Evaluate all rules whose scope equals `window.grain`. Deterministic: output is
 * sorted by ruleId → target → DOMAINS order → TRAITS order; duplicate ids throw.
 */
export function evaluateJyotishRules(chart: JyotishChart, window: SignalWindow, opts: EvaluateJyotishOptions = {}): Signal[] {
  const filter = opts.ruleIds ? new Set(opts.ruleIds) : null;
  const signals: Signal[] = [];
  for (const rule of JYOTISH_RULES) {
    if (rule.scope !== window.grain) continue;
    if (filter && !filter.has(rule.id)) continue;
    for (const hit of rule.match(chart, window)) {
      const modifiers = hit.modifiers ?? [];
      const factor = modifiers.reduce((acc, m) => acc * m.factor, 1);
      for (const t of hit.templates) {
        signals.push(
          createSignal({
            system: 'jyotish',
            ruleId: rule.id,
            ruleVersion: rule.version,
            domain: t.domain,
            trait: t.trait,
            intensity: Math.min(1, round4(t.intensity * factor)),
            valence: t.valence,
            window,
            target: hit.target,
            evidence: { componentIds: hit.componentIds, text: hit.text, modifiers },
          }),
        );
      }
    }
  }
  signals.sort(
    (a, b) =>
      cmp(a.ruleId, b.ruleId) ||
      cmp(a.target ?? '', b.target ?? '') ||
      DOMAINS.indexOf(a.domain) - DOMAINS.indexOf(b.domain) ||
      TRAITS.indexOf(a.trait) - TRAITS.indexOf(b.trait),
  );
  const seen = new Set<string>();
  for (const s of signals) {
    if (seen.has(s.id)) throw new Error(`evaluateJyotishRules: duplicate signal id ${s.id} (${s.ruleId} ${s.target})`);
    seen.add(s.id);
  }
  return signals;
}

