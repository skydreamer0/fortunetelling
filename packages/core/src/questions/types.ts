/**
 * Question Engine types (V5-01/V5-02, ARCHITECTURE-V2 §8).
 *
 * The AI layer (V5-03) will only ever produce a `QuestionRequest`; everything
 * after that is deterministic (D-021). Category data lives in `catalog.json`
 * (D-028) — no qualitative wording in code.
 */
import type { AggregateOptions, SignalConflict } from '../signals/aggregate';
import type { Band, BandCuts } from '../signals/bands';
import type { Domain, Grain, Signal, SignalWindow, SystemId, Trait } from '../signals/types';

/** 'YYYY-MM' (month 01–12). */
export type YearMonth = string;

export interface QuestionRange {
  start: YearMonth;
  end: YearMonth;
}

/** What the AI layer produces from natural language; validated strictly. */
export interface QuestionRequest {
  category: string;
  range: QuestionRange;
}

/** Both variants carry every field so callers can read them without narrowing (core is not `strict`). */
export type QuestionValidationResult =
  | { ok: true; value: QuestionRequest; unsupported: false; errors: [] }
  | { ok: false; value?: undefined; unsupported: boolean; errors: string[] };

/**
 * Injected signal source: all signals in effect for one window (e.g. rule
 * evaluators over each system's chart, or the timeline layer). Must be pure.
 */
export type SignalProvider = (window: SignalWindow) => Signal[];

// ─── catalog (data) ───────────────────────────────────────────────────────────

export interface CategoryDomain {
  domain: Domain;
  /** Relative weight (> 0) of this domain in the category score. */
  weight: number;
}

export interface TraitPreferences {
  /** Traits whose signals count toward `support` for this question. */
  supportive: Trait[];
  /** Traits whose signals count toward `risk` for this question. Disjoint from `supportive`. */
  risky: Trait[];
}

export interface QuestionCategory {
  id: string;
  version: number;
  /** 繁中 display name. */
  name: string;
  /** 繁中 sample phrasings (for the AI classifier and UI hints). */
  examples: string[];
  domains: CategoryDomain[];
  traitPreferences: TraitPreferences;
  /**
   * Per-system rule subset. A non-empty list keeps only those rule ids for
   * that system; an empty or missing list keeps every rule touching the domains.
   */
  ruleIds: Partial<Record<SystemId, string[]>>;
  defaultGrain: Extract<Grain, 'month'>;
  minMonths: number;
  maxMonths: number;
}

export interface ScoringCoefficients {
  activityWeight: number;
  supportWeight: number;
  riskWeight: number;
}

export interface QuestionCatalog {
  schemaVersion: number;
  version: number;
  conventions: Record<string, string>;
  scoring: ScoringCoefficients;
  defaults: { grain: 'month'; minMonths: number; maxMonths: number };
  categories: QuestionCategory[];
}

// ─── answer ───────────────────────────────────────────────────────────────────

export interface DomainConflict extends SignalConflict {
  domain: Domain;
}

export interface DomainScore {
  domain: Domain;
  /** Catalog weight of this domain. */
  weight: number;
  /** Final domain score 0–100 (see conventions.formula). */
  score: number;
  /** aggregateSignals score over all filtered signals, 0–100. */
  activity: number;
  /** Same aggregation over supportive-trait signals, 0–activity. */
  support: number;
  /** Same aggregation over risky-trait signals, 0–activity. */
  risk: number;
  consensus: number;
  highConsensus: boolean;
  conflict: SignalConflict | null;
  signalIds: string[];
}

export interface RankedWindow {
  window: SignalWindow;
  /** 1-based rank in `ranking`. */
  rank: number;
  /** 0–100, rounded to 4 decimals. */
  score: number;
  band: Band;
  domainScores: DomainScore[];
  /** Filtered signals with a supportive trait (source), sorted by intensity desc, then id. */
  supportSignals: Signal[];
  /** Filtered signals with a risky trait (source), sorted by intensity desc, then id. */
  riskSignals: Signal[];
  /** Every filtered signal id used for this window (sorted). */
  signalIds: string[];
  /** Max per-domain consensus (systems with score ≥ θ). */
  consensus: number;
  highConsensus: boolean;
  /** Per-domain conflicts, never averaged away (D-023); null when none. */
  conflict: DomainConflict[] | null;
}

export interface QuestionAnswer {
  category: string;
  range: QuestionRange | null;
  /** All months of the range, sorted by score desc then earlier window. Empty when unsupported. */
  ranking: RankedWindow[];
  /** First (up to) 3 entries of `ranking`. */
  top: RankedWindow[];
  unsupported?: true;
  conventions: Record<string, string>;
  catalogVersion: number;
  categoryVersion?: number;
}

export interface AnswerOptions {
  catalog?: QuestionCatalog;
  /** Passed to aggregateSignals (system weights, θ, τ). */
  aggregate?: AggregateOptions;
  bandCuts?: BandCuts;
  /** Number of `top` entries, default 3. */
  topN?: number;
}
