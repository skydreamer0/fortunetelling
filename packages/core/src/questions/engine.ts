/**
 * Deterministic Question Engine (V5-02, ARCHITECTURE-V2 §8).
 *
 * `QuestionRequest` → month windows → injected `SignalProvider` → filter by the
 * category's domains / rule subset → score (formula below, all coefficients
 * are catalog data, D-028) → deterministic ranking → top 3 with source signals.
 *
 * Scoring formula (per month window W, category C with domain weights w_d):
 *   1. S = provider(W), de-duplicated by id, kept iff s.domain ∈ C.domains and
 *      (C.ruleIds[s.system] is empty/missing or contains s.ruleId).
 *   2. Every s ∈ S is treated as in effect during W: its window is re-stamped to W
 *      (ids unchanged) so `aggregateSignals` yields one aggregate per domain.
 *   3. activity_d = aggregateSignals(S).score for d (noisy-OR within a system,
 *      system-weighted mean across systems, 0–100).
 *      support_d / risk_d = the same per-system noisy-OR over only the signals whose
 *      trait is in C.traitPreferences.supportive / .risky, weighted-summed and divided
 *      by the weight of ALL systems present in d — so 0 ≤ support_d, risk_d ≤ activity_d.
 *   4. domainScore_d = clamp(0, 100, a·activity_d + s·support_d − r·risk_d)
 *      with (a, s, r) = catalog.scoring (default 0.5 each: a supportive-trait signal
 *      counts fully, a neutral-trait signal half, a risky-trait signal not at all).
 *   5. score = Σ_d w_d·domainScore_d / Σ_d w_d (domains with no signals count as 0),
 *      rounded to 4 decimals.
 * Valence is not used for the score (direction comes from trait preferences); it
 * drives conflict detection, which is kept per domain and never cancelled (D-023).
 * Ranking: score desc, then earlier window start.
 *
 * Pure: no clock access (D-014), no LLM (D-021).
 */
import { aggregateSignals, type DomainWindowAggregate } from '../signals/aggregate';
import { toBand } from '../signals/bands';
import type { Domain, Signal, SignalWindow, SystemId, Trait } from '../signals/types';
import catalogJson from './catalog.json';
import type {
  AnswerOptions,
  DomainConflict,
  DomainScore,
  QuestionAnswer,
  QuestionCatalog,
  QuestionCategory,
  QuestionRange,
  QuestionRequest,
  RankedWindow,
  SignalProvider,
  QuestionValidationResult,
} from './types';

export const QUESTION_CATALOG: QuestionCatalog = catalogJson as unknown as QuestionCatalog;
export const QUESTION_CATALOG_VERSION: number = QUESTION_CATALOG.version;

const YEAR_MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const round4 = (x: number) => Math.round(x * 10000) / 10000;
const clamp100 = (x: number) => Math.min(100, Math.max(0, x));
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function listQuestionCategories(catalog: QuestionCatalog = QUESTION_CATALOG): QuestionCategory[] {
  return catalog.categories;
}

export function getQuestionCategory(
  id: string,
  catalog: QuestionCatalog = QUESTION_CATALOG,
): QuestionCategory | null {
  return catalog.categories.find((c) => c.id === id) ?? null;
}

function monthIndex(ym: string): number {
  const m = YEAR_MONTH.exec(ym)!;
  return Number(m[1]) * 12 + (Number(m[2]) - 1);
}

/** Number of calendar months in an (already format-checked) range, inclusive. */
export function monthsInRange(range: QuestionRange): number {
  return monthIndex(range.end) - monthIndex(range.start) + 1;
}

/** Month windows of a range: start = first day, end = last day (proleptic Gregorian). */
export function monthWindows(range: QuestionRange): SignalWindow[] {
  const out: SignalWindow[] = [];
  const last = monthIndex(range.end);
  for (let i = monthIndex(range.start); i <= last; i++) {
    const y = Math.floor(i / 12);
    const m = (i % 12) + 1;
    const days = m === 2 ? (isLeap(y) ? 29 : 28) : MONTH_DAYS[m - 1];
    const yy = String(y).padStart(4, '0');
    const mm = String(m).padStart(2, '0');
    out.push({ grain: 'month', start: `${yy}-${mm}-01`, end: `${yy}-${mm}-${String(days).padStart(2, '0')}` });
  }
  return out;
}

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/**
 * Strict validation of what the AI layer produces. Unknown category →
 * `unsupported: true` (never improvise). Extra keys are rejected.
 */
