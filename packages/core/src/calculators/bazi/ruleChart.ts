/**
 * @fileoverview ChartResult<BaziChart> → `BaziRuleChart` for the 八字 rule engine (V1-04).
 *
 * Replaces `rules/bazi/fromBaziComponents` (year-precision luck cycles, one
 * `liuNian`) for TimeContext-native charts:
 * - pillars: the chart's (true-solar by default) pillars;
 * - luckCycles: ISO start/end dates (end inclusive), componentId `daYun_<i>`;
 * - annual: the 流年 of the requested solar year with its exact 立春 span
 *   (UTC ISO instants; they compare correctly against 'YYYY-MM-DD' windows);
 * - monthly: the 12 流月 of that solar year with exact 節 spans.
 * `annuals` additionally lists the whole `annualSequence` so callers can pick
 * any year without recomputing; `toBaziRuleChart(result, { year })` rebuilds
 * annual + monthly for any solar year (pure: 流年/流月 do not depend on asOf).
 *
 * @module calculators/bazi/ruleChart
 */

import { normalizeChart, type BaziAnnual as RuleAnnual, type BaziRuleChart } from '../../rules/bazi/chart';
import type { ChartResult } from '../types';
import type { BaziChart } from './calculator';
import { annualPillars, monthlyPillars } from './pillars';

export type BaziRuleChartWithSequence = BaziRuleChart & { annuals: RuleAnnual[] };

export interface ToBaziRuleChartOptions {
  /**
   * Solar (立春) year for `annual` / `monthly`. Default: the solar year of the
   * chart's `monthly` (i.e. the asOf solar year).
   */
  year?: number;
}

export function toBaziRuleChart(
  result: ChartResult<BaziChart> | BaziChart,
  opts: ToBaziRuleChartOptions = {},
): BaziRuleChartWithSequence {
  const chart: BaziChart = 'chart' in result ? result.chart : result;
  const p = chart.pillars;
  const base: BaziRuleChart = {
    pillars: p ? { ...p } : { year: null, month: null, day: null, hour: null },
    luckCycles: chart.luckCycles
      .filter((c) => c.start && c.end)
      .map((c) => ({ index: c.index, ganZhi: c.ganZhi, start: c.start!, end: c.end!, componentId: `daYun_${c.index}` })),
    natalComponentId: 'natal',
  };
  const annuals: RuleAnnual[] = (chart.annualSequence ?? []).map((a) => ({
    year: a.year,
    ganZhi: a.ganZhi,
    start: a.start,
    end: a.end,
    componentId: 'liuNian',
  }));

  if (!p) return { ...normalizeChart(base), annuals };

  const year = opts.year ?? chart.monthly?.[0]?.solarYear;
  if (year !== undefined) {
    const a = annuals.find((x) => x.year === year) ?? { ...annualPillars(year, 1)[0], componentId: 'liuNian' };
    base.annual = a;
    const months = chart.monthly?.[0]?.solarYear === year ? chart.monthly : monthlyPillars(year);
    base.monthly = months.map((m) => ({ start: m.start, end: m.end, ganZhi: m.ganZhi }));
  }
  return { ...normalizeChart(base), annuals };
}
