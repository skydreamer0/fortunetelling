/**
 * The only place the server calls core to compute. Everything is derived from one
 * `(profile file, asOf)` pair and cached by `(profileId, chartFingerprint, asOf)`; tools read
 * from {@link Analysis} and never recompute (ROADMAP principle 6: MCP only wraps core).
 */

import {
  buildConsensus,
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
};

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
    return { file, warnings, asOf, ctx, timeline, consensus: buildConsensus(timeline), signals };
  }
}