export function validateQuestionRequest(
  input: unknown,
  catalog: QuestionCatalog = QUESTION_CATALOG,
): QuestionValidationResult {
  const errors: string[] = [];
  let unsupported = false;
  if (!isPlainObject(input)) return { ok: false, unsupported: false, errors: ['request must be an object'] };

  for (const k of Object.keys(input)) {
    if (k !== 'category' && k !== 'range') errors.push(`unknown key ${JSON.stringify(k)}`);
  }

  let category: QuestionCategory | null = null;
  const cat = input.category;
  if (typeof cat !== 'string' || cat.length === 0) {
    errors.push('category must be a non-empty string');
  } else {
    category = getQuestionCategory(cat, catalog);
    if (!category) {
      unsupported = true;
      errors.push(`unsupported category ${JSON.stringify(cat)}`);
    }
  }

  const range = input.range;
  let rangeOk = false;
  if (!isPlainObject(range)) {
    errors.push('range must be an object { start, end }');
  } else {
    for (const k of Object.keys(range)) {
      if (k !== 'start' && k !== 'end') errors.push(`unknown range key ${JSON.stringify(k)}`);
    }
    const { start, end } = range;
    const startOk = typeof start === 'string' && YEAR_MONTH.test(start);
    const endOk = typeof end === 'string' && YEAR_MONTH.test(end);
    if (!startOk) errors.push(`range.start must be 'YYYY-MM', got ${JSON.stringify(start)}`);
    if (!endOk) errors.push(`range.end must be 'YYYY-MM', got ${JSON.stringify(end)}`);
    if (startOk && endOk) {
      const n = monthsInRange({ start: start as string, end: end as string });
      const min = category?.minMonths ?? catalog.defaults.minMonths;
      const max = category?.maxMonths ?? catalog.defaults.maxMonths;
      if (n < 1) errors.push(`range.start (${start}) is after range.end (${end})`);
      else if (n < min) errors.push(`range must span at least ${min} month(s), got ${n}`);
      else if (n > max) errors.push(`range must span at most ${max} months, got ${n}`);
      else rangeOk = true;
    }
  }

  if (errors.length > 0 || !category || !rangeOk) return { ok: false, unsupported, errors };
  const r = range as Record<string, string>;
  return { ok: true, value: { category: category.id, range: { start: r.start, end: r.end } }, unsupported: false, errors: [] };
}

function unsupportedAnswer(input: unknown, catalog: QuestionCatalog): QuestionAnswer {
  const obj = isPlainObject(input) ? input : {};
  const r = obj.range;
  const range =
    isPlainObject(r) && typeof r.start === 'string' && typeof r.end === 'string' ? { start: r.start, end: r.end } : null;
  return {
    category: typeof obj.category === 'string' ? obj.category : '',
    range,
    ranking: [],
    top: [],
    unsupported: true,
    conventions: { ...catalog.conventions },
    catalogVersion: catalog.version,
  };
}

const bySignalStrength = (a: Signal, b: Signal) => b.intensity - a.intensity || cmp(a.id, b.id);

