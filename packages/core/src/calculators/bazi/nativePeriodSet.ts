import type { NativePeriod } from '../../period';
import { baziAnnualNativePeriod, baziLuckCycleNativePeriod, baziMonthlyNativePeriod } from './nativePeriods';
import type { AnnualPillar, LuckCycles, MonthlyPillar } from './pillars';

/**
 * #58 inert slice: maps existing BaZi outputs through the #56 adapters only.
 * Not wired into any consumer and not exported from the public barrel.
 *
 * `annual`/`monthly` match BaziChart.annualSequence/monthly. `luck` must be the
 * raw pillars.ts LuckCycles: BaziChart.luckCycles/luckStart carry only dates,
 * and no 起運 clock time is reconstructed from them here.
 */
export interface BaziNativePeriodSources {
  readonly annual?: readonly AnnualPillar[];
  readonly monthly?: readonly MonthlyPillar[];
  readonly luck?: Readonly<LuckCycles>;
}

export interface BaziNativePeriodSetOptions {
  /** Explicit chart/caller identity scope; no default is generated. */
  readonly idPrefix: string;
  /**
   * Timezone recorded on every period; for 大運 it also resolves the birthplace
   * civil wall-clock boundaries, so it must be the source (birth) timezone.
   * Ambiguous or nonexistent luck boundaries throw (no overlap choice made).
   */
  readonly timezone: string;
}

export interface BaziNativePeriodSet {
  readonly annual: readonly NativePeriod[];
  readonly monthly: readonly NativePeriod[];
  readonly luck: readonly NativePeriod[];
}

/** Families stay separate: each array is one non-overlapping segmentWindow input. */
export function baziNativePeriodsFor(sources: BaziNativePeriodSources, options: BaziNativePeriodSetOptions): BaziNativePeriodSet {
  if (typeof options.idPrefix !== 'string' || options.idPrefix.trim().length === 0) {
    throw new Error('baziNativePeriodsFor requires an idPrefix');
  }
  const { idPrefix, timezone } = options;
  const luck = sources.luck;
  return Object.freeze({
    annual: Object.freeze((sources.annual ?? []).map(p =>
      baziAnnualNativePeriod(p, { periodId: `${idPrefix}:year:${p.year}`, timezone }))),
    monthly: Object.freeze((sources.monthly ?? []).map(p =>
      baziMonthlyNativePeriod(p, { periodId: `${idPrefix}:month:${p.solarYear}-${p.index}`, timezone }))),
    luck: Object.freeze(luck ? luck.steps.map(s =>
      baziLuckCycleNativePeriod(luck, s.index, { periodId: `${idPrefix}:luck:${s.index}`, timezone })) : []),
  });
}
