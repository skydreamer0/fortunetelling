/** Research-only #28/#29 arithmetic. Not a provenance resolver or a production ranking policy. */
import { createSignal } from '../signals/createSignal';
import { canonicalJson } from '../signals/signalId';
import { SYSTEM_IDS, DOMAINS, type Signal, type SystemId, type Domain } from '../signals/types';

export const DIRECTIONAL_KERNEL_V4 = 'group-max-pn-ratio-v1' as const;
export interface DirectionalAxesV4 {
  activity: number; support: number; pressure: number; directionalMass: number;
  direction: number | null; internalConflict: number | null;
}
/** Verify the entire structural signal, not only its short identity (which excludes weights). */
export function validatedSignalsV4(raw: readonly Signal[]): Signal[] {
  if (!Array.isArray(raw)) throw new Error('Question v4: signals must be an array');
  const out = new Map<string, Signal>();
  for (const signal of raw) {
    if (!signal || canonicalJson(createSignal(signal)) !== canonicalJson(signal)) throw new Error('Question v4: invalid signal or identity');
    const previous = out.get(signal.id);
    if (previous && canonicalJson(previous) !== canonicalJson(signal)) throw new Error(`Question v4: conflicting signal ${signal.id}`);
    out.set(signal.id, structuredClone(signal));
  }
  return [...out.values()].sort((a, b) => a.id.localeCompare(b.id));
}
export function directionalAxesV4(activity: number, support: number, pressure: number): DirectionalAxesV4 {
  if ([activity, support, pressure].some(value => !Number.isFinite(value) || value < 0 || value > 1) || support > activity || pressure > activity) {
    throw new Error('Question v4: axes must be finite 0..1 and direction cannot exceed activity');
  }
  const directionalMass = support + pressure;
  return { activity, support, pressure, directionalMass,
    direction: directionalMass === 0 ? null : 100 * (support - pressure) / directionalMass,
    internalConflict: directionalMass === 0 ? null : 2 * Math.min(support, pressure) / directionalMass };
}
export interface ResearchGroupV4 {
  kernelVersion: typeof DIRECTIONAL_KERNEL_V4;
  /** Caller-declared research grouping, NOT authenticated production provenance. */
  groupId: string; branch: string; system: SystemId; domain: Domain; signals: readonly Signal[];
}
export function evaluateResearchGroupV4(input: ResearchGroupV4) {
  if (Object.keys(input).some(key => !['kernelVersion', 'groupId', 'branch', 'system', 'domain', 'signals'].includes(key)) || input.kernelVersion !== DIRECTIONAL_KERNEL_V4 || !input.groupId?.trim() || !input.branch?.trim() ||
      !SYSTEM_IDS.includes(input.system) || !DOMAINS.includes(input.domain)) throw new Error('Question v4: unknown kernel or incomplete research group');
  const signals = validatedSignalsV4(input.signals);
  if (signals.some(signal => signal.system !== input.system || signal.domain !== input.domain)) throw new Error('Question v4: mixed group system/domain');
  const axes = directionalAxesV4(Math.max(0, ...signals.map(s => s.intensity)),
    Math.max(0, ...signals.map(s => s.intensity * Math.max(s.valence, 0))),
    Math.max(0, ...signals.map(s => s.intensity * Math.max(-s.valence, 0))));
  return { kernelVersion: DIRECTIONAL_KERNEL_V4, scope: 'research-only' as const,
    provenance: 'caller-declared-not-production' as const, groupId: input.groupId, branch: input.branch,
    system: input.system, domain: input.domain, ...axes,
    supportSignalIds: signals.filter(s => s.valence > 0 && s.intensity > 0).map(s => s.id),
    pressureSignalIds: signals.filter(s => s.valence < 0 && s.intensity > 0).map(s => s.id), signals };
}
/** Diagnostic comparison only. Caller must establish same coverage, denominator and policy first. */
export function compareDirectionalAxesV4(a: DirectionalAxesV4, b: DirectionalAxesV4): 'dominates' | 'dominated' | 'equal' | 'tradeoff' {
  for (const row of [a, b]) {
    if (canonicalJson(directionalAxesV4(row.activity, row.support, row.pressure)) !== canonicalJson(row)) throw new Error('Question v4: inconsistent axes');
  }
  if (a.support === b.support && a.pressure === b.pressure) return 'equal';
  if (a.support >= b.support && a.pressure <= b.pressure) return 'dominates';
  if (a.support <= b.support && a.pressure >= b.pressure) return 'dominated';
  return 'tradeoff';
}
