/**
 * @fileoverview ⑤ Timeline Engine (V1-13; ARCHITECTURE-V2 §7, §6.1; D-014, D-021, D-023, D-028).
 *
 * `buildTimeline(ctx, { asOf })` → N calendar-year cells (default 5, from the
 * asOf year) plus the 12 calendar months of the asOf year. For every cell it
 * evaluates each system's rules for that window, dedupes the signals by id and
 * aggregates them with `aggregateSignals` (noisy-OR within a system, weighted
 * mean across systems, consensus, explicit conflict). Every cell lists every
 * domain in `DOMAINS` order, so UI tables are rectangular.
 *
 * Pure and deterministic: no clock; the only time input is `opts.asOf`. Same
 * input → byte-identical JSON. `buildTimeline` is SYNC and runs jyotish /
 * humanDesign only if the Swiss Ephemeris WASM is already initialised;
 * `buildTimelineAsync` initialises it first.
 *
 * Window conventions (also written into `timeline.conventions`):
 * - Cells are Gregorian (year: YYYY-01-01…YYYY-12-31; month: calendar month),
 *   for UI simplicity. Each system maps its own period onto the cell; when a
 *   cell overlaps two native periods (八字 立春 year / 節 month, 紫微 lunar year /
 *   lunar month) the timeline passes ONLY the dominant one (largest overlap) to
 *   the rule evaluator, so e.g. the 2026 cell reads 丙午 流年 (立春 2026-02-04 →)
 *   and ignores the Jan 1–Feb 3 tail of 乙巳. Jyotish rules integrate dasha /
 *   transit periods over the whole window themselves; numerology is Gregorian
 *   by definition, so it is exact.
 *
 * @module timeline/buildTimeline
 */

import { initEphemeris, isEphemerisReady } from '../calculators/astro/ephemeris';
import { baziCalculator } from '../calculators/bazi/calculator';
import { monthlyPillars } from '../calculators/bazi/pillars';
import { toBaziRuleChart } from '../calculators/bazi/ruleChart';
import { humanDesignCalculator } from '../calculators/humanDesign/calculator';
import { evaluateHumanDesignRules } from '../calculators/humanDesign/rules';
import { buildJyotishChart } from '../calculators/jyotish/calculator';
import { evaluateJyotishRules } from '../calculators/jyotish/rules';
import { createAstrolabe, monthlySequence, yearlySequence } from '../calculators/ziwei/astrolabe';
import { ziweiCalculator } from '../calculators/ziwei/calculator';
import { toZiweiRuleChart } from '../calculators/ziwei/ruleChart';
import { evaluateBaziRules } from '../rules/bazi/evaluate';
import { evaluateBaziTenGodRules } from '../rules/bazi/evaluateTenGods';
import { evaluateZiweiRules } from '../rules/ziwei/evaluate';
import { aggregateSignals, type SignalConflict, type SystemAggregate } from '../signals/aggregate';
import { DEFAULT_BAND_CUTS, toBand, type Band, type BandCuts } from '../signals/bands';
import { DOMAINS, SYSTEM_IDS, type Domain, type Signal, type SignalWindow, type SystemId } from '../signals/types';
import type { TimeContext } from '../time/types';
import { civilDateOf, evaluateNumerologyRules } from './numerologyRules';

export const TIMELINE_SCHEMA_VERSION = 1 as const;

/** Systems that contribute timeline signals, in SYSTEM_IDS order. */
export const TIMELINE_SYSTEMS: readonly SystemId[] = Object.freeze(['bazi', 'ziwei', 'numerology', 'jyotish', 'humanDesign']);

export const DEFAULT_TIMELINE_YEARS = 5;
export const TOP_SIGNALS_PER_DOMAIN = 5;

export type TimelineSkipReason =
  /** Birth time unknown: the system needs it (bazi hour pillar, ziwei palaces, lagna, HD). */
  | 'time_unknown'
  /** Sync `buildTimeline` called before `initEphemeris()` (jyotish, humanDesign). */
  | 'ephemeris_not_initialised'
  /** Requested, but the system has no time-varying rules (tzolkin, mingGua). */
  | 'no_timeline_rules';

