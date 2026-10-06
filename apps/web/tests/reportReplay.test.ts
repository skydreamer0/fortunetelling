import { describe, expect, test } from 'bun:test';
import {
  analyze, answerQuestion, buildBacktestTimeline, buildTimeline,
  type Signal, type SignalWindow, type TimeContext, type Timeline,
} from '@fortune/core';
import { localQuestion, monthSignalProvider, reportSignalLookup } from '../src/model/askAi';
import type { Report } from '../src/model/types';

// Synthetic fixtures only. The first crosses 午/未 with a clock change;
// the second crosses the lunar month/year boundary at 23:00 with early zi.
const CROSSING = { year: 2026, month: 2, day: 15, hour: 13, minute: 3, gender: 'male' as const };
const MIDNIGHT = { year: 1990, month: 1, day: 26, hour: 23, minute: 30, gender: 'female' as const };
const AS_OF = '2026-12-15';
const defaults = { useTrueSolarTime: true, ziHourConvention: 'late' } as const;
const civilEarly = { useTrueSolarTime: false, ziHourConvention: 'early' } as const;

const asWeb = (report: ReturnType<typeof analyze>) => report as unknown as Report;
const ctxOf = (report: Report) => report.timeContext as unknown as TimeContext;
const sorted = (signals: readonly Signal[]) => [...signals].sort((a, b) => a.id.localeCompare(b.id));
function monthSignals(timeline: Timeline, month: number): Signal[] {
  const byId = new Map<string, Signal>();
  for (const domain of timeline.months[month - 1].domains) {
    for (const signal of domain.topSignals) byId.set(signal.id, signal);
  }
  return sorted([...byId.values()]);
}
function expectedYear(report: Report, year: number, options = civilEarly as { useTrueSolarTime: boolean; ziHourConvention: 'late' | 'early' }) {
  return buildTimeline(ctxOf(report), {
    asOf: year === 2026 ? AS_OF : `${year}-01-01`, years: 1, includeMonths: true,
    topSignalsPerDomain: Infinity, systems: report.timeline!.systems, ...options,
  });
}
const windowOf = (ym: string): SignalWindow => ({ grain: 'month', start: `${ym}-01`, end: `${ym}-28` });

describe('Issue #26 report replay through the real Web/core call chains', () => {
  for (const [label, input, options] of [
    ['cross-shichen civil clock', CROSSING, { useTrueSolarTime: false, ziHourConvention: 'late' }],
    ['early zi at lunar year end', MIDNIGHT, civilEarly],
    ['early zi at calendar year end', { ...MIDNIGHT, month: 12, day: 31 }, civilEarly],
  ] as const) {
    test(`month provider preserves ${label}, across December/January`, () => {
      const report = asWeb(analyze({ ...input, ...options }, { asOf: AS_OF }));
      const provider = monthSignalProvider(report)!;
      let differsFromDefaults = false;
      for (const year of [2026, 2027]) {
        const expected = expectedYear(report, year, options);
        const old = expectedYear(report, year, defaults);
        for (let month = 1; month <= 12; month++) {
          const ym = `${year}-${String(month).padStart(2, '0')}`;
          const signals = monthSignals(expected, month);
          if (JSON.stringify(signals) !== JSON.stringify(monthSignals(old, month))) differsFromDefaults = true;
          expect(sorted(provider(windowOf(ym)))).toEqual(signals);
        }
      }
      expect(differsFromDefaults).toBe(true);
    }, 60_000);
  }

  test('local question ranking uses the same month signals for a cross-year range', () => {
    const report = asWeb(analyze({ ...MIDNIGHT, ...civilEarly }, { asOf: AS_OF }));
    const local = localQuestion(report, '2026 到 2027 什麼時候買車')!;
    const years = new Map([2026, 2027].map(year => [year, expectedYear(report, year)]));
    const expected = answerQuestion({ category: local.category, range: local.range }, window =>
      monthSignals(years.get(Number(window.start.slice(0, 4)))!, Number(window.start.slice(5, 7))));
    expect(local.answer).toEqual(expected);
  }, 60_000);

  test('citation lookup resolves a non-default month signal absent from the report lists', () => {
    const report = asWeb(analyze({ ...MIDNIGHT, ...civilEarly }, { asOf: AS_OF }));
    const stored = new Set((report.signals as Signal[]).map(signal => signal.id));
    const defaultIds = new Set(expectedYear(report, 2027, defaults).months.flatMap(cell =>
      cell.domains.flatMap(domain => domain.topSignals.map(signal => signal.id))));
    const signal = expectedYear(report, 2027).months.flatMap(cell => cell.domains.flatMap(domain => domain.topSignals))
      .find(signal => !stored.has(signal.id) && !defaultIds.has(signal.id))!;
    expect(signal).toBeDefined();
    const lookup = reportSignalLookup(report);
    expect(lookup(signal.id)?.system).toBe(signal.system);
    expect(lookup(signal.id.slice(0, 12).toUpperCase())?.system).toBe(signal.system);
  }, 120_000);

  test('provider caches are isolated between reports with different time options', () => {
    const early = asWeb(analyze({ ...MIDNIGHT, ...civilEarly }, { asOf: AS_OF }));
    const late = asWeb(analyze({ ...MIDNIGHT, ...defaults }, { asOf: AS_OF }));
    const a = monthSignalProvider(early)!;
    const b = monthSignalProvider(late)!;
    const window = windowOf('2027-01');
    expect(sorted(a(window))).toEqual(monthSignals(expectedYear(early, 2027), 1));
    expect(sorted(b(window))).toEqual(monthSignals(expectedYear(late, 2027, defaults), 1));
    expect(sorted(a(window))).toEqual(monthSignals(expectedYear(early, 2027), 1));
  }, 60_000);

  test('backtest options reach every year chunk, preserving year scores and system contributions', () => {
    const report = asWeb(analyze({ ...MIDNIGHT, ...civilEarly }, { asOf: AS_OF }));
    const options = { asOf: AS_OF, fromYear: 2005, toYear: 2056, systems: report.timeline!.systems, ...civilEarly };
    const actual = buildBacktestTimeline(ctxOf(report), options);
    const expected = [2005, 2055].flatMap(fromYear => buildTimeline(ctxOf(report), {
      ...options, fromYear, years: Math.min(50, 2056 - fromYear + 1), includeMonths: false, topSignalsPerDomain: Infinity,
    }).years);
    for (let i = 0; i < expected.length; i++) for (const domain of expected[i].domains) {
      const result = actual.cells[i].domains[domain.domain];
      expect(result.score).toBe(domain.score);
      for (const [system, aggregate] of Object.entries(domain.perSystem)) {
        expect(result.perSystem[system as keyof typeof result.perSystem]).toBe(Math.round(aggregate!.score * 10_000) / 100);
      }
    }
  }, 120_000);
});
