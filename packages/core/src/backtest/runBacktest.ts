/**
 * Backtest runner (V4-04; ARCHITECTURE-V2 §10.1; D-033).
 *
 * Pre-registered method (fixed BEFORE looking at any result — do not tune):
 *
 * - Trial: one (event, domain) pair. The window is the Gregorian year cell that
 *   contains the event date (the same year cells the Timeline shows).
 * - Hit: the trial's score is in the TOP 25% of that person's own timeline for
 *   that domain: `score > 0` and fewer than 25% of the person's year cells have
 *   a strictly higher score (ties at the boundary all count as top). The score
 *   is the cross-system cell score (domain / overall groups), the system's own
 *   noisy-OR score (system groups) or the rule's own noisy-OR (rule groups).
 * - Coverage: a system / rule that never emits for a domain anywhere in the
 *   person's timeline cannot be judged on that domain; such trials are counted
 *   as `uncovered`, not as misses.
 * - Baseline (empirical): the chance that a uniformly random year of the same
 *   person is a hit = share of that person's cells in the top set, averaged
 *   over the group's trials. ≈ 0.25 by construction (ties / zero scores move it).
 *   A seeded random-window baseline (Monte-Carlo draws of random years) is
 *   reported alongside as a sanity check.
 * - Lift = hit rate / empirical baseline.
 * - Sample threshold: n < 30 → status '樣本不足' (no p-value, no weight change).
 * - Split: in-range events (not trials, so one event never straddles both sets)
 *   are shuffled with a seeded PRNG and the first round(N × validationFraction)
 *   become the validation set. Train and validation metrics are reported
 *   separately; only validation metrics may justify a weight change.
 *
 * Pure and deterministic: same (events, timeline, opts) → identical output.
 *
 * @module backtest/runBacktest
 */

import { DOMAINS, SYSTEM_IDS, type Domain, type SystemId } from '../signals/types';
import { lifeEventYear, validateLifeEvent, type LifeEvent } from './lifeEvents';
import { hashString, mulberry32, seededShuffle } from './prng';
import type { BacktestTimeline } from './timeline';

export const BACKTEST_SCHEMA_VERSION = 1 as const;

export const INSUFFICIENT_SAMPLE = '樣本不足' as const;
export const SUFFICIENT_SAMPLE = '可評估' as const;
export type SampleStatus = typeof INSUFFICIENT_SAMPLE | typeof SUFFICIENT_SAMPLE;

/** Pre-registered constants (ARCHITECTURE-V2 §10.1). Changing any of them is a new method version. */
export const BACKTEST_METHOD = Object.freeze({
  version: 1,
  topFraction: 0.25,
  minSample: 30,
  defaultValidationFraction: 0.3,
  defaultRandomDraws: 200,
  hitDefinition:
    "Hit = the event's (domain, year-cell) score is > 0 and fewer than 25% of the person's own year cells score strictly higher (top 25% of their own timeline; boundary ties count as top).",
  baseline:
    "Empirical baseline = share of the person's year cells in their own top set for that domain (≈ 0.25), averaged over trials; plus a seeded random-window Monte-Carlo baseline.",
  sampleThreshold: 'n < 30 trials → 樣本不足: no significance test and no weight change.',
  split: 'Events (not trials) are split train/validation by a seeded shuffle; only validation metrics may justify new weights.',
  window: 'Gregorian calendar year containing the event date.',
});

export interface BacktestOptions {
  /** Seed for the train/validation split and the random-window baseline. */
  seed: number | string;
  /** Share of events held out for validation, default 0.3. */
  validationFraction?: number;
  /** Random-window draws per trial for the Monte-Carlo baseline, default 200. */
  randomDraws?: number;
}

export interface BacktestMetrics {
  /** Trials (event × domain pairs) the group could judge. */
  n: number;
  hits: number;
  hitRate: number | null;
  /** Empirical baseline (expected hit rate of a random year of this person). */
  baseline: number | null;
  /** Seeded Monte-Carlo random-window hit rate. */
  randomBaseline: number | null;
  /** hitRate / baseline. */
  lift: number | null;
  /** One-sided binomial P(X ≥ hits | n, baseline); only when n ≥ minSample. Approximate (uses the mean baseline). */
  pValue: number | null;
  status: SampleStatus;
}

export type BacktestGroupKind = 'overall' | 'domain' | 'system' | 'rule';

export interface BacktestGroup {
  kind: BacktestGroupKind;
  /** 'all' | Domain | SystemId | ruleId */
  key: string;
  all: BacktestMetrics;
  train: BacktestMetrics;
  validation: BacktestMetrics;
  /** Trials this system / rule could not judge (it never emits for that domain for this person). */
  uncovered: number;
}

export interface BacktestTrial {
  eventId: string;
  domain: Domain;
  year: number;
  split: 'train' | 'validation';
  /** Cross-system cell score (0–100). */
  score: number;
  /** Hit under the pre-registered definition (cross-system score). */
  hit: boolean;
  /** Share of this person's cells scoring strictly higher (0 = best year). */
  higherShare: number;
}

