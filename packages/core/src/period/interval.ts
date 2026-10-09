import { normalizePeriodInstant } from './normalize';
import type { PeriodInterval } from './types';

/** Validate nonempty boundaries and return a frozen canonical UTC interval. */
export function normalizePeriodInterval(interval: PeriodInterval): PeriodInterval {
  const startInstant = normalizePeriodInstant(interval.startInstant);
  const endExclusive = normalizePeriodInstant(interval.endExclusive);
  if (Date.parse(startInstant) >= Date.parse(endExclusive)) {
    throw new Error('NativePeriod requires startInstant < endExclusive');
  }
  return Object.freeze({ startInstant, endExclusive });
}

/** Half-open: [a,b) and [b,c) never overlap. */
export function periodsOverlap(a: PeriodInterval, b: PeriodInterval): boolean {
  const left = normalizePeriodInterval(a), right = normalizePeriodInterval(b);
  return Date.parse(left.startInstant) < Date.parse(right.endExclusive)
    && Date.parse(right.startInstant) < Date.parse(left.endExclusive);
}

/** Only geometric bounds; never copies a periodId to a newly shaped interval. */
export function intersectPeriodIntervals(a: PeriodInterval, b: PeriodInterval): PeriodInterval | null {
  const left = normalizePeriodInterval(a), right = normalizePeriodInterval(b);
  const start = Math.max(Date.parse(left.startInstant), Date.parse(right.startInstant));
  const end = Math.min(Date.parse(left.endExclusive), Date.parse(right.endExclusive));
  return start < end ? Object.freeze({ startInstant: new Date(start).toISOString(), endExclusive: new Date(end).toISOString() }) : null;
}

/**
 * Split at explicit instants, sorted and deduplicated. Valid cuts on/outside the
 * outer bounds are ignored. Every cut is validated; the input is never mutated.
 * Segments have no new identity or evaluation semantics and exactly cover input.
 */
export function splitPeriodInterval(interval: PeriodInterval, cuts: readonly string[]): readonly PeriodInterval[] {
  const normalized = normalizePeriodInterval(interval);
  const start = Date.parse(normalized.startInstant), end = Date.parse(normalized.endExclusive);
  const interior = [...new Set(cuts.map(cut => Date.parse(normalizePeriodInstant(cut))))]
    .filter(cut => cut > start && cut < end).sort((a, b) => a - b);
  const boundaries = [start, ...interior, end];
  return Object.freeze(boundaries.slice(0, -1).map((value, index) => Object.freeze({
    startInstant: new Date(value).toISOString(),
    endExclusive: new Date(boundaries[index + 1]!).toISOString(),
  })));
}
