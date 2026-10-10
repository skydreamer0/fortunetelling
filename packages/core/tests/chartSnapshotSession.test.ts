import { afterEach, expect, spyOn, test } from 'bun:test';
import { createCalculationSpec, resolveCalculationSpec } from '../src/core/calculationSpec';
import { createTimeContext } from '../src/time/createTimeContext';
import { buildTimeline } from '../src/timeline/buildTimeline';
import { buildBacktestTimeline } from '../src/backtest/timeline';
import * as pillars from '../src/calculators/bazi/pillars';
import i18next from 'iztro/lib/i18n';
const astro = require('iztro/lib/astro/astro') as typeof import('iztro/lib/astro/astro');
const api: any = await import('../src/core/chartSnapshotSession').catch(() => ({}));
const BIRTH = { year: 1990, month: 5, day: 17, hour: 23, minute: 10, name: 'ALICE', gender: 'female' as const,
  birthplace: { label: 'Synthetic original source', lat: 23, lng: 119.2269, timezone: 'Asia/Taipei' },
  useTrueSolarTime: true, ziHourConvention: 'early' as const };
const spies: Array<{ mockRestore(): void }> = [];
afterEach(() => { for (const spy of spies.splice(0)) spy.mockRestore(); });
function observe<T extends object>(object: T, key: keyof T) { const spy = spyOn(object, key as any); spies.push(spy); return spy; }
const options = { asOf: '2026-01-01', years: 1, systems: ['bazi', 'ziwei', 'numerology'] as const };
function context() { const r = resolveCalculationSpec(BIRTH); return { ctx: createTimeContext(r.profile), options: r.options }; }

test('real multiple-year projections reuse natal once and retain exact legacy timeline bytes', () => {
  const { ctx, options: time } = context();
  const expected = buildTimeline(ctx, { ...options, ...time });
  const bazi = observe(pillars, 'computePillars'), luck = observe(pillars, 'luckCycles'), ziwei = observe(astro, 'bySolar');
  const session = api.createChartSnapshotSession(createCalculationSpec(BIRTH));
  const initialZiwei = ziwei.mock.calls.length;
  const first = session.timeline(options);
  expect(first.timeline).toEqual(expected);
  expect(first.calculation).toEqual({ specHash: session.snapshot.specHash, snapshotId: session.snapshot.snapshotId });
  session.timeline({ ...options, asOf: '2027-01-01' });
  expect(session.timeline(options)).toEqual(first);
  expect(bazi).toHaveBeenCalledTimes(1);
  expect(luck).toHaveBeenCalledTimes(1);
  expect(ziwei.mock.calls.length).toBe(initialZiwei);
  first.timeline.years[0].domains[0].score = -1;
  expect(session.timeline(options).timeline).toEqual(expected);
}, 60_000);

test('backtest shares the same snapshot through more than 50 years', () => {
  const { ctx, options: time } = context();
  const opts = { asOf: '2041-01-01', fromYear: 1990, toYear: 2040, systems: ['bazi'] as const };
  const expected = buildBacktestTimeline(ctx, { ...opts, ...time });
  const bazi = observe(pillars, 'computePillars'), luck = observe(pillars, 'luckCycles');
  const session = api.createChartSnapshotSession(createCalculationSpec(BIRTH));
  const actual = session.backtest(opts);
  expect(actual.timeline).toEqual(expected);
  expect(actual.calculation.snapshotId).toBe(session.snapshot.snapshotId);
  expect(actual.timeline.cells).toHaveLength(51);
  expect(bazi).toHaveBeenCalledTimes(1);
  expect(luck).toHaveBeenCalledTimes(1);
}, 60_000);

test('serialized session reconstructs once, rejects corrupt content, overrides and ephemeris scope', () => {
  const spec = createCalculationSpec(BIRTH), first = api.createChartSnapshotSession(spec);
  const serialized = JSON.parse(JSON.stringify(first.snapshot));
  const session = api.createChartSnapshotSession(spec, serialized);
  serialized.natal.numerology.chart.lifePath.number = 99;
  expect(() => api.createChartSnapshotSession(spec, serialized)).toThrow('content');
  expect(session.snapshot).toEqual(first.snapshot);
  for (const bad of [{ ...options, systems: ['jyotish'] }, { ...options, name: 'BOB' },
    { ...options, useTrueSolarTime: false }, { ...options, ziHourConvention: 'late' }]) {
    expect(() => session.timeline(bad)).toThrow();
  }
});

test('cooperative cancel/retry and changed locale fail closed without poisoning the retained snapshot', async () => {
  const session = api.createChartSnapshotSession(createCalculationSpec(BIRTH));
  const baseline = session.timeline(options);
  const signal = new AbortController();
  let steps = 0;
  await expect(session.timelineCooperatively(options, { signal: signal.signal, yieldTask: async () => {
    if (++steps === 4) signal.abort(new Error('synthetic cancellation'));
  } })).rejects.toThrow('synthetic cancellation');
  expect(await session.timelineCooperatively(options, { signal: new AbortController().signal, yieldTask: async () => {} })).toEqual(baseline);
  const original = i18next.language;
  try {
    i18next.changeLanguage('zh-CN');
    expect(() => session.timeline(options)).toThrow();
    expect(i18next.language).toBe('zh-CN');
  } finally { i18next.changeLanguage(original); }
  expect(session.timeline(options)).toEqual(baseline);
}, 60_000);