export type BacktestExclusionReason = 'invalid' | 'duplicate_id' | 'out_of_range';

export interface BacktestResult {
  schemaVersion: typeof BACKTEST_SCHEMA_VERSION;
  method: typeof BACKTEST_METHOD;
  seed: string;
  validationFraction: number;
  timeline: { asOf: string; fromYear: number; toYear: number; cells: number; systems: SystemId[] };
  events: { used: number; excluded: { id: string | null; reason: BacktestExclusionReason; detail?: string }[] };
  split: { trainIds: string[]; validationIds: string[] };
  trials: BacktestTrial[];
  overall: BacktestGroup;
  byDomain: BacktestGroup[];
  bySystem: BacktestGroup[];
  byRule: BacktestGroup[];
  /** Always present; UI must show it. */
  disclaimer: string;
}

export const BACKTEST_DISCLAIMER =
  '回驗只描述「過去事件是否落在這份時間軸的高分年份」，不代表預測能力；樣本少於 30 筆時結果只是雜訊，僅供參考。';

// ─── helpers ────────────────────────────────────────────────────────────────

const round4 = (x: number) => Math.round(x * 1e4) / 1e4;

interface Series {
  values: number[];
  /** top[i] = cell i is in the person's top set. */
  top: boolean[];
  /** Share of cells in the top set (empirical p). */
  p: number;
  covered: boolean;
  higherShare: number[];
}

function makeSeries(values: number[], topFraction: number): Series {
  const n = values.length;
  const higher = values.map((v) => values.reduce((c, w) => c + (w > v ? 1 : 0), 0));
  const top = values.map((v, i) => v > 0 && higher[i] < topFraction * n);
  return {
    values,
    top,
    p: n ? top.filter(Boolean).length / n : 0,
    covered: values.some((v) => v > 0),
    higherShare: higher.map((h) => (n ? h / n : 0)),
  };
}

/** log C(n, k) via lgamma-free summation (n is small). */
function logChoose(n: number, k: number): number {
  let s = 0;
  for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i);
  return s;
}

/** One-sided upper tail P(X ≥ k), X ~ Binomial(n, p). */
export function binomialUpperTail(n: number, k: number, p: number): number {
  if (k <= 0) return 1;
  if (k > n) return 0;
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let total = 0;
  for (let i = k; i <= n; i++) total += Math.exp(logChoose(n, i) + i * Math.log(p) + (n - i) * Math.log(1 - p));
  return Math.min(1, total);
}

interface TrialRef {
  eventId: string;
  domain: Domain;
  cell: number;
  split: 'train' | 'validation';
}

function metricsFor(
  trials: TrialRef[],
  seriesOf: (d: Domain) => Series,
  nCells: number,
  rand: () => number,
  draws: number,
  minSample: number,
): BacktestMetrics {
  const n = trials.length;
  if (n === 0) {
    return { n: 0, hits: 0, hitRate: null, baseline: null, randomBaseline: null, lift: null, pValue: null, status: INSUFFICIENT_SAMPLE };
  }
  let hits = 0;
  let pSum = 0;
  let randomHits = 0;
  for (const t of trials) {
    const s = seriesOf(t.domain);
    if (s.top[t.cell]) hits++;
    pSum += s.p;
    for (let k = 0; k < draws; k++) if (s.top[Math.floor(rand() * nCells)]) randomHits++;
  }
  const hitRate = hits / n;
  const baseline = pSum / n;
  const enough = n >= minSample;
  return {
    n,
    hits,
    hitRate: round4(hitRate),
    baseline: round4(baseline),
    randomBaseline: draws > 0 ? round4(randomHits / (n * draws)) : null,
    lift: baseline > 0 ? round4(hitRate / baseline) : null,
    pValue: enough && baseline > 0 ? round4(binomialUpperTail(n, hits, baseline)) : null,
    status: enough ? SUFFICIENT_SAMPLE : INSUFFICIENT_SAMPLE,
  };
}

// ─── main ───────────────────────────────────────────────────────────────────

