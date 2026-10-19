import { createRequire } from 'node:module';
const astro = createRequire(import.meta.url)('iztro/lib/astro/astro') as typeof import('iztro/lib/astro/astro');
import { expect, test, vi } from 'vitest';
import * as pillars from '../src/calculators/bazi/pillars';
import { analyze, analyzeReplayReport, createReportReplaySession } from '../src/index';
const input = { year: 1990, month: 5, day: 17, hour: 23, minute: 10, gender: 'female' as const,
  name: 'ALICE', birthplace: { label: 'Synthetic', lat: 23, lng: 113, timezone: 'Asia/Taipei' },
  useTrueSolarTime: false, ziHourConvention: 'early' as const };
const asOf = '2026-01-01';
const options = { asOf, years: 1, includeMonths: true, useTrueSolarTime: false, ziHourConvention: 'early' as const,
  systems: ['bazi', 'ziwei', 'numerology'] as const };

test('opt-in Report8 retains every Report7 field under a fixed clock and owns one live natal session', () => {
  vi.useFakeTimers({ toFake: ['Date', 'performance'] });
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  try {
    const legacy = analyze(input, { asOf });
    const spy = vi.spyOn(pillars, 'computePillars');
    const ziwei = vi.spyOn(astro, 'bySolar');
    const report = analyzeReplayReport(input, { asOf });
    const calls = spy.mock.calls.length, ziweiCalls = ziwei.mock.calls.length;
    const { calculation, replay, ...rest } = report;
    expect({ ...rest, schemaVersion: 7 }).toEqual(legacy);
    expect(calculation.specHash).toBe(replay.spec.specHash);
    expect(calculation.snapshotId).toBe(replay.snapshot.snapshotId);
    const session = createReportReplaySession(report);
    expect(createReportReplaySession(report)).toBe(session);
    expect(session.timeline(options).calculation).toEqual(calculation);
    expect(session.backtest({ ...options, fromYear: 2025, toYear: 2026 }).calculation).toEqual(calculation);
    expect(spy.mock.calls.length).toBe(calls);
    expect(ziwei.mock.calls.length).toBe(ziweiCalls);
    spy.mockRestore();
  } finally { vi.useRealTimers(); vi.restoreAllMocks(); }
});

test('JSON replay validates current complete source/snapshot and retains projection results', () => {
  const report = analyzeReplayReport(input, { asOf });
  const saved = JSON.parse(JSON.stringify(report));
  const live = createReportReplaySession(report), reload = createReportReplaySession(saved);
  expect(reload.timeline(options)).toEqual(live.timeline(options));
  expect(reload.backtest({ ...options, fromYear: 2025, toYear: 2026 })).toEqual(live.backtest({ ...options, fromYear: 2025, toYear: 2026 }));
  for (const mutate of [
    (r: any) => { r.replay.snapshot.identity.input.name = 'BOB'; },
    (r: any) => { r.calculation.snapshotId = 'forged'; },
    (r: any) => { r.replay.spec.identity.versions.core = 'old'; },
    (r: any) => { r.timeContext.profile.birthplace.lng += .000001; },
    (r: any) => { r.timeline.systemWeights.bazi = 0; },
    (r: any) => { r.timeline.years[0].domains[0].score += 1; },
    (r: any) => { r.version = 'historical'; },
    (r: any) => { r.signals[0].generatedAt = 'unreviewed-field'; },
    (r: any) => { r.replay.spec.generatedAt = 'unreviewed-field'; },
  ]) { const changed = JSON.parse(JSON.stringify(report)); mutate(changed); expect(() => createReportReplaySession(changed)).toThrow(); }
  expect(() => createReportReplaySession(analyze(input, { asOf }))).toThrow();
  expect(() => live.timeline({ ...options, useTrueSolarTime: true })).toThrow('mismatch');
  let reads = 0;
  expect(() => createReportReplaySession({ ...report, get replay() { reads++; return report.replay; } })).toThrow();
  expect(reads).toBe(0);
});

test('cooperative replay aborts without publishing partial results and retains owned source after caller mutation', async () => {
  const report = analyzeReplayReport(input, { asOf });
  const session = createReportReplaySession(report);
  const baseline = session.timeline(options);
  const controller = new AbortController();
  let yields = 0;
  await expect(session.timelineCooperatively(options, { signal: controller.signal,
    yieldTask: async () => { if (++yields === 2) controller.abort(new Error('intentional stop')); } })).rejects.toThrow('intentional stop');
  expect(yields).toBe(2);
  expect(await session.timelineCooperatively(options, { signal: new AbortController().signal, yieldTask: async () => {} })).toEqual(baseline);
  report.input.name = 'MUTATED';
  expect(() => createReportReplaySession(report)).toThrow();
  expect(session.timeline(options)).toEqual(baseline);
  let reads = 0;
  expect(() => analyzeReplayReport(input, { get asOf() { reads++; return asOf; } })).toThrow();
  expect(reads).toBe(0);
  expect(() => session.timeline(Object.create(options))).toThrow();
  expect(() => session.timeline({ ...options, get asOf() { reads++; return asOf; } })).toThrow();
  expect(reads).toBe(0);
});
