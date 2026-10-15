import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { expect, test } from 'vitest';
import {
  SystemResult,
  type Component,
  type ComponentInput,
  type SystemResultJSON,
  type SystemResultLike,
  type SystemResultParams,
} from '../src/core/models/SystemResult';
import type { Component as CalculatorComponent } from '../src/calculators/types';
import type { HumanDesignComponent } from '../src/calculators/humanDesign/componentTypes';
import type { JyotishComponent } from '../src/calculators/jyotish/componentTypes';
import type { BaziComponent } from '../src/engines/baziTypes';
import type { DreamspellComponent } from '../src/engines/dreamspellTypes';
import type { MingGuaComponent } from '../src/engines/mingGuaTypes';
import type { NumerologyComponent } from '../src/engines/numerologyTypes';
import type { ZiweiComponent } from '../src/engines/ziweiTypes';
import { SystemResult as Legacy } from './fixtures/systemResult.before-meta-unknown';

type Accept<T extends true> = T;
type Reject<T extends false> = T;
type IsAny<T> = 0 extends (1 & T) ? true : false;
type MetadataViews = [
  Component['meta'],
  CalculatorComponent['meta'],
  ComponentInput['meta'],
  NonNullable<SystemResultParams['components']>[number]['meta'],
  NonNullable<SystemResultLike['components']>[number]['meta'],
  SystemResultJSON['components'][number]['meta'],
  SystemResult['components'][number]['meta'],
  ReturnType<typeof SystemResult.component>['meta'],
  ReturnType<SystemResult['byCategory']>[number]['meta'],
  ReturnType<SystemResult['toJSON']>['components'][number]['meta'],
];
type ContainsAny = { [K in keyof MetadataViews]: IsAny<MetadataViews[K]> }[number];
type Producer = BaziComponent | DreamspellComponent | MingGuaComponent | NumerologyComponent
  | ZiweiComponent | HumanDesignComponent | JyotishComponent | CalculatorComponent;

// Compiled by core's existing typecheck, including all shared input/output views.
export type MetadataContract = [
  Reject<true extends ContainsAny ? true : false>,
  Accept<unknown extends Component['meta'] ? true : false>,
  Accept<Producer extends Component ? true : false>,
  Accept<Component extends CalculatorComponent ? true : false>,
  Accept<{ category: string; meta: unknown } extends ComponentInput ? true : false>,
];

// Never called at runtime: consumers must narrow metadata before using fields.
export function invalidMetadataReads(component: Component) {
  // @ts-expect-error metadata has no known fields before narrowing
  component.meta.convention;
  // @ts-expect-error unknown metadata cannot become a specific payload implicitly
  const convention: { timezone: string } = component.meta;
  return convention;
}

export function invalidCalculatorMetadataReads(component: CalculatorComponent) {
  // @ts-expect-error calculator adapters must not restore unchecked metadata fields
  return component.meta.convention;
}

function timezoneOf(component: Component): string | undefined {
  const metadata = component.meta;
  if (!metadata || typeof metadata !== 'object' || !('convention' in metadata)) return;
  const convention = metadata.convention;
  if (!convention || typeof convention !== 'object' || !('timezone' in convention)) return;
  return typeof convention.timezone === 'string' ? convention.timezone : undefined;
}

const raw = (meta: unknown): ComponentInput => ({ category: 'sample', value: { kept: true }, meta });

test('shared metadata stays opaque until narrowed, without restricting accepted payloads', () => {
  for (const meta of [undefined, null, false, 0, '', [], {}, { convention: null }, { convention: { timezone: 1 } }]) {
    expect(timezoneOf(SystemResult.component(raw(meta)))).toBeUndefined();
  }
  expect(timezoneOf(SystemResult.component(raw({ convention: { timezone: 'Asia/Taipei' } })))).toBe('Asia/Taipei');
});

test('all legacy truthy metadata is retained by reference and every falsy value is still omitted', () => {
  const cycle: { self?: unknown } = {};
  cycle.self = cycle;
  const metadata: unknown[] = [
    undefined, null, false, 0, -0, NaN, '', 0n,
    true, 1, 'metadata', 1n, Symbol('metadata'), () => 'metadata',
    [], {}, new Date('2000-01-01T00:00:00Z'), new Map([['x', 1]]), cycle,
  ];
  for (const meta of metadata) {
    const input = raw(meta);
    const actual = SystemResult.component(input);
    const expected = Legacy.component(input);
    expect(actual).toEqual(expected);
    expect(Object.keys(actual)).toEqual(Object.keys(expected));
    expect(Object.hasOwn(actual, 'meta')).toBe(Boolean(meta));
    expect(actual.value).toBe(input.value);
    if (meta) expect(actual.meta).toBe(meta);
  }
});

test('constructor, chaining, category lookup and JSON snapshot preserve metadata and field order', () => {
  const meta = { convention: { timezone: 'Asia/Taipei' } };
  const operations = (Result: typeof SystemResult | typeof Legacy) => {
    const result = new Result({ engineId: 'test', components: [raw(meta)] });
    // Only the pre-existing wall-clock field is fixed for deterministic comparison.
    result.computedAt = '2000-01-01T00:00:00.000Z';
    expect(result.add(raw(null))).toBe(result);
    expect(result.addMany([raw(false), raw({}), { category: 'other', meta: [] }])).toBe(result);
    expect(result.byCategory('sample')[0].meta).toBe(meta);
    expect(result.toJSON().components).toBe(result.components);
    expect(result.toJSON().components[0].meta).toBe(meta);
    return JSON.stringify(result.toJSON());
  };
  expect(operations(SystemResult)).toBe(operations(Legacy));
});

test('erasing the metadata type leaves the entire executable module byte-identical to frozen master', async () => {
  // Frozen verbatim from master 16f149f3153c4ffca43b89acdadbd061606b1ba3.
  const before = readFileSync(new URL('./fixtures/systemResult.before-meta-unknown.ts', import.meta.url), 'utf8');
  const after = readFileSync(new URL('../src/core/models/SystemResult.ts', import.meta.url), 'utf8');
  const transpiler = { transformSync: (source: string) => transformSync(source, { loader: 'ts', format: 'esm', target: 'esnext' }).code };
  expect(transpiler.transformSync(after)).toBe(transpiler.transformSync(before));
});
