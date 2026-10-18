import { createHash } from 'node:crypto';
import { projectSystemsBaseline } from './systemsBaselineSemantics';

/** Sort object keys without dropping any parsed JSON field, including generatedAt. */
export function rawCanonicalStringify(value: unknown): string {
  const sort = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(sort);
    if (item !== null && typeof item === 'object') {
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        .map(([key, child]) => [key, sort(child)]));
    }
    return item;
  };
  return JSON.stringify(sort(value));
}

/** No stripNew/noYears/ID expansion/version replacement: all raw parsed fields
 * belong to exactly one layer. Canonical object-key ordering is the sole normalization. */
export function currentResponseDigests(response: unknown) {
  const layers = projectSystemsBaseline(response);
  const digest = (value: unknown) => createHash('sha256').update(rawCanonicalStringify(value)).digest('hex');
  return { data: digest(layers.data), caveats: digest(layers.caveats),
    versions: digest(layers.versions), envelope: digest(layers.envelope) };
}
