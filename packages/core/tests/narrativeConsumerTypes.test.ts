import { test } from 'vitest';
import assert from 'node:assert/strict';
import { InsightBuilder, type Insights } from '../src/analysis/InsightBuilder';
import { SummaryBuilder, type Summary } from '../src/analysis/SummaryBuilder';
import type { SystemResult, SystemResultJSON, SystemResultLike } from '../src/core/models/SystemResult';

type IsAny<T> = 0 extends (1 & T) ? true : false;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
type InsightEngines = NonNullable<Parameters<typeof InsightBuilder.build>[0]>;
type SummaryEngines = Parameters<typeof SummaryBuilder.build>[0];
type ConsumerEngine = SummaryEngines[number];
type ConsumerComponent = NonNullable<ConsumerEngine['components']>[number];

export type NarrativePublicContracts = [
  Assert<Equal<NonNullable<InsightEngines[number]['components']>[number]['value'], unknown>>,
  Assert<Equal<ConsumerComponent['value'], unknown>>,
  Assert<Equal<IsAny<Insights['guidance']['numbers'][number]>, false>>,
  Assert<Equal<Insights['guidance']['numbers'], number[]>>,
  Assert<Equal<ReturnType<typeof SummaryBuilder.build>, Summary>>,
  Assert<SystemResult[] extends InsightEngines ? true : false>,
  Assert<SystemResultJSON[] extends SummaryEngines ? true : false>,
  Assert<SystemResultLike[] extends SummaryEngines ? true : false>,
];

// This function is only typechecked, never called. Keep unchecked reads illegal.
export function uncheckedNarrativePayloads(engines: InsightEngines, summary: SummaryEngines) {
  const insightValue = engines[0].components![0].value;
  const summaryValue = summary[0].components![0].value;
  // @ts-expect-error Component payloads must be selected at an engine/category read.
  insightValue.groups;
  // @ts-expect-error The Summary boundary must not restore shared Component.value any.
  summaryValue.majorStars;
}

function component(category: string, value: unknown, id = category): ConsumerComponent {
  return { id, name: `source:${id}`, category, value };
}
function engine(engineId: string, components: ConsumerComponent[]): ConsumerEngine {
  return { engineId, engineName: `engine:${engineId}`, components };
}
function insights(engines: InsightEngines) {
  return InsightBuilder.build(engines, [], { asOf: '2026-07-18' });
}

test('narrative consumers accept unknown payloads without eagerly validating unselected categories', () => {
  const item = component('unselected', null);
  Object.defineProperty(item, 'value', { get() { throw new Error('must remain unread'); } });
  const input = [engine('unselected', [item])];
  assert.deepEqual(SummaryBuilder.build(input).sentences, []);
  const result = insights(input);
  assert.ok(result.domains.every(domain => domain.insufficientData));
  assert.deepEqual(result.annual.themes, []);
  assert.deepEqual(result.guidance.numbers, []);
  assert.deepEqual(InsightBuilder.build(null, null).guidance.numbers, []);
  assert.deepEqual(InsightBuilder.build(undefined, undefined).guidance.numbers, []);
});

test('Summary retains last-engine selection, first category, source identity fields and sentence order', () => {
  const input = [
    engine('numerology', [component('lifePath', { number: 1 })]),
    engine('bazi', [component('dayMaster', { stem: '癸', element: '水', yinYang: '陰' }),
      component('elements', { counts: { 木: 0, 火: 0, 土: 0, 金: 0, 水: 2 }, total: 2 })]),
    engine('numerology', [component('lifePath', { number: 22, isMaster: 'legacy truthy' }, 'first'),
      component('lifePath', { number: 9 }, 'second')]),
  ];
  const before = structuredClone(input);
  const result = SummaryBuilder.build(input);
  assert.deepEqual(result.sentences.map(sentence => sentence.id),
    ['bazi_day_master', 'numerology_life_path', 'bazi_element_distribution']);
  assert.match(result.sentences[1].text, /生命靈數 22/);
  assert.match(result.sentences[1].text, /也是主數/);
  assert.deepEqual(result.sentences[1].sources, [{ engineId: 'numerology', engineName: 'engine:numerology',
    componentId: 'first', componentName: 'source:first' }]);
  assert.deepEqual(result.sourceSystems, ['bazi', 'numerology']);
  assert.deepEqual(input, before);
});

