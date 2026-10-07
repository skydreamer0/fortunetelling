/** Pure agreement provenance and citation checks; no calculators or wall clock. */
import { DOMAINS, GRAINS, SYSTEM_IDS, type Domain, type SignalWindow, type SystemId } from './types';
import { EXPERIMENTAL_SYSTEMS } from './eligibility';

export const DIRECTIONAL_POLICY = 'nonexperimental-directional-v1' as const;
export const DEFAULT_CONSENSUS_THRESHOLD = 0.5;
export const DEFAULT_CONFLICT_THRESHOLD = 0.2;
export const HIGH_CONSENSUS_MIN_SYSTEMS = 3;
export interface AgreementThresholds { theta: number; tau: number }
export interface DirectionalEvidence {
  policy: typeof DIRECTIONAL_POLICY;
  domain: Domain;
  /** Evaluated window. Question providers may supply overlapping native windows. */
  window: SignalWindow;
  thresholds: AgreementThresholds;
  /** Unrounded aggregate values, before display rounding or top-N truncation. */
  perSystem: Partial<Record<SystemId, { score: number; valence: number; weight: number; signalIds: string[] }>>;
}
export interface AgreementSide { systems: SystemId[]; signalIds: string[] }
export interface DirectionalVotes {
  evidence: DirectionalEvidence;
  activity: AgreementSide;
  positive: AgreementSide;
  negative: AgreementSide;
}
export interface AgreementCitation {
  id: string;
  system: string;
  domain?: string;
  window?: SignalWindow;
  valence?: number;
}

const record = (value: unknown): value is Record<string, any> => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const numberIn = (value: unknown, low: number, high: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high;
const validWindow = (value: unknown): value is SignalWindow => record(value) &&
  (GRAINS as readonly string[]).includes(value.grain) && typeof value.start === 'string' && typeof value.end === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value.start) && /^\d{4}-\d{2}-\d{2}$/.test(value.end) && value.start <= value.end;
export function validAgreementThresholds(value: unknown): value is AgreementThresholds {
  return record(value) && numberIn(value.theta, 0, 1) && numberIn(value.tau, 0, 1);
}
export function resolveAgreementThresholds(options: { consensusThreshold?: number; conflictThreshold?: number } = {}): AgreementThresholds {
  const theta = options.consensusThreshold === undefined ? DEFAULT_CONSENSUS_THRESHOLD : options.consensusThreshold;
  const tau = options.conflictThreshold === undefined ? DEFAULT_CONFLICT_THRESHOLD : options.conflictThreshold;
  if (!numberIn(theta, 0, 1)) throw new Error('aggregateSignals: consensusThreshold must be a finite number in [0, 1]');
  if (!numberIn(tau, 0, 1)) throw new Error('aggregateSignals: conflictThreshold must be a finite number in [0, 1]');
  return { theta, tau };
}

/** Malformed/legacy evidence cannot authorize a directional claim. */
export function directionalVotes(value: unknown): DirectionalVotes | null {
  if (!record(value)) return null;
  const { policy, domain, window: rawWindow, thresholds: rawThresholds, perSystem: rawSystems } = value;
  if (!record(rawWindow) || !record(rawThresholds)) return null;
  const window = { grain: rawWindow.grain, start: rawWindow.start, end: rawWindow.end };
  const thresholds = { theta: rawThresholds.theta, tau: rawThresholds.tau };
  if (policy !== DIRECTIONAL_POLICY || !(DOMAINS as readonly string[]).includes(domain) ||
      !validWindow(window) || !validAgreementThresholds(thresholds) || !record(rawSystems)) return null;
  const perSystem: DirectionalEvidence['perSystem'] = Object.create(null);
  const allIds = new Set<string>();
  for (const [system, data] of Object.entries(rawSystems)) {
    if (!(SYSTEM_IDS as readonly string[]).includes(system) || !record(data)) return null;
    const { score, valence, weight, signalIds: rawIds } = data;
    if (!numberIn(score, 0, 1) || !numberIn(valence, -1, 1) || !numberIn(weight, 0, Number.MAX_VALUE) ||
        !Array.isArray(rawIds) || rawIds.length === 0) return null;
    const signalIds: string[] = [];
    for (const id of rawIds) {
      if (typeof id !== 'string' || id.length === 0 || allIds.has(id)) return null;
      allIds.add(id);
      signalIds.push(id);
    }
    perSystem[system as SystemId] = { score, valence, weight, signalIds };
  }
  const proof: DirectionalEvidence = { policy, domain, window, thresholds, perSystem };
  const result: DirectionalVotes = {
    evidence: proof,
    activity: { systems: [], signalIds: [] }, positive: { systems: [], signalIds: [] }, negative: { systems: [], signalIds: [] },
  };
  const add = (side: AgreementSide, system: SystemId, ids: string[]) => { side.systems.push(system); side.signalIds.push(...ids); };
  for (const system of SYSTEM_IDS) {
    const data = perSystem[system];
    if (!data || data.weight <= 0 || data.score < thresholds.theta) continue;
    add(result.activity, system, data.signalIds);
    if (EXPERIMENTAL_SYSTEMS.includes(system)) continue;
    if (data.valence > thresholds.tau) add(result.positive, system, data.signalIds);
    else if (data.valence < -thresholds.tau) add(result.negative, system, data.signalIds);
  }
  for (const side of [result.activity, result.positive, result.negative]) side.signalIds.sort();
  return result;
}

