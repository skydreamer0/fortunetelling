import { expect, test } from 'vitest';
import {
  buildDigitFrequencyRadar, buildElementBalanceRadar, buildPalaceStrengthRadar, buildRadars,
} from '../src/analysis/RadarBuilder';
import type { SystemResult, SystemResultJSON } from '../src/core/models/SystemResult';

type Input = Parameters<typeof buildElementBalanceRadar>[0];
type Inputs = [
  Input,
  Parameters<typeof buildPalaceStrengthRadar>[0],
  Parameters<typeof buildDigitFrequencyRadar>[0],
  Parameters<typeof buildRadars>[0][number],
];
type Accept<T extends true> = T;
type Reject<T extends false> = T;
type IsAny<T> = 0 extends (1 & T) ? true : false;
type IsUnknown<T> = IsAny<T> extends true ? false : unknown extends T ? true : false;
type Payloads = { [K in keyof Inputs]: Inputs[K] extends Input ? Inputs[K]['components'][number]['value'] : never };
type AnyViews = { [K in keyof Payloads]: IsAny<Payloads[K]> }[number];
type UnknownViews = { [K in keyof Payloads]: IsUnknown<Payloads[K]> }[number];

// Checked by core's tsc, rather than only transpiled by the test runner.
export type RadarConsumerContract = [
  Reject<true extends AnyViews ? true : false>,
  Reject<false extends UnknownViews ? true : false>,
  Accept<SystemResult extends Input ? true : false>,
  Accept<SystemResultJSON extends Input ? true : false>,
  Accept<unknown extends Input['components'][number]['value'] ? true : false>,
];

export function uncheckedPayloadReadsAreRejected(input: Input) {
  // @ts-expect-error engine/category-specific fields are opaque at the input
  input.components[0].value.counts;
  // @ts-expect-error a shared component cannot promise a numeric frequency
  const count: number = input.components[0].value;
  return count;
}

function result(engineId: string, category: string, value: unknown): Input {
  return { engineId, components: [{ id: category, name: category, category, value }] };
}

const looseValues: unknown[] = [undefined, null, false, 0, '', [], {}, true, 1, 'legacy', Symbol('legacy')];

test('opaque input accepts arbitrary payloads and retains the existing missing-data results', () => {
  for (const value of looseValues) {
    expect(buildElementBalanceRadar(result('bazi', 'elements', value))).toBeNull();
    const palace = buildPalaceStrengthRadar(result('ziwei', 'palaces', value))!;
    expect(palace.axes[0].key).toBe('palace_undefined');
    expect(palace.axes[0].label).toBeUndefined();
    expect(palace.axes[0].value).toBe(0);
    expect(Object.keys(palace.axes[0])).toEqual(['key', 'label', 'value', 'unit', 'ruleId', 'inputs', 'assets', 'liabilities']);
  }
  for (const value of [undefined, null, false, 0, '']) {
    expect(buildDigitFrequencyRadar(result('numerology', 'digitFrequency', value))).toBeNull();
  }
  expect(buildElementBalanceRadar({ engineId: 'bazi', components: [] })).toBeNull();
  expect(buildPalaceStrengthRadar({ engineId: 'ziwei', components: [] })).toBeNull();
  expect(buildDigitFrequencyRadar({ engineId: 'numerology', components: [] })).toBeNull();
});

test('element fallback and arithmetic preserve loose values and payload references', () => {
  const count = { valueOf: () => 2 };
  const counts = { 木: count, 火: false, 土: '', 金: null, 水: -0 };
  const input = result('bazi', 'elements', { counts, total: '4' });
  const radar = buildElementBalanceRadar(input)!;
  expect(radar.axes.map(axis => axis.value)).toEqual([50, 0, 0, 0, -0]);
  expect(radar.axes[0].inputs.woodCount).toBe(count);
  expect(radar.axes[0].inputs.totalElements).toBe('4');
  expect(radar.axes[1].inputs.fireCount).toBe(false);
  expect(radar.axes[2].inputs.earthCount).toBe('');
  expect(radar.axes[3].inputs.metalCount).toBe(0);
  expect(Object.is(radar.axes[4].inputs.waterCount, -0)).toBe(true);
  expect((input.components[0].value as { counts: unknown }).counts).toBe(counts);
  for (const total of [undefined, null, false, 0, -1, '', NaN]) {
    expect(buildElementBalanceRadar(result('bazi', 'elements', { counts, total }))).toBeNull();
  }
});

