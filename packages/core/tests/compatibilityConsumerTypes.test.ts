import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { analyzeCompatibility, type CompatibilityResult } from '../src/core/analyzeCompatibility';
import type { Report } from '../src/core/analyze';
import type { MingGuaValue } from '../src/engines/mingGuaTypes';

const state = vi.hoisted(() => ({
  reports: [] as unknown[],
  calls: [] as { input: unknown; options: { asOf?: unknown } }[],
}));

// Exercise the real comparison module with synthetic reports. No engine, clock,
// profile store or real birth data is required for these consumer boundaries.
vi.mock('../src/core/analyze', () => ({
  VERSION: 'consumer-test-version',
  analyze(input: unknown, options: { asOf?: unknown }) {
    state.calls.push({ input, options });
    return state.reports[state.calls.length - 1];
  },
}));

type Accept<T extends true> = T;
type Reject<T extends false> = T;
type IsAny<T> = 0 extends (1 & T) ? true : false;
type AvailableGua = Extract<CompatibilityResult['minggua'], { available: true }>;
type AvailableNumbers = Extract<CompatibilityResult['numerology'], { available: true }>;
type GuaLeaves = [AvailableGua['first']['name'], AvailableGua['first']['group'],
  AvailableGua['second']['name'], AvailableGua['second']['group']];
type AnyGuaLeaves = { [K in keyof GuaLeaves]: IsAny<GuaLeaves[K]> }[number];

// Core tsc checks these; Vitest transpilation alone is not type verification.
// The four Ming Gua leaves previously leaked any through CompatibilityResult.
export type CompatibilityConsumerContract = [
  Reject<true extends AnyGuaLeaves ? true : false>,
  Accept<AvailableGua['first']['name'] extends MingGuaValue['name'] ? true : false>,
  Accept<AvailableGua['first']['group'] extends MingGuaValue['groupName'] ? true : false>,
  Reject<IsAny<AvailableGua['sharedDirections'][number]>>,
  Accept<AvailableGua['sharedDirections'][number] extends string ? true : false>,
  Reject<IsAny<AvailableNumbers['first']['number']>>,
  Accept<AvailableNumbers['first']['number'] extends number ? true : false>,
  Accept<string extends CompatibilityResult['elements']['axes'][number]['label'] ? true : false>,
];

// @ts-expect-error an inferred producer name no longer accepts an arbitrary object
export type InvalidGuaName = Accept<{ legacy: true } extends AvailableGua['first']['name'] ? true : false>;
// @ts-expect-error group display names do not widen to arbitrary numbers
export type InvalidGuaGroup = Accept<number extends AvailableGua['second']['group'] ? true : false>;

interface LooseComponent { id: string; name: string; category: string; value: unknown }
interface LooseEngine { engineId: string; components: LooseComponent[] }
interface LooseReport { asOf: string; input: Report['input']; engines: LooseEngine[] }

const FIRST = { year: 1991, month: 10, day: 5, hour: 14, gender: 'female' as const };
const SECOND = { year: 1986, month: 5, day: 29, hour: 8, gender: 'male' as const };
const ELEMENTS = ['木', '火', '土', '金', '水'];

function component(category: string, value: unknown): LooseComponent {
  return { id: category, name: category, category, value };
}

function engine(engineId: string, category: string, value: unknown): LooseEngine {
  return { engineId, components: [component(category, value)] };
}

function report(engines: LooseEngine[] = [], name = ''): LooseReport {
  return {
    asOf: '2026-07-18',
    input: { ...FIRST, minute: 0, name, longitude: 121, latitude: 25 },
    engines,
  };
}

function run(first = report(), second = report(), asOf: string | null = '2026-01-01') {
  state.reports = [first, second];
  state.calls.length = 0;
  return analyzeCompatibility(FIRST, SECOND, { asOf });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-18T12:34:56.000Z'));
});
afterEach(() => vi.useRealTimers());

