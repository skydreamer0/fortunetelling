/**
 * Replaying a report must use the timeline's recorded choices. The main chart
 * differed from its timeline before core 0.5.1, so its options are not a fallback.
 * Missing or contradictory metadata means no recomputation; saved signals remain readable.
 */
import { TIMELINE_SYSTEMS, type TimelineOptions } from '../lib/core';
import type { Report } from './types';

export interface ReportTimelineOptions {
  useTrueSolarTime: boolean;
  ziHourConvention: 'late' | 'early';
  systems: NonNullable<TimelineOptions['systems']>;
  systemWeights: TimelineOptions['systemWeights'];
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

/** Strict, shared contract for Ask AI, citation lookup and life-event backtesting. */
export function reportTimelineOptions(report: Report): ReportTimelineOptions | null {
  if (report.schemaVersion < 4 || !report.timeContext || !report.timeline) return null;
  const conventions = record(report.timeContext.conventions);
  const timeline = record(conventions?.timeline);
  if (!timeline || (timeline.followsOptions !== true && timeline.followsOptions !== false)) return null;

  const { clock, baziZiHourConvention, ziweiZiHourConvention } = timeline;
  if (clock !== 'trueSolar' && clock !== 'civil') return null;
  if (baziZiHourConvention !== 'late' && baziZiHourConvention !== 'early') return null;
  if (ziweiZiHourConvention !== (baziZiHourConvention === 'early' ? 'nextDayAt23' : 'splitMidnight')) return null;
  if (timeline.followsOptions === false) {
    // D-032's recorded historical behavior, even when the main chart was civil/early.
    if (clock !== 'trueSolar' || baziZiHourConvention !== 'late') return null;
  } else if (conventions?.useTrueSolarTime !== (clock === 'trueSolar') ||
      conventions?.ziHourConvention !== baziZiHourConvention) {
    return null;
  }

  const systems = report.timeline.systems;
  if (!Array.isArray(systems) || systems.some(system => !TIMELINE_SYSTEMS.includes(system))) return null;
  const weights = record(report.timeline.systemWeights);
  if (!weights) return null;
  const systemWeights: NonNullable<TimelineOptions['systemWeights']> = {};
  for (const system of systems) {
    const weight = weights[system];
    if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0) return null;
    systemWeights[system] = weight;
  }
  // Copy the report-specific scope before any lazy calculations or caches are created.
  // An empty recorded set is meaningful; never widen it to the global defaults.
  return {
    useTrueSolarTime: clock === 'trueSolar',
    ziHourConvention: baziZiHourConvention,
    systems: [...systems],
    systemWeights,
  };
}
