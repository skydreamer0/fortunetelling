/**
 * @fileoverview ⑤ Timeline Engine (V1-13; ARCHITECTURE-V2 §7, §6.1; D-014, D-021, D-023, D-028).
 *
 * `buildTimeline(ctx, { asOf, useTrueSolarTime, ziHourConvention })` → N calendar-year cells (default 5, from the
 * asOf year) plus the 12 calendar months of the asOf year. For every cell it
 * evaluates each system's rules for that window, dedupes the signals by id and
 * aggregates them with `aggregateSignals` (noisy-OR within a system, weighted
 * mean across systems, consensus, explicit conflict). Every cell lists every
 * domain in `DOMAINS` order, so UI tables are rectangular.
 *
 * Pure and deterministic: no clock; the only time input is `opts.asOf`. Same
 * input → byte-identical JSON. `buildTimeline` is SYNC and runs jyotish /
 * humanDesign (transit rules only) only if the Swiss Ephemeris WASM is already initialised;
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
import { baziCalculator, calculateBaziWithNatalBasis } from '../calculators/bazi/calculator';
import type { BaziNatalBasisProvider } from '../calculators/bazi/natalBasis';
import { monthlyPillars } from '../calculators/bazi/pillars';
import { toBaziRuleChart } from '../calculators/bazi/ruleChart';
import { humanDesignCalculator } from '../calculators/humanDesign/calculator';
import { evaluateHumanDesignRules } from '../calculators/humanDesign/rules';
import { buildJyotishChart } from '../calculators/jyotish/calculator';
import { evaluateJyotishRules } from '../calculators/jyotish/rules';
import { monthlySequenceSteps, yearlySequenceSteps } from '../calculators/ziwei/astrolabe';
import { createZiweiNatalBasisProvider, type ZiweiNatalBasisProvider } from '../calculators/ziwei/natalBasis';
import { calculateZiweiSteps } from '../calculators/ziwei/calculator';
import { finishCalculation, type CalculationSteps } from '../core/calculationSteps';
import { toZiweiRuleChart } from '../calculators/ziwei/ruleChart';
import { evaluateBaziRules } from '../rules/bazi/evaluate';
import { evaluateBaziTenGodRules } from '../rules/bazi/evaluateTenGods';
import { evaluateZiweiRules } from '../rules/ziwei/evaluate';
import { aggregateSignals, type SignalConflict, type SystemAggregate } from '../signals/aggregate';
import { resolveAgreementThresholds, validAgreementThresholds, type AgreementThresholds, type DirectionalEvidence } from '../signals/directionalEvidence';
import { DEFAULT_BAND_CUTS, toBand, type Band, type BandCuts } from '../signals/bands';
import { DOMAINS, SYSTEM_IDS, type Domain, type Signal, type SignalWindow, type SystemId } from '../signals/types';
import type { TimeContext } from '../time/types';
import { toZiweiZiConvention, type AnalysisTimeOptions } from '../core/analyzeInput';
import { civilDateOf, evaluateNumerologyRules } from './numerologyRules';
import { finishCooperatively, supportedTimelineEnvironment, TimelineEnvironmentChangedError } from './cooperative';

export const TIMELINE_SCHEMA_VERSION = 2 as const;

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

export interface TimelineOptions extends AnalysisTimeOptions {
  /** Required effective natal day/hour clock for bazi and ziwei; no downstream default. */
  useTrueSolarTime: boolean;
  /** Required bazi naming: late (sect=2) / early (sect=1).
   * Explicitly mapped to ziwei splitMidnight / nextDayAt23; not passed through as an alias.
   */
  ziHourConvention: AnalysisTimeOptions['ziHourConvention'];
  /** 'YYYY-MM-DD' (required, D-014). The first year cell is asOf's calendar year unless `fromYear` is set. */
  asOf: string;
  /** Number of year cells, default 5. */
  years?: number;
  /**
   * First year cell (default: asOf's calendar year). Additive option for V4
   * backtesting (`backtest/buildBacktestTimeline`), which needs cells across the
   * person's past life. Month cells (if included) always stay in the asOf year.
   */
  fromYear?: number;
  /**
   * Max signals kept in each domain cell's `topSignals` (default 5 =
   * TOP_SIGNALS_PER_DOMAIN). Backtesting passes `Infinity` to keep every signal
   * so per-rule scores can be derived. Does not affect scores.
   */
  topSignalsPerDomain?: number;
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
  activityAgreement: number;
  highConsensus: boolean;
  directionalEvidence: DirectionalEvidence | null;
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
  /** Effective raw aggregation thresholds; readers must not silently substitute defaults. */
  thresholds: AgreementThresholds;
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
  agreement: 'activityAgreement is attention from positive-weight systems, including experimental systems. consensus is the largest same-direction side with raw score >= theta and raw valence beyond +/-tau, excluding experimental and zero-weight systems. Three systems on one side qualify as highConsensus; opposing sides and conflicts are both retained.',
});

