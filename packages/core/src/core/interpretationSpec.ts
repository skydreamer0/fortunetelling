/** Internal interpretation identity. No CalculationSpec/Report migration. */
import type { DeepReadonly } from './calculationSpec';
import type { SchoolPackRef, SchoolContext } from '../schools/types';

export const INTERPRETATION_SPEC_VERSION = 1 as const;
export type InterpretationSpec = DeepReadonly<{
  schemaVersion: 1;
  scope: 'sync-natal' | 'synthetic-sync-natal';
  implementationCatalog: { id: string; version: 1 };
  interpretationVersion: 1;
  comparisonVersion: 1;
  packs: readonly SchoolPackRef[];
}>;

/** Strict data-only canonicalization: never invokes accessors or drops fields.
 * This intentionally does not use the report serializer's generatedAt omission.
 */
export function interpretationData<T>(value: T): DeepReadonly<T> {
  const ancestors = new Set<object>();
  function copy(item: unknown): unknown {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number' && Number.isFinite(item)) return Object.is(item, -0) ? 0 : item;
    if (!item || typeof item !== 'object') throw new TypeError('Interpretation requires plain data');
    if (ancestors.has(item)) throw new TypeError('Interpretation requires acyclic data');
    const array = Array.isArray(item);
    if (array ? Object.getPrototypeOf(item) !== Array.prototype : ![Object.prototype, null].includes(Object.getPrototypeOf(item))) {
      throw new TypeError('Interpretation requires plain data');
    }
    const keys = Reflect.ownKeys(item);
    if (array && (keys.length !== item.length + 1 || keys.some(k => k !== 'length' &&
      (typeof k !== 'string' || !/^(0|[1-9][0-9]*)$/.test(k) || Number(k) >= item.length)))) throw new TypeError('Invalid dense array');
    ancestors.add(item);
    const output: Record<string, unknown> | unknown[] = array ? [] : {};
    for (const key of keys.filter(k => !array || k !== 'length').sort((a, b) => String(a) < String(b) ? -1 : 1)) {
      const d = Object.getOwnPropertyDescriptor(item, key)!;
      if (typeof key !== 'string' || !d.enumerable || !('value' in d) || key === 'toJSON') throw new TypeError('Unsupported interpretation property');
      Object.defineProperty(output, key, { value: copy(d.value), enumerable: true, configurable: true, writable: true });
    }
    ancestors.delete(item);
    return Object.freeze(output);
  }
  return copy(value) as DeepReadonly<T>;
}

export const interpretationBytes = (value: unknown): string => JSON.stringify(interpretationData(value));
export function exactInterpretationKeys(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))) throw new TypeError('Unexpected interpretation fields');
}
export function canonicalSchoolContext(context: SchoolContext): SchoolContext {
  const copy = interpretationData(context);
  exactInterpretationKeys(copy, ['factIds', 'availableConditions']);
  const normalize = (values: readonly string[]): readonly string[] => {
    if (!Array.isArray(values) || values.some(v => typeof v !== 'string' || !v.trim()) || new Set(values).size !== values.length) {
      throw new TypeError('Invalid or duplicate SchoolContext members');
    }
    return Object.freeze([...values].sort());
  };
  return Object.freeze({ factIds: normalize(copy.factIds), availableConditions: normalize(copy.availableConditions) });
}