test('Summary star filtering and equal-brightness order preserve original array and fallback borrowing', () => {
  const stars = [null, { name: '' }, { name: 4 }, { name: '天同', brightnessScore: 0.5 },
    { name: '天梁', brightnessScore: 0.5 }, { name: '紫微', brightnessScore: 0.1 }];
  const before = structuredClone(stars);
  const result = SummaryBuilder.build([engine('ziwei', [
    component('palaces', { name: '命宮', index: 0, majorStars: [] }, 'soul'),
    component('palaces', { name: '身宮', index: 2, isBodyPalace: true, majorStars: [{ name: '太陰' }] }, 'body'),
    component('sanFangSiZheng', { anchor: '命宮', opposite: { name: '遷移', majorStars: stars } }, 'opposite'),
  ])]);
  assert.match(result.sentences[0].text, /對宮遷移的天同、天梁/);
  assert.match(result.sentences[0].text, /借宮閱讀/);
  assert.match(result.sentences[0].text, /身宮在身宮並見太陰/);
  assert.deepEqual(result.sentences[0].sources.map(source => source.componentId), ['soul', 'body', 'opposite']);
  assert.deepEqual(stars, before);
});

test('Summary explicit false soul and malformed/non-array stars retain nullish and empty behavior', () => {
  const fallback = component('palaces', { name: '命宮', majorStars: [{ name: '紫微' }] });
  const falseSoul = SummaryBuilder.build([engine('ziwei', [
    component('soulVsBody', { soul: false }), fallback,
  ])]);
  assert.deepEqual(falseSoul.sentences, []);
  for (const majorStars of [null, undefined, false, 0, '紫微', {}, new Set(['紫微'])]) {
    const result = SummaryBuilder.build([engine('ziwei', [component('soulVsBody', { soul: { majorStars } })])]);
    assert.deepEqual(result.sentences, []);
  }
});

test('Summary finite-count checks do not coerce numeric strings, and invalid total uses computed total', () => {
  const input = [engine('bazi', [component('elements', {
    counts: { 木: '8', 火: 2, 土: NaN, 金: Infinity, 水: -0, extra: 100 }, total: '100',
  })])];
  const result = SummaryBuilder.build(input);
  assert.match(result.sentences[0].text, /火較集中（100%）/);
  assert.match(result.sentences[0].text, /木、土、金、水未出現/);
  assert.deepEqual(SummaryBuilder.build([engine('bazi', [component('elements', { counts: {} })])]).sentences, []);
});

test('Insight keeps first-engine, id-or-category lookup and first matching group semantics', () => {
  const result = insights([
    engine('numerology', [component('unrelated-category', { number: 8 }, 'lifePath')]),
    engine('numerology', [component('lifePath', { number: 9 })]),
    engine('bazi', [component('tenGodsContext', { groups: [
      { group: '官殺', share: '0.25' }, { group: '官殺', share: 0.75 }, { group: '食傷', share: 0.5 },
    ] })]),
  ]);
  assert.deepEqual(result.guidance.numbers, [8]);
  assert.deepEqual(result.domains[0].metrics, [
    { label: '官殺', value: 25, unit: '%結構占比' }, { label: '食傷', value: 50, unit: '%結構占比' },
  ]);
  assert.equal(result.domains[0].insufficientData, false);
});

test('Insight annual branches retain raw arithmetic, stage ordering and sparse payload fallbacks', () => {
  const result = insights([
    engine('bazi', [component('natal', { year: '甲子' }), component('liuNian', { ganZhi: '丙午' }),
      component('daYun', { isCurrent: 1, ganZhi: '庚子', startYear: '2020', endYear: '2029' })]),
    engine('ziwei', [component('xiaoXian', { palaceIndex: '2' })]),
    engine('numerology', [component('personalYear', { number: 9 })]),
  ]);
  assert.deepEqual(result.annual.themes.map(theme => theme.id), ['year-rhythm', 'stage-background']);
  assert.equal(result.annual.themes[0].taiSui!.relation, '沖太歲');
  assert.match(result.annual.themes[1].text, /庚子大運（2020–2029）/);
  assert.match(result.annual.themes[1].text, /第 21 宮位/);
  assert.deepEqual(result.guidance.numbers, [9]);
});

