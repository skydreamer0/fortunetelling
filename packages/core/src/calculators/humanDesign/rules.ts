/**
 * @fileoverview Human Design rule set (ARCHITECTURE-V2 §5, D-028). Minimal
 * natal signals: type / authority → trait weights, defined channels → domains
 * via the center table. All weights live in `catalog.json`; no 吉/凶 text.
 *
 * @module calculators/humanDesign/rules
 */

import { createSignal } from '../../signals/createSignal';
import type { Domain, Grain, Rule, Signal, SignalTemplate, SignalWindow, Trait } from '../../signals/types';
import { CHANNELS, GATE_CENTER, type Center } from './bodygraph';
import catalogData from './catalog.json';
import type { HumanDesignChart } from './calculator';
import { HD_PLANETS, longitudesAt, type HdPlanet } from './humanDesign';
import { GATE_ARC_DEG, GATE_ORDER, MANDALA_START_DEG } from './mandala';

export type HdRuleStatus = 'active' | 'pending';

export interface HdCatalogEntry {
  id: string;
  version: number;
  /** Single scope (natal rules). */
  scope?: Grain;
  /** Several scopes (transit rules); one rule object is built per scope. */
  scopes?: Grain[];
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
    scope: e.scope!,
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
    scope: e.scope!,
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

// ─── Transit rule (M5-04) ────────────────────────────────────────────────

interface TransitGatesParams {
  /** Days between longitude samples, per grain. */
  sampleDays: Partial<Record<Grain, number>>;
  /** Transiting body → base intensity, per grain. */
  planets: Partial<Record<Grain, Partial<Record<HdPlanet, number>>>>;
  kindFactors: { complete: number; reinforce: number };
  centers: Record<Center, { domain: Domain; trait: Trait }>;
}

const DAY_MS = 86_400_000;
const UNIX_EPOCH_JD = 2440587.5;
/** JD (UT) of 00:00 on an ISO date ('YYYY-MM-DD…'). */
function dateToJd(iso: string): number {
  return Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY_MS + UNIX_EPOCH_JD;
}

const norm360 = (d: number) => ((d % 360) + 360) % 360;
const gateAt = (k: number) => GATE_ORDER[((k % 64) + 64) % 64]!;

/**
 * Every gate a body occupies while its longitude moves through `lons` (successive
 * samples). Between two samples the body is assumed to take the shorter arc, so
 * gates in between are counted even when a fast body skips past one sample point.
 */
export function gatesAlong(lons: readonly number[]): number[] {
  const seen = new Set<number>();
  if (lons.length > 0) seen.add(gateAt(Math.floor(norm360(lons[0]! - MANDALA_START_DEG) / GATE_ARC_DEG)));
  for (let i = 1; i < lons.length; i++) {
    const a = norm360(lons[i - 1]! - MANDALA_START_DEG);
    const d = norm360(lons[i]! - lons[i - 1]! + 180) - 180; // signed shortest arc, [−180, 180)
    const ka = Math.floor(a / GATE_ARC_DEG);
    const kb = Math.floor((a + d) / GATE_ARC_DEG);
    const step = kb >= ka ? 1 : -1;
    for (let k = ka; k !== kb + step; k += step) seen.add(gateAt(k));
  }
  return [...seen].sort((x, y) => x - y);
}

/** Bounded memo of longitudes by (node, jd): positions are a pure function of the instant. */
const LONGITUDE_CACHE = new Map<string, Record<HdPlanet, number>>();
function cachedLongitudes(jd: number, node: 'true' | 'mean'): Record<HdPlanet, number> {
  const key = `${node}:${jd}`;
  let v = LONGITUDE_CACHE.get(key);
  if (!v) {
    if (LONGITUDE_CACHE.size >= 4096) LONGITUDE_CACHE.clear();
    v = longitudesAt(jd, node);
    LONGITUDE_CACHE.set(key, v);
  }
  return v;
}

/**
 * @internal Sampling seam for step-halving validation; not exported by the package.
 * Keeps the production inclusive end-date convention and cached ephemeris calls.
 */
export function sampleHumanDesignTransitWindow(window: SignalWindow, node: 'true' | 'mean', stepDays: number) {
  const startJd = dateToJd(window.start);
  const endJd = dateToJd(window.end) + 1;
  const jds: number[] = [];
  for (let jd = startJd; jd < endJd; jd += stepDays) jds.push(jd);
  jds.push(endJd);
  return { jds, samples: jds.map((jd) => cachedLongitudes(jd, node)) };
}

const PLANET_LABEL: Record<HdPlanet, string> = {
  sun: '太陽',
  earth: '地球',
  moon: '月亮',
  northNode: '北交點',
  southNode: '南交點',
  mercury: '水星',
  venus: '金星',
  mars: '火星',
  jupiter: '木星',
  saturn: '土星',
  uranus: '天王星',
  neptune: '海王星',
  pluto: '冥王星',
};

/**
 * 行運閘門（M5-04）。窗口內每個行運行星經過的閘門 g，與原局比對：
 * - complete（補完／電磁）：g 是一條原局未定義通道的一端，而另一端 h 原局已被啟動 → 行運暫時補滿該通道；
 *   對通道兩端中心各發一則 domain × trait 訊號，強度 = 行星權重 × kindFactors.complete。
 * - reinforce（強化）：g 本身屬於原局已定義通道 → 對 g 所屬中心發一則訊號，強度 = 行星權重 × kindFactors.reinforce。
 * 兩者都只描述特徵權重，valence 一律 0。決定論：取樣點只由窗口日期決定；需要 `initEphemeris()`。
 */
function transitGatesRule(scope: Grain, samplingStepDays?: number): HdRule {
  const e = HUMAN_DESIGN_CATALOG.rules.find((r) => r.id === 'humanDesign.transit.gates');
  if (!e) throw new Error('humanDesign catalog: missing rule humanDesign.transit.gates');
  if (e.status !== 'active') throw new Error(`humanDesign catalog: rule ${e.id} is ${e.status}`);
  const p = e.params as unknown as TransitGatesParams;
  const weights = p.planets[scope] ?? {};
  const stepDays = samplingStepDays ?? p.sampleDays[scope];
  if (!e.scopes?.includes(scope) || stepDays === undefined) {
    throw new Error(`humanDesign catalog: rule ${e.id} has no params for scope ${scope}`);
  }
  const maxWeight = Math.max(0, ...Object.values(weights).map((w) => w ?? 0));
  const emits: SignalTemplate[] = Object.values(p.centers).flatMap((c) =>
    (['complete', 'reinforce'] as const).map((k) => ({ ...c, intensity: maxWeight * p.kindFactors[k], valence: 0 })),
  );

  return {
    id: e.id,
    version: e.version,
    system: 'humanDesign',
    scope,
    emits,
    match(chart, window) {
      if (chart.birthJdUt === null || chart.gates.length === 0) return [];
      const natalOn = new Map(chart.gates.map((g) => [g.gate, g]));
      const definedIds = new Set(chart.channels.map((c) => c.id));
      const definedGates = new Set(chart.channels.flatMap((c) => [...c.gates]));
      const natalComponents = (gate: number): string[] => {
        const g = natalOn.get(gate)!;
        return [...g.personality.map((pl) => `hd_personality_${pl}`), ...g.design.map((pl) => `hd_design_${pl}`)];
      };

      const { samples } = sampleHumanDesignTransitWindow(window, chart.node, stepDays);

      const hits: HdHit[] = [];
      for (const planet of HD_PLANETS) {
        const w = weights[planet];
        if (w === undefined) continue;
        const label = PLANET_LABEL[planet];
        for (const g of gatesAlong(samples.map((s) => s[planet]))) {
          // 補完：未定義通道、另一端原局已啟動、本端原局未啟動。
          if (!natalOn.has(g)) {
            for (const ch of CHANNELS) {
              if (!ch.gates.includes(g)) continue;
              const other = ch.gates[0] === g ? ch.gates[1] : ch.gates[0];
              if (!natalOn.has(other) || definedIds.has(ch.id)) continue;
              for (const c of ch.centers) {
                const t = p.centers[c];
                hits.push({
                  target: `transit:${planet}:g${g}:complete:${ch.id}:${c}`,
                  componentIds: [...natalComponents(other), `hd_center_${c}`],
                  text:
                    `${window.start}～${window.end} 行運${label}經過閘門 ${g}，補滿原局閘門 ${other} 的通道 ${ch.id}` +
                    `（${ch.centers[0]}–${ch.centers[1]}）→ ${t.domain}.${t.trait}`,
                  domain: t.domain,
                  trait: t.trait,
                  intensity: w * p.kindFactors.complete,
                  valence: 0,
                });
              }
            }
          }
          // 強化：落在原局已定義通道的閘門。
          if (definedGates.has(g)) {
            const c = GATE_CENTER[g]!;
            const t = p.centers[c];
            const chIds = chart.channels.filter((ch) => ch.gates.includes(g)).map((ch) => ch.id);
            hits.push({
              target: `transit:${planet}:g${g}:reinforce:${c}`,
              componentIds: [...natalComponents(g), ...chIds.map((id) => `hd_channel_${id}`), `hd_center_${c}`],
              text:
                `${window.start}～${window.end} 行運${label}經過原局已定義的閘門 ${g}（通道 ${chIds.join('、')}，${c}）→ ` +
                `${t.domain}.${t.trait}`,
              domain: t.domain,
              trait: t.trait,
              intensity: w * p.kindFactors.reinforce,
              valence: 0,
            });
          }
        }
      }
      return hits;
    },
  };
}

/** @internal Explicit step only for sampling validation; production rules retain catalog defaults. */
export function humanDesignTransitRuleForSampling(scope: 'year' | 'month', stepDays: number): HdRule {
  if (!Number.isFinite(stepDays) || stepDays <= 0) throw new RangeError('sampling step must be positive and finite');
  return transitGatesRule(scope, stepDays);
}

export const HUMAN_DESIGN_RULES: readonly HdRule[] = Object.freeze([
  templateRule('humanDesign.natal.type', 'type', 'hd_type'),
  templateRule('humanDesign.natal.authority', 'authority', 'hd_authority'),
  channelCentersRule(),
  transitGatesRule('year'),
  transitGatesRule('month'),
]);

/** Run the rules whose scope is in `opts.scopes` (default: the window's grain); deterministic, sorted by signal id; throws on a duplicate id. */
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
