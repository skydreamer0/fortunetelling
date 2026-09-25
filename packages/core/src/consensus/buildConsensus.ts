/**
 * @fileoverview V3 cross-system consensus summary (ARCHITECTURE-V2 §6.1 step 3,
 * §11 v5; D-023, D-033, D-034).
 *
 * `buildConsensus(timeline)` re-reads what `aggregateSignals` already decided
 * per (domain, cell) — `consensus`, `highConsensus`, `conflict`, `perSystem` —
 * and lays it out for readers:
 *
 * - `years[]`: per year cell, the high-consensus domains (with the systems whose
 *   noisy-OR score ≥ θ and their signal ids) and the conflicted domains (both
 *   sides, each with its systems and signal ids);
 * - `headlines`: the strongest agreements (capped) and ALL conflicts (never
 *   dropped, D-023);
 * - `coverage`: per domain × cell, how many timeline systems could speak vs did
 *   speak — so the UI can say "only 1 of 3 systems" next to a score that, by
 *   D-033, averages only the systems that emitted signals.
 *
 * There is NO new scoring formula here (D-033): scores, consensus counts and
 * conflict sides are copied from the timeline. Pure and deterministic.
 *
 * @module consensus/buildConsensus
 */

import { DEFAULT_CONSENSUS_THRESHOLD, HIGH_CONSENSUS_MIN_SYSTEMS } from '../signals/aggregate';
import { DOMAINS, SYSTEM_IDS, type Domain, type SignalWindow, type SystemId } from '../signals/types';
import type { Timeline, TimelineCell, TimelineDomainCell } from '../timeline/buildTimeline';

export const CONSENSUS_SCHEMA_VERSION = 1 as const;

/** Default number of agreements kept in `headlines.agreements` (conflicts are never capped). */
export const DEFAULT_HEADLINE_AGREEMENTS = 5;

export interface ConsensusOptions {
  /**
   * θ used to list which systems reached the consensus threshold. Must match the
   * θ the timeline was built with (default DEFAULT_CONSENSUS_THRESHOLD = 0.5).
   */
  consensusThreshold?: number;
  /** Max agreements in `headlines.agreements` (default 5). */
  maxHeadlineAgreements?: number;
}

/** One side of a cross-system agreement or conflict. */
export interface ConsensusSide {
  /** SYSTEM_IDS order. */
  systems: SystemId[];
  /** Sorted, de-duplicated. */
  signalIds: string[];
}

/** A high-consensus (domain, year): ≥ 3 systems with noisy-OR score ≥ θ. */
export interface ConsensusAgreement extends ConsensusSide {
  domain: Domain;
  window: SignalWindow;
  /** Number of systems whose score ≥ θ (copied from the timeline cell). */
  consensus: number;
  /** Cross-system score 0–100 (copied from the timeline cell). */
  score: number;
}

/** A conflicted (domain, year): one system leans supportive, another under pressure. */
export interface ConsensusConflict {
  domain: Domain;
  window: SignalWindow;
  score: number;
  positive: ConsensusSide;
  negative: ConsensusSide;
}

export interface ConsensusYear {
  window: SignalWindow;
  /** DOMAINS order. */
  highConsensus: ConsensusAgreement[];
  /** DOMAINS order. */
  conflicts: ConsensusConflict[];
}

export interface CoverageDomain {
  domain: Domain;
  /** Timeline systems that could contribute (= timeline.systems.length). */
  available: number;
  /** Systems that emitted at least one signal for this domain in this cell. */
  speaking: number;
  /** SYSTEM_IDS order. */
  systems: SystemId[];
  /** available − speaking, SYSTEM_IDS order. */
  silent: SystemId[];
}

export interface CoverageCell {
  window: SignalWindow;
  /** DOMAINS order, every domain present. */
  domains: CoverageDomain[];
}