/**
 * Conventions that replace / extend the base set when humanDesign contributes (M5-04).
 * Kept separate so a timeline WITHOUT humanDesign (the sync `analyze()` report) keeps its
 * recorded `conventions` byte for byte; `scopes` here is the humanDesign-aware text.
 */
export const TIMELINE_CONVENTIONS_HUMAN_DESIGN: Readonly<Record<string, string>> = Object.freeze({
  scopes:
    'Each cell runs only rules whose scope equals its grain (year or month). Natal and decade (大運/大限) rules are not emitted as separate signals; 八字 year rules still include the current 大運 as a relation member. humanDesign likewise runs only its year / month transit rule (humanDesign.transit.gates); its natal rules (type, authority, channel centers) are NOT stamped on cells, because a constant time-invariant signal would clear the consensus threshold in every window and count the system toward agreement without saying anything about that window.',
  humanDesign:
    'humanDesign evaluates humanDesign.transit.gates: transiting bodies (year cells: Jupiter, Saturn, the Nodes and the outer planets; month cells: Jupiter, Saturn, the Nodes, Sun, Earth, Mercury, Venus, Mars) sampled over the whole cell window; a gate they pass that completes an undefined natal channel (electromagnetic / compensation) or falls on a gate of a defined natal channel emits domain × trait weights with valence 0. A cell with no such gate has no humanDesign signal, so the system is simply absent there.',
});

/** `timeline.conventions` for the systems that contributed (base set; humanDesign-aware text only when humanDesign is in). */
export function timelineConventions(systems: readonly SystemId[]): Record<string, string> {
  return { ...TIMELINE_CONVENTIONS, ...(systems.includes('humanDesign') ? TIMELINE_CONVENTIONS_HUMAN_DESIGN : {}) };
}

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

