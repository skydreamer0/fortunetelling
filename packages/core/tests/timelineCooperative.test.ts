import { expect, test } from 'bun:test';
import { astro } from 'iztro';
import i18next from 'iztro/lib/i18n';
import { buildTimeline, buildTimelineCooperatively, createTimeContext, ziweiCalculator,
  TimelineEnvironmentChangedError, ZiweiEngine, BirthData, type BirthProfile, type TimelineOptions } from '../src/index';
import baseline from './fixtures/cooperativeTimeline.v0.8.0.json';

const sha = (value: unknown) => new Bun.CryptoHasher('sha256').update(JSON.stringify(value)).digest('hex');
const restoreLanguage = (language: string) => { i18next.changeLanguage(language); };
const setup = (index = 0) => {
  const entry = baseline.records[index];
  const ctx = createTimeContext(entry.profile as BirthProfile);
  const opts = { ...entry.options, topSignalsPerDomain: entry.options.topSignalsPerDomain === 'Infinity'
    ? Infinity : entry.options.topSignalsPerDomain } as TimelineOptions;
  return { entry, ctx, opts };
};

// Static complete-serialization hashes were captured from the untouched 0.8.0
// tree identified by the fixture, before refactoring. No fields are omitted.
for (let index = 0; index < baseline.records.length; index++) {
  test(`cooperative full output and ordering retain 0.8.0 bytes: ${baseline.records[index].id}`, async () => {
    const { entry, ctx, opts } = setup(index);
    const synchronous = buildTimeline(ctx, opts);
    let units = 0;
    const cooperative = await buildTimelineCooperatively(ctx, opts,
      { signal: new AbortController().signal, yieldTask: async () => { units++; } });
    expect(cooperative).toEqual(synchronous);
    expect(JSON.stringify(cooperative)).toBe(JSON.stringify(synchronous));
    expect(sha(synchronous)).toBe(entry.timelineSha256);
    expect(sha(cooperative)).toBe(entry.timelineSha256);
    expect(sha(ziweiCalculator.calculate(ctx, { asOf: opts.asOf, useTrueSolarTime: opts.useTrueSolarTime,
      ziHourConvention: opts.ziHourConvention === 'early' ? 'nextDayAt23' : 'splitMidnight' }))).toBe(entry.calculatorSha256);
    expect(units).toBeGreaterThan(0);
  }, 15_000);
}

test('public cooperative bridge copies inputs and never substitutes global/default choices', async () => {
  const { ctx, opts } = setup(16);
  const expected = buildTimeline(ctx, opts);
  const before = structuredClone({ ctx, opts });
  let calls = 0;
  const pending = buildTimelineCooperatively(ctx, opts, { signal: new AbortController().signal,
    yieldTask: async () => { calls++; } });
  ctx.profile.date = '2000-01-01'; opts.ziHourConvention = 'early';
  opts.systemWeights = { bazi: 0, ziwei: 0, numerology: 0 };
  expect(await pending).toEqual(expected);
  expect(calls).toBeGreaterThan(1);
  expect(before.opts.ziHourConvention).toBe('late');
});

test('interleaved supported report clocks/zi conventions retain independent full outputs', async () => {
  const a = setup(16), b = setup(19);
  const expectedA = buildTimeline(a.ctx, a.opts), expectedB = buildTimeline(b.ctx, b.opts);
  expect(JSON.stringify(expectedA)).not.toBe(JSON.stringify(expectedB));
  const controller = new AbortController();
  const [actualA, actualB] = await Promise.all([a, b].map(value => buildTimelineCooperatively(value.ctx, value.opts,
    { signal: controller.signal, yieldTask: async () => {} })));
  expect(JSON.stringify(actualA)).toBe(JSON.stringify(expectedA));
  expect(JSON.stringify(actualB)).toBe(JSON.stringify(expectedB));
});

