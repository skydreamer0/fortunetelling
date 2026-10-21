import { producerCategory, producerValue, numericInputs } from './helpers/producerComponents';
import { expect, test } from 'vitest';
import { SystemResult, type Component } from '../src/core/models/SystemResult';
import { BaseEngine } from '../src/core/BaseEngine';
import { BirthData } from '../src/core/models/BirthData';
import { LayerClassifier, type ClassifiedComponent } from '../src/analysis/LayerClassifier';
import { StateSwitchTable } from '../src/analysis/StateSwitchTable';
import type { RadarAxis } from '../src/analysis/RadarBuilder';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { transformSync } from 'esbuild';

type IsAny<T> = 0 extends 1 & T ? true : false;
type Reject<T extends false> = T;
export type OpaqueBoundary = [Reject<IsAny<Component['value']>>, Reject<IsAny<ClassifiedComponent['value']>>, Reject<IsAny<RadarAxis['inputs'][string]>>];
export function typeOnlyNegativeControls(c: Component, classified: ClassifiedComponent, axis: RadarAxis) {
  // @ts-expect-error unknown values must not leak arbitrary property access
  const a = c.value.unchecked;
  // @ts-expect-error classification does not validate a producer payload
  const b: number = classified.value;
  // @ts-expect-error provenance inputs can contain opaque plugin values
  const n: number = axis.inputs.unchecked;
  return [a, b, n];
}

class DynamicPlugin extends BaseEngine {
  id = 'synthetic-plugin';
  constructor(readonly payload: unknown) { super(); }
  _compute() { return this.result([{ category: 'opaque', value: this.payload }]); }
}

test('actual plugin result and classification retain every opaque value/reference and nullish normalization', () => {
  const values = [undefined, null, false, true, 0, -0, NaN, Infinity, '', 'legacy', 0n, 1n, Symbol('opaque'), () => 1, [], { nested: [1] }];
  for (const value of values) {
    const result = new DynamicPlugin(value).run(new BirthData({ year: 1990, month: 6, day: 15, hour: 12 }));
    expect(result.errors).toEqual([]);
    expect(result.components[0].value).toBe(value ?? null);
    expect(result.toJSON().components).toBe(result.components);
    const classified = new LayerClassifier().classify([result]);
    expect(classified.components[0].value).toBe(value ?? null);
    expect(classified.components[0].unclassified).toBe(true);
  }
});

test('component normalization reads value once; classifier retains custom rule getter behavior', () => {
  const reads: string[] = [];
  const value = { nested: [1] };
  const result = new SystemResult({ engineId: 'plugin', components: [{ category: 'custom', get value() { reads.push('value'); return value; } }] });
  expect(reads).toEqual(['value']);
  const classifier = new LayerClassifier();
  classifier.addRule({ sourceSystem: 'plugin', category: 'custom', layer: 'L3', rationale: 'synthetic' });
  expect(classifier.classify([result]).components[0].value).toBe(value);
  expect(reads).toEqual(['value']);
});

test('real StateSwitch consumer retains legacy count coercion rather than adding numeric filtering', () => {
  for (const [count, expected] of [[1, 2], ['1', 2], [NaN, 2], ['legacy', 2], [undefined, 2], [0, 0], ['0', 0], [-1, 0]] as const) {
    const result = new SystemResult({ engineId: 'bazi', components: [{ category: 'tenGodsContext', value: { groups: [{ group: '官殺', count, presence: '顯' }] } }] });
    const states = StateSwitchTable.build(new LayerClassifier().classify([result]));
    expect(states.flatMap(s => s.cells)).toHaveLength(expected);
    expect(states.every(s => s.cells.every(c => c.hypothesis))).toBe(true);
  }
});

test('real StateSwitch consumer preserves accessor read order and malformed-array throw behavior', () => {
  const reads: string[] = [];
  const group = { group: '官殺', count: 1, presence: '顯' };
  const payload = { get groups() { reads.push('groups'); return [group]; } };
  const classified = new LayerClassifier().classify([new SystemResult({ engineId: 'bazi', components: [{ category: 'tenGodsContext', value: payload }] })]);
  expect(StateSwitchTable.build(classified).flatMap(s => s.cells)).toHaveLength(2);
  expect(reads).toEqual(Array(5).fill('groups'));
  classified.components[0].value = { groups: {} };
  expect(() => StateSwitchTable.build(classified)).toThrow(TypeError);
});

// Frozen from ea811be95f6784d507c10b94077179e1aabfe3ed; tests fail on a
// runtime guard/copy/coercion change, not just on a different golden payload.
const ERASED_BASELINE = {
  "../src/analysis/LayerClassifier.ts": "3fb3f51a8c1212b5faeddc4eb907a2782607eaa085789cc3570bb36efbd3ee36",
  "../src/analysis/RadarBuilder.ts": "831161e238bbbbbc744f63eee2feb7df2f5672188ad96d973ac5c7117f4a878e",
  "../src/analysis/StateSwitchTable.ts": "e762ffd22d5fe56f3d3f14d2c4a1608f3f6d161681b8c09b43ecd6c5421be37d",
  "../src/core/models/SystemResult.ts": "030b4611eb33070ea29a638fab645ec1aab6148da80247230e46db64fb684f0e",
  "../src/core/timeContextEngines.ts": "7519d7982fc1cd70d3996a109fad3eaa944bc32e58243f95b60752f929ccc39d"
};
test('all changed production modules erase to exactly the original JavaScript', () => {
  for (const [path, hash] of Object.entries(ERASED_BASELINE)) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    const js = transformSync(source, { loader: 'ts', format: 'esm', target: 'esnext' }).code;
    expect(createHash('sha256').update(js).digest('hex')).toBe(hash);
    const changed = js + '\nthrow new Error("negative control");';
    expect(createHash('sha256').update(changed).digest('hex')).not.toBe(hash);
  }
});

test('test-only producer views reject wrong engines/missing identities and retain field assertions', () => {
  const result = new SystemResult({ engineId: 'bazi', components: [] });
  expect(() => producerCategory(result, 'ziwei', 'palaces')).toThrow();
  expect(() => producerValue(result, 'bazi', 'natal')).toThrow();
  expect(() => numericInputs({ count: '1' }, ['count'])).toThrow();
  expect(numericInputs({ count: NaN }, ['count']).count).toBeNaN();
});
export function producerViewTypeNegatives(result: SystemResult) {
  // @ts-expect-error Ziwei category must not be selected under a BaZi contract
  producerCategory(result, 'bazi', 'palaces');
  const natal = producerValue(result, 'bazi', 'natal');
  // @ts-expect-error producer types are not arbitrary bags of any
  const wrong: number = natal.convention;
  return wrong;
}