test('element component value is still read twice, with count reads after the total predicate', () => {
  const reads: string[] = [];
  const input: Input = { engineId: 'bazi', components: [{
    id: 'elements', name: 'elements', category: 'elements',
    get value() {
      reads.push('value');
      return {
        get counts() { reads.push('counts'); return { get 木() { reads.push('木'); return 1; } }; },
        get total() { reads.push('total'); return 1; },
      };
    },
  }] };
  expect(buildElementBalanceRadar(input)!.axes[0].value).toBe(100);
  expect(reads).toEqual(['value', 'counts', 'value', 'total', '木']);
  reads.length = 0;
  input.components[0] = {
    id: 'elements', name: 'elements', category: 'elements',
    get value() { reads.push('value'); return reads.length === 1 ? { counts: { 木: 1 } } : { total: 2 }; },
  };
  expect(buildElementBalanceRadar(input)!.axes[0].value).toBe(50);
  expect(reads).toEqual(['value', 'value']);
});

test('palace defaults, brightness filtering, star arrays and mutagen reads retain their order', () => {
  const reads: string[] = [];
  const majorStars = [{
    get brightnessScore() { reads.push('brightnessScore'); return 0.5; },
    get mutagen() { reads.push('mutagen'); return ''; },
  }];
  const payload = {
    get index() { reads.push('index'); return 0; },
    get name() { reads.push('name'); return '命宮'; },
    get majorStars() { reads.push('majorStars'); return majorStars; },
    get minorStars() { reads.push('minorStars'); return []; },
    get adjectiveStars() { reads.push('adjectiveStars'); return []; },
  };
  const radar = buildPalaceStrengthRadar(result('ziwei', 'palaces', payload))!;
  expect(radar.axes[0].value).toBe(30);
  expect(reads).toEqual(['index', 'name', 'majorStars', 'minorStars', 'adjectiveStars', 'brightnessScore', 'mutagen', 'mutagen']);
  expect(majorStars).toHaveLength(1);
  const legacy = buildPalaceStrengthRadar(result('ziwei', 'palaces', {
    index: 0, name: '命宮', majorStars: [{ brightnessScore: '1', mutagen: false }, { brightnessScore: 0.5 }],
  }))!;
  expect(legacy.axes[0].inputs).toEqual({ mainStarBrightness: 50, auxiliaryStarCount: 0, fourTransformBonus: 100 });
});

test('invalid arithmetic and malformed star collections keep throwing rather than being normalized', () => {
  for (const total of [Symbol('total'), 1n]) {
    expect(() => buildElementBalanceRadar(result('bazi', 'elements', { counts: { 木: 1 }, total }))).toThrow(TypeError);
  }
  for (const majorStars of [null, {}, '', [null]]) {
    expect(() => buildPalaceStrengthRadar(result('ziwei', 'palaces', { majorStars }))).toThrow(TypeError);
  }
  expect(() => buildPalaceStrengthRadar(result('ziwei', 'palaces', { minorStars: null }))).toThrow(TypeError);
});

test('digit values are passed through by identity, with only nullish frequency defaulting', () => {
  const object = { count: 3 };
  const reads: string[] = [];
  const counts = { get 1() { reads.push('1'); return object; }, 2: false, 3: '', 4: null, 5: -0 };
  const radar = buildDigitFrequencyRadar(result('numerology', 'digitFrequency', counts))!;
  expect(radar.axes[0].value).toBe(object);
  expect(radar.axes[0].inputs.digitOccurrences).toBe(object);
  expect(radar.axes.map(axis => axis.value)).toEqual([object, false, '', 0, -0, 0, 0, 0, 0]);
  expect(reads).toEqual(['1']);
  expect(buildDigitFrequencyRadar(result('numerology', 'digitFrequency', '12'))!.axes[0].value).toBe('2');
});

test('aggregate keeps system order, last-engine selection and first-component selection', () => {
  const first = result('numerology', 'digitFrequency', { 1: 1 });
  const last = result('numerology', 'digitFrequency', { 1: 9 });
  last.components.push({ id: 'later', name: 'later', category: 'digitFrequency', value: { 1: 100 } });
  const radars = buildRadars([first, result('ziwei', 'palaces', {}), result('bazi', 'elements', { counts: {}, total: 1 }), last]);
  expect(radars.map(radar => radar.system)).toEqual(['bazi', 'ziwei', 'numerology']);
  expect(radars[2].axes[0].value).toBe(9);
  expect(buildRadars(null as unknown as Input[])).toEqual([]);
});