export function evidenceMatchesContext(value: unknown, context: {
  domain: string; window: SignalWindow; thresholds: AgreementThresholds | null;
  systemWeights?: Partial<Record<SystemId, number>>;
  systems?: readonly string[];
  perSystem?: Partial<Record<SystemId, { signalIds: readonly string[] }>>;
  signalIds?: readonly string[];
}): value is DirectionalEvidence {
  const votes = directionalVotes(value);
  if (!votes || !validAgreementThresholds(context.thresholds)) return false;
  const proof = votes.evidence;
  if (proof.domain !== context.domain || proof.window.grain !== context.window.grain ||
      proof.window.start !== context.window.start || proof.window.end !== context.window.end ||
      proof.thresholds.theta !== context.thresholds.theta || proof.thresholds.tau !== context.thresholds.tau) return false;
  if (context.systemWeights) for (const [system, data] of Object.entries(proof.perSystem)) {
    if (!Object.prototype.hasOwnProperty.call(context.systemWeights, system) || data!.weight !== context.systemWeights[system as SystemId]) return false;
  }
  if (context.systems && Object.keys(proof.perSystem).some(system => !context.systems!.includes(system))) return false;
  if (context.perSystem) {
    if (Object.keys(context.perSystem).length !== Object.keys(proof.perSystem).length) return false;
    for (const [system, data] of Object.entries(proof.perSystem)) {
      const source = context.perSystem[system as SystemId];
      if (!source || source.signalIds.length !== data!.signalIds.length || data!.signalIds.some(id => !source.signalIds.includes(id))) return false;
    }
  }
  if (context.signalIds) {
    const source = new Set(context.signalIds);
    const ids = Object.values(proof.perSystem).flatMap(data => data!.signalIds);
    if (ids.length !== source.size || ids.some(id => !source.has(id))) return false;
  }
  return true;
}

/** Never reaggregate only the cited subset. All three votes must come from one recorded side. */
export function supportsHighConsensusCitations(evidence: readonly unknown[], citations: readonly AgreementCitation[]): boolean {
  for (const item of evidence) {
    const votes = directionalVotes(item);
    if (!votes) continue;
    const proof = votes.evidence;
    for (const direction of ['positive', 'negative'] as const) {
      const side = votes[direction];
      if (side.systems.length < HIGH_CONSENSUS_MIN_SYSTEMS) continue;
      const supported = new Set<SystemId>();
      for (const signal of citations) {
        const system = signal.system as SystemId;
        if (!side.systems.includes(system) || !proof.perSystem[system]!.signalIds.includes(signal.id) ||
            signal.domain !== proof.domain || !validWindow(signal.window) ||
            signal.window.start > proof.window.end || signal.window.end < proof.window.start ||
            !numberIn(signal.valence, -1, 1) || (direction === 'positive' ? signal.valence <= 0 : signal.valence >= 0)) continue;
        supported.add(system);
      }
      if (supported.size >= HIGH_CONSENSUS_MIN_SYSTEMS) return true;
    }
  }
  return false;
}
