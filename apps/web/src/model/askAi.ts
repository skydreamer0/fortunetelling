/**
 * 問 AI (D-035, V5-05): map a free-text question to a Question Engine category by
 * KEYWORDS ONLY (no AI), derive a month range, and run the deterministic
 * `answerQuestion` locally so the copy-paste prompt can carry the site's ranking.
 *
 * The SignalProvider is the same timeline layer the report uses: month cells of
 * `buildTimeline` (one call per calendar year in the range, every signal kept).
 */

import {
  answerQuestion, buildTimeline, buildTimelineCooperatively, TimelineEnvironmentChangedError, getQuestionCategory, resolveSignalId,
  evidenceMatchesContext, type DirectionalEvidence,
  type CoreSignal, type QuestionAnswer, type QuestionRange, type SignalWindow, type TimeContext,
} from '../lib/core';
import type { Report } from './types';
import { reportTimelineOptions } from './reportTimeline';
import { yieldToBrowser } from './yieldToBrowser';

/** Keyword → category. First category with a hit wins only if no other category also hits. */
export const QUESTION_KEYWORDS: ReadonlyArray<{ category: string; keywords: readonly string[] }> = [
  { category: 'vehicle_purchase', keywords: ['買車', '換車', '購車', '買新車', '汽車', '機車', '車子'] },
  { category: 'job_change', keywords: ['換工作', '轉職', '跳槽', '離職', '找工作', '新工作', '換跑道'] },
  { category: 'relationship_timing', keywords: ['感情', '戀愛', '對象', '告白', '結婚', '桃花', '交往', '伴侶', '脫單'] },
  { category: 'startup_timing', keywords: ['創業', '開店', '開公司', '成立公司', '自己當老闆'] },
  { category: 'property_purchase', keywords: ['買房', '購屋', '換房', '買屋', '房子', '房產'] },
  { category: 'relocation', keywords: ['搬家', '遷居', '搬到', '移居', '定居', '搬去'] },
  { category: 'study_exam', keywords: ['考試', '進修', '證照', '研究所', '升學', '讀書', '考研'] },
  { category: 'investment', keywords: ['投資', '進場', '股票', '理財', '基金', '加密貨幣'] },
];