function scoreWindow(
  window: SignalWindow,
  raw: readonly Signal[],
  category: QuestionCategory,
  catalog: QuestionCatalog,
  opts: AnswerOptions,
): Omit<RankedWindow, 'rank'> {
  if (!Array.isArray(raw)) throw new Error(`answerQuestion: provider must return an array for ${window.start}`);

  // 1. de-duplicate by id (identical ids must describe the same signal), filter.
  const domainWeight = new Map<Domain, number>(category.domains.map((d) => [d.domain, d.weight]));
  const byId = new Map<string, Signal>();
  for (const s of raw) {
    const prev = byId.get(s.id);
    if (prev) {
      if (prev.intensity !== s.intensity || prev.valence !== s.valence || prev.domain !== s.domain || prev.trait !== s.trait) {
        throw new Error(`answerQuestion: provider returned conflicting signals with id ${s.id}`);
      }
      continue;
    }
    byId.set(s.id, s);
  }
  const filtered = [...byId.values()]
    .filter((s) => {
      if (!domainWeight.has(s.domain)) return false;
      const subset = category.ruleIds[s.system as SystemId];
      return !subset || subset.length === 0 || subset.includes(s.ruleId);
    })
    .sort((a, b) => cmp(a.id, b.id));

  // 2. re-stamp windows so each domain aggregates into one group for W.
  const stamped = filtered.map((s) => ({ ...s, window }));
  const supportive = new Set<Trait>(category.traitPreferences.supportive);
  const risky = new Set<Trait>(category.traitPreferences.risky);
  const agg = opts.aggregate ?? {};
  const byDomain = (list: Signal[]) => new Map<Domain, DomainWindowAggregate>(aggregateSignals(list, agg).map((a) => [a.domain, a]));
  const all = byDomain(stamped);
  const sup = byDomain(stamped.filter((s) => supportive.has(s.trait)));
  const rsk = byDomain(stamped.filter((s) => risky.has(s.trait)));
  const wSys = (s: string) => agg.systemWeights?.[s as SystemId] ?? 1;

  const { activityWeight: a, supportWeight: sw, riskWeight: rw } = catalog.scoring;
  let wTotal = 0;
  let wScore = 0;
  let consensus = 0;
  let highConsensus = false;
  const conflicts: DomainConflict[] = [];
  const domainScores: DomainScore[] = category.domains.map(({ domain, weight }) => {
    const base = all.get(domain);
    wTotal += weight;
    if (!base) {
      return {
        domain, weight, score: 0, activity: 0, support: 0, risk: 0,
        consensus: 0, highConsensus: false, conflict: null, signalIds: [],
      };
    }
    const systems = Object.keys(base.perSystem);
    const denom = systems.reduce((acc, s) => acc + wSys(s), 0);
    const part = (m: Map<Domain, DomainWindowAggregate>) => {
      const x = m.get(domain);
      if (!x || denom <= 0) return 0;
      let n = 0;
      for (const [s, v] of Object.entries(x.perSystem)) n += wSys(s) * v!.score;
      return (100 * n) / denom;
    };
    const activity = base.score;
    const support = part(sup);
    const risk = part(rsk);
    const score = clamp100(a * activity + sw * support - rw * risk);
    wScore += weight * score;
    consensus = Math.max(consensus, base.consensus);
    highConsensus ||= base.highConsensus;
    if (base.conflict) conflicts.push({ domain, ...base.conflict });
    const signalIds = [...new Set(Object.values(base.perSystem).flatMap((v) => v!.signalIds))].sort(cmp);
    return {
      domain, weight,
      score: round4(score), activity: round4(activity), support: round4(support), risk: round4(risk),
      consensus: base.consensus, highConsensus: base.highConsensus, conflict: base.conflict, signalIds,
    };
  });

  const score = round4(wTotal > 0 ? wScore / wTotal : 0);
  return {
    window: { ...window },
    score,
    band: toBand(score, opts.bandCuts),
    domainScores,
    supportSignals: filtered.filter((s) => supportive.has(s.trait)).sort(bySignalStrength),
    riskSignals: filtered.filter((s) => risky.has(s.trait)).sort(bySignalStrength),
    signalIds: filtered.map((s) => s.id),
    consensus,
    highConsensus,
    conflict: conflicts.length > 0 ? conflicts : null,
  };
}

/**
 * Answer a question deterministically. Unknown category → `{ unsupported: true }`
 * with no ranking. Any other invalid request throws (the caller must validate).
 */
export function answerQuestion(
  request: QuestionRequest | unknown,
  provider: SignalProvider,
  opts: AnswerOptions = {},
): QuestionAnswer {
  const catalog = opts.catalog ?? QUESTION_CATALOG;
  const v = validateQuestionRequest(request, catalog);
  if (!v.ok) {
    if (v.unsupported) return unsupportedAnswer(request, catalog);
    throw new Error(`answerQuestion: invalid request: ${v.errors.join('; ')}`);
  }
  const category = getQuestionCategory(v.value.category, catalog)!;
  const topN = opts.topN ?? 3;
  if (!Number.isInteger(topN) || topN < 0) throw new Error(`answerQuestion: topN must be a non-negative integer`);

  const scored = monthWindows(v.value.range).map((w) => scoreWindow(w, provider({ ...w }), category, catalog, opts));
  const ranking: RankedWindow[] = scored
    .sort((x, y) => y.score - x.score || cmp(x.window.start, y.window.start))
    .map((r, i) => ({ ...r, rank: i + 1 }));

  return {
    category: category.id,
    range: v.value.range,
    ranking,
    top: ranking.slice(0, topN),
    conventions: { ...catalog.conventions },
    catalogVersion: catalog.version,
    categoryVersion: category.version,
  };
}