export interface SkippedSystem {
  system: SystemId;
  reason: TimelineSkipReason;
}

export interface TimelineOptions {
  /** 'YYYY-MM-DD' (required, D-014). The first year cell is asOf's calendar year. */
  asOf: string;
  /** Number of year cells, default 5. */
  years?: number;
  /** Include the 12 month cells of the asOf year (default true). */
  includeMonths?: boolean;
  /** Restrict to these systems (default: TIMELINE_SYSTEMS). */
  systems?: readonly SystemId[];
  /** wₛ for the cross-system weighted mean (default 1 each). Also weights topSignals ranking. */
  systemWeights?: Partial<Record<SystemId, number>>;
  /** Band cuts (default DEFAULT_BAND_CUTS = 35/55/75). */
  bandCuts?: BandCuts;
  /** θ, τ passed to aggregateSignals. */
  consensusThreshold?: number;
  conflictThreshold?: number;
  /** Name override for calculators. */
  name?: string;
}

export interface TimelineDomainCell {
  domain: Domain;
  /** 0–100, one decimal. */
  score: number;
  band: Band;
  consensus: number;
  highConsensus: boolean;
  conflict: SignalConflict | null;
  /** Per-system noisy-OR score / valence (rounded to 4 decimals) and signal ids. */
  perSystem: Partial<Record<SystemId, SystemAggregate>>;
  /** Top signals by intensity × system weight (desc), tie-break by id. */
  topSignals: Signal[];
}

export interface TimelineCell {
  window: SignalWindow;
  domains: TimelineDomainCell[];
}

export interface Timeline {
  schemaVersion: typeof TIMELINE_SCHEMA_VERSION;
  asOf: string;
  /** Systems that actually contributed, in SYSTEM_IDS order. */
  systems: SystemId[];
  skippedSystems: SkippedSystem[];
  conventions: Record<string, string>;
  bandCuts: BandCuts;
  /** Effective weight of every contributing system. */
  systemWeights: Partial<Record<SystemId, number>>;
  years: TimelineCell[];
  months: TimelineCell[];
}

export const TIMELINE_CONVENTIONS: Readonly<Record<string, string>> = Object.freeze({
  windows:
    'Year cells are Gregorian calendar years (YYYY-01-01…YYYY-12-31) starting at the asOf year; month cells are the 12 Gregorian months of the asOf year. Gregorian windows are a UI simplification: no system natively uses them except numerology.',
  periodMapping:
    'Each system maps its own period onto a cell by overlap. When a cell overlaps two native periods, only the dominant one (largest overlap, ties → earlier) is evaluated: 八字 流年 = 立春 year (≈ Feb 4 → Feb 3), so a year cell ignores the Jan 1–Feb 3 tail of the previous 流年; 八字 流月 = 節 month (≈ 4th–8th → next 節); 紫微 流年 / 流月 = lunar year / lunar month (春節 / 初一 boundaries). The remaining approximation is that ~5–7 weeks of each year cell (and ~1 week of each month cell) actually belong to the neighbouring native period.',
  jyotish:
    'Jyotish rules evaluate Vimshottari dasha periods and slow transits over the whole cell window themselves (no dominant-period selection).',
  numerology:
    'Numerology uses Gregorian personal year / personal month numbers, which coincide with the cells exactly.',
  scopes:
    'Each cell runs only rules whose scope equals its grain (year or month). Natal and decade (大運/大限) rules are not emitted as separate signals; 八字 year rules still include the current 大運 as a relation member. Exception: humanDesign has only natal rules — its natal signals are stamped on every cell as a constant, time-invariant baseline.',
  excluded:
    'tzolkin and mingGua emit no timeline signals: both are fixed at birth in this project (Kin, 命卦) and have no time-varying component.',
  score:
    'Per (domain, cell): noisy-OR within each system, then Σ wₛ·scoreₛ / Σ wₛ over the systems that emitted signals for that domain (ARCHITECTURE-V2 §6.1), ×100, rounded to one decimal. A domain with no signals scores 0. Band = toBand(rounded score, bandCuts).',
  topSignals:
    'Up to 5 signals per domain, ordered by intensity × system weight (desc), then signal id (asc).',
  determinism: 'No clock reads: the output depends only on (TimeContext, options, rule/catalog versions).',
});