test('comparison forwards asOf once and preserves input references, keys and person fallbacks', () => {
  const first = report([], 'A synthetic name');
  const second = report();
  const result = run(first, second, null);
  expect(state.calls).toEqual([
    { input: FIRST, options: { asOf: null } },
    { input: SECOND, options: { asOf: first.asOf } },
  ]);
  expect(state.calls[0].input).toBe(FIRST);
  expect(state.calls[1].input).toBe(SECOND);
  expect(result.generatedAt).toBe('2026-07-18T12:34:56.000Z');
  expect(result.people.map(person => person.name)).toEqual(['A synthetic name', 'B']);
  expect(result.people[0].input).toBe(first.input);
  expect(result.people[1].input).toBe(second.input);
  expect(result.people.map(person => [person.lifePath, person.mingGua])).toEqual([[null, null], [null, null]]);
  expect(Object.keys(result)).toEqual(['version', 'schemaVersion', 'generatedAt', 'asOf', 'people', 'elements', 'numerology', 'minggua', 'narrative']);
  expect(Object.keys(result.people[0])).toEqual(['label', 'name', 'input', 'lifePath', 'mingGua']);
  expect(result.elements.available).toBe(false);
  expect(result.numerology).toEqual({ available: false });
  expect(result.minggua).toEqual({ available: false });
});

test('element comparisons keep legacy coercion, signed zero, formula and axis order', () => {
  const count = { valueOf: () => 2 };
  const counts = { 木: count, 火: false, 土: '', 金: null, 水: -0 };
  const first = report([engine('bazi', 'elements', { counts, total: '4' })]);
  const second = report([engine('bazi', 'elements', { counts: { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 }, total: 4 })]);
  const result = run(first, second);
  expect(result.elements.axes.map(axis => axis.label)).toEqual(ELEMENTS);
  expect(result.elements.axes.map(axis => axis.firstShare)).toEqual([50, 0, 0, 0, -0]);
  expect(result.elements.axes[0]).toEqual({ label: '木', firstShare: 50, secondShare: 0, combinedShare: 25, complement: 75, friction: 25 });
  expect(Object.keys(result.elements.axes[0])).toEqual(['label', 'firstShare', 'secondShare', 'combinedShare', 'complement', 'friction']);
  expect(result.elements.overallComplement).toBe(15);
  expect(result.elements.overallFriction).toBe(5);
  expect((first.engines[0].components[0].value as { counts: unknown }).counts).toBe(counts);
  expect(counts.木).toBe(count);
});

test('element truthiness and incomplete counts are retained without new normalization', () => {
  const counts = { 木: 1, 火: 1, 土: 1, 金: 1, 水: 1 };
  const second = report([engine('bazi', 'elements', { counts, total: 5 })]);
  for (const value of [undefined, null, false, 0, '', {}, [], Symbol('legacy')]) {
    expect(run(report([engine('bazi', 'elements', value)]), second).elements.available).toBe(false);
  }
  for (const total of [undefined, null, false, 0, -0, '', NaN]) {
    expect(run(report([engine('bazi', 'elements', { counts, total })]), second).elements.available).toBe(false);
  }
  expect(run(report([engine('bazi', 'elements', { counts, total: -5 })]), second).elements.axes[0].firstShare).toBe(-20);
  expect(run(report([engine('bazi', 'elements', { counts, total: Infinity })]), second).elements.axes[0].firstShare).toBe(0);
  const sparse = run(report([engine('bazi', 'elements', { counts: {}, total: 1 })]), second);
  expect(sparse.elements.available).toBe(true);
  expect(sparse.elements.axes.every(axis => Number.isNaN(axis.firstShare))).toBe(true);
  expect(sparse.elements.overallComplement).toBeNaN();
});

