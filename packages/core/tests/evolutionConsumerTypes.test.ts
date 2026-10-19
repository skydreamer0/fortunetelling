import { numericInputs } from './helpers/producerComponents';
/** Issue #21: opaque Evolution inputs, unchanged sparse-data/runtime semantics. */
import assert from 'node:assert/strict';
import { expectTypeOf, test } from 'vitest';
import { SystemResult } from '../src/core/models/SystemResult';
import type { Component, SystemResultJSON } from '../src/core/models/SystemResult';
import { EvolutionCalculator, buildDaYunElementRadar, buildDaXianPalaceRadar } from '../src/analysis/EvolutionCalculator';
import type { Period } from '../src/analysis/EvolutionCalculator';
import type { Radar } from '../src/analysis/RadarBuilder';

type Input = Parameters<typeof EvolutionCalculator.calculate>[0][number];
type InputComponent = NonNullable<Input['components']>[number];
type PalaceInput = Parameters<typeof buildDaXianPalaceRadar>[0][number];
const component = (category: string, value: unknown): InputComponent => ({ id: category, name: category, category, value });
const engine = (engineId: string, ...components: InputComponent[]): Input => ({ engineId, components });
const elements = (total: unknown = 10, counts: unknown = { 木: 2, 火: 2, 土: 2, 金: 2, 水: 2 }) => component('elements', { counts, total });
const dayun = (index = 0, extra: Record<string, unknown> = {}) => component('daYun', {
  index, ganZhi: '甲寅', startYear: 2000 + index * 10, endYear: 2009 + index * 10, startAge: 10 + index * 10, ...extra,
});
const palace = (extra: Record<string, unknown> = {}) => component('palaces', { index: 0, name: '命宮', ...extra });
const daxian = (extra: Record<string, unknown> = {}) => component('daXian', {
  index: 0, range: [10, 19], heavenlyStem: '甲', earthlyBranch: '寅', palaceName: '命宮', ...extra,
});
const xiao = (nominalAge: unknown = 30, asOf: unknown = '2020-01-01') => component('xiaoXian', { nominalAge, asOf });
const ziwei = (...extra: InputComponent[]) => engine('ziwei', palace(), daxian(), ...extra);

test('public entry payloads are unknown; class/JSON and sparse palace records stay accepted', () => {
  expectTypeOf<InputComponent['value']>().toEqualTypeOf<unknown>();
  expectTypeOf<PalaceInput['value']>().toEqualTypeOf<unknown>();
  expectTypeOf<ReturnType<typeof EvolutionCalculator.calculate>>().toEqualTypeOf<{ periods: Period[]; narrative: string }>();
  expectTypeOf<ReturnType<typeof buildDaXianPalaceRadar>>().toEqualTypeOf<Radar>();
  const result = new SystemResult({ engineId: 'empty' });
  const json: SystemResultJSON = result.toJSON();
  assert.deepEqual(EvolutionCalculator.calculate([result, json]), { periods: [], narrative: '' });
  const records: Component[] = [palace()];
  assert.equal(buildDaXianPalaceRadar(records, { index: 0, mutagen: [] }, '').axes.length, 1);
  assert.equal(buildDaXianPalaceRadar([{}, { extra: true }, { value: {} }], { index: 0, mutagen: null }, '').axes.length, 3);
  assert.equal(buildDaXianPalaceRadar([], { index: 0 }, '').axes.length, 0);
  const payload: InputComponent['value'] = {};
  // @ts-expect-error A category name is not a payload validator.
  void payload.ganZhi;
  const palacePayload: PalaceInput['value'] = {};
  // @ts-expect-error Palace payloads must be explicitly projected before reading stars.
  void palacePayload.majorStars;
});

test('missing engines/components and non-arrays keep the existing empty result', () => {
  for (const value of [null, undefined, false, {}, 0, 'bazi']) {
    assert.deepEqual(Reflect.apply(EvolutionCalculator.calculate, null, [value]), { periods: [], narrative: '' });
  }
  for (const value of [undefined, null, {}, 'bad']) {
    assert.deepEqual(Reflect.apply(EvolutionCalculator.calculate, null, [[{ engineId: 'bazi', components: value }]]), { periods: [], narrative: '' });
  }
  assert.deepEqual(EvolutionCalculator.calculate([engine('bazi', elements(), dayun()), engine('bazi')]).periods, []);
});

