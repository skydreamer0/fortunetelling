import { expect, test } from 'bun:test';
import { BirthData } from '../src/core/models/BirthData';
import { SystemResult } from '../src/core/models/SystemResult';
import { MingGuaEngine } from '../src/engines/MingGuaEngine';
import type { MingGuaComponent, MingGuaMetadata, MingGuaValue } from '../src/engines/mingGuaTypes';
import { extractMingGuaChart } from '../src/calculators/mingGua/calculator';

// Compiled by the workspace typecheck; a widened/disconnected contract fails it.
type Reject<T extends false> = T;
export type RejectWrongCategory = Reject<{
  id: 'ming_gua'; name: string; category: 'directions'; value: MingGuaValue;
} extends MingGuaComponent ? true : false>;
export type RejectNullValue = Reject<{
  id: 'ming_gua'; name: string; category: 'mingGua'; value: null;
} extends MingGuaComponent ? true : false>;
export type RejectUndefinedValue = Reject<{
  id: 'ming_gua'; name: string; category: 'mingGua'; value: undefined;
} extends MingGuaComponent ? true : false>;
export type RejectWrongGroup = Reject<
  Omit<MingGuaValue, 'group'> & { group: 'north' } extends MingGuaValue ? true : false
>;
export type RejectMissingBoundary = Reject<
  Omit<MingGuaMetadata, 'boundaryAmbiguous'> extends MingGuaMetadata ? true : false
>;
export type RejectNullMetadata = Reject<null extends MingGuaMetadata ? true : false>;

export function payloadKeys(component: MingGuaComponent): string[] {
  if (component.category === 'mingGua') {
    const id: 'ming_gua' = component.id;
    return [id, component.value.group];
  }
  const id: 'directions' = component.id;
  return [id, ...Object.keys(component.value.auspicious)];
}

test('category discrimination binds each emitted Ming Gua payload', () => {
  const result = new MingGuaEngine().run(new BirthData({
    year: 1990, month: 6, day: 15, hour: 12, minute: 0, gender: 'male', timeKnown: true,
  }));
  expect(result.errors).toEqual([]);
  expect(result.components.map(c => c.category === 'mingGua'
    ? [c.id, c.value.group] : [c.id, ...Object.keys(c.value.auspicious)])).toEqual([
    ['ming_gua', 'east'], ['directions', '生氣', '天醫', '延年', '伏位'],
  ]);
  expect(result.components.every(c => !Object.hasOwn(c, 'meta'))).toBe(true);
  expect(extractMingGuaChart(result.components).gua?.number).toBe(1);
});

test('legacy normalizer still preserves nullish value and metadata omission bytes', () => {
  for (const value of [undefined, null]) {
    for (const meta of [undefined, null]) {
      const component = SystemResult.component({ category: 'mingGua', value, meta });
      expect(JSON.stringify(component)).toBe('{"id":"mingGua","name":"mingGua","category":"mingGua","value":null}');
    }
  }
  expect(JSON.stringify(SystemResult.component({ category: 'mingGua', meta: {} })))
    .toBe('{"id":"mingGua","name":"mingGua","category":"mingGua","value":null,"meta":{}}');
});

test('legacy chart extraction still handles absent and null values without inventing output', () => {
  const empty = { gua: null, bestDirection: null, directions: null };
  expect(extractMingGuaChart([])).toEqual(empty);
  expect(extractMingGuaChart([
    { id: 'ming_gua', name: '', category: 'mingGua', value: null },
    { id: 'directions', name: '', category: 'directions', value: null },
  ])).toEqual(empty);
  // The legacy generic consumer is intentionally not widened into a runtime validator.
  // A present undefined directions payload remains undefined (and is omitted by JSON).
  expect(JSON.stringify(extractMingGuaChart([
    { id: 'ming_gua', name: '', category: 'mingGua', value: undefined },
    { id: 'directions', name: '', category: 'directions', value: undefined },
  ]))).toBe('{"gua":null,"bestDirection":null}');
});