test('element reads retain guard, property-getter and arithmetic evaluation order', () => {
  const reads: string[] = [];
  const counts = Object.fromEntries(ELEMENTS.map(label => [label, 1]));
  const observed = new Proxy(counts, { get(target, property, receiver) {
    reads.push(String(property));
    return Reflect.get(target, property, receiver);
  } });
  const item: LooseComponent = { id: 'elements', name: 'elements', category: 'elements', get value() {
    reads.push('value');
    return {
      get counts() { reads.push('counts'); return observed; },
      get total() { reads.push('total'); return 5; },
    };
  } };
  const first = report([{ engineId: 'bazi', components: [item] }]);
  const second = report([engine('bazi', 'elements', { counts, total: 5 })]);
  expect(run(first, second).elements.axes[0].firstShare).toBe(20);
  expect(reads).toEqual(['value', 'counts', 'value', 'total',
    ...ELEMENTS.flatMap(label => ['value', 'counts', label, 'value', 'total'])]);
  let accesses = 0;
  first.engines[0].components[0] = { ...component('elements', null), get value() {
    accesses++;
    return accesses % 2 ? { counts: Object.fromEntries(ELEMENTS.map(label => [label, accesses])) } : { total: 4 };
  } };
  expect(run(first, second).elements.axes.map(axis => axis.firstShare)).toEqual([75, 125, 175, 225, 275]);
  expect(accesses).toBe(12);
});

test('life-path values preserve strict equality, coercion and person-summary references', () => {
  const first = report([engine('numerology', 'lifePath', { number: '2' })]);
  const second = report([engine('numerology', 'lifePath', { number: 2 })]);
  const result = run(first, second);
  expect(result.numerology).toMatchObject({ available: true, first: { number: '2' }, second: { number: 2 }, distance: 0, dynamic: '鄰近節奏' });
  expect(result.people[0].lifePath).toBe('2');
  const object = { valueOf: () => 2, toString: () => '2' };
  const same = run(report([engine('numerology', 'lifePath', { number: object })]), report([engine('numerology', 'lifePath', { number: object })]));
  expect(same.numerology.first?.number).toBe(object);
  expect(same.numerology.second?.number).toBe(object);
  expect(same.people[0].lifePath).toBe(object);
  expect(same.numerology.dynamic).toBe('同頻');
  for (const number of [0, false, '', -0]) {
    const loose = run(report([engine('numerology', 'lifePath', { number })]), second);
    expect(loose.numerology.first?.number).toBe(number);
    expect(loose.people[0].lifePath).toBe(number);
  }
  const sparse = run(report([engine('numerology', 'lifePath', {})]), second);
  expect(sparse.numerology.available).toBe(true);
  expect(sparse.numerology.distance).toBeNaN();
  expect(sparse.people[0].lifePath).toBeNull();
});

test('life-path getter stays one read per comparison and one per person summary', () => {
  const reads: string[] = [];
  const observed = (side: string) => ({ get number() { reads.push(side); return reads.length; } });
  const result = run(report([engine('numerology', 'lifePath', observed('A'))]), report([engine('numerology', 'lifePath', observed('B'))]));
  expect(reads).toEqual(['A', 'B', 'A', 'B']);
  expect(result.numerology.first?.number).toBe(1);
  expect(result.numerology.second?.number).toBe(2);
  expect(result.people.map(person => person.lifePath)).toEqual([3, 4]);
});

function guaReport(gua: unknown, auspicious?: unknown): LooseReport {
  return report([{ engineId: 'minggua', components: [component('mingGua', gua), component('directions', { auspicious })] }]);
}

test('Ming Gua keeps sparse payloads, nullish defaults, insertion order and Set identity', () => {
  const gua = { name: '乾', group: 'west', groupName: '西四命' };
  const marker = { toString: () => '物件方位' };
  const a = { x: { zh: '西' }, y: { zh: marker }, z: { zh: '東' }, repeat: { zh: '西' } };
  const b = { one: { zh: marker }, two: { zh: '西' }, three: { zh: { toString: () => '物件方位' } } };
  const result = run(guaReport(gua, a), guaReport(gua, b));
  expect(result.minggua.sharedDirections).toEqual(['西', marker]);
  expect(result.minggua.sharedDirections?.[1]).toBe(marker);
  expect(Object.keys(result.minggua)).toEqual(['available', 'first', 'second', 'sameGroup', 'sharedDirections', 'text', 'limitation']);
  for (const auspicious of [undefined, null, false, 0, '']) {
    expect(run(guaReport(gua, auspicious), guaReport(gua, auspicious)).minggua.sharedDirections).toEqual([]);
  }
  expect(run(guaReport(gua, 'ab'), guaReport(gua, 'xy')).minggua.sharedDirections).toEqual([undefined]);
  const sparse = run(guaReport({}), guaReport({}));
  expect(sparse.minggua).toMatchObject({ available: true, sameGroup: true, first: { name: undefined, group: undefined } });
  expect(sparse.people[0].mingGua).toBe('undefined卦 · undefined');
  expect(run(report([engine('minggua', 'directions', {})]), guaReport(gua)).minggua).toEqual({ available: false });
});