test('partial setup/cells and pre-publication cancellation propagate custom reasons; retry is exact', async () => {
  const { ctx, opts, entry } = setup();
  buildTimeline(ctx, opts); // Establish the existing supported zh-TW call contract.
  let total = 0;
  await buildTimelineCooperatively(ctx, opts, { signal: new AbortController().signal,
    yieldTask: async () => { total++; } });
  expect(total).toBeGreaterThan(60); // Real per-period setup exists; not one annual step.
  for (const checkpoint of [1, 10, 50, total - 2, total]) {
    const controller = new AbortController(), reason = { checkpoint };
    let calls = 0;
    await expect(buildTimelineCooperatively(ctx, opts, { signal: controller.signal, yieldTask: async () => {
      if (++calls === checkpoint) controller.abort(reason);
    } })).rejects.toBe(reason);
    expect(calls).toBe(checkpoint);
  }
  const retried = await buildTimelineCooperatively(ctx, opts,
    { signal: new AbortController().signal, yieldTask: async () => {} });
  expect(sha(retried)).toBe(entry.timelineSha256);
}, 15_000);

test('public non-default Ziwei engine and config interference discard a cooperative result', async () => {
  const { ctx, opts } = setup(); const original = i18next.language;
  const before = astro.getConfig().horoscopeDivide;
  const birth = new BirthData({ year: 1995, month: 7, day: 16, hour: 22, minute: 0, gender: 'male' });
  try {
    for (const mutate of [
      () => new ZiweiEngine({ language: 'zh-CN', asOf: '2026-09-25' }).run(birth),
      () => astro.config({ horoscopeDivide: 'exact' }),
    ]) {
      astro.config({ horoscopeDivide: before }); buildTimeline(ctx, opts);
      let calls = 0;
      await expect(buildTimelineCooperatively(ctx, opts, { signal: new AbortController().signal,
        yieldTask: async () => { if (++calls === 10) mutate(); } })).rejects.toBeInstanceOf(TimelineEnvironmentChangedError);
      expect(calls).toBe(10);
    }
    expect(astro.getConfig().horoscopeDivide).toBe('exact'); // No restoration by runtime.
  } finally { astro.config({ horoscopeDivide: before }); restoreLanguage(original); }
});

test('cooperative bridge does not widen to ephemeris systems or invent missing scope', async () => {
  const { ctx, opts } = setup();
  for (const systems of [undefined, ['jyotish'], ['humanDesign'], ['not-a-system']]) {
    let calls = 0;
    await expect(buildTimelineCooperatively(ctx, { ...opts, systems } as TimelineOptions,
      { signal: new AbortController().signal, yieldTask: async () => { calls++; } })).rejects.toBeInstanceOf(TimelineEnvironmentChangedError);
    expect(calls).toBe(0);
  }
});

test('year-only/zero-top-signal selections remain exact and invalid years do not become empty success', async () => {
  const { ctx, opts } = setup();
  const selected = { ...opts, includeMonths: false, years: 2, fromYear: 2024, topSignalsPerDomain: 0 };
  const sync = buildTimeline(ctx, selected);
  const actual = await buildTimelineCooperatively(ctx, selected, { signal: new AbortController().signal, yieldTask: async () => {} });
  expect(JSON.stringify(actual)).toBe(JSON.stringify(sync));
  expect(actual.months).toEqual([]);
  expect(actual.years.map(cell => cell.window.start)).toEqual(['2024-01-01', '2025-01-01']);
  expect(actual.years.every(cell => cell.domains.every(domain => domain.topSignals.length === 0))).toBe(true);
  for (const years of [0, 51, 1.5]) {
    expect(() => buildTimeline(ctx, { ...opts, years })).toThrow('years must be an integer');
    await expect(buildTimelineCooperatively(ctx, { ...opts, years },
      { signal: new AbortController().signal, yieldTask: async () => {} })).rejects.toThrow('years must be an integer');
  }
});
