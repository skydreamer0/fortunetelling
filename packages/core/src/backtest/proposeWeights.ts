/**
 * Weight proposals from a backtest (V4-05; ARCHITECTURE-V2 §10.1; D-028, D-033).
 *
 * - Uses ONLY validation-set metrics, and only groups with validation n ≥ 30.
 * - Never mutates anything: returns a NEW, frozen, versioned proposal object
 *   (`version = base.version + 1`). Old versions stay reproducible (D-028).
 * - With one person's handful of events (typically 5–10) nothing qualifies and
 *   the result is `{ ok: false, status: 'insufficient_data' }` — that is the
 *   expected, correct outcome, not an error.
 *
 * Multiplier per qualifying system / rule (shrunk toward 1 by sample size):
 *   m = clamp(1 + (lift − 1) · n / (n + 30), 0.5, 2), rounded to 4 decimals.
 * System multipliers scale `systemWeights`; rule multipliers are stored as
 * `ruleWeightMultipliers` (to be applied to that rule's trait-weight templates
 * in a new catalog version — never in place).
 *
 * @module backtest/proposeWeights
 */

import { SYSTEM_IDS, type SystemId } from '../signals/types';
import { BACKTEST_METHOD, type BacktestGroup, type BacktestResult } from './runBacktest';

export const WEIGHT_PROPOSAL_SCHEMA_VERSION = 1 as const;
export const MIN_MULTIPLIER = 0.5;
export const MAX_MULTIPLIER = 2;

/** The currently active weights a proposal is based on. */
export interface WeightVersion {
  version: number;
  systemWeights: Partial<Record<SystemId, number>>;
}

export interface WeightChange {
  kind: 'system' | 'rule';
  key: string;
  from: number;
  to: number;
  multiplier: number;
  validation: { n: number; hitRate: number | null; baseline: number | null; lift: number | null; pValue: number | null };
}

export interface WeightProposal {
  schemaVersion: typeof WEIGHT_PROPOSAL_SCHEMA_VERSION;
  kind: 'trait_weights_proposal';
  version: number;
  parentVersion: number;
  basedOn: { backtestSchemaVersion: number; methodVersion: number; seed: string; validationFraction: number; validationEvents: number };
  systemWeights: Partial<Record<SystemId, number>>;
  ruleWeightMultipliers: Record<string, number>;
  changes: WeightChange[];
}

export type WeightProposalResult =
  | { ok: true; status: 'proposed'; proposal: WeightProposal }
  | {
      ok: false;
      status: 'insufficient_data';
      message: string;
      required: number;
      /** Validation n per system (and the largest rule n) so the UI can show how far off it is. */
      observed: { systems: Partial<Record<SystemId, number>>; maxRuleN: number };
    };

const round4 = (x: number) => Math.round(x * 1e4) / 1e4;

function multiplier(g: BacktestGroup): number {
  const { n, lift } = g.validation;
  const shrink = n / (n + BACKTEST_METHOD.minSample);
  return round4(Math.min(MAX_MULTIPLIER, Math.max(MIN_MULTIPLIER, 1 + ((lift ?? 1) - 1) * shrink)));
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    for (const v of Object.values(o)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}

const qualifies = (g: BacktestGroup) => g.validation.n >= BACKTEST_METHOD.minSample && g.validation.lift !== null;

/**
 * Propose new weights from a backtest's validation metrics. `base` defaults to
 * version 1 with weight 1 for every system in the result.
 */
export function proposeWeights(result: BacktestResult, base?: WeightVersion): WeightProposalResult {
  const parent: WeightVersion = base ?? {
    version: 1,
    systemWeights: Object.fromEntries(result.timeline.systems.map((s) => [s, 1])),
  };
  const systems = result.bySystem.filter(qualifies);
  const rules = result.byRule.filter(qualifies);

  if (systems.length === 0 && rules.length === 0) {
    const observed: Partial<Record<SystemId, number>> = {};
    for (const g of result.bySystem) observed[g.key as SystemId] = g.validation.n;
    return {
      ok: false,
      status: 'insufficient_data',
      message: `樣本不足：驗證集沒有任何系統或規則達到 ${BACKTEST_METHOD.minSample} 筆事件，不產生新權重版本（現行 v${parent.version} 維持不變）。單一使用者通常只有 5–10 筆事件，這是預期結果。`,
      required: BACKTEST_METHOD.minSample,
      observed: { systems: observed, maxRuleN: Math.max(0, ...result.byRule.map((g) => g.validation.n)) },
    };
  }

  const systemWeights: Partial<Record<SystemId, number>> = {};
  for (const s of SYSTEM_IDS) if (parent.systemWeights[s] !== undefined) systemWeights[s] = parent.systemWeights[s];
  const changes: WeightChange[] = [];
  const evidence = (g: BacktestGroup) => ({
    n: g.validation.n,
    hitRate: g.validation.hitRate,
    baseline: g.validation.baseline,
    lift: g.validation.lift,
    pValue: g.validation.pValue,
  });
  for (const g of systems) {
    const key = g.key as SystemId;
    const from = parent.systemWeights[key] ?? 1;
    const m = multiplier(g);
    systemWeights[key] = round4(from * m);
    changes.push({ kind: 'system', key, from, to: systemWeights[key]!, multiplier: m, validation: evidence(g) });
  }
  const ruleWeightMultipliers: Record<string, number> = {};
  for (const g of rules) {
    const m = multiplier(g);
    ruleWeightMultipliers[g.key] = m;
    changes.push({ kind: 'rule', key: g.key, from: 1, to: m, multiplier: m, validation: evidence(g) });
  }

  return {
    ok: true,
    status: 'proposed',
    proposal: deepFreeze({
      schemaVersion: WEIGHT_PROPOSAL_SCHEMA_VERSION,
      kind: 'trait_weights_proposal',
      version: parent.version + 1,
      parentVersion: parent.version,
      basedOn: {
        backtestSchemaVersion: result.schemaVersion,
        methodVersion: result.method.version,
        seed: result.seed,
        validationFraction: result.validationFraction,
        validationEvents: result.split.validationIds.length,
      },
      systemWeights,
      ruleWeightMultipliers,
      changes,
    }),
  };
}