test('BaZi uses first elements and stable index ordering without normalizing sparse steps', () => {
  const steps = [dayun(2), dayun(0), dayun(0, { ganZhi: '丙午', isCurrent: 'yes' }), component('daYun', null), component('daYun', { ganZhi: 7 })];
  const result = EvolutionCalculator.calculate([engine('bazi', elements(), elements(0), ...steps)]);
  assert.deepEqual(result.periods.map(p => p.label), ['2000–2009 甲寅大運', '2000–2009 丙午大運', '2020–2029 甲寅大運']);
  assert.equal(Reflect.get(result.periods[1], 'isCurrent'), true);
  assert.deepEqual(steps.map(s => s.value), [dayun(2).value, dayun(0).value, dayun(0, { ganZhi: '丙午', isCurrent: 'yes' }).value, null, { ganZhi: 7 }]);
  assert.deepEqual(EvolutionCalculator.calculate([engine('bazi', elements(0), elements(), dayun())]).periods, []);
});

test('BaZi weights, rounding, unknown characters and legacy numeric-string coercion stay exact', () => {
  const radar = buildDaYunElementRadar({ 木: 1 }, 3, { index: 4, ganZhi: '甲子' });
  assert.deepEqual(radar.axes.map(a => a.value), [50, 0, 0, 0, 25]);
  assert.deepEqual(radar.axes[0].inputs, { natalCount: 1, stemOverlay: 3, branchOverlay: 0, daYunOverlay: 3, natalTotal: 3, overlayTotal: 5 });
  assert.equal(buildDaYunElementRadar({ 木: 1 }, 3, { index: 0, ganZhi: '?' }).axes[0].value, 33.33);
  const coercion = EvolutionCalculator.calculate([engine('bazi', elements('10', { 木: '2' }), dayun())]);
  assert.equal(coercion.periods[0].radar.axes[0].value, 23.81); // ('2' + 5) / ('10' + 5)
  assert.equal(coercion.periods[0].radar.axes[0].inputs.natalCount, '2');
});

test('birth year uses first unsorted BaZi period; finite XiaoXian is the fallback', () => {
  const bazi = engine('bazi', dayun(8, { startYear: 2010, startAge: 20 }), dayun(0, { startYear: 1980, startAge: 10 }));
  assert.deepEqual(EvolutionCalculator.calculate([bazi, ziwei(xiao(10))]).periods[0].range, [2000, 2009]);
  const badFirst = engine('bazi', dayun(0, { startYear: '2010' }), dayun(1));
  assert.deepEqual(EvolutionCalculator.calculate([badFirst, ziwei(xiao())]).periods[0].range, [2000, 2009]);
  for (const age of [null, '30', NaN, Infinity]) assert.deepEqual(EvolutionCalculator.calculate([ziwei(xiao(age))]).periods, []);
  assert.ok(EvolutionCalculator.calculate([ziwei(xiao(30, 'oops'))]).periods[0].range.every(Number.isNaN));
});

test('Ziwei range sorting, virtual-age conversion, mutagen narratives and current flags are unchanged', () => {
  const z = engine('ziwei', palace(), xiao(), daxian({ index: 2, range: [30, 39] }), daxian({ index: 0, range: [10, 19], mutagen: ['祿星', '', '', '忌星'], isCurrent: 1 }), daxian({ range: null }));
  const { periods } = EvolutionCalculator.calculate([z]);
  assert.deepEqual(periods.map(p => p.range), [[2000, 2009], [2020, 2029]]);
  assert.match(periods[0].summary[1], /「祿星」化祿、「忌星」化忌/);
  assert.match(periods[1].summary[1], /資料不足/);
  assert.equal(Reflect.get(periods[0], 'isCurrent'), true);
  const strings = EvolutionCalculator.calculate([engine('ziwei', palace(), xiao(), daxian({ range: ['10', '19'] }))]);
  assert.deepEqual(strings.periods[0].range, [199109, 199118]);
});

