import { dateBoundaryInstant, intersectPeriodIntervals, normalizePeriodInterval, normalizePeriodTimezone,
  periodsOverlap, type NativePeriod, type PeriodInterval } from '../period';

/**
 * #58 inert slice: NOT wired into buildTimeline, backtest, questions, MCP or web,
 * and not exported from the public barrel. No signal is evaluated or counted here.
 */

/** A Gregorian timeline cell; month is 1–12. */
export type GregorianCell =
  | { readonly kind: 'year'; readonly year: number }
  | { readonly kind: 'month'; readonly year: number; readonly month: number };

export interface NativeSegment {
  readonly interval: PeriodInterval;
  readonly periodId: string;
}

export interface NativeSegmentation {
  /** The cell's own half-open bounds in the given timezone. */
  readonly window: PeriodInterval;
  /** Sorted, non-overlapping, each within window; gaps are not segments. */
  readonly segments: readonly NativeSegment[];
  readonly coveredMs: number;
  /** window length − coveredMs: time no supplied period covers. */
  readonly unknownMs: number;
}

const isoDate = (year: number, month: number) =>
  `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;

/**
 * Local midnight of the cell's first day → local midnight of the next cell's
 * first day, through bundled tzdb. A nonexistent or ambiguous midnight throws
 * (dateBoundaryInstant); no earlier/later choice is made silently.
 */
export function gregorianCellInterval(cell: GregorianCell, timezone: string): PeriodInterval {
  const zone = normalizePeriodTimezone(timezone);
  if (!Number.isSafeInteger(cell.year)) throw new Error('Gregorian cell requires an integer year');
  let start: string, end: string;
  if (cell.kind === 'year') {
    start = isoDate(cell.year, 1); end = isoDate(cell.year + 1, 1);
  } else if (cell.kind === 'month') {
    if (!Number.isSafeInteger(cell.month) || cell.month < 1 || cell.month > 12) {
      throw new Error('Gregorian month cell requires month 1–12');
    }
    start = isoDate(cell.year, cell.month);
    end = cell.month === 12 ? isoDate(cell.year + 1, 1) : isoDate(cell.year, cell.month + 1);
  } else {
    throw new Error('Gregorian cell kind must be year or month');
  }
  return normalizePeriodInterval({ startInstant: dateBoundaryInstant(start, zone), endExclusive: dateBoundaryInstant(end, zone) });
}

/**
 * Split one cell by ONE family of native periods (e.g. only 流年, only 流月 or
 * only 大運). Periods must share system and kind and must not overlap each
 * other (duplicates included); combining families is left to a future caller.
 * `timezone` only defines the Gregorian cell; it is required and has no default
 * because the birth-vs-analysis timezone choice is still open.
 */
export function segmentWindow(cell: GregorianCell, periods: readonly NativePeriod[], timezone: string): NativeSegmentation {
  const window = gregorianCellInterval(cell, timezone);
  const sorted = [...periods].sort((a, b) => Date.parse(a.startInstant) - Date.parse(b.startInstant));
  // Sorted by start: any overlap implies one with the furthest-reaching earlier period.
  let reach: NativePeriod | undefined;
  for (const p of sorted) {
    if (p.system !== sorted[0]!.system || p.kind !== sorted[0]!.kind) {
      throw new Error('segmentWindow requires a single period family (same system and kind)');
    }
    if (reach && periodsOverlap(reach, p)) throw new Error('segmentWindow periods must not overlap');
    if (!reach || Date.parse(p.endExclusive) > Date.parse(reach.endExclusive)) reach = p;
  }
  const segments: NativeSegment[] = [];
  let coveredMs = 0;
  for (const p of sorted) {
    const interval = intersectPeriodIntervals(window, p);
    if (!interval) continue;
    coveredMs += Date.parse(interval.endExclusive) - Date.parse(interval.startInstant);
    segments.push(Object.freeze({ interval, periodId: p.periodId }));
  }
  const totalMs = Date.parse(window.endExclusive) - Date.parse(window.startInstant);
  return Object.freeze({ window, segments: Object.freeze(segments), coveredMs, unknownMs: totalMs - coveredMs });
}
