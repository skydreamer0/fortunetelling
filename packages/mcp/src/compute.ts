/**
 * The only place the server calls core to compute. Everything is derived from one
 * `(profile file, asOf)` pair and cached by the complete validated loaded source; tools read
 * from {@link Analysis} and never recompute (ROADMAP principle 6: MCP only wraps core).
 */

import {
  buildConsensus,
  buildTimeline,
  buildTimelineAsync,
  canonicalStringify,
  createTimeContext,
  evidenceMatchesContext,
  type DirectionalEvidence,
  type QuestionAnswer,
  type ConsensusSummary,
  type Signal,
  type TimeContext,
  type Timeline,
  type TimelineCell,
  type ProfileFileV1,
} from '@fortune/core';
import { ToolError } from './errors';
import { SignalIndex, type SignalResolution } from './signalIndex';
import type { ProfileStore } from './store';

export type { SignalResolution } from './signalIndex';

export type Analysis = {
  file: ProfileFileV1;
  warnings: string[];
  asOf: string;
  ctx: TimeContext;
  /** Every signal kept (`topSignalsPerDomain: Infinity`). */
  timeline: Timeline;
  consensus: ConsensusSummary;
  /** All signals of all cells, deduped by id, sorted by id. */
  signals: Signal[];
  /** The 12 month cells of one calendar year (core only builds months for asOf's year), one `buildTimeline` per year, cached. */
  monthCells(year: number): TimelineCell[];
  /** Month signals of one calendar year ('YYYY-MM' → signals), one `buildTimeline` per year, cached. */
  monthSignals(year: number): Map<string, Signal[]>;
  /** Any signal this analysis (or a question answer) can cite; accepts a full id or a >= 8-hex prefix. Undefined when none / ambiguous. */
  findSignal(id: string): Signal | undefined;
  /**
   * 完整編號或前綴解析。先查已知訊號（timeline + 已建過的年份）；命中（exact／唯一）就停，
   * 找不到或有歧義才由 asOf 年向外逐年擴大（每年只建一次 timeline，結果快取）。
   */
  resolveSignal(input: string): SignalResolution;
  /** 輸出用：縮成短編號（sig_ + 8 位）；與「已知訊號」碰撞的保留完整編號，確保輸出內每個編號都能唯一解析。 */
  shortIds(ids: readonly string[]): string[];
  /** Run-local evidence from this analysis, resolved month caches and Question Engine results. */
  directionalEvidence(): DirectionalEvidence[];
  rememberQuestionEvidence(answer: QuestionAnswer): void;
};

/**
 * Years (relative to asOf's year) whose month signals can be computed and therefore resolved by
 * `get_signal`. `answer_question` ranges must stay inside it so every cited id stays fetchable.
 */
export const RESOLVABLE_YEARS = Object.freeze({ before: 5, after: 10 });

export function resolvableYearRange(asOf: string): { min: number; max: number } {
  const year = Number(asOf.slice(0, 4));
  return { min: year - RESOLVABLE_YEARS.before, max: year + RESOLVABLE_YEARS.after };
}

const ASOF_RE = /^\d{4}-\d{2}-\d{2}$/;

export function assertAsOf(asOf: unknown): asserts asOf is string {
  if (typeof asOf !== 'string' || !ASOF_RE.test(asOf) || Number.isNaN(Date.parse(`${asOf}T00:00:00Z`))) {
    throw new ToolError('invalid_args', `asOf must be 'YYYY-MM-DD' (got ${JSON.stringify(asOf)})`);
  }
}

export class Analyzer {
  // One current generation per profile/asOf. cf1 is a portable chart fingerprint,
  // not complete calculation/source identity: it excludes name/label and rounds
  // coordinates. This private, in-process cache is not a cs1 or snapshot contract.
  private cache = new Map<string, { identity: string; pending: Promise<Analysis> }>();

  constructor(private store: ProfileStore) {}

  async get(profileId: string, asOf: string): Promise<Analysis> {
    assertAsOf(asOf);
    const { file, warnings } = await this.store.get(profileId);
    const key = canonicalStringify({ profileId: file.profileId, asOf });
    // Include exact profile values, all validated file metadata and the parser's
    // current warnings. Store validation remains before every cache lookup.
    // Use full canonical bytes, not a lossy fingerprint or collision-prone hash.
    const identity = canonicalStringify({ file, warnings, asOf });
    const cached = this.cache.get(key);
    if (cached?.identity === identity) return cached.pending;

    const pending = this.compute(file, warnings, asOf);
    const entry = { identity, pending };
    this.cache.set(key, entry);
    pending.catch(() => {
      // An older generation can reject after a newer source replaced its slot,
      // including A → B → A. Only the owning entry may evict itself.
      if (this.cache.get(key) === entry) this.cache.delete(key);
    });
    return pending;
  }

