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
  /**
   * 只在呼叫端指定 `AnswerOptions.systems` 時出現（不指定時輸出與舊版逐位元相同）。
   * 說明這次排名採計了哪些系統的訊號、排除了哪些。
   */
  systemFilter?: SystemFilterInfo;
}

/** 指定系統時的採計紀錄（皆依 SYSTEM_IDS 順序）。 */
export interface SystemFilterInfo {
  /** 呼叫端指定的系統（去重、依 SYSTEM_IDS 排序）。 */
  systemsRequested: SystemId[];
  /** 指定系統中，在範圍內任一月份實際提供過訊號者。 */
  systemsUsed: SystemId[];
  /** provider 有回傳訊號、但因不在指定清單而被排除的系統。 */
  systemsExcluded: SystemId[];
}

export interface AnswerOptions {
  catalog?: QuestionCatalog;
  /** Passed to aggregateSignals (system weights, θ, τ). */
  aggregate?: AggregateOptions;
  bandCuts?: BandCuts;
  /** Number of `top` entries, default 3. */
  topN?: number;
  /**
   * 只採計這些系統的訊號（在去重與領域過濾之前就丟掉其他系統的訊號，
   * 因此領域分數、共識、衝突都只從這些系統重算，等同 provider 只回傳這些系統）。
   * 省略 = 採計 provider 回傳的全部系統，且輸出不帶 `systemFilter`。
   */
  systems?: readonly SystemId[];
}

/** 敏感度比較中的一名：月份、分數、band。 */
export interface SensitivityEntry {
  /** 'YYYY-MM' */
  month: YearMonth;
  score: number;
  band: Band;
}

/** 同一問題、同一範圍，「含實驗性系統」與「僅已驗證系統」兩個排名的前 N 名比較。 */
export interface ExperimentalSensitivity {
  /** 含實驗性系統時採計的系統（依 SYSTEM_IDS 順序）。 */
  systemsAll: SystemId[];
  /** 排除實驗性系統後採計的系統。 */
  systemsVerifiedOnly: SystemId[];
  top3All: SensitivityEntry[];
  top3VerifiedOnly: SensitivityEntry[];
  /** 兩邊前 N 名的月份（含名次順序）不同即為 true；分數差異本身不算。 */
  changed: boolean;
}
