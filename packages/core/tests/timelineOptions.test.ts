import { describe, expect, test } from 'bun:test';
import { analyze, type AnalyzeInput } from '../src/core/analyze';
import { resolveAnalyzeInput, toZiweiZiConvention, type AnalysisTimeOptions } from '../src/core/analyzeInput';
import { createTimeContext } from '../src/time/createTimeContext';
import { baziCalculator } from '../src/calculators/bazi/calculator';
import { monthlyPillars } from '../src/calculators/bazi/pillars';
import { toBaziRuleChart } from '../src/calculators/bazi/ruleChart';
import { ziweiCalculator } from '../src/calculators/ziwei/calculator';
import { createAstrolabe, monthlySequence } from '../src/calculators/ziwei/astrolabe';
import { toZiweiRuleChart } from '../src/calculators/ziwei/ruleChart';
import { evaluateBaziRules } from '../src/rules/bazi/evaluate';
import { evaluateBaziTenGodRules } from '../src/rules/bazi/evaluateTenGods';
import { evaluateZiweiRules } from '../src/rules/ziwei/evaluate';
import { buildTimeline, buildTimelineAsync, dominantPeriod, type TimelineCell, type TimelineOptions } from '../src/timeline/buildTimeline';
import type { Signal } from '../src/signals/types';
import { aggregateSignals } from '../src/signals/aggregate';

const AS_OF = '2026-07-11';
const SYSTEMS = ['bazi', 'ziwei', 'numerology'] as const;
// Synthetic fixtures; no personal birth records. The first crosses 午/未 only
// when the selected clock changes (Taipei civil 13:03 -> true solar 12:55).
const CROSSING: AnalyzeInput = { year: 2026, month: 2, day: 15, hour: 13, minute: 3, gender: 'male' };
const MIDNIGHT: AnalyzeInput = { year: 1990, month: 6, day: 15, hour: 23, minute: 0, gender: 'female' };

function assertSignalIds(cell: TimelineCell, system: 'bazi' | 'ziwei', expected: Signal[]) {
  const aggregates = aggregateSignals([...expected].sort((a, b) => a.id.localeCompare(b.id)));
  const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
  for (const domain of cell.domains) {
    const ids = [...new Set(expected.filter(s => s.domain === domain.domain).map(s => s.id))].sort();
    expect([...(domain.perSystem[system]?.signalIds ?? [])].sort()).toEqual(ids);
    const aggregate = aggregates.find(a => a.domain === domain.domain)?.perSystem[system];
    if (aggregate) {
      expect(domain.perSystem[system]?.score).toBe(round4(aggregate.score));
      expect(domain.perSystem[system]?.valence).toBe(round4(aggregate.valence));
    }
    for (const signal of domain.topSignals.filter(s => s.system === system)) {
      expect(signal).toEqual(expected.find(s => s.id === signal.id));
    }
  }
}

/** Independent expected rule input comes from the typed calculator, never the
 * legacy bazi components (which deliberately retain civil-clock compatibility).
 * Check every year/month, including signals omitted from topSignals by ranking.
 */
function assertReportUsesOptions(input: AnalyzeInput) {
  const resolved = resolveAnalyzeInput(input);
  const ctx = createTimeContext(resolved.profile);
  const opts = resolved.options;
  const report = analyze(input, { asOf: AS_OF });
  const bazi = baziCalculator.calculate(ctx, { asOf: AS_OF, ...opts });
  const ziwei = ziweiCalculator.calculate(ctx, {
    asOf: AS_OF, useTrueSolarTime: opts.useTrueSolarTime,
    ziHourConvention: toZiweiZiConvention(opts.ziHourConvention),
  });
  const mainBazi = report.engines.find(e => e.engineId === 'bazi')!;
  const mainZiwei = report.engines.find(e => e.engineId === 'ziwei')!;
  const p = bazi.chart.pillars!;
  const natal = mainBazi.components.find(c => c.id === 'natal')!.value;
  expect({ year: natal.year, month: natal.month, day: natal.day, hour: natal.time }).toEqual(p);
  expect(mainZiwei.components).toEqual(ziwei.components);
  const time = ziwei.chart.time!;
  const astrolabe = createAstrolabe(time.date, time.timeIndex, ctx.profile.gender);
  const zrc = toZiweiRuleChart(ziwei, {
    monthlySequence: [...monthlySequence(astrolabe, 2025), ...monthlySequence(astrolabe, 2026)],
  });
  const monthPool = [...monthlyPillars(2025), ...monthlyPillars(2026)];
  for (const cell of [...report.timeline.years, ...report.timeline.months]) {
    const w = cell.window;
    let brc = toBaziRuleChart(bazi, { year: Number(w.start.slice(0, 4)) });
    if (w.grain === 'month') {
      const m = dominantPeriod(monthPool, w)!;
      brc = { ...toBaziRuleChart(bazi, { year: m.solarYear }), monthly: [{ start: m.start, end: m.end, ganZhi: m.ganZhi }] };
    }
    assertSignalIds(cell, 'bazi', [...evaluateBaziRules(brc, w), ...evaluateBaziTenGodRules(brc, w)]);
    const zsignals = w.grain === 'year'
      ? evaluateZiweiRules({ ...zrc, yearly: null, yearlySequence: [dominantPeriod(zrc.yearlySequence, w)!] }, w)
      : evaluateZiweiRules({ ...zrc, yearly: null, yearlySequence: [], monthlySequence: [dominantPeriod(zrc.monthlySequence, w)!] }, w);
    assertSignalIds(cell, 'ziwei', zsignals);
  }
  // Actual result parity is tested above, before checking descriptive metadata.
  const conventions = report.timeContext.conventions;
  expect(conventions.timeline.clock).toBe(opts.useTrueSolarTime ? 'trueSolar' : 'civil');
  expect(conventions.timeline.baziZiHourConvention).toBe(opts.ziHourConvention);
  expect(conventions.timeline.ziweiZiHourConvention).toBe(toZiweiZiConvention(opts.ziHourConvention));
  expect(conventions.timeline.followsOptions).toBe(true);
  return { report, ctx, opts };
}

