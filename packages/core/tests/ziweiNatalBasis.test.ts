import { afterEach, describe, expect, spyOn, test } from 'bun:test';
// Observe the implementation behind iztro's read-only re-export accessor.
// No mock module or replacement calculation: every call still runs real iztro.
const astro = require('iztro/lib/astro/astro') as typeof import('iztro/lib/astro/astro');
import { analyze } from '../src/core/analyze';
import { resolveCalculationSpec } from '../src/core/calculationSpec';
import { TimeContextZiweiEngine } from '../src/core/timeContextEngines';
import { createTimeContext } from '../src/time/createTimeContext';
import { toZiweiZiConvention } from '../src/core/analyzeInput';
import { timeIndexFrom } from '../src/calculators/ziwei/astrolabe';
import { ziweiCalculator, calculateZiweiSteps } from '../src/calculators/ziwei/calculator';
import { finishCalculation } from '../src/core/calculationSteps';
import { buildTimeline, buildTimelineCooperatively } from '../src/timeline/buildTimeline';
import * as publicCore from '../src/index';
import type { AnalyzeInput } from '../src/core/analyze';

const BIRTH: AnalyzeInput = { year: 1990, month: 1, day: 26, hour: 23, minute: 30,
  gender: 'female', name: 'SYNTHETIC ALICE', useTrueSolarTime: false, ziHourConvention: 'early',
  birthplace: { label: 'Synthetic Taipei', lat: 25.033, lng: 121.5654, timezone: 'Asia/Taipei' } };
const ASOF = '2026-09-25';
const spies: Array<{ mockRestore(): void }> = [];
afterEach(() => { for (const spy of spies.splice(0)) spy.mockRestore(); });
function observe() { const spy = spyOn(astro, 'bySolar'); spies.push(spy); return spy; }
function resolved(input: AnalyzeInput = BIRTH) {
  const value = resolveCalculationSpec(input);
  return { ...value, ctx: createTimeContext(value.profile), ziweiOptions: {
    useTrueSolarTime: value.options.useTrueSolarTime,
    ziHourConvention: toZiweiZiConvention(value.options.ziHourConvention),
  } };
}
async function factory() {
  const path = '../src/calculators/ziwei/natalBasis';
  const module = await import(path);
  expect(typeof module.createZiweiNatalBasisProvider).toBe('function');
  return module.createZiweiNatalBasisProvider as (ctx: any, options: any) => (ctx: any, options: any) => any;
}
const sharedCalculator = (ctx: any, options: any, provider: any) =>
  finishCalculation((calculateZiweiSteps as any)(ctx, options, provider)) as ReturnType<typeof ziweiCalculator.calculate>;
const stable = (result: unknown) => JSON.parse(JSON.stringify(result, (key, value) =>
  ['generatedAt', 'computedAt', 'durationMs'].includes(key) ? undefined : value));