// ─── windows ────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const pad = (n: number, w = 2) => String(n).padStart(w, '0');

function yearWindow(y: number): SignalWindow {
  return { grain: 'year', start: `${pad(y, 4)}-01-01`, end: `${pad(y, 4)}-12-31` };
}

function monthWindow(y: number, m: number): SignalWindow {
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { grain: 'month', start: `${pad(y, 4)}-${pad(m)}-01`, end: `${pad(y, 4)}-${pad(m)}-${pad(last)}` };
}

/** [startMs, endMs) of a date ('YYYY-MM-DD', end inclusive) or UTC-instant ('…Z', end exclusive) span. */
function spanMs(start: string, end: string): [number, number] {
  const s = Date.parse(start);
  const e = Date.parse(end) + (end.length === 10 ? DAY_MS : 0);
  return [s, e];
}

/** Period with the largest overlap with `w` (ties → earlier in `periods`), or null. */
export function dominantPeriod<T extends { start: string | null; end: string | null }>(
  periods: readonly T[],
  w: SignalWindow,
): T | null {
  const [ws, we] = spanMs(w.start, w.end);
  let best: T | null = null;
  let bestOverlap = 0;
  for (const p of periods) {
    if (p.start == null || p.end == null) continue;
    const [ps, pe] = spanMs(p.start, p.end);
    const overlap = Math.min(we, pe) - Math.max(ws, ps);
    if (overlap > bestOverlap) {
      best = p;
      bestOverlap = overlap;
    }
  }
  return best;
}

// ─── per-system evaluators ─────────────────────────────────────────────────

/** Evaluates one system for a window. */
type WindowEvaluator = (w: SignalWindow) => Signal[];

interface Prepared {
  evaluators: Partial<Record<SystemId, WindowEvaluator>>;
  skipped: SkippedSystem[];
}