function* prepareSystems(ctx: TimeContext, systems: readonly SystemId[], asOf: string, firstYear: number, years: number, opts: TimelineOptions, baziNatalBasis?: BaziNatalBasisProvider, ziweiNatalBasis?: ZiweiNatalBasisProvider): CalculationSteps<Prepared> {
  const evaluators: Partial<Record<SystemId, WindowEvaluator>> = {};
  const skipped: SkippedSystem[] = [];
  const timeKnown = ctx.jd !== null && ctx.utc !== null;
  const { name, useTrueSolarTime, ziHourConvention } = opts;
  const calcConfig = name === undefined ? { asOf } : { asOf, name };
  const asOfYear = Number(asOf.slice(0, 4));

  for (const system of SYSTEM_IDS) {
    if (!systems.includes(system)) continue;
    switch (system) {
      case 'bazi': {
        const baziConfig = { ...calcConfig, useTrueSolarTime, ziHourConvention };
        const res = baziNatalBasis
          ? calculateBaziWithNatalBasis(ctx, baziConfig, baziNatalBasis)
          : baziCalculator.calculate(ctx, baziConfig);
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
        const config = {
          ...calcConfig, useTrueSolarTime, ziHourConvention: toZiweiZiConvention(ziHourConvention),
        };
        const provider = ziweiNatalBasis ?? createZiweiNatalBasisProvider(ctx, config);
        const res = yield* calculateZiweiSteps(ctx, config, provider);
        const time = res.chart.time;
        if (!timeKnown || !time) {
          skipped.push({ system, reason: 'time_unknown' });
          break;
        }
        const astrolabe = provider(ctx, config).astrolabeFor(time);
        yield;
        const yearly = yield* yearlySequenceSteps(astrolabe, firstYear - 1, years + 1);
        const previousMonths = yield* monthlySequenceSteps(astrolabe, asOfYear - 1);
        const currentMonths = yield* monthlySequenceSteps(astrolabe, asOfYear);
        const rc = toZiweiRuleChart(res, {
          // Lunar years firstYear−1 … last year: the Gregorian year cells overlap all of them.
          yearlySequence: yearly,
          // Gregorian Jan/Feb of the asOf year fall in the previous lunar year.
          monthlySequence: [...previousMonths, ...currentMonths],
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
          // Only the transit rule (scope = the cell grain). Natal rules are NOT stamped on cells: a constant
          // signal would clear the consensus threshold in every window (see conventions.scopes / humanDesign).
          evaluators.humanDesign = (w) => evaluateHumanDesignRules(chart, w);
        }
        break;
      }
      default:
        skipped.push({ system, reason: 'no_timeline_rules' });
    }
    yield;
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
  evidence?: Map<string, Signal>,
): TimelineCell {
  const byId = new Map<string, Signal>();
  for (const system of SYSTEM_IDS) {
    const ev = evaluators[system];
    if (!ev) continue;
    for (const s of ev(w)) if (!byId.has(s.id)) byId.set(s.id, s);
  }
  // Preserve the same evaluated signals before display-only top-N truncation.
  if (evidence) for (const [id, signal] of byId) if (!evidence.has(id)) evidence.set(id, signal);
  return cellFromSignals(w, [...byId.values()], weightOf, opts, bandCuts);
}

/** 由一個 cell 已去重的訊號算出整個 cell（buildCell 與 restrictTimelineCell 共用，確保同一條公式）。 */
function cellFromSignals(
  w: SignalWindow,
  deduped: readonly Signal[],
  weightOf: (s: SystemId) => number,
  opts: Pick<TimelineOptions, 'systemWeights' | 'consensusThreshold' | 'conflictThreshold' | 'topSignalsPerDomain'>,
  bandCuts: BandCuts,
): TimelineCell {
  const signals = [...deduped].sort((a, b) => cmp(a.id, b.id));
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
      .slice(0, opts.topSignalsPerDomain ?? TOP_SIGNALS_PER_DOMAIN)
      .map(({ s }) => s);
    return {
      domain,
      score,
      band: toBand(score, bandCuts),
      consensus: agg?.consensus ?? 0,
      activityAgreement: agg?.activityAgreement ?? 0,
      highConsensus: agg?.highConsensus ?? false,
      directionalEvidence: agg?.directionalEvidence ?? null,
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
  return buildTimelineInternal(ctx, opts);
}

/** Internal sync-analyze path. No caller-supplied natal object is added to TimelineOptions. */
export function buildTimelineWithBaziNatalBasis(ctx: TimeContext, opts: TimelineOptions, natalBasis: BaziNatalBasisProvider, ziweiNatalBasis?: ZiweiNatalBasisProvider): Timeline {
  return buildTimelineInternal(ctx, opts, natalBasis, undefined, ziweiNatalBasis);
}

/** Internal report assembly: the public timeline API still returns only Timeline. */
export function buildTimelineEvidenceWithBaziNatalBasis(ctx: TimeContext, opts: TimelineOptions, natalBasis: BaziNatalBasisProvider, ziweiNatalBasis?: ZiweiNatalBasisProvider): { timeline: Timeline; signals: Signal[] } {
  const evidence = new Map<string, Signal>();
  const timeline = buildTimelineInternal(ctx, opts, natalBasis, evidence, ziweiNatalBasis);
  return { timeline, signals: [...evidence.values()].sort((a, b) => cmp(a.id, b.id)) };
}

function validateTimeOptions(opts: TimelineOptions): void {
  if (typeof opts?.useTrueSolarTime !== 'boolean') {
    throw new Error('buildTimeline: useTrueSolarTime is required and must be a boolean');
  }
  if (opts.ziHourConvention !== 'late' && opts.ziHourConvention !== 'early') {
    throw new Error("buildTimeline: ziHourConvention is required and must be 'late' or 'early'");
  }
}

function buildTimelineInternal(ctx: TimeContext, opts: TimelineOptions, natalBasis?: BaziNatalBasisProvider, evidence?: Map<string, Signal>, ziweiNatalBasis?: ZiweiNatalBasisProvider): Timeline {
  return finishCalculation(buildTimelineSteps(ctx, opts, natalBasis, evidence, ziweiNatalBasis));
}

export interface TimelineCooperativeControl {
  signal: AbortSignal;
  /** Must yield a task for input/paint opportunities; rejection is propagated. */
  yieldTask?: () => Promise<void>;
}

/**
 * Cooperative report projection with the same calculations as buildTimeline.
 * Requires an explicit subset of bazi/ziwei/numerology (the sync Web report scope).
 * Known-time Ziwei requires the already-established zh-TW/default iztro state.
 * Does not initialize ephemeris or change/restore global configuration. Boundary
 * checks are not a plugin/resource audit or cross-global-configuration isolation.
 * Inputs are copied before the first yield; only a complete Timeline is returned.
 * One next() unit remains indivisible. buildTimelineAsync retains its old meaning.
 */
export async function buildTimelineCooperatively(ctx: TimeContext, opts: TimelineOptions,
  { signal, yieldTask = () => new Promise(resolve => setTimeout(resolve, 0)) }: TimelineCooperativeControl): Promise<Timeline> {
  return buildTimelineCooperativelyWithNatalBasis(ctx, opts, { signal, yieldTask });
}

/** Internal immutable-snapshot session path; the public API retains its old shape. */
export async function buildTimelineCooperativelyWithNatalBasis(ctx: TimeContext, opts: TimelineOptions,
  { signal, yieldTask = () => new Promise(resolve => setTimeout(resolve, 0)) }: TimelineCooperativeControl,
  baziNatalBasis?: BaziNatalBasisProvider, ziweiNatalBasis?: ZiweiNatalBasisProvider): Promise<Timeline> {
  signal.throwIfAborted();
  if (!Array.isArray(opts?.systems) || opts.systems.some(system => !['bazi', 'ziwei', 'numerology'].includes(system))) {
    throw new TimelineEnvironmentChangedError('Cooperative timeline requires an explicit bazi/ziwei/numerology report scope');
  }
  const context = structuredClone(ctx), options = structuredClone(opts);
  const verify = options.systems!.includes('ziwei') && context.jd !== null && context.utc !== null
    ? supportedTimelineEnvironment() : () => {};
  return finishCooperatively(buildTimelineSteps(context, options, baziNatalBasis, undefined, ziweiNatalBasis), signal, yieldTask, verify);
}

function* buildTimelineSteps(ctx: TimeContext, opts: TimelineOptions, natalBasis?: BaziNatalBasisProvider, evidence?: Map<string, Signal>, ziweiNatalBasis?: ZiweiNatalBasisProvider): CalculationSteps<Timeline> {
  const asOf = validateAsOf(opts?.asOf);
  const thresholds = resolveAgreementThresholds(opts);
  validateTimeOptions(opts);
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

  const firstYear = opts.fromYear ?? Number(asOf.slice(0, 4));
  if (!Number.isInteger(firstYear) || firstYear < 1 || firstYear > 9999 - years) {
    throw new Error(`buildTimeline: fromYear must be an integer year, got ${opts.fromYear}`);
  }
  const topN = opts.topSignalsPerDomain;
  if (topN !== undefined && !(topN === Infinity || (Number.isInteger(topN) && topN >= 0))) {
    throw new Error(`buildTimeline: topSignalsPerDomain must be an integer ≥ 0 or Infinity, got ${topN}`);
  }
  const { evaluators, skipped } = yield* prepareSystems(ctx, requested, asOf, firstYear, years, opts, natalBasis, ziweiNatalBasis);
  const weightOf = (s: SystemId) => opts.systemWeights?.[s] ?? 1;
  const systems = SYSTEM_IDS.filter((s) => evaluators[s] !== undefined);
  const systemWeights: Partial<Record<SystemId, number>> = {};
  for (const s of systems) systemWeights[s] = weightOf(s);

  const yearCells: TimelineCell[] = [];
  for (let i = 0; i < years; i++) {
    yearCells.push(buildCell(yearWindow(firstYear + i), evaluators, weightOf, opts, bandCuts, evidence));
    yield;
  }
  const monthCells: TimelineCell[] = [];
  if (opts.includeMonths !== false) for (let i = 0; i < 12; i++) {
    monthCells.push(buildCell(monthWindow(Number(asOf.slice(0, 4)), i + 1), evaluators, weightOf, opts, bandCuts, evidence));
    yield;
  }

  return {
    schemaVersion: TIMELINE_SCHEMA_VERSION,
    asOf,
    systems,
    skippedSystems: skipped,
    conventions: timelineConventions(systems),
    bandCuts: [bandCuts[0], bandCuts[1], bandCuts[2]],
    systemWeights,
    thresholds,
    years: yearCells,
    months: monthCells,
  };
}

// ─── 依系統篩選 ─────────────────────────────────────────────────────────────

/** `restrictTimeline*` 需要、但 Timeline 本身沒存下來的選項（須與建 timeline 時相同）。 */
export interface RestrictTimelineOptions {
  consensusThreshold?: number;
  conflictThreshold?: number;
}

function recordedThresholds(timeline: { thresholds?: AgreementThresholds }, opts: RestrictTimelineOptions): AgreementThresholds {
  if (!validAgreementThresholds(timeline.thresholds)) throw new Error('restrictTimeline: recorded thresholds are required');
  const { theta, tau } = timeline.thresholds;
  if ((opts.consensusThreshold !== undefined && opts.consensusThreshold !== theta) ||
      (opts.conflictThreshold !== undefined && opts.conflictThreshold !== tau)) {
    throw new Error('restrictTimeline: threshold override does not match the source timeline');
  }
  return { theta, tau };
}

function assertKnownSystems(systems: readonly SystemId[], fn: string): Set<SystemId> {
  if (!Array.isArray(systems)) throw new Error(`${fn}: systems must be an array`);
  for (const s of systems) {
    if (!(SYSTEM_IDS as readonly string[]).includes(s)) throw new Error(`${fn}: unknown system ${JSON.stringify(s)}`);
  }
  return new Set(systems);
}

/**
 * 只保留指定系統的訊號，重算一個 cell（分數、band、共識、衝突、perSystem、topSignals）。
 * 前提：cell 以 `topSignalsPerDomain: Infinity` 建立（topSignals 含全部訊號），否則丟錯，
 * 因為截斷過的 topSignals 無法還原原始訊號。結果與 `buildTimeline({ systems })` 的同一 cell 相同。
 */
export function restrictTimelineCell(
  cell: TimelineCell,
  systems: readonly SystemId[],
  timeline: Pick<Timeline, 'systemWeights' | 'bandCuts' | 'thresholds'>,
  opts: RestrictTimelineOptions = {},
): TimelineCell {
  const keep = assertKnownSystems(systems, 'restrictTimelineCell');
  const thresholds = recordedThresholds(timeline, opts);
  const byId = new Map<string, Signal>();
  for (const d of cell.domains) {
    const total = new Set(Object.values(d.perSystem).flatMap((p) => p!.signalIds)).size;
    if (d.topSignals.length !== total) {
      throw new Error('restrictTimelineCell: cell topSignals are truncated; build the timeline with topSignalsPerDomain: Infinity');
    }
    for (const s of d.topSignals) if (keep.has(s.system) && !byId.has(s.id)) byId.set(s.id, s);
  }
  const systemWeights = timeline.systemWeights ?? {};
  const weightOf = (s: SystemId) => systemWeights[s] ?? 1;
  const bandCuts = timeline.bandCuts ?? DEFAULT_BAND_CUTS;
  return cellFromSignals(
    cell.window,
    [...byId.values()],
    weightOf,
    {
      systemWeights,
      topSignalsPerDomain: Infinity,
      consensusThreshold: thresholds.theta,
      conflictThreshold: thresholds.tau,
    },
    bandCuts,
  );
}

/**
 * 只採計指定系統的 timeline：每個 cell 從那些系統的訊號重算（不是把分數乘係數）。
 * `systems`／`skippedSystems`／`systemWeights` 也只留指定系統。
 * 前提同 `restrictTimelineCell`；結果與 `buildTimeline(ctx, { systems, topSignalsPerDomain: Infinity })` 相同。
 */
export function restrictTimeline(timeline: Timeline, systems: readonly SystemId[], opts: RestrictTimelineOptions = {}): Timeline {
  const keep = assertKnownSystems(systems, 'restrictTimeline');
  const thresholds = recordedThresholds(timeline, opts);
  const systemWeights: Partial<Record<SystemId, number>> = {};
  for (const s of SYSTEM_IDS) {
    const w = timeline.systemWeights[s];
    if (keep.has(s) && w !== undefined) systemWeights[s] = w;
  }
  const restricted = { systemWeights, bandCuts: timeline.bandCuts, thresholds };
  return {
    schemaVersion: timeline.schemaVersion,
    asOf: timeline.asOf,
    systems: timeline.systems.filter((s) => keep.has(s)),
    skippedSystems: timeline.skippedSystems.filter((s) => keep.has(s.system)).map((s) => ({ ...s })),
    conventions: timelineConventions(timeline.systems.filter((s) => keep.has(s))),
    bandCuts: [timeline.bandCuts[0], timeline.bandCuts[1], timeline.bandCuts[2]],
    systemWeights,
    thresholds,
    years: timeline.years.map((c) => restrictTimelineCell(c, systems, restricted, opts)),
    months: timeline.months.map((c) => restrictTimelineCell(c, systems, restricted, opts)),
  };
}

/** Validate effective settings before initialization, then include jyotish and humanDesign. */
export async function buildTimelineAsync(ctx: TimeContext, opts: TimelineOptions): Promise<Timeline> {
  validateTimeOptions(opts);
  await initEphemeris();
  return buildTimeline(ctx, opts);
}
