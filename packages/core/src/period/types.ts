import type { SystemId } from '../signals/types';

/** A nonempty half-open interval [startInstant, endExclusive). */
export interface PeriodInterval {
  /** An ISO timestamp with explicit offset; constructors return canonical UTC. */
  readonly startInstant: string;
  readonly endExclusive: string;
}

/** Resolution of the source boundary, not a confidence score or duration unit. */
export type PeriodPrecision = 'day' | 'second' | 'millisecond';
export type PeriodOverlapChoice = 'earlier' | 'later';

/**
 * Native calendar/fortune period contract (#55). No SignalWindow migration yet.
 * Identity and kind come from the adapter/caller; this module neither generates
 * signal/fact IDs nor decides calendar or interpretation conventions.
 */
export interface NativePeriod extends PeriodInterval {
  readonly periodId: string;
  readonly system: SystemId;
  readonly kind: string;
  readonly precision: PeriodPrecision;
  /** A timezone in the bundled tzdb; constructors canonicalize aliases. */
  readonly timezone: string;
}

/** Date boundaries are both explicit: endDateExclusive is NOT an inclusive end. */
export interface NativePeriodDateInput {
  readonly periodId: string;
  readonly system: SystemId;
  readonly kind: string;
  readonly startDate: string;
  readonly endDateExclusive: string;
  readonly timezone: string;
  /** Only needed when this boundary is an ambiguous local midnight. */
  readonly startOverlap?: PeriodOverlapChoice;
  readonly endOverlap?: PeriodOverlapChoice;
}
