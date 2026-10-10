import { parseIsoDate } from '../../core/calendar';
import { nativePeriodFromDates, type NativePeriod, type PeriodOverlapChoice } from '../../period';
import { addDays } from './astrolabe';
import type { ZiweiDecadePeriod, ZiweiMonthlyPeriod, ZiweiYearlyPeriod } from './types';

/** Explicit profile timezone; there is no UTC, host-zone or birthplace default. */
export interface ZiweiNativePeriodOptions {
  readonly timezone: string;
  /** Repeated midnight choices apply to the start / day AFTER the inclusive end. */
  readonly startOverlap?: PeriodOverlapChoice;
  readonly endOverlap?: PeriodOverlapChoice;
}

type SourceSpan = Readonly<Pick<ZiweiYearlyPeriod, 'id' | 'start' | 'end'>>;

function fromSource(
  source: SourceSpan,
  kind: 'decade' | 'year' | 'month',
  options: ZiweiNativePeriodOptions,
): NativePeriod {
  // Validate before addDays: invalid source dates must not silently roll over.
  parseIsoDate(source.start);
  parseIsoDate(source.end);
  if (source.start > source.end) throw new Error('Ziwei period start is after its inclusive end');
  return nativePeriodFromDates({
    // Source/chart-scoped identity only. It is NOT a global fact/snapshot/cache ID.
    periodId: source.id,
    system: 'ziwei',
    kind,
    startDate: source.start,
    endDateExclusive: addDays(source.end, 1),
    timezone: options.timezone,
    startOverlap: options.startOverlap,
    endOverlap: options.endOverlap,
  });
}

/** 大限 source dates → immutable, day-precision half-open instants. */
export function ziweiDecadeNativePeriod(source: Readonly<ZiweiDecadePeriod>, options: ZiweiNativePeriodOptions): NativePeriod {
  return fromSource(source, 'decade', options);
}

/** 農曆年 source dates → immutable, day-precision half-open instants. */
export function ziweiYearlyNativePeriod(source: Readonly<ZiweiYearlyPeriod>, options: ZiweiNativePeriodOptions): NativePeriod {
  return fromSource(source, 'year', options);
}

/** 流月 dates retain the source's iztro leap-month day-15/16 convention. */
export function ziweiMonthlyNativePeriod(source: Readonly<ZiweiMonthlyPeriod>, options: ZiweiNativePeriodOptions): NativePeriod {
  return fromSource(source, 'month', options);
}
