/**
 * Deterministic JSON + hashing helpers (D-014: same input → same bytes → same cache key).
 * Browser- and Bun-compatible (WebCrypto only).
 */

/** Recursively sorts object keys; arrays keep their order; drops `undefined`. */
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[k];
      if (v !== undefined) out[k] = canonicalize(v);
    }
    return out;
  }
  return value;
}

/** Canonical (sorted-key, compact) JSON string. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

/** SHA-256 hex of a string (WebCrypto; works in browsers, Bun, Node ≥ 19). */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