  private async compute(file: ProfileFileV1, warnings: string[], asOf: string): Promise<Analysis> {
    const ctx = createTimeContext(file.profile);
    const timeline = await buildTimelineAsync(ctx, { asOf, topSignalsPerDomain: Infinity });
    const byId = new Map<string, Signal>();
    for (const cell of [...timeline.years, ...timeline.months]) {
      for (const domain of cell.domains) for (const signal of domain.topSignals) byId.set(signal.id, signal);
    }
    const signals = [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const asOfYear = Number(asOf.slice(0, 4));
    const { min, max } = resolvableYearRange(asOf);
    const systems = timeline.systems;
    const cellsByYear = new Map<number, TimelineCell[]>();
    const monthCells = (year: number): TimelineCell[] => {
      let cells = cellsByYear.get(year);
      if (!cells) {
        cells = buildTimeline(ctx, {
          asOf: year === asOfYear ? asOf : `${year}-01-01`,
          years: 1,
          includeMonths: true,
          topSignalsPerDomain: Infinity,
          systems,
          systemWeights: timeline.systemWeights,
          consensusThreshold: timeline.thresholds.theta,
          conflictThreshold: timeline.thresholds.tau,
        }).months;
        cellsByYear.set(year, cells);
      }
      return cells;
    };
    const byYear = new Map<number, Map<string, Signal[]>>();
    const monthSignals = (year: number): Map<string, Signal[]> => {
      let months = byYear.get(year);
      if (!months) {
        months = new Map();
        for (const cell of monthCells(year)) {
          const cellSignals = new Map<string, Signal>();
          for (const domain of cell.domains) for (const signal of domain.topSignals) cellSignals.set(signal.id, signal);
          months.set(cell.window.start.slice(0, 7), [...cellSignals.values()]);
        }
        byYear.set(year, months);
      }
      return months;
    };
    // 已知訊號宇宙（見 signalIndex.ts）：timeline 全部訊號 + 每個已建過的年份的月訊號。
    const index = new SignalIndex(
      signals,
      { min, max, center: asOfYear },
      year => [...monthSignals(year).values()].flat(),
    );
    // 任何人取過某年的 monthSignals（例如 answer_question 的月訊號提供者），該年就併入宇宙，
    // 這樣輸出過的月份編號一定在碰撞檢查的範圍內。
    const trackedMonthSignals = (year: number) => {
      const months = monthSignals(year);
      index.absorbYear(year);
      return months;
    };
    const resolveSignal = (input: string): SignalResolution => index.resolve(input);
    const findSignal = (id: string): Signal | undefined => {
      const r = index.resolve(id);
      return r.status === 'exact' || r.status === 'unique' ? r.signal : undefined;
    };
    const shortIds = (ids: readonly string[]) => index.shortIds(ids);
    // Scoped to this Analysis generation, never keyed globally by signalId.
    const questionEvidence = new Map<string, DirectionalEvidence>();
    const rememberQuestionEvidence = (answer: QuestionAnswer) => {
      for (const item of answer.ranking) for (const domain of item.domainScores) {
        if (evidenceMatchesContext(domain.directionalEvidence, {
          domain: domain.domain, window: item.window, thresholds: answer.thresholds, signalIds: domain.signalIds,
        })) questionEvidence.set(canonicalStringify(domain.directionalEvidence), structuredClone(domain.directionalEvidence));
      }
    };
    const directionalEvidence = () => {
      const out = new Map(questionEvidence);
      for (const cell of [...timeline.years, ...timeline.months, ...[...cellsByYear.values()].flat()]) {
        for (const domain of cell.domains) if (evidenceMatchesContext(domain.directionalEvidence, {
          domain: domain.domain, window: cell.window, thresholds: timeline.thresholds,
          systems: timeline.systems, systemWeights: timeline.systemWeights, perSystem: domain.perSystem,
        })) out.set(canonicalStringify(domain.directionalEvidence), domain.directionalEvidence);
      }
      return [...out.values()];
    };
    return { file, warnings, asOf, ctx, timeline, consensus: buildConsensus(timeline), signals, monthCells,
      monthSignals: trackedMonthSignals, findSignal, resolveSignal, shortIds, directionalEvidence, rememberQuestionEvidence };
  }
}