function prepareSystems(ctx: TimeContext, systems: readonly SystemId[], asOf: string, firstYear: number, years: number, name?: string): Prepared {
  const evaluators: Partial<Record<SystemId, WindowEvaluator>> = {};
  const skipped: SkippedSystem[] = [];
  const timeKnown = ctx.jd !== null && ctx.utc !== null;
  const calcConfig = name === undefined ? { asOf } : { asOf, name };
  const asOfYear = Number(asOf.slice(0, 4));

  for (const system of SYSTEM_IDS) {
    if (!systems.includes(system)) continue;
    switch (system) {
      case 'bazi': {
        const res = baziCalculator.calculate(ctx, calcConfig);
        if (!timeKnown || !res.chart.pillars) {
          skipped.push({ system, reason: 'time_unknown' });
          break;
        }
        const byYear = new Map<number, ReturnType<typeof toBaziRuleChart>>();
        const chartFor = (y: number) => {
          let c = byYear.get(y);
          if (!c) byYear.set(y, (c = toBaziRuleChart(res, { year: y })));
          return c;
        };
        // 流月 pool covering the asOf Gregorian year: solar years Y−1 (子/丑月 in Jan) and Y.
        const monthPool = [...monthlyPillars(asOfYear - 1), ...monthlyPillars(asOfYear)];
        evaluators.bazi = (w) => {
          const y = Number(w.start.slice(0, 4));
          // 關係規則（合沖刑害破…）＋十神／神煞規則（V1-10b：財星、驛馬、財庫、桃花、沖動）
          const both = (chart: Parameters<typeof evaluateBaziRules>[0]) => [
            ...evaluateBaziRules(chart, w),
            ...evaluateBaziTenGodRules(chart, w),
          ];
          if (w.grain === 'year') return both(chartFor(y));
          const m = dominantPeriod(monthPool, w);
          if (!m) return [];
          return both({ ...chartFor(m.solarYear), monthly: [{ start: m.start, end: m.end, ganZhi: m.ganZhi }] });
        };
        break;
      }
      case 'ziwei': {
        const res = ziweiCalculator.calculate(ctx, calcConfig);
        const time = res.chart.time;
        if (!timeKnown || !time) {
          skipped.push({ system, reason: 'time_unknown' });
          break;
        }
        const astrolabe = createAstrolabe(time.date, time.timeIndex, ctx.profile.gender);
        const rc = toZiweiRuleChart(res, {
          // Lunar years firstYear−1 … last year: the Gregorian year cells overlap all of them.
          yearlySequence: yearlySequence(astrolabe, firstYear - 1, years + 1),
          // Gregorian Jan/Feb of the asOf year fall in the previous lunar year.
          monthlySequence: [...monthlySequence(astrolabe, asOfYear - 1), ...monthlySequence(astrolabe, asOfYear)],
        });
        evaluators.ziwei = (w) => {
          if (w.grain === 'year') {
            const y = dominantPeriod(rc.yearlySequence, w);
            return y ? evaluateZiweiRules({ ...rc, yearly: null, yearlySequence: [y] }, w) : [];
          }
          const m = dominantPeriod(rc.monthlySequence, w);
          return m ? evaluateZiweiRules({ ...rc, yearly: null, yearlySequence: [], monthlySequence: [m] }, w) : [];
        };
        break;
      }
      case 'numerology': {
        const chart = { birthDate: civilDateOf(ctx.profile.date) };
        evaluators.numerology = (w) => evaluateNumerologyRules(chart, w);
        break;
      }
      case 'jyotish': {
        if (!timeKnown) skipped.push({ system, reason: 'time_unknown' });
        else if (!isEphemerisReady()) skipped.push({ system, reason: 'ephemeris_not_initialised' });
        else {
          const chart = buildJyotishChart(ctx, { asOf });
          evaluators.jyotish = (w) => evaluateJyotishRules(chart, w);
        }
        break;
      }
      case 'humanDesign': {
        if (!timeKnown) skipped.push({ system, reason: 'time_unknown' });
        else if (!isEphemerisReady()) skipped.push({ system, reason: 'ephemeris_not_initialised' });
        else {
          const { chart } = humanDesignCalculator.calculate(ctx, { asOf });
          // Natal-only rule set: a constant baseline on every cell (see conventions.scopes).
          evaluators.humanDesign = (w) => evaluateHumanDesignRules(chart, w, { scopes: ['natal'] });
        }
        break;
      }
      default:
        skipped.push({ system, reason: 'no_timeline_rules' });
    }
  }
  return { evaluators, skipped };
}

// ─── cells ──────────────────────────────────────────────────────────────────

const round = (x: number, d: number) => {
  const f = 10 ** d;
  return Math.round(x * f) / f;
};
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function buildCell(
  w: SignalWindow,
  evaluators: Partial<Record<SystemId, WindowEvaluator>>,
  weightOf: (s: SystemId) => number,
  opts: TimelineOptions,
  bandCuts: BandCuts,
): TimelineCell {
  const byId = new Map<string, Signal>();
  for (const system of SYSTEM_IDS) {
    const ev = evaluators[system];
    if (!ev) continue;
    for (const s of ev(w)) if (!byId.has(s.id)) byId.set(s.id, s);
  }
  const signals = [...byId.values()].sort((a, b) => cmp(a.id, b.id));
  const aggs = aggregateSignals(signals, {
    systemWeights: opts.systemWeights,
    ...(opts.consensusThreshold !== undefined ? { consensusThreshold: opts.consensusThreshold } : {}),
    ...(opts.conflictThreshold !== undefined ? { conflictThreshold: opts.conflictThreshold } : {}),
  });

  const domains = DOMAINS.map((domain): TimelineDomainCell => {
    const agg = aggs.find((a) => a.domain === domain);
    const score = agg ? round(agg.score, 1) : 0;
    const perSystem: Partial<Record<SystemId, SystemAggregate>> = {};
    if (agg) {
      for (const s of SYSTEM_IDS) {
        const p = agg.perSystem[s];
        if (p) perSystem[s] = { score: round(p.score, 4), valence: round(p.valence, 4), signalIds: [...p.signalIds] };
      }
    }
    const topSignals = signals
      .filter((s) => s.domain === domain)
      .map((s) => ({ s, k: s.intensity * weightOf(s.system) }))
      .sort((a, b) => b.k - a.k || cmp(a.s.id, b.s.id))
      .slice(0, TOP_SIGNALS_PER_DOMAIN)
      .map(({ s }) => s);
    return {
      domain,
      score,
      band: toBand(score, bandCuts),
      consensus: agg?.consensus ?? 0,
      highConsensus: agg?.highConsensus ?? false,
      conflict: agg?.conflict ?? null,
      perSystem,
      topSignals,
    };
  });
  return { window: { ...w }, domains };
}