export interface ConsensusSummary {
  schemaVersion: typeof CONSENSUS_SCHEMA_VERSION;
  asOf: string;
  /** Systems that contributed to the timeline (SYSTEM_IDS order). */
  systems: SystemId[];
  consensusThreshold: number;
  highConsensusMinSystems: number;
  years: ConsensusYear[];
  headlines: {
    /** Sorted by consensus desc, score desc, DOMAINS order, year; capped. */
    agreements: ConsensusAgreement[];
    /** Every conflict of every year cell, by year then DOMAINS order. Never capped. */
    conflicts: ConsensusConflict[];
  };
  coverage: {
    years: CoverageCell[];
    months: CoverageCell[];
  };
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const copyWindow = (w: SignalWindow): SignalWindow => ({ grain: w.grain, start: w.start, end: w.end });
const bySystemOrder = (systems: Iterable<SystemId>) => {
  const set = new Set(systems);
  return SYSTEM_IDS.filter((s) => set.has(s));
};

function speakingSystems(cell: TimelineDomainCell): SystemId[] {
  return bySystemOrder(
    (Object.keys(cell.perSystem ?? {}) as SystemId[]).filter((s) => (cell.perSystem[s]?.signalIds?.length ?? 0) > 0),
  );
}

/** Systems that emitted any of `ids` in this cell (via perSystem.signalIds). */
function sideOf(cell: TimelineDomainCell, ids: readonly string[]): ConsensusSide {
  const wanted = new Set(ids);
  const systems: SystemId[] = [];
  for (const s of SYSTEM_IDS) {
    if (cell.perSystem?.[s]?.signalIds?.some((id) => wanted.has(id))) systems.push(s);
  }
  return { systems, signalIds: [...wanted].sort(cmp) };
}

function agreementOf(cell: TimelineDomainCell, window: SignalWindow, theta: number): ConsensusAgreement {
  const systems = SYSTEM_IDS.filter((s) => {
    const p = cell.perSystem?.[s];
    return p !== undefined && p.score >= theta;
  });
  const ids = new Set(systems.flatMap((s) => cell.perSystem[s]!.signalIds));
  return {
    domain: cell.domain,
    window: copyWindow(window),
    consensus: cell.consensus,
    score: cell.score,
    systems,
    signalIds: [...ids].sort(cmp),
  };
}

function conflictOf(cell: TimelineDomainCell, window: SignalWindow): ConsensusConflict {
  return {
    domain: cell.domain,
    window: copyWindow(window),
    score: cell.score,
    positive: sideOf(cell, cell.conflict!.positive),
    negative: sideOf(cell, cell.conflict!.negative),
  };
}

const domainIndex = (d: Domain) => DOMAINS.indexOf(d);
const byDomain = <T extends { domain: Domain }>(list: T[]) => list.sort((a, b) => domainIndex(a.domain) - domainIndex(b.domain));

function coverageOf(cells: readonly TimelineCell[], available: readonly SystemId[]): CoverageCell[] {
  return cells.map((cell) => ({
    window: copyWindow(cell.window),
    domains: DOMAINS.map((domain): CoverageDomain => {
      const found = cell.domains.find((d) => d.domain === domain);
      const systems = found ? speakingSystems(found) : [];
      return {
        domain,
        available: available.length,
        speaking: systems.length,
        systems,
        silent: available.filter((s) => !systems.includes(s)),
      };
    }),
  }));
}

/**
 * Cross-system consensus summary of a timeline (see module doc). Output depends
 * only on (timeline, options): same input → byte-identical JSON.
 */
export function buildConsensus(timeline: Timeline, options: ConsensusOptions = {}): ConsensusSummary {
  const theta = options.consensusThreshold ?? DEFAULT_CONSENSUS_THRESHOLD;
  const maxAgreements = options.maxHeadlineAgreements ?? DEFAULT_HEADLINE_AGREEMENTS;
  if (!Number.isInteger(maxAgreements) || maxAgreements < 0) {
    throw new Error(`buildConsensus: maxHeadlineAgreements must be an integer ≥ 0, got ${maxAgreements}`);
  }
  const systems = bySystemOrder(timeline.systems ?? []);

  const years: ConsensusYear[] = (timeline.years ?? []).map((cell) => {
    const highConsensus: ConsensusAgreement[] = [];
    const conflicts: ConsensusConflict[] = [];
    for (const d of cell.domains) {
      if (d.highConsensus) highConsensus.push(agreementOf(d, cell.window, theta));
      if (d.conflict) conflicts.push(conflictOf(d, cell.window));
    }
    return { window: copyWindow(cell.window), highConsensus: byDomain(highConsensus), conflicts: byDomain(conflicts) };
  });

  const agreements = years
    .flatMap((y) => y.highConsensus)
    .sort(
      (a, b) =>
        b.consensus - a.consensus ||
        b.score - a.score ||
        domainIndex(a.domain) - domainIndex(b.domain) ||
        cmp(a.window.start, b.window.start),
    )
    .slice(0, maxAgreements);
  // Years are already chronological and each year's conflicts in DOMAINS order.
  const conflicts = years.flatMap((y) => y.conflicts);

  const coverage = {
    years: coverageOf(timeline.years ?? [], systems),
    months: coverageOf(timeline.months ?? [], systems),
  };

  return {
    schemaVersion: CONSENSUS_SCHEMA_VERSION,
    asOf: timeline.asOf,
    systems,
    consensusThreshold: theta,
    highConsensusMinSystems: HIGH_CONSENSUS_MIN_SYSTEMS,
    years,
    headlines: { agreements, conflicts },
    coverage,
  };
}
