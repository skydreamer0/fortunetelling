import { DOMAINS, GRAINS, SYSTEM_IDS, type Domain, type Signal, type SignalWindow, type SystemId } from './types';

export interface AggregateOptions {
  /** Per-system weight wₛ (data; default 1 for any system not listed). */
  systemWeights?: Partial<Record<SystemId, number>>;
  /** θ: a system counts toward consensus when its noisy-OR score ≥ θ. Default 0.5. */
  consensusThreshold?: number;
  /** τ: conflict when one system valence > τ and another < −τ. Default 0.2. */
  conflictThreshold?: number;
}

export interface SystemAggregate {
  /** Noisy-OR 1 − Π(1 − intensityᵢ), 0–1. */
  score: number;
  /** Intensity-weighted mean valence, −1–1 (0 when total intensity is 0). */
  valence: number;
  /** Sorted, de-duplicated. */
  signalIds: string[];
}

export interface SignalConflict {
  /** Positive-valence signals from systems whose valence > τ (sorted). */
  positive: string[];
  /** Negative-valence signals from systems whose valence < −τ (sorted). */
  negative: string[];
}

export interface DomainWindowAggregate {
  domain: Domain;
  window: SignalWindow;
  /** Cross-system weighted score, 0–100. */
  score: number;
  perSystem: Partial<Record<SystemId, SystemAggregate>>;
  /** Number of systems whose score ≥ θ. */
  consensus: number;
  highConsensus: boolean;
  conflict: SignalConflict | null;
}

export const DEFAULT_CONSENSUS_THRESHOLD = 0.5;
export const DEFAULT_CONFLICT_THRESHOLD = 0.2;
export const HIGH_CONSENSUS_MIN_SYSTEMS = 3;

const SEP = '\u0000';
const windowKey = (w: SignalWindow) => `${w.grain}${SEP}${w.start}${SEP}${w.end}`;
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * §6.1: per (domain, window) — noisy-OR within a system, weighted mean across
 * systems, consensus count, and explicit conflict (never averaged away, D-023).
 * Pure and input-order independent. Output sorted by DOMAINS order, then window
 * start, grain, end.
 */
export function aggregateSignals(
  signals: readonly Signal[],
  options: AggregateOptions = {},
): DomainWindowAggregate[] {
  const theta = options.consensusThreshold ?? DEFAULT_CONSENSUS_THRESHOLD;
  const tau = options.conflictThreshold ?? DEFAULT_CONFLICT_THRESHOLD;
  const weightOf = (s: SystemId) => options.systemWeights?.[s] ?? 1;

  type Group = { domain: Domain; window: SignalWindow; bySystem: Map<SystemId, Signal[]> };
  const groups = new Map<string, Group>();
  for (const sig of signals) {
    const key = `${sig.domain}${SEP}${windowKey(sig.window)}`;
    let g = groups.get(key);
    if (!g) {
      const { grain, start, end } = sig.window;
      g = { domain: sig.domain, window: { grain, start, end }, bySystem: new Map() };
      groups.set(key, g);
    }
    const list = g.bySystem.get(sig.system);
    if (list) list.push(sig);
    else g.bySystem.set(sig.system, [sig]);
  }

  const out: DomainWindowAggregate[] = [];
  for (const g of groups.values()) {
    const perSystem: Partial<Record<SystemId, SystemAggregate>> = {};
    let wSum = 0;
    let wScore = 0;
    let consensus = 0;
    const posSystems: SystemId[] = [];
    const negSystems: SystemId[] = [];

    for (const system of SYSTEM_IDS) {
      const raw = g.bySystem.get(system);
      if (!raw) continue;
      // Sort so floating-point accumulation order does not depend on input order.
      const sigs = [...raw].sort(
        (a, b) => cmp(a.id, b.id) || a.intensity - b.intensity || a.valence - b.valence,
      );
      let miss = 1;
      let iSum = 0;
      let ivSum = 0;
      for (const s of sigs) {
        miss *= 1 - s.intensity;
        iSum += s.intensity;
        ivSum += s.intensity * s.valence;
      }
      const score = 1 - miss;
      const valence = iSum > 0 ? ivSum / iSum : 0;
      perSystem[system] = { score, valence, signalIds: [...new Set(sigs.map((s) => s.id))] };

      const w = weightOf(system);
      wSum += w;
      wScore += w * score;
      if (score >= theta) consensus++;
      if (valence > tau) posSystems.push(system);
      else if (valence < -tau) negSystems.push(system);
    }

    let conflict: SignalConflict | null = null;
    if (posSystems.length > 0 && negSystems.length > 0) {
      const collect = (systems: SystemId[], sign: 1 | -1) => {
        const ids = systems.flatMap((s) =>
          g.bySystem
            .get(s)!
            .filter((x) => Math.sign(x.valence) === sign)
            .map((x) => x.id),
        );
        return [...new Set(ids)].sort(cmp);
      };
      conflict = { positive: collect(posSystems, 1), negative: collect(negSystems, -1) };
    }

    out.push({
      domain: g.domain,
      window: g.window,
      score: wSum > 0 ? (100 * wScore) / wSum : 0,
      perSystem,
      consensus,
      highConsensus: consensus >= HIGH_CONSENSUS_MIN_SYSTEMS,
      conflict,
    });
  }

  return out.sort(
    (a, b) =>
      DOMAINS.indexOf(a.domain) - DOMAINS.indexOf(b.domain) ||
      cmp(a.window.start, b.window.start) ||
      GRAINS.indexOf(a.window.grain) - GRAINS.indexOf(b.window.grain) ||
      cmp(a.window.end, b.window.end),
  );
}
