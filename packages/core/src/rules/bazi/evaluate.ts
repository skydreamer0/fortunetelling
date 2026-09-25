/**
 * 八字規則評估（V1-10）：chart × 時間窗 → Signal[]（ARCHITECTURE-V2 §5、§6）。
 * 純函式、確定性（D-014）：輸出依 ruleId → target → DOMAINS 順序 → TRAITS 順序排序。
 */
import { createSignal } from '../../signals/createSignal';
import { DOMAINS, TRAITS, type Signal, type SignalWindow } from '../../signals/types';
import type { BaziRuleChart } from './chart';
import { BAZI_RULES } from './rules';

export interface EvaluateBaziOptions {
  /** Only evaluate these rule ids (default: all). */
  ruleIds?: readonly string[];
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function evaluateBaziRules(chart: BaziRuleChart, window: SignalWindow, opts: EvaluateBaziOptions = {}): Signal[] {
  const filter = opts.ruleIds ? new Set(opts.ruleIds) : null;
  const signals: Signal[] = [];
  for (const rule of BAZI_RULES) {
    if (rule.scope !== window.grain) continue;
    if (filter && !filter.has(rule.id)) continue;
    for (const hit of rule.match(chart, window)) {
      const modifiers = hit.modifiers ?? [];
      const factor = modifiers.reduce((p, m) => p * m.factor, 1);
      for (const t of rule.templatesFor(hit)) {
        signals.push(
          createSignal({
            system: 'bazi',
            ruleId: rule.id,
            ruleVersion: rule.version,
            domain: t.domain,
            trait: t.trait,
            intensity: Math.round(t.intensity * factor * 10000) / 10000,
            valence: t.valence,
            window,
            target: hit.target,
            evidence: { componentIds: hit.componentIds, text: hit.text, modifiers },
          }),
        );
      }
    }
  }
  signals.sort(
    (a, b) =>
      cmp(a.ruleId, b.ruleId) ||
      cmp(a.target ?? '', b.target ?? '') ||
      DOMAINS.indexOf(a.domain) - DOMAINS.indexOf(b.domain) ||
      TRAITS.indexOf(a.trait) - TRAITS.indexOf(b.trait),
  );
  const seen = new Set<string>();
  for (const s of signals) {
    if (seen.has(s.id)) throw new Error(`evaluateBaziRules: duplicate signal id ${s.id} (${s.ruleId} ${s.target})`);
    seen.add(s.id);
  }
  return signals;
}
