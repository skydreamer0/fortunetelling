import { expect, spyOn, test } from 'bun:test';
import { analyze, baziCalculator, buildTimeline, ZiweiEngine, BirthData, TimelineEnvironmentChangedError, type Signal } from '@fortune/core';
import { reportSignalLookup } from '../src/model/askAi';
import { reportTimelineOptions } from '../src/model/reportTimeline';
import type { Report } from '../src/model/types';

const input = { name: 'Synthetic cooperative QA', year: 1995, month: 7, day: 16,
  hour: 22, minute: 0, gender: 'male' as const,
  birthplace: { label: 'Synthetic Tainan QA', lat: 22.9922, lng: 120.1848, timezone: 'Asia/Taipei' } };
const report = analyze(input, { asOf: '2026-09-25' }) as unknown as Report;
const timeline = (year: number, source = report) => buildTimeline(source.timeContext as any, {
  asOf: year === 2026 ? source.asOf : `${year}-01-01`, years: 1, includeMonths: true,
  topSignalsPerDomain: Infinity, ...reportTimelineOptions(source)!,
});
const first = timeline(2021), second = timeline(2022);
const signals = (value: ReturnType<typeof buildTimeline>) => [...new Map(value.months.flatMap(cell =>
  cell.domains.flatMap(domain => domain.topSignals)).map(signal => [signal.id, signal])).values()];
const target = signals(first)[0], targetB = signals(second)[0];
const immediate = async () => {};
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
};

test('partial-year abort leaves no proofs/cursor/cache; exact fresh retry and cached zero-work path', async () => {
  const fresh = reportSignalLookup(report); let expectedUnits = 0;
  await fresh.prepare([target.id], new AbortController().signal, async () => { expectedUnits++; });
  expect(expectedUnits).toBeGreaterThan(60);
  for (const checkpoint of [10, 50, expectedUnits]) {
    const lookup = reportSignalLookup(report), controller = new AbortController();
    const before = JSON.stringify(lookup.directionalEvidence());
    const reason = { custom: 'whole-year rollback', checkpoint }; let calls = 0;
    await expect(lookup.prepare([target.id], controller.signal, async () => {
      if (++calls === checkpoint) controller.abort(reason);
    })).rejects.toBe(reason);
    expect(calls).toBe(checkpoint);
    expect(JSON.stringify(lookup.directionalEvidence())).toBe(before);
    let retryUnits = 0;
    await lookup.prepare([target.id], new AbortController().signal, async () => { retryUnits++; });
    expect(retryUnits).toBe(expectedUnits); // No incorrectly scanned/cached first year.
    expect(JSON.stringify(lookup.directionalEvidence())).toBe(JSON.stringify(fresh.directionalEvidence()));
    expect(lookup(target.id)).toEqual(target);
    let cachedUnits = 0;
    await lookup.prepare([target.id], new AbortController().signal, async () => { cachedUnits++; });
    expect(cachedUnits).toBe(0);
  }
}, 20_000);

test('scheduler failure is not a successfully empty year and retry is exact', async () => {
  const lookup = reportSignalLookup(report), failure = { scheduler: 'failed' };
  const before = JSON.stringify(lookup.directionalEvidence()); let units = 0;
  await expect(lookup.prepare([target.id], new AbortController().signal, async () => {
    if (++units === 12) throw failure;
  })).rejects.toBe(failure);
  expect(JSON.stringify(lookup.directionalEvidence())).toBe(before);
  await lookup.prepare([target.id], new AbortController().signal, immediate);
  expect(lookup(target.id)).toEqual(target);
});

