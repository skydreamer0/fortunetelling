/**
 * @fileoverview Canonical JSON (ROADMAP M0.5-02, D-037). One strict serializer shared by the
 * MCP server, web export and contract tests: sorted keys, no whitespace, non-deterministic
 * fields dropped. Pure: no clock, no IO.
 * Distinct from `signals/signalId#canonicalJson`, which stays lenient because signal ids depend on it.
 * @module portable/canonical
 */

/** Keys removed at every depth: they change between runs of the same input. */
export const NONDETERMINISTIC_KEYS: readonly string[] = Object.freeze(['generatedAt']);

export type CanonicalOptions = {
  /** Extra keys to drop at every depth, added to {@link NONDETERMINISTIC_KEYS}. */
  omit?: readonly string[];
};

function normalize(value: unknown, omit: ReadonlySet<string>, path: string): unknown {
  if (value === null) return null;
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return value;
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError(`canonicalJson: non-finite number at ${path}`);
      return Object.is(value, -0) ? 0 : value;
    case 'object': {
      if (Array.isArray(value)) {
        return value.map((item, i) => (item === undefined ? null : normalize(item, omit, `${path}[${i}]`)));
      }
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) {
        throw new TypeError(`canonicalJson: unsupported object at ${path}`);
      }
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(value as object).sort()) {
        const child = (value as Record<string, unknown>)[key];
        if (child === undefined || omit.has(key)) continue;
        out[key] = normalize(child, omit, `${path}.${key}`);
      }
      return out;
    }
    default:
      throw new TypeError(`canonicalJson: unsupported ${typeof value} at ${path}`);
  }
}

/** Plain-data copy with sorted keys and non-deterministic keys removed. */
export function canonicalize(value: unknown, options: CanonicalOptions = {}): unknown {
  const omit = new Set([...NONDETERMINISTIC_KEYS, ...(options.omit ?? [])]);
  return normalize(value, omit, '$');
}

/** Canonical JSON string: same input (ignoring omitted keys) → identical bytes. */
export function canonicalStringify(value: unknown, options: CanonicalOptions = {}): string {
  return JSON.stringify(canonicalize(value, options));
}
