/**
 * `evaluateZiweiRules`: run the ziwei rule set against a chart for one window
 * and return validated Signals (ARCHITECTURE-V2 §5, §6).
 *
 * - Rules run when their `scope` is in `opts.scopes` (default: `[window.grain]`).
 *   Decade/year rules only hit periods overlapping `window`; every emitted signal
 *   carries the caller's `window` so aggregation groups by the evaluation window.
 * - Deterministic: pure over (chart, window, opts); output sorted by signal id.
 * - Throws on a duplicate signal id (a rule-authoring bug, never silently merged).
 */

import { createSignal } from '../../signals/createSignal';
import type { Grain, Signal, SignalWindow } from '../../signals/types';
import type { ZiweiRuleChart } from './chart';
import { ZIWEI_RULES, type ZiweiRule } from './rules';
import { finalizeHit } from './traitSignals';

export interface EvaluateZiweiOptions {
  /** Which rule scopes to run (default: only the window's own grain). */
  scopes?: readonly Grain[];
  /** Restrict to these rule ids. */
  ruleIds?: readonly string[];
  /** Override the rule set (tests). */
  rules?: readonly ZiweiRule[];
}

export function evaluateZiweiRules(
  chart: ZiweiRuleChart,
  window: SignalWindow,
  opts: EvaluateZiweiOptions = {},
): Signal[] {
  const scopes = new Set<Grain>(opts.scopes ?? [window.grain]);
  const only = opts.ruleIds ? new Set(opts.ruleIds) : null;
  const rules = (opts.rules ?? ZIWEI_RULES).filter((r) => scopes.has(r.scope) && (!only || only.has(r.id)));

  const byId = new Map<string, Signal>();
  for (const rule of rules) {
    for (const hit of rule.match(chart, window)) {
      const { intensity, valence, modifiers } = finalizeHit(hit);
      const signal = createSignal({
        system: 'ziwei',
        ruleId: rule.id,
        ruleVersion: rule.version,
        domain: hit.domain,
        trait: hit.trait,
        intensity,
        valence,
        window,
        target: hit.target,
        evidence: { componentIds: [...new Set(hit.componentIds)], text: hit.text, modifiers },
      });
      if (byId.has(signal.id)) {
        throw new Error(`evaluateZiweiRules: duplicate signal id ${signal.id} (${rule.id} ${hit.target} ${hit.domain}/${hit.trait})`);
      }
      byId.set(signal.id, signal);
    }
  }
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