describe('Issue #26 first slice: real analyze -> timeline option propagation', () => {
  test('direct timeline rejects malformed clock and noncanonical zi-hour options', () => {
    const ctx = createTimeContext(resolveAnalyzeInput(CROSSING).profile);
    expect(() => buildTimeline(ctx, { asOf: AS_OF, useTrueSolarTime: 'false' } as unknown as TimelineOptions)).toThrow('useTrueSolarTime');
    expect(() => buildTimeline(ctx, { asOf: AS_OF, ziHourConvention: 'nextDayAt23' } as unknown as TimelineOptions)).toThrow('ziHourConvention');
  });
  for (const useTrueSolarTime of [false, true]) {
    test(`cross-shichen fixture uses ${useTrueSolarTime ? 'true solar' : 'civil'} natal chart throughout`, () => {
      assertReportUsesOptions({ ...CROSSING, useTrueSolarTime });
    }, 60_000);
    for (const ziHourConvention of ['late', 'early'] as const) {
      for (const [hour, minute] of [[22, 59], [23, 0], [23, 59], [0, 0]]) {
        test(`${hour}:${String(minute).padStart(2, '0')} / solar=${useTrueSolarTime} / ${ziHourConvention}`, () => {
          assertReportUsesOptions({ ...MIDNIGHT, hour, minute, useTrueSolarTime, ziHourConvention });
        }, 60_000);
      }
    }
  }
  test('ziwei aliases are explicitly normalized into the two system conventions', () => {
    for (const [alias, canonical] of [['splitMidnight', 'late'], ['nextDayAt23', 'early']] as const) {
      const a = assertReportUsesOptions({ ...MIDNIGHT, useTrueSolarTime: false, ziHourConvention: alias });
      const b = analyze({ ...MIDNIGHT, useTrueSolarTime: false, ziHourConvention: canonical }, { asOf: AS_OF });
      expect(a.report.timeline).toEqual(b.timeline);
    }
  }, 60_000);
  test('explicit defaults retain default calculation results', () => {
    const implicit = analyze(CROSSING, { asOf: AS_OF });
    const explicit = analyze({ ...CROSSING, useTrueSolarTime: true, ziHourConvention: 'late' }, { asOf: AS_OF });
    expect(explicit.timeline).toEqual(implicit.timeline);
    expect(explicit.signals).toEqual(implicit.signals);
  }, 60_000);
  test('sync/async with the same systems honor the same non-default options', async () => {
    for (const input of [CROSSING, MIDNIGHT]) {
      const { report, ctx, opts } = assertReportUsesOptions({ ...input, useTrueSolarTime: false, ziHourConvention: 'early' });
      const options: AnalysisTimeOptions & { asOf: string; systems: typeof SYSTEMS } = { asOf: AS_OF, systems: SYSTEMS, ...opts };
      const sync = buildTimeline(ctx, options);
      const asyncResult = await buildTimelineAsync(ctx, options);
      expect(asyncResult).toEqual(sync);
      expect(sync.years).toEqual(report.timeline.years);
      expect(sync.months).toEqual(report.timeline.months);
    }
  }, 60_000);
});
