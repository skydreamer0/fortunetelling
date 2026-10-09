import { SYSTEM_IDS } from '../signals/types';
import { normalizePeriodInterval } from './interval';
import { dateBoundaryInstant, normalizePeriodTimezone } from './normalize';
import type { NativePeriod, NativePeriodDateInput } from './types';

/** Explicit metadata + canonical bounds; no IDs, defaults or facts are invented. */
export function createNativePeriod(input: NativePeriod): NativePeriod {
  for (const field of ['periodId', 'kind'] as const) {
    if (typeof input[field] !== 'string' || input[field].trim().length === 0) {
      throw new Error(`NativePeriod requires ${field}`);
    }
  }
  if (!SYSTEM_IDS.includes(input.system)) throw new Error(`Unknown NativePeriod system: ${input.system}`);
  if (!(['day', 'second', 'millisecond'] as const).includes(input.precision)) {
    throw new Error(`Unknown NativePeriod precision: ${input.precision}`);
  }
  return Object.freeze({
    periodId: input.periodId,
    system: input.system,
    kind: input.kind,
    ...normalizePeriodInterval(input),
    precision: input.precision,
    timezone: normalizePeriodTimezone(input.timezone),
  });
}

/** Both local dates are explicit boundaries; no inclusive-end/24-hour conversion. */
export function nativePeriodFromDates(input: NativePeriodDateInput): NativePeriod {
  return createNativePeriod({
    periodId: input.periodId,
    system: input.system,
    kind: input.kind,
    timezone: input.timezone,
    precision: 'day',
    startInstant: dateBoundaryInstant(input.startDate, input.timezone, input.startOverlap),
    endExclusive: dateBoundaryInstant(input.endDateExclusive, input.timezone, input.endOverlap),
  });
}
