/**
 * The only place the server calls core to compute. Everything is derived from one
 * `(profile file, asOf)` pair and cached by `(profileId, chartFingerprint, asOf)`; tools read
 * from {@link Analysis} and never recompute (ROADMAP principle 6: MCP only wraps core).
 */

import {
  buildConsensus,
  buildTimeline,
  buildTimelineAsync,
  createTimeContext,
  type ConsensusSummary,
  type Signal,
  type TimeContext,
  type Timeline,
  type ProfileFileV1,
} from '@fortune/core';
import { ToolError } from './errors';
import type { ProfileStore } from './store';

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
  /** Month signals of one calendar year ('YYYY-MM' → signals), one `buildTimeline` per year, cached. */
  monthSignals(year: number): Map<string, Signal[]>;
  /** Any signal this analysis (or a question answer) can cite; looks through the resolvable years. */
  findSignal(id: string): Signal | undefined;
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
  private cache = new Map<string, Promise<Analysis>>();

  constructor(private store: ProfileStore) {}

  async get(profileId: string, asOf: string): Promise<Analysis> {
    assertAsOf(asOf);
    const { file, warnings } = await this.store.get(profileId);
    const key = `${file.profileId}|${file.chartFingerprint}|${asOf}`;
    let pending = this.cache.get(key);
    if (!pending) {
      pending = this.compute(file, warnings, asOf);
      this.cache.set(key, pending);
      pending.catch(() => this.cache.delete(key));
    }
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
    const byYear = new Map<number, Map<string, Signal[]>>();
    const monthSignals = (year: number): Map<string, Signal[]> => {
      let months = byYear.get(year);
      if (!months) {
        const tl = buildTimeline(ctx, {
          asOf: year === asOfYear ? asOf : `${year}-01-01`,
          years: 1,
          includeMonths: true,
          topSignalsPerDomain: Infinity,
          systems,
        });
        months = new Map();
        for (const cell of tl.months) {
          const cellSignals = new Map<string, Signal>();
          for (const domain of cell.domains) for (const signal of domain.topSignals) cellSignals.set(signal.id, signal);
          months.set(cell.window.start.slice(0, 7), [...cellSignals.values()]);
        }
        byYear.set(year, months);
      }
      return months;
    };
    const timelineIndex = new Map(signals.map(signal => [signal.id, signal]));
    const findSignal = (id: string): Signal | undefined => {
      const direct = timelineIndex.get(id);
      if (direct) return direct;
      for (let year = min; year <= max; year++) {
        for (const list of monthSignals(year).values()) {
          const hit = list.find(signal => signal.id === id);
          if (hit) return hit;
        }
      }
      return undefined;
    };
    return { file, warnings, asOf, ctx, timeline, consensus: buildConsensus(timeline), signals, monthSignals, findSignal };
  }
}
