/** Test-only views of known built-in producer contracts. These are not payload
 * validators: the existing field/golden assertions remain the runtime oracle.
 * Engine identity is checked here to prevent using a BaZi contract for Ziwei.
 * No public/dynamic-plugin boundary is narrowed by this test adapter. */
import assert from 'node:assert/strict';
import type { Component, SystemResult } from '../../src/core/models/SystemResult';
import type { BaziComponent } from '../../src/engines/baziTypes';
import type { ZiweiComponent } from '../../src/engines/ziweiTypes';
import type { NumerologyComponent } from '../../src/engines/numerologyTypes';
import type { MingGuaComponent } from '../../src/engines/mingGuaTypes';
interface Producers { bazi: BaziComponent; ziwei: ZiweiComponent; numerology: NumerologyComponent; minggua: MingGuaComponent }
export function producerCategory<S extends keyof Producers, K extends Producers[S]['category']>(
  result: Pick<SystemResult, 'engineId' | 'byCategory'>, system: S, category: K,
): Extract<Producers[S], { category: K }>[] {
  assert.equal(result.engineId, system);
  return result.byCategory(category) as Extract<Producers[S], { category: K }>[];
}
export function producerComponents<S extends keyof Producers>(
  result: { engineId: string; components: Component[] }, system: S,
): Producers[S][] {
  assert.equal(result.engineId, system);
  return result.components as Producers[S][];
}
type AtId<C, I> = C extends { id: infer Id } ? I extends Id ? C : never : never;
export function producerValue<S extends keyof Producers, I extends Producers[S]['id']>(
  result: { engineId: string; components: Component[] }, system: S, id: I,
): AtId<Producers[S], I>['value'] {
  const component = producerComponents(result, system).find(c => c.id === id);
  assert.ok(component, `missing ${system}/${id}`);
  return component.value as AtId<Producers[S], I>['value'];
}
/** Tests of actual numeric radar formulas explicitly establish numeric inputs.
 * This assertion is test-only and deliberately does not demand finiteness. */
export function numericInputs<K extends string>(inputs: Record<string, unknown>, keys: readonly K[]): Record<K, number> {
  for (const key of keys) assert.equal(typeof inputs[key], 'number', `numeric radar input ${key}`);
  return inputs as Record<K, number>;
}