test('palace brightness, minor-star cap and all three mutagen sources retain the formula', () => {
  for (const stars of ['majorStars', 'minorStars', 'adjectiveStars']) {
    const r = buildDaXianPalaceRadar([palace({ majorStars: [{ brightnessScore: 0.33333 }], minorStars: Array.from({ length: 12 }, () => ({})), [stars]: [{ name: '化星', brightnessScore: 0.33333 }] })], { index: 7, mutagen: ['化星'] }, 'title');
    const inputs = numericInputs(r.axes[0].inputs, ['mainStarBrightness', 'auxiliaryStarCount', 'fourTransformBonus']);
    assert.equal(inputs.fourTransformBonus, 100);
    assert.equal(r.axes[0].value, Math.round((inputs.mainStarBrightness * 0.6 + Math.min(inputs.auxiliaryStarCount * 10, 100) * 0.2 + 20) * 100) / 100);
  }
  const r = buildDaXianPalaceRadar([palace({ majorStars: [{ brightnessScore: null }, { brightnessScore: '1' }, { brightnessScore: 0.5 }] })], { index: 0 }, '');
  assert.equal(r.axes[0].value, 30);
  assert.ok(Number.isNaN(buildDaXianPalaceRadar([palace({ majorStars: [{ brightnessScore: NaN }] })], { index: 0 }, '').axes[0].value));
});

test('sparse palaces preserve missing labels and malformed star containers still throw', () => {
  const sparse = buildDaXianPalaceRadar([{}, { value: null }], { index: 0 }, '');
  assert.deepEqual(sparse.axes.map(a => [a.key, a.label, a.value]), [['palace_undefined', undefined, 0], ['palace_undefined', undefined, 0]]);
  for (const stars of ['majorStars', 'minorStars', 'adjectiveStars']) {
    assert.throws(() => buildDaXianPalaceRadar([palace({ [stars]: null })], { index: 0 }, ''), TypeError);
  }
  assert.throws(() => buildDaXianPalaceRadar([palace({ majorStars: [null] })], { index: 0 }, ''), TypeError);
});

test('narrative keeps first-axis ties, contiguous dominant runs, gaps and asOf truthiness', () => {
  const bazi = engine('bazi', elements(5, { 木: 1, 火: 1, 土: 1, 金: 1, 水: 1 }), dayun(0, { ganZhi: '?' }), dayun(1, { ganZhi: '?' }));
  assert.match(EvolutionCalculator.calculate([bazi]).narrative, /2000–2019 共 2 步皆以「木」為重心/);
  const gap = engine('bazi', elements(), dayun(), dayun(2));
  assert.match(EvolutionCalculator.calculate([gap], { asOf: '2026-01-01' }).narrative, /^以 2026-01-01 為基準日觀察，.*其後/);
  assert.ok(!EvolutionCalculator.calculate([gap], { asOf: '' }).narrative.startsWith('以 '));
});

test('payload getters, reference identity and original thrown values are not cached or sanitized', () => {
  let reads = 0;
  const e = component('elements', null);
  Object.defineProperty(e, 'value', { get() { reads++; return reads === 1 ? { counts: { 木: 2 } } : { total: 10 }; } });
  assert.equal(EvolutionCalculator.calculate([engine('bazi', e, dayun())]).periods[0].radar.axes[0].value, 46.67);
  assert.equal(reads, 2);
  const count = { valueOf: () => 2 };
  const r = Reflect.apply(buildDaYunElementRadar, null, [{ 木: count }, 10, { index: 0, ganZhi: '甲寅' }]);
  assert.equal(r.axes[0].inputs.natalCount, count);
  const sentinel = { message: 'synthetic getter failure' };
  const bad = palace();
  Object.defineProperty(bad, 'value', { get() { throw sentinel; } });
  assert.throws(() => buildDaXianPalaceRadar([bad], { index: 0 }, ''), err => err === sentinel);
});
