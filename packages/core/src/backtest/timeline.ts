/**
 * Backtest timeline (V4-04): one Gregorian year cell per year of the person's
 * life, reduced to the numbers the backtest needs. Built with the regular
 * `buildTimeline` (same rules, windows and aggregation — ARCHITECTURE-V2 §7),
 * using its additive `fromYear` / `topSignalsPerDomain` options.
 *
 * @module backtest/timeline
 */

import { buildTimeline, TIMELINE_SYSTEMS, type SkippedSystem, type TimelineOptions } from '../timeline/buildTimeline';
import { DOMAINS, SYSTEM_IDS, type Domain, type SystemId } from '../signals/types';
import type { TimeContext } from '../time/types';

export const BACKTEST_TIMELINE_SCHEMA_VERSION = 1 as const;

/** Default first cell = birth year + 15 (events before adolescence are rare and hard to date). */
export const DEFAULT_BACKTEST_START_AGE = 15;

/** buildTimeline accepts ≤ 50 year cells per call; longer ranges are built in chunks. */
const CHUNK_YEARS = 50;

export interface BacktestDomainScores {
  /** Cross-system timeline score, 0–100 (identical to `TimelineDomainCell.score`). */
  score: number;
  /** Per-system noisy-OR score, 0–100 (2 decimals). Only systems that emitted signals. */
  perSystem: Partial<Record<SystemId, number>>;
  /** Per-rule noisy-OR of that rule's signal intensities in this cell, 0–100 (2 decimals). */
  perRule: Record<string, number>;
}

export interface BacktestYearCell {
  year: number;
  domains: Record<Domain, BacktestDomainScores>;
}

export interface BacktestTimeline {
  schemaVersion: typeof BACKTEST_TIMELINE_SCHEMA_VERSION;
  asOf: string;
  fromYear: number;
  toYear: number;
  systems: SystemId[];
  skippedSystems: SkippedSystem[];
  systemWeights: Partial<Record<SystemId, number>>;
  /** Every rule id seen anywhere in the range, sorted. */
  ruleIds: string[];
  /** One cell per year, fromYear … toYear. */
  cells: BacktestYearCell[];
}

export interface BacktestTimelineOptions {
  /** 'YYYY-MM-DD' (required, D-014). */
  asOf: string;
  /** Default: birth year + 15. */
  fromYear?: number;
  /** Default: asOf year (inclusive). */
  toYear?: number;
  systems?: readonly SystemId[];
  systemWeights?: TimelineOptions['systemWeights'];
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Build year cells across the person's life. SYNC like `buildTimeline`:
 * jyotish / humanDesign are included only if the ephemeris is initialised.
 */
export function buildBacktestTimeline(ctx: TimeContext, opts: BacktestTimelineOptions): BacktestTimeline {
  const asOf = opts?.asOf;
  if (typeof asOf !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    throw new Error(`buildBacktestTimeline: asOf must be 'YYYY-MM-DD', got ${JSON.stringify(asOf)}`);
  }
  const birthYear = Number(String(ctx.profile.date).slice(0, 4));
  const fromYear = opts.fromYear ?? birthYear + DEFAULT_BACKTEST_START_AGE;
  const toYear = opts.toYear ?? Number(asOf.slice(0, 4));
  if (!Number.isInteger(fromYear) || !Number.isInteger(toYear) || fromYear > toYear) {
    throw new Error(`buildBacktestTimeline: need integer fromYear ≤ toYear, got ${fromYear}..${toYear}`);
  }
  if (fromYear < birthYear) throw new Error(`buildBacktestTimeline: fromYear ${fromYear} is before the birth year ${birthYear}`);

  const cells: BacktestYearCell[] = [];
  const ruleIds = new Set<string>();
  let meta: Pick<BacktestTimeline, 'systems' | 'skippedSystems' | 'systemWeights'> | null = null;

  for (let start = fromYear; start <= toYear; start += CHUNK_YEARS) {
    const years = Math.min(CHUNK_YEARS, toYear - start + 1);
    const tl = buildTimeline(ctx, {
      asOf,
      fromYear: start,
      years,
      includeMonths: false,
      topSignalsPerDomain: Infinity,
      systems: opts.systems ?? TIMELINE_SYSTEMS,
      ...(opts.systemWeights ? { systemWeights: opts.systemWeights } : {}),
    });
    meta ??= { systems: tl.systems, skippedSystems: tl.skippedSystems, systemWeights: tl.systemWeights };
    for (const cell of tl.years) {
      const domains = {} as Record<Domain, BacktestDomainScores>;
      for (const d of cell.domains) {
        const perSystem: Partial<Record<SystemId, number>> = {};
        for (const s of SYSTEM_IDS) {
          const p = d.perSystem[s];
          if (p) perSystem[s] = round2(p.score * 100);
        }
        const miss = new Map<string, number>();
        for (const sig of d.topSignals) {
          ruleIds.add(sig.ruleId);
          miss.set(sig.ruleId, (miss.get(sig.ruleId) ?? 1) * (1 - sig.intensity));
        }
        const perRule: Record<string, number> = {};
        for (const id of [...miss.keys()].sort()) perRule[id] = round2((1 - miss.get(id)!) * 100);
        domains[d.domain] = { score: d.score, perSystem, perRule };
      }
      for (const d of DOMAINS) domains[d] ??= { score: 0, perSystem: {}, perRule: {} };
      cells.push({ year: Number(cell.window.start.slice(0, 4)), domains });
    }
  }

  return {
    schemaVersion: BACKTEST_TIMELINE_SCHEMA_VERSION,
    asOf,
    fromYear,
    toYear,
    systems: meta!.systems,
    skippedSystems: meta!.skippedSystems,
    systemWeights: meta!.systemWeights,
    ruleIds: [...ruleIds].sort(),
    cells,
  };
}