test('Ming Gua preserves repeated getter access and raw output leaf references', () => {
  const reads: string[] = [];
  const observed = (side: string): LooseEngine => {
    const payload = new Proxy({ name: '乾', group: 'west', groupName: '西四命' }, {
      get(target, property, receiver) { reads.push(`${side}.${String(property)}`); return Reflect.get(target, property, receiver); },
    });
    return { engineId: 'minggua', components: [{ ...component('mingGua', null), get value() { reads.push(`${side}.value`); return payload; } }] };
  };
  run(report([observed('A')]), report([observed('B')]));
  expect(reads).toEqual(['A.value', 'A.group', 'B.value', 'B.group',
    'A.value', 'A.name', 'A.value', 'A.groupName', 'B.value', 'B.name', 'B.value', 'B.groupName',
    'A.value', 'A.groupName', 'A.value', 'A.name', 'A.groupName', 'B.value', 'B.name', 'B.groupName']);
  const name = { toString: () => '乾' };
  const groupName = { toString: () => '西四命' };
  const raw = run(guaReport({ name, groupName, group: 'west' }), guaReport({ name, groupName, group: 'west' }));
  expect(raw.minggua.first?.name).toBe(name);
  expect(raw.minggua.first?.group).toBe(groupName);
  expect(raw.minggua.second?.name).toBe(name);
  expect(raw.minggua.second?.group).toBe(groupName);
});

test('malformed category payloads retain errors instead of becoming unavailable results', () => {
  const goodElements = report([engine('bazi', 'elements', { counts: { 木: 1 }, total: 1 })]);
  for (const total of [Symbol('total'), 1n]) {
    expect(() => run(report([engine('bazi', 'elements', { counts: { 木: 1 }, total })]), goodElements)).toThrow(TypeError);
  }
  for (const value of [null, undefined]) {
    expect(() => run(report([engine('numerology', 'lifePath', value)]), report([engine('numerology', 'lifePath', { number: 1 })]))).toThrow(TypeError);
    expect(() => run(guaReport(value), guaReport({}))).toThrow(TypeError);
  }
  for (const auspicious of [{ x: null }, { x: undefined }]) {
    expect(() => run(guaReport({}, auspicious), guaReport({}))).toThrow(TypeError);
  }
});

test('first matching engine and component win, and equal element ranks stay in canonical order', () => {
  const firstEngine = engine('numerology', 'lifePath', { number: 1 });
  firstEngine.components.push(component('lifePath', { number: 7 }));
  const first = report([firstEngine, engine('numerology', 'lifePath', { number: 9 })]);
  const second = report([engine('numerology', 'lifePath', { number: 2 })]);
  expect(run(first, second).numerology.first?.number).toBe(1);
  firstEngine.components.length = 0;
  expect(run(first, second).numerology).toEqual({ available: false });
  const equal = report([engine('bazi', 'elements', { counts: { 木: 1, 火: 1, 土: 1, 金: 1, 水: 1 }, total: 5 })]);
  const result = run(equal, equal);
  expect(result.elements.axes.map(axis => axis.label)).toEqual(ELEMENTS);
  expect(result.narrative.strength).toContain('「木」');
  expect(result.narrative.watchpoint).toContain('沒有任何五行');
});
