import { beforeAll, expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { analyze } from '@fortune/core';
import type { BaziTenGodsContextValue, MingGuaValue, ZiweiPalaceValue } from '@fortune/core';
import { Charts } from '../src/components/report/Charts';
import { Method } from '../src/components/report/Method';
import { baziStructure, engine, identity, mingGua, soulStars, ziweiBoard } from '../src/model/selectors';
import type { Component, EngineResult, Report } from '../src/model/types';

type Reject<T extends false> = T;
type Accept<T extends true> = T;
type IsAny<T> = 0 extends (1 & T) ? true : false;
type IsUnknown<T> = IsAny<T> extends true ? false : unknown extends T ? true : false;
export type OpaqueComponentContract = [
  Reject<IsAny<Component['value']>>,
  Accept<IsUnknown<Component['value']>>,
  Accept<IsUnknown<EngineResult['components'][number]['value']>>,
  Accept<IsUnknown<Report['engines'][number]['components'][number]['value']>>,
  Reject<IsAny<NonNullable<ReturnType<typeof mingGua>>['name']>>,
  Reject<IsAny<NonNullable<ReturnType<typeof ziweiBoard>>['palaces'][number]['name']>>,
];

// These are compile-time checks, included in the Web tsc invocation.
export function rejectedUncheckedReads(component: Component, group: BaziTenGodsContextValue, palace: ZiweiPalaceValue, gua: MingGuaValue) {
  // @ts-expect-error opaque values cannot be traversed without selecting a contract
  component.value.nested;
  // @ts-expect-error opaque values cannot silently become numeric
  const count: number = component.value;
  // @ts-expect-error producer contracts must not become an any escape hatch
  group.groups[0].share = 'fraction';
  // @ts-expect-error producer star payloads retain numeric brightness scores
  palace.majorStars[0].brightnessScore = 'bright';
  // @ts-expect-error the real MingGua producer year is numeric
  gua.yearForGua = 'year';
  return count;
}

let report: Report;
let unknownTime: Report;
beforeAll(() => {
  const input = { name: '', year: 1991, month: 10, day: 5, hour: 14, minute: 0, gender: 'female' as const };
  report = analyze(input, { asOf: '2026-09-25' }) as unknown as Report;
  unknownTime = analyze({ ...input, timeKnown: false }, { asOf: '2026-09-25' }) as unknown as Report;
});

function withValue(system: string, category: string, value: unknown): Report {
  return { ...report, engines: report.engines.map(result => result.engineId !== system ? result : {
    ...result, components: result.components.map(component => component.category !== category ? component : { ...component, value }),
  }) };
}

test('actual producer → selectors → all chart panels and Method remain connected', () => {
  expect(baziStructure(report)!.groups.length).toBeGreaterThan(0);
  expect(ziweiBoard(report)!.palaces).toHaveLength(12);
  expect(soulStars(report)!.borrowed).toBe(true);
  expect(mingGua(report)!.compass).toHaveLength(8);
  expect(identity(report)).toHaveLength(5);
  const html = renderToStaticMarkup(<Charts report={report} />);
  expect(html.match(/role="tabpanel"/g)).toHaveLength(5);
  expect(html).toContain('八字');
  expect(html).toContain('紫微');
  expect(html).toContain(mingGua(report)!.name);
  expect(renderToStaticMarkup(<Method report={report} />)).toContain('計算約定與已知限制');
});

test('unknown-time producer keeps unavailable panels without inventing natal components', () => {
  expect(baziStructure(unknownTime)).toBeNull();
  expect(ziweiBoard(unknownTime)).toBeNull();
  expect(soulStars(unknownTime)).toBeNull();
  expect(identity(unknownTime)).toHaveLength(3);
  expect(renderToStaticMarkup(<Charts report={unknownTime} />)).toContain('出生時辰不確定，八字結構未計算。');
});

test('arbitrary plugin payloads enter the shared boundary unchanged', () => {
  const cycle: { self?: unknown } = {}; cycle.self = cycle;
  for (const value of [undefined, null, NaN, 'opaque', 1n, Symbol('opaque'), () => 1, cycle]) {
    const component: Component = { id: 'custom', name: 'custom', category: 'custom', value };
    const added = { ...report, engines: [...report.engines, { engineId: 'custom', engineName: 'custom', components: [component], meta: {}, errors: [] }] };
    expect(engine(added, 'custom')!.components[0].value).toBe(value);
    expect(identity(added)).toEqual(identity(report));
  }
});

test('BaZi group projection preserves nullish defaults, strings, NaN and getter access', () => {
  let reads = 0;
  const observed = ['正官'];
  const value = { groups: [{ group: '官殺', context: 'legacy', presence: '顯',
    get share() { reads++; return '0.5'; }, visibleCount: NaN, hiddenCount: null, observedTenGods: observed }] };
  const group = baziStructure(withValue('bazi', 'tenGodsContext', value))!.groups[0];
  expect(reads).toBe(1);
  expect(group.share).toBe('0.5');
  expect(group.visibleCount).toBeNaN();
  expect(group.hiddenCount).toBe(0);
  expect(group.observed).toBe(observed);
  expect(() => baziStructure(withValue('bazi', 'tenGodsContext', { groups: {} }))).toThrow(TypeError);
});

test('Ziwei serialized star getters and original malformed-array exceptions survive', () => {
  const original = engine(report, 'ziwei')!.components.find(item => item.category === 'palaces')!.value as ZiweiPalaceValue;
  let scoreReads = 0;
  const star = { name: 'legacy', brightness: null, get brightnessScore() { scoreReads++; return NaN; }, mutagen: '' };
  const view = ziweiBoard(withValue('ziwei', 'palaces', { ...original, majorStars: [star], minorStars: [] }))!;
  expect(view.palaces[0].majorStars[0]).toEqual({ name: 'legacy', brightness: '', brightnessScore: NaN, mutagen: null });
  expect(scoreReads).toBe(24); // 12 components, original typeof check followed by value read.
  expect(() => ziweiBoard(withValue('ziwei', 'palaces', { ...original, majorStars: {} }))).toThrow(TypeError);
  expect(() => soulStars(withValue('ziwei', 'soulVsBody', { soul: { majorStars: {} } }))).toThrow(TypeError);
});

test('MingGua remains a projection rather than a payload coercion or validator', () => {
  const name = { retained: true };
  const output = mingGua(withValue('minggua', 'mingGua', { name, elementZh: '', groupName: false, yearForGua: '1991' }))!;
  expect(output.name).toBe(name);
  expect(output.groupName).toBe(false);
  expect(output.yearForGua).toBe('1991');
  expect(mingGua(withValue('minggua', 'mingGua', null))).toBeNull();
});

test('Method retains its exact false comparison and nullish convention access', () => {
  let reads = 0;
  const warning = '目前尚未做真太陽時校正';
  const html = renderToStaticMarkup(<Method report={withValue('bazi', 'natal', { get convention() { reads++; return { trueSolarTime: false }; } })} />);
  expect(reads).toBe(1);
  expect(html).toContain(warning);
  expect(renderToStaticMarkup(<Method report={withValue('bazi', 'natal', { convention: { trueSolarTime: 'false' } })} />)).not.toContain(warning);
  expect(renderToStaticMarkup(<Method report={withValue('bazi', 'natal', null)} />)).not.toContain(warning);
});

test('changed Web modules emit the same JavaScript as the frozen base', () => {
  const expected = [
    ['apps/web/src/model/types.ts', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['apps/web/src/model/selectors.ts', '62696d3f97f87a5bd7fa470c16c538aa92a9cb736d28669827cca362d52aa39d'],
    ['apps/web/src/components/report/Method.tsx', '9fe64c522bcaf6cd478ec8fae3bcfbced693632372c86a89b6726f500bdc09b7'],
  ];
  for (const [path, hash] of expected) {
    const source = readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
    const emitted = transformSync(source, { loader: path.endsWith('tsx') ? 'tsx' : 'ts', format: 'esm', target: 'es2022', ...(path.endsWith('tsx') ? { jsx: 'automatic' as const } : {}) }).code;
    expect(createHash('sha256').update(emitted).digest('hex')).toBe(hash);
    expect(createHash('sha256').update(emitted + '\nvoid 1;').digest('hex')).not.toBe(hash);
  }
});

test('new public producer type exports add no runtime code', () => {
  const source = readFileSync(new URL('../../../packages/core/src/index.ts', import.meta.url), 'utf8');
  const declarations = ['BaziComponent', 'SerializedStar', 'MingGuaValue'].map(firstName => {
    const declaration = source.split('\n').find(line => line.startsWith(`export type { ${firstName}`));
    expect(declaration).toBeDefined();
    return declaration!;
  }).join('\n');
  expect(transformSync(declarations, { loader: 'ts', format: 'esm', target: 'es2022' }).code).toBe('');
});
