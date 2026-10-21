import { expect, test, vi } from 'vitest';
import * as pillars from '../../../packages/core/src/calculators/bazi/pillars';
import { analyzeReplayReport, analyze as analyzeLegacy, createProfileCalculation, parseProfileFile, initEphemeris } from '@fortune/core';
import { analyze } from '../src/lib/core';
import { localQuestion, monthSignalProvider, reportSignalLookup } from '../src/model/askAi';
import { buildReportBacktestTimeline, canBacktest } from '../src/model/backtest';
import { reportReplaySession } from '../src/model/reportReplay';
import { buildProfileDownload } from '../src/lib/profileFile';
import type { Report } from '../src/model/types';
const input = { year: 1990, month: 5, day: 17, hour: 23, minute: 10, gender: 'female' as const,
  name: 'ALICE', timeKnown: true, timeAccuracy: 'exact' as const, calendarType: 'solar' as const,
  birthplace: { label: 'Synthetic', lat: 23, lng: 113, timezone: 'Asia/Taipei' },
  useTrueSolarTime: false, ziHourConvention: 'early' as const };
const asOf = '2026-01-01';
const web = (r: unknown) => r as Report;

test('real Web bridge produces Report8; Question, citation, LifeEvents and portable profile share identity', async () => {
  vi.useFakeTimers({ toFake: ['Date', 'performance'] }); vi.setSystemTime(new Date(asOf));
  try {
    const report = analyze(input);
    expect(report.schemaVersion).toBe(8);
    const spy = vi.spyOn(pillars, 'computePillars');
    const question = localQuestion(report, '2026 年買車');
    expect(question?.calculation).toEqual(report.calculation);
    expect(question?.answer?.ranking.length).toBeGreaterThan(0);
    const signals = monthSignalProvider(report)!({ start: '2026-01-01', end: '2026-01-31', grain: 'month' });
    expect(signals.length).toBeGreaterThan(0);
    expect(reportSignalLookup(report)(signals[0].id)?.id).toBe(signals[0].id);
    const backtest = buildReportBacktestTimeline(report);
    expect('calculation' in backtest && backtest.calculation).toEqual(report.calculation);
    expect(backtest.cells.length).toBeGreaterThan(0);
    expect(spy).not.toHaveBeenCalled(); spy.mockRestore();
    const download = buildProfileDownload(report, 'sky'); if (!download.ok) throw Error(download.error);
    const parsed = parseProfileFile(download.text); if (!parsed.ok) throw Error(parsed.errors.join(';'));
    const portable = createProfileCalculation(parsed.file);
    expect(portable.calculation.snapshotId).toBe(report.calculation?.snapshotId);
    expect(portable.calculation.specHash).toBe(report.calculation?.specHash);
  } finally { vi.useRealTimers(); vi.restoreAllMocks(); }
});

test('four settings, JSON reload, unknown-time and late ephemeris do not change the recorded sync replay scope', async () => {
  const identities = [];
  for (const useTrueSolarTime of [false, true]) for (const ziHourConvention of ['early', 'late'] as const) {
    const report = web(analyzeReplayReport({ ...input, useTrueSolarTime, ziHourConvention }, { asOf }));
    const saved = JSON.parse(JSON.stringify(report));
    expect(localQuestion(saved, '2026 年買車')).toEqual(localQuestion(report, '2026 年買車'));
    expect(buildReportBacktestTimeline(saved)).toEqual(buildReportBacktestTimeline(report));
    identities.push(report.calculation!.snapshotId);
  }
  expect(new Set(identities).size).toBe(4);
  const unknown = web(analyzeReplayReport({ ...input, timeKnown: false, timeAccuracy: 'unknown' }, { asOf }));
  expect(canBacktest(unknown)).toBe(true);
  expect(unknown.calculation?.excludedSystems).toEqual(['jyotish', 'humanDesign']);
  const before = buildReportBacktestTimeline(unknown);
  await initEphemeris();
  expect(buildReportBacktestTimeline(unknown)).toEqual(before);
});

