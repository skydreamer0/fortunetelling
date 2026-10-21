import { expect, test } from 'vitest';
import { createTimeContext } from '../src/time';
import { buildTimeline, buildTimelineAsync, replayAsyncTimeline, type TimelineOptions } from '../src/timeline/buildTimeline';
import dependencies from '../src/timeline/ephemerisDependencies.json';
import lock from '../../../package-lock.json';
const context = () => createTimeContext({ date: '1990-05-17', time: '23:10', timeAccuracy: 'exact', gender: 'female',
  birthplace: { label: 'Synthetic', lat: 23, lng: 113, timezone: 'Asia/Taipei' } });
const options = (): TimelineOptions => ({ asOf: '2026-01-01', years: 1, includeMonths: false,
  useTrueSolarTime: false, ziHourConvention: 'early', systems: ['jyotish', 'humanDesign'],
  ephemeris: { humanDesign: { sampleDays: { year: 30, month: 3 } } } });

test('actual async recording retains full real result and exact current-build JSON replay', async () => {
  const ctx = context(), opts = options();
  const record = await buildTimelineAsync(ctx, opts, { captureReplay: true });
  expect(record.timeline.systems).toEqual(['jyotish', 'humanDesign']);
  expect(record.timeline).toEqual(buildTimeline(ctx, opts));
  expect(await replayAsyncTimeline(JSON.parse(JSON.stringify(record)))).toEqual(record);
  expect(await buildTimelineAsync(ctx, opts, { captureReplay: true })).toEqual(record);
  expect(record.execution.scope).toBe('async-timeline');
  expect(Object.isFrozen(record.spec.context.profile.birthplace)).toBe(true);
  expect(Object.isFrozen(record.timeline.years[0].domains)).toBe(true);
  for (const [name, value] of Object.entries(dependencies)) {
    expect(lock.packages[`node_modules/${name}` as keyof typeof lock.packages]).toMatchObject(value);
  }
});

test('birth, period, ayanamsa, nodes and sampling are full execution identity, not aes1 alone', async () => {
  const ctx = context(), opts = options();
  const base = await buildTimelineAsync(ctx, opts, { captureReplay: true });
  const hashes = new Set([base.execution.specHash]);
  for (const changed of [
    { ...opts, asOf: '2027-01-01' },
    { ...opts, ephemeris: { ...opts.ephemeris, jyotish: { ayanamsa: 'raman' as const } } },
    { ...opts, ephemeris: { ...opts.ephemeris, jyotish: { node: 'true' as const } } },
    { ...opts, ephemeris: { humanDesign: { node: 'true' as const, sampleDays: { year: 15, month: 3 } } } },
  ]) {
    const actual = await buildTimelineAsync(ctx, changed, { captureReplay: true });
    expect(actual.timeline).toEqual(buildTimeline(ctx, changed));
    expect(actual.execution.specHash).not.toBe(base.execution.specHash);
    if (changed.ephemeris?.jyotish?.ayanamsa) expect(actual.timeline).not.toEqual(base.timeline);
    hashes.add(actual.execution.specHash);
  }
  const other = createTimeContext({ ...context().profile, date: '1990-05-18' });
  hashes.add((await buildTimelineAsync(other, opts, { captureReplay: true })).execution.specHash);
  expect(hashes.size).toBe(6);
});

test('complete content, source and dependency mismatch fail closed despite copied diagnostic hashes', async () => {
  const record = await buildTimelineAsync(context(), options(), { captureReplay: true });
  for (const change of [
    (r: typeof record) => { r.schemaVersion = 2 as 1; },
    (r: typeof record) => { r.spec.versions.core = 'future'; },
    (r: typeof record) => { r.spec.versions.ephemerisDependencies['@swisseph/core'].integrity = 'forged'; },
    (r: typeof record) => { r.spec.context.profile.name = 'forged'; },
    (r: typeof record) => { r.timeline.years[0].domains[0].score += 1; },
    (r: typeof record) => { Object.assign(r.timeline, { generatedAt: 'forged nested field' }); },
  ]) {
    const bad = structuredClone(record); change(bad);
    await expect(replayAsyncTimeline(bad)).rejects.toThrow();
  }
  let reads = 0;
  const bad = { ...record, get spec() { reads++; return record.spec; } };
  await expect(replayAsyncTimeline(bad)).rejects.toThrow(); expect(reads).toBe(0);
});

