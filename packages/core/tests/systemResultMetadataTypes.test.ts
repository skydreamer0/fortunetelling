import { expect, test } from 'bun:test';
import {
  SystemResult, type SystemResultMeta, type SystemResultParams,
  type SystemResultLike, type SystemResultJSON,
} from '../src/core/models/SystemResult';
import type { Report } from '../src/core/analyze';

type IsAny<T> = 0 extends (1 & T) ? true : false;
type Reject<T extends false> = T;
type Accept<T extends true> = T;
type IsUnknown<T> = IsAny<T> extends true ? false : unknown extends T ? true : false;
type Views = [
  SystemResultMeta['unavailableReason'],
  NonNullable<SystemResultParams['meta']>['timeConvention'],
  NonNullable<SystemResultLike['meta']>['timeConvention'],
  SystemResultJSON['meta']['timeConvention'],
  SystemResult['meta']['timeConvention'],
  ReturnType<SystemResult['toJSON']>['meta']['timeConvention'],
  Report['engines'][number]['meta']['timeConvention'],
];
type AnyView = { [K in keyof Views]: IsAny<Views[K]> }[number];
type UnknownView = { [K in keyof Views]: IsUnknown<Views[K]> }[number];
export type MetadataIsOpaqueAcrossPublicViews = [
  Reject<IsAny<SystemResultMeta>>,
  Reject<unknown extends SystemResultMeta ? true : false>,
  Reject<null extends SystemResultMeta ? true : false>,
  Reject<string extends SystemResultMeta ? true : false>,
  Reject<true extends AnyView ? true : false>,
  Reject<false extends UnknownView ? true : false>,
  Accept<unknown extends Views[number] ? true : false>,
];

// Each public view must accept arbitrary field payloads without an unsafe cast.
export function arbitraryFieldPayloads(value: unknown) {
  const metadata: SystemResultMeta = { arbitrary: value };
  const params: SystemResultParams = { engineId: 'synthetic', meta: metadata };
  const result = new SystemResult(params);
  const like: SystemResultLike = result;
  const json: SystemResultJSON = result.toJSON();
  const reportEngine: Report['engines'][number] = result;
  return [metadata, params.meta, result.meta, like.meta, json.meta, reportEngine.meta];
}

export function rejectUncheckedReads(result: SystemResult) {
  // @ts-expect-error engine metadata fields must be narrowed before traversal
  result.meta.timeConvention.timeIndex;
  // @ts-expect-error arbitrary metadata cannot silently become a number
  const index: number = result.meta.timeConvention;
  return index;
}

test('metadata remains reference-preserving and accepts arbitrary field payloads', () => {
  const cycle: { self?: unknown } = {};
  cycle.self = cycle;
  const values: unknown[] = [
    undefined, null, false, true, 0, -0, NaN, '', 'metadata', 0n, 1n,
    [], {}, Symbol('x'), () => 1, new Date('2000-01-01T00:00:00Z'),
    new Map([['x', 1]]), cycle,
  ];
  for (const value of values) {
    const meta = { arbitrary: value };
    const result = new SystemResult({ engineId: 'synthetic', meta });
    expect(result.meta).toBe(meta);
    expect(result.toJSON().meta).toBe(meta);
    expect(result.meta.arbitrary).toBe(value);
    expect(Object.hasOwn(result.meta, 'arbitrary')).toBe(true);
  }
});

test('engine metadata change must erase to identical executable JavaScript', async () => {
  const before = await Bun.file(new URL('./fixtures/systemResult.before-meta-unknown.ts', import.meta.url)).text();
  const after = await Bun.file(new URL('../src/core/models/SystemResult.ts', import.meta.url)).text();
  const transpiler = new Bun.Transpiler({ loader: 'ts' });
  expect(transpiler.transformSync(after)).toBe(transpiler.transformSync(before));
});

test('default metadata and ordinary JSON serialization keep existing shape and key order', () => {
  const result = new SystemResult({ engineId: 'synthetic' });
  const explicitDefault = new SystemResult({ engineId: 'synthetic', meta: undefined });
  expect(result.meta).toEqual({});
  expect(explicitDefault.meta).toEqual({});
  expect(explicitDefault.meta).not.toBe(result.meta);
  expect(result.toJSON().meta).toBe(result.meta);
  const meta = { zero: 0, no: false, empty: '', nullable: null, omitted: undefined, nested: { items: [1, 2] } };
  const snapshot = new SystemResult({ engineId: 'synthetic', meta });
  snapshot.computedAt = '2000-01-01T00:00:00.000Z';
  expect(JSON.stringify(snapshot.toJSON())).toBe('{"engineId":"synthetic","engineName":"synthetic","components":[],"meta":{"zero":0,"no":false,"empty":"","nullable":null,"nested":{"items":[1,2]}},"errors":[],"durationMs":0,"computedAt":"2000-01-01T00:00:00.000Z"}');
});