test('completed first year survives partial second-year abort without duplicate proofs on retry', async () => {
  const fresh = reportSignalLookup(report); let firstUnits = 0, secondUnits = 0;
  await fresh.prepare([target.id], new AbortController().signal, async () => { firstUnits++; });
  const firstProofs = JSON.stringify(fresh.directionalEvidence());
  await fresh.prepare([targetB.id], new AbortController().signal, async () => { secondUnits++; });
  const lookup = reportSignalLookup(report), controller = new AbortController(), reason = { stop: 'second year' };
  let calls = 0;
  await expect(lookup.prepare([targetB.id], controller.signal, async () => {
    if (++calls === firstUnits + 10) controller.abort(reason);
  })).rejects.toBe(reason);
  expect(JSON.stringify(lookup.directionalEvidence())).toBe(firstProofs);
  let firstCached = 0;
  await lookup.prepare([target.id], new AbortController().signal, async () => { firstCached++; });
  expect(firstCached).toBe(0);
  let retried = 0;
  await lookup.prepare([targetB.id], new AbortController().signal, async () => { retried++; });
  expect(retried).toBe(secondUnits);
  expect(JSON.stringify(lookup.directionalEvidence())).toBe(JSON.stringify(fresh.directionalEvidence()));
}, 15_000);

test('genuine engine throws retain skip policy, even when named AbortError with a live signal', async () => {
  // Controlled fault injection only. Later calls still run the real calculator.
  for (const name of ['Error', 'AbortError']) {
    const failure = new Error('synthetic first-year engine fault'); failure.name = name;
    const fault = spyOn(baziCalculator, 'calculate').mockImplementationOnce(() => { throw failure; });
    try {
      const lookup = reportSignalLookup(report), signal = new AbortController().signal;
      await lookup.prepare([targetB.id], signal, immediate);
      expect(signal.aborted).toBe(false);
      expect(fault.mock.calls.map(call => call[1]?.asOf)).toEqual(['2021-01-01', '2022-01-01']);
      expect(lookup(targetB.id)).toEqual(targetB);
      // The skipped first year was not claimed successful or silently retried.
      const controller = new AbortController(), reason = { stop: 'observe next cursor' }; let units = 0;
      await expect(lookup.prepare([target.id], controller.signal, async () => {
        if (++units === 2) controller.abort(reason);
      })).rejects.toBe(reason);
      expect(fault.mock.calls.at(-1)?.[1]?.asOf).toBe('2023-01-01');
    } finally { fault.mockRestore(); }
  }
}, 15_000);

test('actual signal abort concurrent with a calculator throw is fatal and leaves the year retryable', async () => {
  const lookup = reportSignalLookup(report), controller = new AbortController(), reason = { stop: 'during real unit' };
  const before = JSON.stringify(lookup.directionalEvidence());
  const fault = spyOn(baziCalculator, 'calculate').mockImplementationOnce(() => {
    controller.abort(reason); throw new Error('secondary unit error');
  });
  try { await expect(lookup.prepare([target.id], controller.signal, immediate)).rejects.toBe(reason); }
  finally { fault.mockRestore(); }
  expect(JSON.stringify(lookup.directionalEvidence())).toBe(before);
  await lookup.prepare([target.id], new AbortController().signal, immediate);
  expect(lookup(target.id)).toEqual(target);
});

test('foreign public engine language invalidates partial year without committing it', async () => {
  const lookup = reportSignalLookup(report);
  const before = JSON.stringify(lookup.directionalEvidence()); let units = 0;
  try {
    await expect(lookup.prepare([target.id], new AbortController().signal, async () => {
      if (++units === 10) new ZiweiEngine({ language: 'zh-CN', asOf: report.asOf }).run(new BirthData(input));
    })).rejects.toBeInstanceOf(TimelineEnvironmentChangedError);
    expect(JSON.stringify(lookup.directionalEvidence())).toBe(before);
    new ZiweiEngine({ asOf: report.asOf }).run(new BirthData(input)); // Test-only restoration by supported caller.
    await lookup.prepare([target.id], new AbortController().signal, immediate);
    expect(lookup(target.id)).toEqual(target);
  } finally { new ZiweiEngine({ asOf: report.asOf }).run(new BirthData(input)); }
});

