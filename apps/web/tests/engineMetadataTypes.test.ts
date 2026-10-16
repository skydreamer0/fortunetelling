import { expect, test } from 'vitest';
import type { DreamspellMetadata, SystemResult, ZiweiMetadata } from '@fortune/core';
import { analyze } from '../src/lib/core';
import { kin, notices, ziweiBoard } from '../src/model/selectors';
import type { EngineResult, Report } from '../src/model/types';

type Accept<T extends true> = T;
type Reject<T extends false> = T;
type IsAny<T> = 0 extends (1 & T) ? true : false;
type IsUnknown<T> = IsAny<T> extends true ? false : unknown extends T ? true : false;
type Same<A, B> = [A] extends [B] ? [B] extends [A] ? true : false : false;
type MetadataViews = [
  EngineResult['meta']['arbitrary'],
  EngineResult['meta']['fiveElementsClass'],
  EngineResult['meta']['fullSignature'],
  EngineResult['meta']['epoch'],
  EngineResult['meta']['unavailableReason'],
  EngineResult['meta']['unavailableMessage'],
  Report['engines'][number]['meta']['arbitrary'],
];
type ContainsAny = { [K in keyof MetadataViews]: IsAny<MetadataViews[K]> }[number];
type EveryViewIsUnknown = { [K in keyof MetadataViews]: IsUnknown<MetadataViews[K]> }[number];

// Included in the existing web typecheck, not only transpiled by Vitest.
export type OpaqueMetadataContract = [
  Reject<true extends ContainsAny ? true : false>,
  Reject<false extends EveryViewIsUnknown ? true : false>,
  Accept<Same<EngineResult['meta'], SystemResult['meta']>>,
  Accept<unknown extends MetadataViews[number] ? true : false>,
  Reject<unknown extends EngineResult['meta'] ? true : false>,
  Reject<null extends EngineResult['meta'] ? true : false>,
  Reject<IsAny<NonNullable<ReturnType<typeof kin>>['signature']>>,
  Reject<IsAny<NonNullable<ReturnType<typeof kin>>['epoch']>>,
  Reject<IsAny<NonNullable<ReturnType<typeof ziweiBoard>>['fiveElementsClass']>>,
  Accept<Same<NonNullable<ReturnType<typeof kin>>['signature'], DreamspellMetadata['fullSignature']>>,
  Accept<Same<NonNullable<ReturnType<typeof kin>>['epoch'], DreamspellMetadata['epoch']>>,
  Accept<Same<NonNullable<ReturnType<typeof ziweiBoard>>['fiveElementsClass'], ZiweiMetadata['fiveElementsClass']>>,
];

// Arbitrary legacy payloads still enter through the opaque boundary. The
// producer-specific assertions in selectors are not runtime validation.
export function arbitraryMetadata(value: unknown): EngineResult['meta'] {
  return {
    arbitrary: value, fiveElementsClass: value, fullSignature: value,
    epoch: value, unavailableReason: value, unavailableMessage: value,
  };
}

export function uncheckedReadsAreRejected(result: EngineResult) {
  // @ts-expect-error metadata fields need a specific contract before traversal
  result.meta.arbitrary.nested;
  // @ts-expect-error a producer's known field is also opaque at the shared boundary
  const signature: string = result.meta.fullSignature;
  // @ts-expect-error the shared boundary must not silently expose string methods
  result.meta.epoch.toUpperCase();
  return signature;
}

const base = analyze({
  name: '', year: 1991, month: 10, day: 5, hour: 14, minute: 0,
  timeKnown: true, gender: 'female', calendarType: 'solar',
});

function withMetadata(id: string, meta: EngineResult['meta']): Report {
  return { ...base, engines: base.engines.map(result => result.engineId === id ? { ...result, meta } : result) };
}

function legacyPayloads(): unknown[] {
  const cycle: { self?: unknown } = {};
  cycle.self = cycle;
  return [
    undefined, null, false, true, 0, -0, NaN, '', 'metadata', 0n, 1n,
    [], {}, Symbol('metadata'), () => 'metadata', new Date('2000-01-01T00:00:00Z'),
    new Map([['key', 1]]), cycle,
  ];
}

test('Dreamspell metadata retains nullish fallbacks and every other payload by reference', () => {
  const fallback = kin(withMetadata('dreamspell', {}))!;
  expect(fallback.signature).toBeTruthy();
  expect(fallback.epoch).toBe('');
  for (const value of legacyPayloads()) {
    const actual = kin(withMetadata('dreamspell', arbitraryMetadata(value)))!;
    expect(actual.signature).toBe(value ?? fallback.signature);
    expect(actual.epoch).toBe(value ?? '');
    expect(Object.keys(actual)).toEqual(['kin', 'signature', 'color', 'tone', 'seal', 'epoch']);
  }
});

test('Ziwei metadata retains its natal fallback without converting falsy or non-string payloads', () => {
  const fallback = ziweiBoard(withMetadata('ziwei', {}))!.fiveElementsClass;
  expect(fallback).toBeTruthy();
  for (const value of legacyPayloads()) {
    const actual = ziweiBoard(withMetadata('ziwei', arbitraryMetadata(value)))!;
    expect(actual.fiveElementsClass).toBe(value ?? fallback);
  }
});

test('unavailable notices keep their exact reason filter and opaque message passthrough', () => {
  for (const value of legacyPayloads()) {
    expect(notices(withMetadata('ziwei', { unavailableReason: 'unknown-time', unavailableMessage: value })).unavailable).toEqual([value]);
    expect(notices(withMetadata('ziwei', { unavailableReason: value, unavailableMessage: 'ignored' })).unavailable).toEqual([]);
  }
  expect(notices(withMetadata('ziwei', { unavailableReason: 'unknown-time' })).unavailable).toEqual([undefined]);
});

test('metadata getters retain their read count and order', () => {
  const reads: string[] = [];
  const dreamspell = kin(withMetadata('dreamspell', {
    get fullSignature() { reads.push('fullSignature'); return ''; },
    get epoch() { reads.push('epoch'); return 'epoch'; },
  }))!;
  expect(reads).toEqual(['fullSignature', 'epoch']);
  expect(dreamspell.signature).toBe('');
  expect(dreamspell.epoch).toBe('epoch');
  reads.length = 0;
  expect(ziweiBoard(withMetadata('ziwei', {
    get fiveElementsClass() { reads.push('fiveElementsClass'); return null; },
  }))!.fiveElementsClass).toBe(ziweiBoard(withMetadata('ziwei', {}))!.fiveElementsClass);
  expect(reads).toEqual(['fiveElementsClass']);
  reads.length = 0;
  expect(notices(withMetadata('ziwei', {
    get unavailableReason() { reads.push('unavailableReason'); return 'unknown-time'; },
    get unavailableMessage() { reads.push('unavailableMessage'); return 'message'; },
  })).unavailable).toEqual(['message']);
  expect(reads).toEqual(['unavailableReason', 'unavailableMessage']);
});