/** Run the pre-registered backtest. Pure; never mutates its inputs. */
export function runBacktest(events: readonly LifeEvent[], timeline: BacktestTimeline, opts: BacktestOptions): BacktestResult {
  if (opts == null || (typeof opts.seed !== 'number' && typeof opts.seed !== 'string')) {
    throw new Error('runBacktest: opts.seed (number | string) is required');
  }
  const seed = String(opts.seed);
  const validationFraction = opts.validationFraction ?? BACKTEST_METHOD.defaultValidationFraction;
  if (!(validationFraction >= 0 && validationFraction <= 1)) throw new Error('runBacktest: validationFraction must be in [0, 1]');
  const draws = opts.randomDraws ?? BACKTEST_METHOD.defaultRandomDraws;
  if (!Number.isInteger(draws) || draws < 0) throw new Error('runBacktest: randomDraws must be an integer ≥ 0');
  const { topFraction, minSample } = BACKTEST_METHOD;

  const cells = timeline.cells;
  const nCells = cells.length;
  const cellOfYear = new Map(cells.map((c, i) => [c.year, i]));

  // 1. validate / dedupe / range-check events
  const excluded: BacktestResult['events']['excluded'] = [];
  const seen = new Set<string>();
  const usable: LifeEvent[] = [];
  for (const raw of events ?? []) {
    const v = validateLifeEvent(raw);
    const id = typeof (raw as LifeEvent)?.id === 'string' ? (raw as LifeEvent).id : null;
    if (!v.ok) {
      excluded.push({ id, reason: 'invalid', detail: v.errors.join('; ') });
      continue;
    }
    if (seen.has(v.value.id)) {
      excluded.push({ id, reason: 'duplicate_id' });
      continue;
    }
    seen.add(v.value.id);
    if (!cellOfYear.has(lifeEventYear(v.value.date))) {
      excluded.push({ id, reason: 'out_of_range', detail: `${v.value.date} not in ${timeline.fromYear}..${timeline.toYear}` });
      continue;
    }
    usable.push(v.value);
  }

  // 2. deterministic split at the event level
  const sortedIds = usable.map((e) => e.id).sort();
  const shuffled = seededShuffle(sortedIds, mulberry32(hashString(`${seed}|split`)));
  const nVal = Math.round(sortedIds.length * validationFraction);
  const validationSet = new Set(shuffled.slice(0, nVal));
  const split = {
    trainIds: sortedIds.filter((id) => !validationSet.has(id)),
    validationIds: sortedIds.filter((id) => validationSet.has(id)),
  };

  // 3. trials (sorted by event id, then DOMAINS order)
  const byId = new Map(usable.map((e) => [e.id, e]));
  const trials: TrialRef[] = [];
  for (const id of sortedIds) {
    const e = byId.get(id)!;
    for (const d of e.domains) {
      trials.push({ eventId: id, domain: d, cell: cellOfYear.get(lifeEventYear(e.date))!, split: validationSet.has(id) ? 'validation' : 'train' });
    }
  }

  // 4. series cache
  const cache = new Map<string, Series>();
  const series = (kind: BacktestGroupKind, key: string, d: Domain): Series => {
    const k = `${kind}|${key}|${d}`;
    let s = cache.get(k);
    if (!s) {
      const values = cells.map((c) => {
        const x = c.domains[d];
        if (kind === 'system') return x.perSystem[key as SystemId] ?? 0;
        if (kind === 'rule') return x.perRule[key] ?? 0;
        return x.score;
      });
      cache.set(k, (s = makeSeries(values, topFraction)));
    }
    return s;
  };

  const group = (kind: BacktestGroupKind, key: string, pool: TrialRef[]): BacktestGroup => {
    const seriesOf = (d: Domain) => series(kind, key, d);
    const covered = pool.filter((t) => seriesOf(t.domain).covered);
    const m = (subset: TrialRef[], label: string) =>
      metricsFor(subset, seriesOf, nCells, mulberry32(hashString(`${seed}|random|${kind}|${key}|${label}`)), draws, minSample);
    return {
      kind,
      key,
      all: m(covered, 'all'),
      train: m(covered.filter((t) => t.split === 'train'), 'train'),
      validation: m(covered.filter((t) => t.split === 'validation'), 'validation'),
      uncovered: pool.length - covered.length,
    };
  };

  const overall = group('overall', 'all', trials);
  const byDomain = DOMAINS.filter((d) => trials.some((t) => t.domain === d)).map((d) =>
    group('domain', d, trials.filter((t) => t.domain === d)),
  );
  const bySystem = SYSTEM_IDS.filter((s) => timeline.systems.includes(s)).map((s) => group('system', s, trials));
  const byRule = [...timeline.ruleIds]
    .sort()
    .map((r) => group('rule', r, trials))
    .filter((g) => g.all.n > 0);

  const outTrials: BacktestTrial[] = trials.map((t) => {
    const s = series('domain', t.domain, t.domain);
    return {
      eventId: t.eventId,
      domain: t.domain,
      year: cells[t.cell].year,
      split: t.split,
      score: s.values[t.cell],
      hit: s.top[t.cell],
      higherShare: round4(s.higherShare[t.cell]),
    };
  });

  return {
    schemaVersion: BACKTEST_SCHEMA_VERSION,
    method: BACKTEST_METHOD,
    seed,
    validationFraction,
    timeline: { asOf: timeline.asOf, fromYear: timeline.fromYear, toYear: timeline.toYear, cells: nCells, systems: [...timeline.systems] },
    events: { used: usable.length, excluded },
    split,
    trials: outTrials,
    overall,
    byDomain,
    bySystem,
    byRule,
    disclaimer: BACKTEST_DISCLAIMER,
  };
}