test('controlled old A resumes after B and cached new A without publishing or evicting their year', async () => {
  const lookup = reportSignalLookup(report), paused = deferred(), release = deferred(); let oldUnits = 0;
  const old = lookup.prepare([target.id], new AbortController().signal, async () => {
    if (++oldUnits === 10) { paused.resolve(); await release.promise; }
  });
  const caughtOld = old.then(() => ({ success: true }), error => ({ error }));
  await Promise.race([paused.promise, caughtOld.then(() => { throw new Error('Old A ended before its controlled pause'); })]);
  try {
  await lookup.prepare([targetB.id], new AbortController().signal, immediate);
  const afterB = JSON.stringify(lookup.directionalEvidence());
  let newAUnits = 0;
  await lookup.prepare([target.id], new AbortController().signal, async () => { newAUnits++; });
  expect(newAUnits).toBe(0);
  release.resolve();
  expect(await caughtOld).toMatchObject({ error: { name: 'AbortError', message: 'Citation preparation superseded' } });
  expect(oldUnits).toBe(10);
  expect(JSON.stringify(lookup.directionalEvidence())).toBe(afterB);
  expect(lookup(target.id)).toEqual(target);
  expect(lookup(targetB.id)).toEqual(targetB);
  } finally { release.resolve(); await caughtOld; }
}, 15_000);

test('synchronous scan supersedes a paused preparation without letting its cursor move backwards', async () => {
  const lookup = reportSignalLookup(report), paused = deferred(), release = deferred(); let units = 0;
  const pending = lookup.prepare([target.id], new AbortController().signal, async () => {
    if (++units === 10) { paused.resolve(); await release.promise; }
  });
  const caught = pending.then(() => null, error => error);
  await Promise.race([paused.promise, caught.then(() => { throw new Error('Preparation ended before its controlled pause'); })]);
  try {
  expect(lookup(targetB.id)).toEqual(targetB);
  const after = JSON.stringify(lookup.directionalEvidence());
  release.resolve();
  expect(await caught).toMatchObject({ name: 'AbortError' });
  expect(JSON.stringify(lookup.directionalEvidence())).toBe(after);
  let calls = 0;
  await lookup.prepare([targetB.id], new AbortController().signal, async () => { calls++; });
  expect(calls).toBe(0);
  } finally { release.resolve(); await caught; }
}, 15_000);

test('separate reports with differing supported clock/zi choices interleave without shared lookup state', async () => {
  const boundary = { ...input, year: 1990, month: 1, day: 26, hour: 23, minute: 30 };
  const a = analyze({ ...boundary, useTrueSolarTime: false, ziHourConvention: 'early' }, { asOf: report.asOf }) as unknown as Report;
  const b = analyze({ ...boundary, useTrueSolarTime: true, ziHourConvention: 'late' }, { asOf: report.asOf }) as unknown as Report;
  const ids = [a, b].map(source => signals(timeline(2021, source))[0]);
  const lookups = [a, b].map(reportSignalLookup);
  await Promise.all(lookups.map((lookup, i) => lookup.prepare([ids[i].id], new AbortController().signal, immediate)));
  for (const [i, lookup] of lookups.entries()) expect(lookup(ids[i].id)).toEqual(ids[i]);
}, 15_000);

test('one real 16-year cold scan resolves every expected annual month signal and keeps warm lookups zero-work', async () => {
  const lookup = reportSignalLookup(report); let calls = 0;
  await lookup.prepare(['sig_ffffffff'], new AbortController().signal, async () => { calls++; });
  expect(calls).toBeGreaterThan(16 * 60);
  for (let year = 2021; year <= 2036; year++) {
    const expected: Signal[] = signals(timeline(year));
    expect(expected.length).toBeGreaterThan(0); // Counted successful real reference calculations, not swallowed years.
    for (const signal of expected) expect(lookup(signal.id)).toEqual(signal);
  }
  expect(lookup('sig_ffffffff')).toBeNull();
  let warm = 0;
  await lookup.prepare(['sig_ffffffff'], new AbortController().signal, async () => { warm++; });
  expect(warm).toBe(0);
}, 60_000);