function validateAsOf(asOf: unknown): string {
  if (typeof asOf !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    throw new Error(`buildTimeline: asOf must be 'YYYY-MM-DD', got ${JSON.stringify(asOf)}`);
  }
  const [y, m, d] = asOf.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw new Error(`buildTimeline: asOf is not a valid date: ${asOf}`);
  }
  return asOf;
}

/**
 * Build the timeline synchronously. jyotish / humanDesign run only when the
 * ephemeris is already initialised; otherwise they are listed in
 * `skippedSystems` with reason 'ephemeris_not_initialised'.
 */
export function buildTimeline(ctx: TimeContext, opts: TimelineOptions): Timeline {
  const asOf = validateAsOf(opts?.asOf);
  const years = opts.years ?? DEFAULT_TIMELINE_YEARS;
  if (!Number.isInteger(years) || years < 1 || years > 50) {
    throw new Error(`buildTimeline: years must be an integer in 1..50, got ${years}`);
  }
  const bandCuts: BandCuts = opts.bandCuts ? [opts.bandCuts[0], opts.bandCuts[1], opts.bandCuts[2]] : DEFAULT_BAND_CUTS;
  toBand(0, bandCuts); // validates ascending cuts
  const requested = opts.systems ?? TIMELINE_SYSTEMS;
  for (const s of requested) {
    if (!(SYSTEM_IDS as readonly string[]).includes(s)) throw new Error(`buildTimeline: unknown system ${JSON.stringify(s)}`);
  }
  for (const [s, w] of Object.entries(opts.systemWeights ?? {})) {
    if (typeof w !== 'number' || !Number.isFinite(w) || w < 0) throw new Error(`buildTimeline: weight of ${s} must be a finite number ≥ 0`);
  }

  const firstYear = Number(asOf.slice(0, 4));
  const { evaluators, skipped } = prepareSystems(ctx, requested, asOf, firstYear, years, opts.name);
  const weightOf = (s: SystemId) => opts.systemWeights?.[s] ?? 1;
  const systems = SYSTEM_IDS.filter((s) => evaluators[s] !== undefined);
  const systemWeights: Partial<Record<SystemId, number>> = {};
  for (const s of systems) systemWeights[s] = weightOf(s);

  const yearCells = Array.from({ length: years }, (_, i) => buildCell(yearWindow(firstYear + i), evaluators, weightOf, opts, bandCuts));
  const monthCells =
    opts.includeMonths === false
      ? []
      : Array.from({ length: 12 }, (_, i) => buildCell(monthWindow(firstYear, i + 1), evaluators, weightOf, opts, bandCuts));

  return {
    schemaVersion: TIMELINE_SCHEMA_VERSION,
    asOf,
    systems,
    skippedSystems: skipped,
    conventions: { ...TIMELINE_CONVENTIONS },
    bandCuts: [bandCuts[0], bandCuts[1], bandCuts[2]],
    systemWeights,
    years: yearCells,
    months: monthCells,
  };
}

/** `await initEphemeris()`, then `buildTimeline` — includes jyotish and humanDesign. */
export async function buildTimelineAsync(ctx: TimeContext, opts: TimelineOptions): Promise<Timeline> {
  await initEphemeris();
  return buildTimeline(ctx, opts);
}
