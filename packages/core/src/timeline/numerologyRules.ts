/**
 * @fileoverview 生命靈數 timeline rules (V1-13; ARCHITECTURE-V2 §5, D-028).
 *
 * Numerology contributes time-varying signals through two numbers:
 * - `numerology.personal_year` (scope 'year'): 個人流年數 of every Gregorian
 *   calendar year the window overlaps;
 * - `numerology.personal_month` (scope 'month'): 個人流月數 of every Gregorian
 *   calendar month the window overlaps, intensity × the rule's `factor`
 *   (recorded as a modifier).
 * Every domain / trait / intensity / valence comes from `numerologyCatalog.json`;
 * this module only computes the numbers and which calendar periods a window covers.
 *
 * Not here on purpose: Tzolkin (Kin) and 命卦 have no time-varying component in
 * this project (both are fixed at birth), so they emit no timeline signals — they
 * would only add the same constant to every cell.
 *
 * @module timeline/numerologyRules
 */

import { calculatePersonalYear, reduce, type CivilDate } from '../calculators/numerology/numerology';
import { createSignal } from '../signals/createSignal';
import {
  DOMAINS,
  TRAITS,
  type Grain,
  type Modifier,
  type Rule,
  type RuleHit,
  type Signal,
  type SignalTemplate,
  type SignalWindow,
} from '../signals/types';
import catalogJson from './numerologyCatalog.json';

export interface NumerologyTimelineCatalog {
  version: number;
  system: 'numerology';
  conventions: Record<string, string>;
  /** Number ('1'…'9', '11', '22', '33') → templates. */
  numbers: Record<string, SignalTemplate[]>;
  rules: { id: string; version: number; scope: Grain; description: string; source: string; params: { factor: number } }[];
}

export const NUMEROLOGY_TIMELINE_CATALOG = catalogJson as unknown as NumerologyTimelineCatalog;

/** What the numerology timeline rules read: only the birth civil date. */
export interface NumerologyRuleChart {
  birthDate: CivilDate;
}

export interface NumerologyHit extends RuleHit {
  templates: SignalTemplate[];
}

export interface NumerologyRule extends Rule<NumerologyRuleChart> {
  match(chart: NumerologyRuleChart, window: SignalWindow): NumerologyHit[];
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** 'YYYY-MM-DD' birth date → CivilDate. */
export function civilDateOf(ymd: string): CivilDate {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) throw new Error(`numerology: expected 'YYYY-MM-DD', got ${JSON.stringify(ymd)}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** 個人流月數 = reduce(個人流年數 + month), master numbers kept (NumerologyEngine convention). */
export function calculatePersonalMonth(date: CivilDate, year: number, month: number): number {
  return reduce(calculatePersonalYear(date, year) + month);
}

function templatesFor(n: number): SignalTemplate[] {
  const t = NUMEROLOGY_TIMELINE_CATALOG.numbers[String(n)];
  if (!t) throw new Error(`numerology catalog: no templates for number ${n}`);
  return t;
}

/** Calendar (year, month) pairs overlapped by a window, in order. */
function monthsIn(w: SignalWindow): { year: number; month: number }[] {
  const s = civilDateOf(w.start.slice(0, 10));
  const e = civilDateOf(w.end.slice(0, 10));
  const out: { year: number; month: number }[] = [];
  for (let k = s.year * 12 + s.month - 1; k <= e.year * 12 + e.month - 1; k++) {
    out.push({ year: Math.floor(k / 12), month: (k % 12) + 1 });
  }
  return out;
}

function yearsIn(w: SignalWindow): number[] {
  const s = Number(w.start.slice(0, 4));
  const e = Number(w.end.slice(0, 4));
  const out: number[] = [];
  for (let y = s; y <= e; y++) out.push(y);
  return out;
}

function catalogRule(id: string) {
  const r = NUMEROLOGY_TIMELINE_CATALOG.rules.find((x) => x.id === id);
  if (!r) throw new Error(`numerology catalog: missing rule ${id}`);
  return r;
}

const personalYearRule = (() => {
  const e = catalogRule('numerology.personal_year');
  const rule: NumerologyRule = {
    id: e.id,
    version: e.version,
    system: 'numerology',
    scope: e.scope,
    emits: Object.values(NUMEROLOGY_TIMELINE_CATALOG.numbers).flat(),
    match(chart, window) {
      return yearsIn(window).map((year) => {
        const n = calculatePersonalYear(chart.birthDate, year);
        return {
          target: `personalYear@${year}`,
          componentIds: [`personalYear_${year}`],
          text: `個人流年數 ${year} = ${n}`,
          templates: templatesFor(n),
          modifiers: e.params.factor === 1 ? [] : [{ id: `${e.id}.factor`, factor: e.params.factor, reason: `流年強度係數 ${e.params.factor}` }],
        };
      });
    },
  };
  return rule;
})();

const personalMonthRule = (() => {
  const e = catalogRule('numerology.personal_month');
  const rule: NumerologyRule = {
    id: e.id,
    version: e.version,
    system: 'numerology',
    scope: e.scope,
    emits: Object.values(NUMEROLOGY_TIMELINE_CATALOG.numbers).flat(),
    match(chart, window) {
      return monthsIn(window).map(({ year, month }) => {
        const py = calculatePersonalYear(chart.birthDate, year);
        const n = calculatePersonalMonth(chart.birthDate, year, month);
        const modifiers: Modifier[] = [
          { id: `${e.id}.factor`, factor: e.params.factor, reason: `流月強度係數 ${e.params.factor}（相對流年）` },
        ];
        return {
          target: `personalMonth@${year}-${pad(month)}`,
          componentIds: [`personalMonth_${year}_${pad(month)}`],
          text: `個人流月數 ${year}-${pad(month)} = ${n}（個人流年數 ${py}）`,
          templates: templatesFor(n),
          modifiers,
        };
      });
    },
  };
  return rule;
})();

export const NUMEROLOGY_TIMELINE_RULES: readonly NumerologyRule[] = Object.freeze([personalYearRule, personalMonthRule]);

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Evaluate the numerology rules whose scope equals `window.grain`. Pure and
 * deterministic: sorted by ruleId → target → DOMAINS → TRAITS; duplicate ids throw.
 */
export function evaluateNumerologyRules(chart: NumerologyRuleChart, window: SignalWindow): Signal[] {
  const signals: Signal[] = [];
  for (const rule of NUMEROLOGY_TIMELINE_RULES) {
    if (rule.scope !== window.grain) continue;
    for (const hit of rule.match(chart, window)) {
      const modifiers = hit.modifiers ?? [];
      const factor = modifiers.reduce((p, m) => p * m.factor, 1);
      for (const t of hit.templates) {
        signals.push(
          createSignal({
            system: 'numerology',
            ruleId: rule.id,
            ruleVersion: rule.version,
            domain: t.domain,
            trait: t.trait,
            intensity: Math.min(1, Math.round(t.intensity * factor * 10000) / 10000),
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
    if (seen.has(s.id)) throw new Error(`evaluateNumerologyRules: duplicate signal id ${s.id} (${s.ruleId} ${s.target})`);
    seen.add(s.id);
  }
  return signals;
}
