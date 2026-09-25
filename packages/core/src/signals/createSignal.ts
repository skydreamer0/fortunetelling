import { signalId } from './signalId';
import {
  DOMAINS,
  GRAINS,
  SYSTEM_IDS,
  TRAITS,
  type Domain,
  type Modifier,
  type Signal,
  type SignalWindow,
  type SystemId,
  type Trait,
} from './types';

export interface CreateSignalParams {
  system: SystemId;
  ruleId: string;
  ruleVersion: number;
  domain: Domain;
  trait: Trait;
  intensity: number;
  valence: number;
  window: SignalWindow;
  /** Rule hit target; contributes to the id but is not stored on the Signal (§6 shape). */
  target?: string | null;
  evidence?: { componentIds?: string[]; text?: string; modifiers?: Modifier[] };
}

function fail(msg: string): never {
  throw new Error(`createSignal: ${msg}`);
}

function isMember<T extends string>(list: readonly T[], v: unknown): v is T {
  return typeof v === 'string' && (list as readonly string[]).includes(v);
}

/**
 * Validate params and build a Signal with its deterministic id.
 * Throws (never clamps silently) on: unknown system/domain/trait/grain, empty ruleId,
 * non-integer ruleVersion, intensity ∉ [0,1], valence ∉ [-1,1], NaN/Infinity, start > end.
 */
export function createSignal(params: CreateSignalParams): Signal {
  const { system, ruleId, ruleVersion, domain, trait, intensity, valence, window } = params;
  if (!isMember(SYSTEM_IDS, system)) fail(`unknown system ${JSON.stringify(system)}`);
  if (typeof ruleId !== 'string' || ruleId.length === 0) fail('ruleId must be a non-empty string');
  if (!Number.isInteger(ruleVersion) || ruleVersion < 0) {
    fail(`ruleVersion must be a non-negative integer, got ${ruleVersion}`);
  }
  if (!isMember(DOMAINS, domain)) fail(`unknown domain ${JSON.stringify(domain)}`);
  if (!isMember(TRAITS, trait)) fail(`unknown trait ${JSON.stringify(trait)}`);
  if (typeof intensity !== 'number' || !Number.isFinite(intensity) || intensity < 0 || intensity > 1) {
    fail(`intensity must be in [0,1], got ${intensity}`);
  }
  if (typeof valence !== 'number' || !Number.isFinite(valence) || valence < -1 || valence > 1) {
    fail(`valence must be in [-1,1], got ${valence}`);
  }
  if (!window || !isMember(GRAINS, window.grain)) fail(`invalid window grain ${JSON.stringify(window?.grain)}`);
  if (typeof window.start !== 'string' || typeof window.end !== 'string') fail('window.start/end must be strings');
  if (window.start > window.end) fail(`window.start (${window.start}) is after window.end (${window.end})`);

  const modifiers = (params.evidence?.modifiers ?? []).map((m) => {
    if (typeof m.factor !== 'number' || !Number.isFinite(m.factor)) fail(`modifier ${m.id} has non-finite factor`);
    return { id: m.id, factor: m.factor, reason: m.reason };
  });

  const win: SignalWindow = { grain: window.grain, start: window.start, end: window.end };
  return {
    id: signalId({ system, ruleId, ruleVersion, window: win, target: params.target, domain, trait }),
    system,
    ruleId,
    ruleVersion,
    domain,
    trait,
    intensity,
    valence,
    window: win,
    evidence: {
      componentIds: [...(params.evidence?.componentIds ?? [])],
      text: params.evidence?.text ?? '',
      modifiers,
    },
  };
}