describe('Issue #51 run-local Ziwei natal reuse (not a persisted ChartSnapshot)', () => {
  test('real analyze main chart and timeline construct the primary natal astrolabe once', () => {
    const { ctx, ziweiOptions } = resolved();
    const primary = timeIndexFrom(ctx, ziweiOptions)!;
    const date = primary.date.split('-').map(Number).join('-');
    const calls = observe();
    const report = analyze(BIRTH, { asOf: ASOF });
    expect(report.engines.find(engine => engine.engineId === 'ziwei')!.errors).toEqual([]);
    expect(report.timeline.systems).toContain('ziwei');
    expect(calls.mock.calls.filter(args => args[0] === date && args[1] === primary.timeIndex)).toHaveLength(1);
    for (const alt of primary.alternatives) {
      expect(calls.mock.calls.filter(args => args[0] === alt.date.split('-').map(Number).join('-')
        && args[1] === alt.timeIndex)).toHaveLength(1);
    }
    expect(report.schemaVersion).toBe(7);
    expect(report).not.toHaveProperty('snapshotId');
    expect(publicCore).not.toHaveProperty('createZiweiNatalBasisProvider');
    expect(publicCore).not.toHaveProperty('ZiweiNatalBasisEngine');
  });

  test('creation is lazy, matches full source identity and freezes plain natal views only', async () => {
    const create = await factory();
    const { ctx, ziweiOptions } = resolved();
    const original = structuredClone(ctx), options = structuredClone(ziweiOptions);
    const calls = observe();
    const provider = create(ctx, ziweiOptions), basis = provider(ctx, ziweiOptions);
    expect(calls).not.toHaveBeenCalled();
    expect(Object.isFrozen(basis)).toBe(true);
    const time = basis.time;
    expect(calls).not.toHaveBeenCalled();
    expect(Object.isFrozen(time)).toBe(true);
    expect(Object.isFrozen(time.alternatives)).toBe(true);
    const natal = basis.natalFor(time);
    expect(basis.natalFor(time)).toBe(natal);
    for (const changed of [{ ...time, timeIndex: 5 }, { ...time, wallTime: '2000-01-01T12:00:00' },
      { ...time, basis: time.basis === 'civil' ? 'trueSolar' : 'civil' }]) {
      expect(() => basis.astrolabeFor(changed)).toThrow('Ziwei natal basis resolution mismatch');
    }
    expect(Object.isFrozen(natal)).toBe(true);
    expect(Object.isFrozen(natal.palaces[0].majorStars)).toBe(true);
    expect(calls).toHaveBeenCalledTimes(1);
    expect(provider(structuredClone(ctx), structuredClone(ziweiOptions))).toBe(basis);
    expect(ctx).toEqual(original); expect(ziweiOptions).toEqual(options);
    expect(Object.isFrozen(ctx)).toBe(false);
    ctx.profile.birthplace.lng += 0.000001;
    expect(() => provider(ctx, ziweiOptions)).toThrow('Ziwei natal basis input mismatch');
    expect(basis.natalFor(time)).toBe(natal);
  });

  test('main and typed period projections reuse natal work without exposing mutable results', async () => {
    const create = await factory();
    const { ctx, options, ziweiOptions, birth } = resolved();
    const expected = ziweiCalculator.calculate(ctx, { asOf: ASOF, ...ziweiOptions });
    const expectedEngine = new TimeContextZiweiEngine({ ctx, asOf: new Date(ASOF), ...options }).run(birth);
    const calls = observe(), provider = create(ctx, ziweiOptions);
    const main = new TimeContextZiweiEngine({ ctx, asOf: new Date(ASOF), ...options, natalBasis: provider } as any).run(birth);
    expect(stable(main)).toEqual(stable(expectedEngine));
    const palace = main.components.find(component => component.category === 'palaces' && component.value.decadalRange)!;
    palace.value.decadalRange[0] = -123;
    main.meta.timeConvention.alternatives[0].reasons.push('caller mutation');
    expect(stable(new TimeContextZiweiEngine({ ctx, asOf: new Date(ASOF), ...options, natalBasis: provider } as any).run(birth)))
      .toEqual(stable(expectedEngine));
    const first = sharedCalculator(ctx, { asOf: ASOF, ...ziweiOptions }, provider);
    expect(first).toEqual(expected);
    const count = calls.mock.calls.length;
    first.chart.palaces[0].name = 'caller mutation';
    first.components[0].value = { changed: true };
    first.chart.alternatives[0].palaces[0].name = 'caller mutation';
    first.chart.alternatives[0].resolution.reasons.push('caller mutation' as any);
    const second = sharedCalculator(ctx, { asOf: ASOF, ...ziweiOptions }, provider);
    expect(second).toEqual(expected);
    expect(calls.mock.calls.length).toBe(count);
    const later = sharedCalculator(ctx, { asOf: '2027-02-07', ...ziweiOptions }, provider);
    expect(calls.mock.calls.length).toBe(count);
    expect(later).toEqual(ziweiCalculator.calculate(ctx, { asOf: '2027-02-07', ...ziweiOptions }));
  }, 60_000);

  test('different settings or complete source values cannot reuse another basis; A → B → A remains isolated', async () => {
    const create = await factory();
    const a = resolved(), b = resolved({ ...BIRTH, useTrueSolarTime: true, ziHourConvention: 'late' });
    const providerA = create(a.ctx, a.ziweiOptions), providerB = create(b.ctx, b.ziweiOptions);
    const first = sharedCalculator(a.ctx, { asOf: ASOF, ...a.ziweiOptions }, providerA);
    const second = sharedCalculator(b.ctx, { asOf: ASOF, ...b.ziweiOptions }, providerB);
    expect(first.chart.time).not.toEqual(second.chart.time);
    expect(sharedCalculator(a.ctx, { asOf: ASOF, ...a.ziweiOptions }, providerA)).toEqual(first);
    expect(() => providerA(a.ctx, b.ziweiOptions)).toThrow('Ziwei natal basis input mismatch');
    for (const change of [
      { ...a.ctx, profile: { ...a.ctx.profile, name: 'SYNTHETIC BOB' } },
      { ...a.ctx, profile: { ...a.ctx.profile, birthplace: { ...a.ctx.profile.birthplace, label: 'Other label' } } },
    ]) expect(() => providerA(change, a.ziweiOptions)).toThrow('Ziwei natal basis input mismatch');
  }, 60_000);

  test('unknown birth time preserves unavailable outputs without creating an astrolabe', async () => {
    const create = await factory();
    const { ctx, ziweiOptions } = resolved({ ...BIRTH, timeKnown: false });
    const calls = observe(), provider = create(ctx, ziweiOptions);
    expect(provider(ctx, ziweiOptions).time).toBeNull();
    expect(sharedCalculator(ctx, { asOf: ASOF, ...ziweiOptions }, provider)).toEqual(
      ziweiCalculator.calculate(ctx, { asOf: ASOF, ...ziweiOptions }));
    expect(calls).not.toHaveBeenCalled();
  });

  test('lazy source copies cannot drift and a failed natal construction is not retained', async () => {
    const create = await factory(), { ctx, ziweiOptions } = resolved();
    const expectedTime = timeIndexFrom(ctx, ziweiOptions)!;
    const provider = create(ctx, ziweiOptions), basis = provider(ctx, ziweiOptions);
    ctx.profile.gender = 'male'; ctx.profile.birthplace.lng += 10;
    ziweiOptions.useTrueSolarTime = !ziweiOptions.useTrueSolarTime;
    expect(basis.time).toEqual(expectedTime);
    expect(basis.gender).toBe('female');
    const calls = observe();
    calls.mockImplementationOnce(() => { throw new Error('synthetic natal failure'); });
    expect(() => basis.natalFor(expectedTime)).toThrow('synthetic natal failure');
    const natal = basis.natalFor(expectedTime);
    expect(natal.palaces).toHaveLength(12);
    expect(basis.natalFor(expectedTime)).toBe(natal);
    expect(calls).toHaveBeenCalledTimes(2);
    expect(() => provider(ctx, ziweiOptions)).toThrow('Ziwei natal basis input mismatch');
  });

  test('standalone and cooperative timelines each reuse one private primary; cancellation cannot leak it into retry', async () => {
    const { ctx, options, ziweiOptions } = resolved(), primary = timeIndexFrom(ctx, ziweiOptions)!;
    const opts = { ...options, asOf: ASOF, systems: ['ziwei'] as const, years: 1 };
    const calls = observe();
    const count = () => calls.mock.calls.filter(args => args[0] === primary.date.split('-').map(Number).join('-')
      && args[1] === primary.timeIndex).length;
    const sync = buildTimeline(ctx, opts);
    expect(count()).toBe(1);
    let units = 0;
    const cooperative = await buildTimelineCooperatively(ctx, opts, { signal: new AbortController().signal,
      yieldTask: async () => { units++; } });
    expect(cooperative).toEqual(sync); expect(count()).toBe(2); expect(units).toBeGreaterThan(30);
    const controller = new AbortController(), reason = { cancelled: 'synthetic checkpoint' };
    let ticks = 0;
    await expect(buildTimelineCooperatively(ctx, opts, { signal: controller.signal, yieldTask: async () => {
      if (++ticks === 5) controller.abort(reason);
    } })).rejects.toBe(reason);
    expect(count()).toBe(3);
    expect(await buildTimelineCooperatively(ctx, opts, { signal: new AbortController().signal,
      yieldTask: async () => {} })).toEqual(sync);
    expect(count()).toBe(4);
  }, 30_000);

  test('solar/civil and early/late midnight projections remain equal to independent real calculations', async () => {
    const create = await factory();
    for (const [hour, minute] of [[22, 59], [23, 0], [23, 59], [0, 0]]) {
      for (const useTrueSolarTime of [false, true]) for (const ziHourConvention of ['late', 'early'] as const) {
        const { ctx, options, ziweiOptions, birth } = resolved({ ...BIRTH, hour, minute, useTrueSolarTime, ziHourConvention });
        const provider = create(ctx, ziweiOptions), cfg = { asOf: ASOF, ...ziweiOptions };
        expect(sharedCalculator(ctx, cfg, provider)).toEqual(ziweiCalculator.calculate(ctx, cfg));
        expect(stable(new TimeContextZiweiEngine({ ctx, asOf: new Date(ASOF), ...options, natalBasis: provider } as any).run(birth)))
          .toEqual(stable(new TimeContextZiweiEngine({ ctx, asOf: new Date(ASOF), ...options }).run(birth)));
      }
    }
  }, 60_000);
});
