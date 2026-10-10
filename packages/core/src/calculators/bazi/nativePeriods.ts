/// <reference path="../../types/lunar-javascript.d.ts" />
import { Solar } from 'lunar-javascript';
import { createNativePeriod, normalizePeriodInstant, normalizePeriodTimezone,
  type NativePeriod, type PeriodOverlapChoice } from '../../period';
import { resolveWallTime } from '../../time/zone';
import type { AnnualPillar, MonthlyPillar, LuckCycles } from './pillars';

/** Identity is explicitly caller/chart scoped; no global fact or snapshot ID. */
export interface BaziNativePeriodOptions {
  readonly periodId: string;
  readonly timezone: string;
}

/** Ambiguous civil luck-cycle endpoints must be chosen independently. */
export interface BaziLuckCycleNativePeriodOptions extends BaziNativePeriodOptions {
  readonly startOverlap?: PeriodOverlapChoice;
  readonly endOverlap?: PeriodOverlapChoice;
}

function secondInstant(value: string): string {
  const instant = normalizePeriodInstant(value);
  if (Date.parse(instant) % 1000 !== 0) throw new Error('Bazi period source exceeds second precision');
  return instant;
}

function fromInstants(source: Readonly<{ start: string; end: string }>, kind: 'year' | 'month',
  options: BaziNativePeriodOptions): NativePeriod {
  return createNativePeriod({ ...options, system: 'bazi', kind, precision: 'second',
    startInstant: secondInstant(source.start), endExclusive: secondInstant(source.end) });
}

/** Existing annualPillars bounds already span Li Chun → next Li Chun in UTC. */
export function baziAnnualNativePeriod(source: Readonly<AnnualPillar>, options: BaziNativePeriodOptions): NativePeriod {
  return fromInstants(source, 'year', options);
}

/** Existing monthlyPillars bounds already span Jie → next Jie in UTC. */
export function baziMonthlyNativePeriod(source: Readonly<MonthlyPillar>, options: BaziNativePeriodOptions): NativePeriod {
  return fromInstants(source, 'month', options);
}

function wallInstant(wall: string, timezone: string, overlap?: PeriodOverlapChoice): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(wall)) {
    throw new Error('Bazi luck-cycle source requires a second-precision civil clock');
  }
  const naive = Date.parse(normalizePeriodInstant(`${wall}Z`));
  if (overlap !== undefined && overlap !== 'earlier' && overlap !== 'later') {
    throw new Error('Bazi luck-cycle overlap choice must be earlier or later');
  }
  const result = resolveWallTime(timezone, naive, overlap);
  if (result.kind === 'gap') throw new Error(`Bazi luck-cycle boundary is nonexistent: ${wall} in ${timezone}`);
  if (result.kind === 'overlap' && overlap === undefined) {
    throw new Error(`Bazi luck-cycle boundary is ambiguous; choose earlier or later: ${wall} in ${timezone}`);
  }
  return secondInstant(new Date(result.utcMs).toISOString());
}

/**
 * Reconstruct each exact civil boundary from luckCycles.startIso using the SAME
 * lunar-javascript nextYear arithmetic as luckCycles, not 3650 days or UTC years.
 * The existing inclusive date strings and calculator outputs remain untouched.
 * This is source-convention precision, not independent astronomical accuracy.
 */
export function baziLuckCycleNativePeriod(source: Readonly<LuckCycles>, index: number,
  options: BaziLuckCycleNativePeriodOptions): NativePeriod {
  if (!Number.isSafeInteger(index) || index < 1) throw new Error('Bazi luck-cycle index must be a positive integer');
  const matches = source.steps.filter(step => step.index === index);
  if (matches.length !== 1) throw new Error('Bazi luck-cycle source must contain exactly one matching step');
  const timezone = normalizePeriodTimezone(options.timezone);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(source.startIso)) {
    throw new Error('Bazi luck-cycle source requires a second-precision civil startIso');
  }
  // Strict Gregorian validation before any library calendar arithmetic.
  const naive = new Date(normalizePeriodInstant(`${source.startIso}Z`));
  if (source.startDate !== source.startIso.slice(0, 10)) throw new Error('Bazi luck-cycle source startDate disagrees with startIso');
  if (naive.getUTCFullYear() + index * 10 > 9999) throw new Error('Bazi luck-cycle boundary exceeds year 9999');
  const start = Solar.fromYmdHms(naive.getUTCFullYear(), naive.getUTCMonth() + 1, naive.getUTCDate(),
    naive.getUTCHours(), naive.getUTCMinutes(), naive.getUTCSeconds());
  const begin = start.nextYear((index - 1) * 10), end = start.nextYear(index * 10);
  const startWall: string = begin.toYmdHms().replace(' ', 'T');
  const endWall: string = end.toYmdHms().replace(' ', 'T');
  const step = matches[0];
  if (step.start !== begin.toYmd() || step.end !== end.next(-1).toYmd()) {
    throw new Error('Bazi luck-cycle source dates disagree with its exact civil bounds');
  }
  return createNativePeriod({ periodId: options.periodId, system: 'bazi', kind: 'luckCycle',
    precision: 'second', timezone,
    startInstant: wallInstant(startWall, timezone, options.startOverlap),
    endExclusive: wallInstant(endWall, timezone, options.endOverlap) });
}