/** The single category whose keywords appear in `text`, or null (none, or more than one). */
export function matchQuestionCategory(text: string): string | null {
  const hits = QUESTION_KEYWORDS.filter(entry => entry.keywords.some(keyword => text.includes(keyword)));
  return hits.length === 1 ? hits[0].category : null;
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymOf = (index: number) => `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
const indexOf = (year: number, month: number) => year * 12 + (month - 1);
const MAX_MONTHS = 36;

/**
 * Month range from the text, relative to `asOf` ('YYYY-MM-DD'); never before the asOf month.
 *   years named (2026、2027…) → first named year … last named year (cut at 36 months);
 *   今年 / 明年 / 後年 → those calendar years; 兩年 / 三年 → 24 / 36 months;
 *   otherwise → the next 12 months starting with the asOf month.
 */
export function questionRange(text: string, asOf: string): QuestionRange {
  const asOfYear = Number(asOf.slice(0, 4));
  const now = indexOf(asOfYear, Number(asOf.slice(5, 7)));
  const years = [...text.matchAll(/(20\d{2}|19\d{2})\s*年?/g)].map(m => Number(m[1]));
  if (/今年/.test(text)) years.push(asOfYear);
  if (/明年/.test(text)) years.push(asOfYear + 1);
  if (/後年/.test(text)) years.push(asOfYear + 2);

  let start = now;
  let end = now + 11;
  if (years.length > 0) {
    start = Math.max(now, indexOf(Math.min(...years), 1));
    end = indexOf(Math.max(...years), 12);
    if (end < start) { start = now; end = now + 11; }
  } else if (/(兩|二|2)\s*年/.test(text)) {
    end = now + 23;
  } else if (/(三|3)\s*年/.test(text)) {
    end = now + 35;
  }
  end = Math.min(end, start + MAX_MONTHS - 1);
  return { start: ymOf(start), end: ymOf(end) };
}

/** Month signals from the timeline layer, one `buildTimeline` per calendar year (cached). */
export function monthSignalProvider(report: Report): ((window: SignalWindow) => CoreSignal[]) | null {
  const monthsOf = monthSignalsByYear(report);
  if (!monthsOf) return null;
  return window => monthsOf(Number(window.start.slice(0, 4))).get(window.start.slice(0, 7)) ?? [];
}

type MonthSignalsDraft = { months: Map<string, CoreSignal[]>; proofs: DirectionalEvidence[] };
type MonthSignalsSource = ((year: number) => Map<string, CoreSignal[]>) & {
  stage(year: number, signal: AbortSignal, yieldTask: () => Promise<void>): Promise<MonthSignalsDraft>;
  commit(year: number, draft: MonthSignalsDraft): void;
  directionalEvidence(): DirectionalEvidence[];
};
function monthSignalsByYear(report: Report): MonthSignalsSource | null {
  const ctx = report.timeContext as unknown as TimeContext | null | undefined;
  const options = reportTimelineOptions(report);
  if (!ctx || !options) return null;
  const asOfYear = Number(report.asOf.slice(0, 4));
  const byYear = new Map<number, MonthSignalsDraft>();
  const proofs: DirectionalEvidence[] = [];
  const timelineOptions = (year: number) => ({
    asOf: year === asOfYear ? report.asOf : `${year}-01-01`,
    years: 1, includeMonths: true, topSignalsPerDomain: Infinity, ...options,
  });
  const project = (tl: ReturnType<typeof buildTimeline>): MonthSignalsDraft => {
      const months = new Map<string, CoreSignal[]>(), stagedProofs: DirectionalEvidence[] = [];
      for (const cell of tl.months) {
        const byId = new Map<string, CoreSignal>();
        for (const domain of cell.domains) for (const signal of domain.topSignals) byId.set(signal.id, signal);
        months.set(cell.window.start.slice(0, 7), [...byId.values()]);
        if (options.consensusThreshold !== undefined && options.conflictThreshold !== undefined) {
          for (const domain of cell.domains) if (evidenceMatchesContext(domain.directionalEvidence, {
            domain: domain.domain, window: cell.window, thresholds: tl.thresholds, systems: tl.systems,
            systemWeights: tl.systemWeights, perSystem: domain.perSystem,
          })) stagedProofs.push(domain.directionalEvidence);
        }
      }
      return { months, proofs: stagedProofs };
  };
  const commit = (year: number, draft: MonthSignalsDraft) => {
    if (byYear.has(year)) return;
    byYear.set(year, draft);
    proofs.push(...draft.proofs);
  };
  const read = (year: number) => {
    let draft = byYear.get(year);
    if (!draft) {
      draft = project(buildTimeline(ctx, timelineOptions(year)));
      commit(year, draft);
    }
    return draft.months;
  };
  const stage = async (year: number, signal: AbortSignal, yieldTask: () => Promise<void>) => {
    const cached = byYear.get(year);
    if (cached) return cached;
    const tl = await buildTimelineCooperatively(ctx, timelineOptions(year), { signal, yieldTask });
    signal.throwIfAborted();
    return project(tl); // No cache/proof publication here, including partial years.
  };
  return Object.assign(read, { stage, commit, directionalEvidence: () => proofs });
}

/** Same reach as the MCP server's `get_signal`: asOf year −5 … +10 (RESOLVABLE_YEARS in @fortune/mcp). */
const LOOKUP_YEARS = { before: 5, after: 10 } as const;

/**
 * id → signal for checking a pasted Claude answer (M4-03). Cheap sources first (the report's own
 * lists), then month signals year by year (~1 s per year, cached) so any id the MCP tools could
 * have returned resolves here too. An unknown id scans every year before it is reported missing.
 *
 * Accepts a full id or a short id / prefix (sig_ + ≥ 8 hex, any case): resolved with core's
 * `resolveSignalId`, so a prefix only counts when it is unique. A full 16-hex id stops scanning as
 * soon as it is found; a shorter prefix scans every year first (once, then cached), because a
 * not-yet-scanned year could hold a second signal with the same prefix. Ambiguous → null, never a guess.
 */
export type ReportSignalLookup = ((id: string) => CoreSignal | null) & {
  directionalEvidence(): DirectionalEvidence[];
  /** Prepare the same lookup in bounded units; publish only complete owned years. */
  prepare(ids: readonly string[], signal: AbortSignal, yieldTask?: () => Promise<void>): Promise<void>;
};
export function reportSignalLookup(report: Report): ReportSignalLookup {
  const known = new Map<string, CoreSignal>();
  const add = (signal: CoreSignal | null | undefined) => {
    if (signal && typeof signal.id === 'string') known.set(signal.id, signal);
  };
  if (Array.isArray(report.signals)) report.signals.forEach(add);
  for (const cell of [...(report.timeline?.years ?? []), ...(report.timeline?.months ?? [])]) {
    for (const domain of cell.domains) domain.topSignals.forEach(add);
  }
  const monthsOf = monthSignalsByYear(report);
  const proofs: DirectionalEvidence[] = [];
  if (report.timeline && report.timeline.schemaVersion >= 2) {
    const timeline = report.timeline;
    for (const cell of [...timeline.years, ...timeline.months]) for (const domain of cell.domains) {
      if (evidenceMatchesContext(domain.directionalEvidence, { domain: domain.domain, window: cell.window,
        thresholds: timeline.thresholds, systems: timeline.systems, systemWeights: timeline.systemWeights, perSystem: domain.perSystem,
      })) proofs.push(domain.directionalEvidence);
    }
  }
  const asOfYear = Number(report.asOf.slice(0, 4));
  let scanned = asOfYear - LOOKUP_YEARS.before - 1;
  const last = asOfYear + LOOKUP_YEARS.after;
  let active: AbortController | null = null;
  const supersede = () => {
    active?.abort(new DOMException('Citation preparation superseded', 'AbortError'));
    active = null;
  };
  const scanNext = () => {
    scanned += 1;
    try {
      for (const list of monthsOf!(scanned).values()) list.forEach(add);
    } catch {
      // a year the engine cannot build simply contributes no signals
    }
  };
  const lookup = (input: string) => {
    const wanted = input.trim().toLowerCase();
    const isFull = /^sig_[0-9a-f]{16}$/.test(wanted);
    // A full id that is already known needs no scan; anything shorter must see every year first.
    if (resolveSignalId(wanted, []).status === 'invalid') return null;
    if (monthsOf && scanned < last && !(isFull && known.has(wanted))) supersede();
    while (monthsOf && scanned < last && !(isFull && known.has(wanted))) scanNext();
    const found = resolveSignalId(wanted, known.keys());
    return found.status === 'exact' || found.status === 'unique' ? known.get(found.id) ?? null : null;
  };
  const prepare: ReportSignalLookup['prepare'] = async (ids, signal, yieldTask = yieldToBrowser) => {
    signal.throwIfAborted();
    supersede();
    const controller = new AbortController();
    active = controller;
    const abort = () => controller.abort(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    const currentSignal = controller.signal;
    try {
      const wanted = ids.map(id => id.trim().toLowerCase()).filter(id => resolveSignalId(id, []).status !== 'invalid');
      const needsScan = () => Boolean(monthsOf && scanned < last && wanted.some(id => !/^sig_[0-9a-f]{16}$/.test(id) || !known.has(id)));
      while (needsScan()) {
        currentSignal.throwIfAborted();
        const year = scanned + 1;
        let schedulerFailed = false;
        const yieldCurrent = async () => {
          currentSignal.throwIfAborted();
          try { await yieldTask(); } catch (error) { schedulerFailed = true; throw error; }
          currentSignal.throwIfAborted();
        };
        let draft: MonthSignalsDraft;
        try {
          draft = await monthsOf!.stage(year, currentSignal, yieldCurrent);
        } catch (error) {
          currentSignal.throwIfAborted(); // Actual abort state/reason, never error.name.
          if (schedulerFailed || error instanceof TimelineEnvironmentChangedError) throw error;
          // Preserve existing engine-error policy, but not cancellation/environment failures.
          scanned = year;
          continue;
        }
        currentSignal.throwIfAborted();
        // One non-yielding commit: partial work cannot poison cache, proofs or cursor.
        monthsOf!.commit(year, draft);
        for (const list of draft.months.values()) list.forEach(add);
        scanned = year;
      }
      currentSignal.throwIfAborted();
    } finally {
      signal.removeEventListener('abort', abort);
      if (active === controller) active = null;
    }
  };
  return Object.assign(lookup, { prepare, directionalEvidence: () => [...proofs, ...(monthsOf?.directionalEvidence() ?? [])] });
}

export interface LocalQuestion {
  category: string;
  categoryName: string;
  range: QuestionRange;
  /** Unavailable sources are explicitly insufficient_evidence, not evaluated zero scores. */
  answer: QuestionAnswer | null;
}

/** Keyword-mapped category + range + deterministic answer; null when no category matches. */
export function localQuestion(report: Report, text: string): LocalQuestion | null {
  const category = matchQuestionCategory(text);
  if (!category) return null;
  const range = questionRange(text, report.asOf);
  const categoryName = getQuestionCategory(category)?.name ?? category;
  const provider = monthSignalProvider(report);
  const options = reportTimelineOptions(report);
  let answer: QuestionAnswer | null = null;
  if (provider && options) {
    try {
      answer = answerQuestion({ category, range }, provider, { aggregate: {
        systemWeights: options.systemWeights, consensusThreshold: options.consensusThreshold, conflictThreshold: options.conflictThreshold,
      } });
      // Legacy metadata can replay scores, but cannot attest to a historical
      // directional policy/threshold. Do not backfill a new high-consensus claim.
      if (options.consensusThreshold === undefined || options.conflictThreshold === undefined) {
        for (const item of answer.ranking) {
          item.consensus = 0; item.highConsensus = false;
          for (const domain of item.domainScores) { domain.consensus = 0; domain.highConsensus = false; domain.directionalEvidence = null; }
        }
      }
    } catch {
      answer = null;
    }
  }
  if (!answer) {
    answer = answerQuestion({ category, range }, () => []);
    // The source was never successfully evaluated: do not expose synthetic zero-month diagnostics.
    answer.ranking = [];
    answer.abstentionReasons = [{ code: 'source_unavailable', message: '這份報告缺少可重放的月份資料，或月份計算未完成；不能把未取得的資料當成已評估的零分，不提供月份排名。' }];
  }
  return { category, categoryName, range, answer };
}