test('tampered new reports abstain rather than fall back; legacy reports retain their old replay path', () => {
  const report = web(analyzeReplayReport(input, { asOf }));
  const bad = JSON.parse(JSON.stringify(report)); bad.replay.snapshot.snapshotId = 'forged';
  expect(reportReplaySession(bad)).toBeNull(); expect(canBacktest(bad)).toBe(false);
  if (!Array.isArray(report.signals)) throw new Error('Expected complete report signals');
  expect(reportSignalLookup(bad)(report.signals[0].id)).toBeNull();
  expect(localQuestion(bad, '2026 年買車')?.answer?.ranking).toEqual([]);
  expect(() => buildReportBacktestTimeline(bad)).toThrow('快照');
  const legacy = web(analyzeLegacy(input, { asOf }));
  expect(reportReplaySession(legacy)).toBeNull(); expect(canBacktest(legacy)).toBe(true);
  expect(localQuestion(legacy, '2026 年買車')?.calculation).toBeUndefined();
  expect(localQuestion(legacy, '2026 年買車')?.answer).toEqual(localQuestion(report, '2026 年買車')?.answer);
});

test('Report8 cached citation owns source, returned signals and nested proofs across cooperative reuse', async () => {
  const report = web(analyzeReplayReport(input, { asOf }));
  if (!Array.isArray(report.signals)) throw new Error('Expected report signals');
  const source = report.signals[0];
  const lookup = reportSignalLookup(report); // Same retained lookup used by AnswerCheck's reference cache.
  const original = structuredClone(lookup(source.id));
  const originalProofs = structuredClone(lookup.directionalEvidence());
  expect(originalProofs.length).toBeGreaterThan(0);
  source.evidence.text = 'FORGED AFTER VALIDATION';
  expect(lookup(source.id)).toEqual(original);
  const returned = lookup(source.id)!;
  returned.evidence.text = 'FORGED VIA RETURN';
  expect(source.evidence.text).toBe('FORGED AFTER VALIDATION');
  expect(lookup(source.id)).toEqual(original);
  const sourceProof = report.timeline!.years.flatMap(cell => cell.domains).find(domain => domain.directionalEvidence)?.directionalEvidence;
  if (!sourceProof) throw new Error('Expected source proof');
  sourceProof.window.start = 'forged source proof';
  expect(lookup.directionalEvidence()).toEqual(originalProofs);
  const exposedProofs = lookup.directionalEvidence();
  Object.assign(exposedProofs[0], { window: { start: 'forged', end: 'forged', grain: 'year' } });
  expect(lookup.directionalEvidence()).toEqual(originalProofs);
  expect(reportSignalLookup(report)(source.id)).toBeNull();

  // Lazy/cooperative signals and proofs must obey the same outward-copy contract.
  const fresh = web(analyzeReplayReport(input, { asOf }));
  const replay = reportReplaySession(fresh)!;
  const timeline = replay.timeline({ useTrueSolarTime: false, ziHourConvention: 'early', asOf: '2021-01-01', years: 1, includeMonths: true, topSignalsPerDomain: Infinity }).timeline;
  const target = timeline.months.flatMap(cell => cell.domains.flatMap(domain => domain.topSignals))[0];
  const prepared = reportSignalLookup(fresh);
  await prepared.prepare([target.id], new AbortController().signal, async () => {});
  expect(prepared(target.id)).toEqual(target);
  prepared(target.id)!.evidence.text = 'FORGED LAZY RETURN';
  expect(prepared(target.id)).toEqual(target);
  const proofs = prepared.directionalEvidence();
  const expected = structuredClone(proofs);
  for (const proof of proofs) Object.assign(proof.window, { start: 'forged' });
  await prepared.prepare([target.id], new AbortController().signal, async () => {});
  expect(prepared.directionalEvidence()).toEqual(expected);
  expect(prepared.calculation).toEqual(fresh.calculation);
});

test('retained or partial Report8 envelopes cannot be relabelled into legacy consumers', () => {
  const report = web(analyzeReplayReport(input, { asOf }));
  if (!Array.isArray(report.signals)) throw new Error('Expected report signals');
  for (const envelope of ['both', 'replay', 'calculation'] as const) {
    const bad = JSON.parse(JSON.stringify(report));
    bad.schemaVersion = 7;
    if (envelope === 'replay') delete bad.calculation;
    if (envelope === 'calculation') delete bad.replay;
    expect(canBacktest(bad)).toBe(false);
    expect(reportSignalLookup(bad)(report.signals[0].id)).toBeNull();
    expect(reportSignalLookup(bad).directionalEvidence()).toEqual([]);
    expect(localQuestion(bad, '2026 年買車')?.answer?.ranking).toEqual([]);
    expect(() => buildReportBacktestTimeline(bad)).toThrow('快照');
  }
});
