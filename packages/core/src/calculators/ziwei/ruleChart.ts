/**
 * @fileoverview Calculator chart → `ZiweiRuleChart` for the ziwei rule set (V1-05).
 *
 * Builds on `fromZiweiComponents` (engine components → palaces, 大限, asOf 流年)
 * and adds what V1-05 knows: precise lunar-year spans (春節 boundaries) and the
 * 流年 / 流月 sequences. Sequence periods carry chart-level ids
 * ('liuNian_YYYY', 'liuYue_YYYY_MM'), which are listed in `componentIds`.
 *
 * @module calculators/ziwei/ruleChart
 */

import { fromZiweiComponents, type ZiweiPeriod, type ZiweiRuleChart } from '../../rules/ziwei/chart';
import type { ChartResult } from '../types';
import { lunarNewYear } from './astrolabe';
import type { ZiweiChart, ZiweiMonthlyPeriod, ZiweiYearlyPeriod } from './types';

const CN_MONTHS = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];

function mutagenRecord(stars: readonly string[]): ZiweiPeriod['mutagen'] {
  return stars.length === 4 && stars.every((s) => typeof s === 'string' && s)
    ? { 祿: stars[0], 權: stars[1], 科: stars[2], 忌: stars[3] }
    : null;
}

function yearlyPeriod(y: ZiweiYearlyPeriod): ZiweiPeriod {
  return {
    componentId: y.id,
    label: `${y.stem}${y.branch}流年（${y.lunarYear}）`,
    palaceIndex: y.palaceIndex,
    heavenlyStem: y.stem,
    earthlyBranch: y.branch,
    mutagen: mutagenRecord(y.mutagen),
    start: y.start,
    end: y.end,
    lunarYear: y.lunarYear,
  };
}

function monthlyPeriod(m: ZiweiMonthlyPeriod): ZiweiPeriod {
  return {
    componentId: m.id,
    label: `${m.lunarYear}年農曆${CN_MONTHS[m.lunarMonth - 1]}月${m.stem}${m.branch}`,
    palaceIndex: m.palaceIndex,
    heavenlyStem: m.stem,
    earthlyBranch: m.branch,
    mutagen: mutagenRecord(m.mutagen),
    start: m.start,
    end: m.end,
    lunarYear: m.lunarYear,
    lunarMonth: m.lunarMonth,
  };
}

export interface ToZiweiRuleChartOptions {
  /**
   * Replace the chart's 流年 sequence (default: `chart.yearlySequence`, asOf −1 … +9).
   * Added for the timeline (V1-13), which needs years outside that range.
   */
  yearlySequence?: readonly ZiweiYearlyPeriod[];
  /**
   * Replace the chart's 流月 sequence (default: `chart.monthlySequence`, the asOf
   * lunar year only). Added for the timeline (V1-13): Gregorian January/February
   * fall in the previous lunar year.
   */
  monthlySequence?: readonly ZiweiMonthlyPeriod[];
}

/**
 * Rule chart for a ziwei calculator result. Throws (like `fromZiweiComponents`)
 * when the chart has no palaces, i.e. the birth time is unknown.
 */
export function toZiweiRuleChart(result: ChartResult<ZiweiChart>, opts: ToZiweiRuleChartOptions = {}): ZiweiRuleChart {
  const { chart } = result;
  const cache = new Map<number, string>();
  return fromZiweiComponents(result.components, {
    ...(chart.birthLunarYear !== null ? { birthLunarYear: chart.birthLunarYear } : {}),
    lunarNewYear: (y) => {
      let iso = cache.get(y);
      if (iso === undefined) {
        iso = lunarNewYear(y);
        cache.set(y, iso);
      }
      return iso;
    },
    sequences: {
      yearly: (opts.yearlySequence ?? chart.yearlySequence).map(yearlyPeriod),
      monthly: (opts.monthlySequence ?? chart.monthlySequence).map(monthlyPeriod),
    },
  });
}
