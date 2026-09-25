import type { Domain, SignalWindow, SystemId, Trait } from './types';

export interface SignalIdInput {
  system: SystemId;
  ruleId: string;
  ruleVersion: number;
  window: SignalWindow;
  /** What the rule hit on; omitted/undefined is canonicalised to null. */
  target?: string | null;
  domain: Domain;
  trait: Trait;
}

/** Canonical JSON: object keys sorted recursively, undefined → null. */
export function canonicalJson(value: unknown): string {
  if (value === undefined || value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const FNV64_OFFSET = 0xcbf29ce484222325n;
const FNV64_PRIME = 0x100000001b3n;
const MASK64 = 0xffffffffffffffffn;

/** FNV-1a 64-bit over the UTF-8 bytes of `text`, as 16 lowercase hex chars. */
export function fnv1a64Hex(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let h = FNV64_OFFSET;
  for (const b of bytes) {
    h ^= BigInt(b);
    h = (h * FNV64_PRIME) & MASK64;
  }
  return h.toString(16).padStart(16, '0');
}

/**
 * Deterministic signal id from (system, ruleId, ruleVersion, window, target, domain, trait):
 * `sig_` + FNV-1a 64 hex over canonical (sorted-key) JSON. Pure; key order of the input is irrelevant.
 */
export function signalId(input: SignalIdInput): string {
  const canonical = canonicalJson({
    system: input.system,
    ruleId: input.ruleId,
    ruleVersion: input.ruleVersion,
    window: { grain: input.window.grain, start: input.window.start, end: input.window.end },
    target: input.target ?? null,
    domain: input.domain,
    trait: input.trait,
  });
  return `sig_${fnv1a64Hex(canonical)}`;
}