test('recording owns nested data before await; unknown time stays unknown and Infinity roundtrips explicitly', async () => {
  const ctx = context(), opts = options();
  const expected = await buildTimelineAsync(ctx, opts, { captureReplay: true });
  const pending = buildTimelineAsync(ctx, opts, { captureReplay: true });
  ctx.profile.name = 'changed'; ctx.profile.birthplace.lng = 0;
  (opts.systems as string[]).splice(0); opts.ephemeris!.humanDesign!.sampleDays!.year = 366;
  expect(await pending).toEqual(expected);
  const unknown = createTimeContext({ ...context().profile, time: null, timeAccuracy: 'unknown' });
  const record = await buildTimelineAsync(unknown, { ...options(), topSignalsPerDomain: Infinity }, { captureReplay: true });
  expect(record.spec.context.utc).toBeNull();
  expect(record.spec.context.profile.time).toBeNull();
  expect(record.timeline.skippedSystems).toEqual([{ system: 'jyotish', reason: 'time_unknown' }, { system: 'humanDesign', reason: 'time_unknown' }]);
  expect(record.spec.options.topSignalsPerDomain).toBe('all');
  expect(await replayAsyncTimeline(JSON.parse(JSON.stringify(record)))).toEqual(record);
});


test('recording rejects getters before await and detects changed shared iztro configuration', async () => {
  const { astro } = await import('iztro');
  let reads = 0;
  const opts = options();
  Object.defineProperty(opts, 'systems', { enumerable: true, get() { reads++; return ['jyotish']; } });
  await expect(buildTimelineAsync(context(), opts, { captureReplay: true })).rejects.toThrow();
  expect(reads).toBe(0);
  const before = structuredClone(astro.getConfig());
  try {
    const pending = buildTimelineAsync(context(), options(), { captureReplay: true });
    astro.config({ algorithm: before.algorithm === 'zhongzhou' ? 'default' : 'zhongzhou' });
    await expect(pending).rejects.toThrow('environment changed');
  } finally { astro.config({ algorithm: before.algorithm }); }
});

test('mixed real systems preserve legacy output and concurrent A/B/ABA isolation', async () => {
  const ctx = context();
  const a: TimelineOptions = { ...options(), systems: ['bazi', 'ziwei', 'numerology', 'mingGua', 'tzolkin', 'jyotish', 'humanDesign'] };
  const b: TimelineOptions = { ...a, ephemeris: { ...a.ephemeris, jyotish: { ayanamsa: 'raman', node: 'true' } } };
  const [first, other, again] = await Promise.all([a, b, a].map(opts => buildTimelineAsync(ctx, opts, { captureReplay: true })));
  expect(first).toEqual(again);
  expect(first.execution.specHash).not.toBe(other.execution.specHash);
  expect(first.timeline).toEqual(await buildTimelineAsync(ctx, a));
  expect(other.timeline).toEqual(buildTimeline(ctx, b));
  expect(await replayAsyncTimeline(JSON.parse(JSON.stringify(first)))).toEqual(first);
  expect(await replayAsyncTimeline(JSON.parse(JSON.stringify(other)))).toEqual(other);
});

test('record request and replay boundary reject inherited, hidden, symbolic and getter data without reading getters', async () => {
  let reads = 0;
  for (const request of [Object.create({ captureReplay: true }),
    Object.defineProperty({ captureReplay: true }, 'hidden', { value: 1 }),
    { captureReplay: true, [Symbol('extra')]: 1 },
    { get captureReplay() { reads++; return true; } }]) {
    await expect(buildTimelineAsync(context(), options(), request as { captureReplay: true })).rejects.toThrow();
  }
  expect(reads).toBe(0);
  const record = await buildTimelineAsync(context(), options(), { captureReplay: true });
  await expect(replayAsyncTimeline(Object.create(record))).rejects.toThrow();
  const source = structuredClone(record);
  const pending = replayAsyncTimeline(source);
  source.spec.context.profile.name = 'changed after replay entry';
  source.timeline.years[0].domains[0].score += 99;
  expect(await pending).toEqual(record);
});
