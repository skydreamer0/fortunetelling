import { expect, test } from 'vitest';
import type { z } from 'zod';
import { conventionsFor, NOT_RECORDED } from '../src/conventions';
import { TOOLS } from '../src/tools/index';
import type { RegisteredTool, ToolContext, ToolDef } from '../src/tools/types';
import type { baziCalculator, humanDesignCalculator, jyotishCalculator, ziweiCalculator } from '@fortune/core';

type IsAny<T> = 0 extends (1 & T) ? true : false;
type Accept<T extends true> = T;
type Reject<T extends false> = T;
type Input = Parameters<typeof conventionsFor>[1];
export type ConsumerBoundaryContract = [
  Reject<IsAny<Input>>,
  Reject<IsAny<Parameters<RegisteredTool['handler']>[0]>>,
  Accept<[Parameters<RegisteredTool['handler']>[0]] extends [never] ? true : false>,
  Accept<ToolDef<{ value: z.ZodString }> extends RegisteredTool ? true : false>,
  Accept<ReturnType<typeof baziCalculator.calculate>['chart'] extends Input ? true : false>,
  Accept<ReturnType<typeof ziweiCalculator.calculate>['chart'] extends Input ? true : false>,
  Accept<ReturnType<typeof jyotishCalculator.calculate>['chart'] extends Input ? true : false>,
  Accept<ReturnType<typeof humanDesignCalculator.calculate>['chart'] extends Input ? true : false>,
];
export function uncheckedReadsRejected(input: NonNullable<Input>, tool: RegisteredTool, ctx: ToolContext) {
  // @ts-expect-error producer-specific data cannot be read at the shared boundary
  input.settings.node;
  // @ts-expect-error registry handler needs its matching Zod parse, not arbitrary data
  void tool.handler({ unvalidated: true }, ctx);
}
const ctx = { profile: { date: '1990-05-17', time: null, timeAccuracy: 'unknown', gender: 'female', birthplace: {label: 'Synthetic', lat: 0, lng: 0, timezone: ''} } } as const;

test('registry still exposes original schema/handler objects, with no runtime adapter', () => {
  expect(TOOLS.length).toBeGreaterThan(10);
  for (const tool of TOOLS) {
    expect(typeof tool.handler).toBe('function');
    expect(typeof tool.input).toBe('object');
  }
});

test('absent charts keep missing-convention behavior across all branches', () => {
  for (const system of ['bazi', 'ziwei', 'jyotish', 'humanDesign', 'numerology', 'tzolkin', 'mingGua', 'unknown']) {
    for (const chart of [null, undefined, {}]) {
      const result = conventionsFor(system, chart, ctx);
      expect(result).toEqual(conventionsFor(system, undefined, ctx));
      expect(JSON.stringify(result)).toContain(NOT_RECORDED);
    }
  }
});

test('selected producer leaves retain current values and read only selected properties', () => {
  const accesses: string[] = [];
  const chart = {
    get node() { accesses.push('node'); return 'true'; },
    get settings() { throw new Error('wrong branch'); },
    get conventions() { throw new Error('wrong branch'); },
    get time() { throw new Error('wrong branch'); },
  };
  expect(conventionsFor('humanDesign', chart, ctx).items.node).toContain('true node');
  expect(accesses).toEqual(['node']);
  const bazi = conventionsFor('bazi', { conventions: { useTrueSolarTime: false, ziHourConvention: 'early', clock: { basis: 'civil' }, yearMonthBasis: 'jie-instant' } }, ctx);
  expect(bazi.items.dayHourClock).toBe('當地民用時間');
  expect(bazi.items.ziHourConvention).toContain('23:00');
  expect(conventionsFor('jyotish', { settings: { ayanamsa: 'custom', dashaYearDays: 0, node: 'mean', houseSystem: 'whole_sign' } }, ctx).items.vimshottariYear).toContain('0 日');
  expect(conventionsFor('ziwei', { time: { basis: 'civil', ziHourConvention: 'nextDayAt23' } }, ctx).items.ziHourConvention).toContain('23:00');
});

test('legacy malformed leaf and getter errors are not swallowed or coerced by typing', () => {
  for (const system of ['bazi', 'ziwei', 'jyotish', 'humanDesign']) {
    const property = { bazi: 'conventions', ziwei: 'time', jyotish: 'settings', humanDesign: 'node' }[system]!;
    const chart = Object.defineProperty({}, property, { get() { throw new RangeError('synthetic getter'); } });
    expect(() => conventionsFor(system, chart, ctx)).toThrow(RangeError);
  }
  expect(conventionsFor('humanDesign', { node: 0 }, ctx).items.node).toBe(NOT_RECORDED);
  expect(conventionsFor('jyotish', { settings: { dashaYearDays: '365.25' } }, ctx).items.vimshottariYear).toBe(NOT_RECORDED);
});