test('Insight guidance keeps entry order, tied minima, raw references and unknown extension fields', () => {
  const limitation = { legacy: 'reference preserved' };
  const code = { legacy: 'code' };
  const direction = { legacy: 'direction' };
  const input = [engine('bazi', [component('elements', { counts: { extra: 0, 水: 0, 木: 2 }, limitation })]),
    engine('minggua', [component('directions', { auspicious: { B: { code, zh: direction }, A: { code: 'A', zh: '南' } } })])];
  const result = insights(input).guidance;
  assert.deepEqual(result.balance!.tiedElements, ['extra', '水']);
  assert.equal(result.balance!.element, 'extra');
  assert.equal(result.balance!.limitation as unknown, limitation);
  assert.deepEqual(result.directions.map(item => item.name), ['B', 'A']);
  assert.equal(result.directions[0].code as unknown, code);
  assert.equal(result.directions[0].direction as unknown, direction);
  assert.deepEqual([result.balance!.color, result.balance!.direction, result.balance!.habit], ['', '', '']);
  assert.match(result.balance!.text, /不能據此提出補缺建議/);
});

test('Insight Number.isFinite remains the exact non-coercing filter with Set order and negative zero semantics', () => {
  const cases: unknown[] = [undefined, null, false, true, '', '8', NaN, Infinity, -Infinity, 1n, Symbol('n'),
    {}, { valueOf() { throw new Error('finite filter must not coerce'); } }];
  for (const number of cases) {
    assert.deepEqual(insights([engine('numerology', [component('lifePath', { number })])]).guidance.numbers, []);
  }
  assert.deepEqual(insights([engine('numerology', [component('lifePath', { number: 8 }),
    component('personalYear', { number: 8 })])]).guidance.numbers, [8]);
  assert.deepEqual(insights([engine('numerology', [component('lifePath', { number: -0 }),
    component('personalYear', { number: 7 })])]).guidance.numbers, [0, 7]);
});

test('narrative property reads remain repeated and ordered rather than cached', () => {
  const reads: string[] = [];
  const elem = component('elements', null);
  const payload = { counts: { 木: 1 }, get limitation() { reads.push('limitation'); return 'kept'; } };
  Object.defineProperty(elem, 'value', { get() { reads.push('value'); return payload; } });
  insights([engine('bazi', [elem])]);
  assert.deepEqual(reads, ['value', 'value', 'value', 'limitation']);

  const order: string[] = [];
  const counts = { 木: 0, 火: 1, 土: 0, 金: 0, 水: 0 };
  const summaryElem = component('elements', null);
  const summaryPayload = { get counts() { order.push('counts'); return counts; },
    get total() { order.push('total'); return 1; } };
  Object.defineProperty(summaryElem, 'value', { get() { order.push('value'); return summaryPayload; } });
  SummaryBuilder.build([engine('bazi', [summaryElem])]);
  assert.deepEqual(order, ['value', 'counts', 'value', 'total', 'value', 'total', 'value', 'total']);
});

test('narrative consumers preserve getter thrown-object identity and malformed collection errors', () => {
  const thrown = { exact: 'sentinel' };
  const throwing = component('lifePath', null);
  Object.defineProperty(throwing, 'value', { get() { throw thrown; } });
  for (const build of [(values: ConsumerEngine[]) => insights(values), SummaryBuilder.build]) {
    assert.throws(() => build([engine('numerology', [throwing])]), error => error === thrown);
  }
  assert.throws(() => insights([engine('bazi', [component('tenGodsContext', { groups: {} })])]), TypeError);
  assert.throws(() => insights([engine('ziwei', [component('flyingStars', { mutagen: {} })])]), TypeError);
});
