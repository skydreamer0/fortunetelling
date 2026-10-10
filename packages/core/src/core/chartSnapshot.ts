/**
 * Internal sync natal snapshot foundation for #51. This is not a Report 8
 * migration, historical replay API, async ephemeris spec, or a fact identity.
 * Runtime iztro capabilities and period/asOf projections never enter this DTO.
 */
import { createCalculationSpec, type CalculationSpec, type CalculationIdentity, type DeepReadonly } from './calculationSpec';
import { createTimeContext } from '../time/createTimeContext';
import { canonicalStringify } from '../portable/canonical';
import { fnv1a64Hex } from '../signals/signalId';
import { createBaziNatalBasisProvider, type BaziNatalBasis } from '../calculators/bazi/natalBasis';
import { createZiweiNatalBasisProvider } from '../calculators/ziwei/natalBasis';
import type { ZiweiNatalChart, ZiweiTimeIndexResult, ZiweiTimeResolution } from '../calculators/ziwei/types';
import { NumerologyEngine } from '../engines/NumerologyEngine';
import { extractNumerologyChart, type NumerologyChart } from '../calculators/numerology/calculator';
import { tzolkinCalculator, type TzolkinChart } from '../calculators/tzolkin/calculator';
import { mingGuaCalculator, type MingGuaChart } from '../calculators/mingGua/calculator';
import { profileDateToBirthData } from '../calculators/profileDateBirthData';
import { astro } from 'iztro';

export const CHART_SNAPSHOT_SCHEMA_VERSION = 1 as const;
type Computed<T> = { status: 'computed'; chart: T; warnings: string[] };
type TimeUnknown = { status: 'skipped'; reason: 'time_unknown' };
type NumerologyNatal = Omit<NumerologyChart, 'personalYear' | 'personalMonth' | 'personalYears'>;
type ZiweiNatal = {
  time: ZiweiTimeIndexResult;
  primary: ZiweiNatalChart;
  alternatives: { time: ZiweiTimeResolution; natal: ZiweiNatalChart }[];
};
export type ChartSnapshot = DeepReadonly<{
  schemaVersion: typeof CHART_SNAPSHOT_SCHEMA_VERSION;
  scope: 'analyze-sync-natal';
  /** Non-cryptographic diagnostic only, not authentication/anonymization. */
  snapshotId: string;
  specHash: string;
  /** Contains the existing name-dependent Numerology input. Keep private. */
  identity: CalculationIdentity;
  natal: {
    bazi: Computed<BaziNatalBasis> | TimeUnknown;
    ziwei: Computed<ZiweiNatal> | TimeUnknown;
    numerology: Computed<NumerologyNatal>;
    tzolkin: Computed<TzolkinChart>;
    mingGua: Computed<MingGuaChart>;
  };
}>;

function freezeDeep<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

// Unlike portable report serialization, validation must not silently omit any
// field. In particular, generatedAt and undefined must not hide extra data.
function strictCanonical(value: unknown): string {
  const ancestors = new Set<object>();
  function check(item: unknown): void {
    if (item === null) return;
    if (typeof item === 'object') {
      if (ancestors.has(item)) throw new Error('ChartSnapshot requires acyclic JSON content');
      ancestors.add(item);
      if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) {
        throw new Error('ChartSnapshot requires plain JSON content');
      }
      const keys = Reflect.ownKeys(item);
      if (Array.isArray(item) && (keys.length !== item.length + 1 ||
          keys.some(key => key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= item.length)))) {
        throw new Error('ChartSnapshot requires dense JSON arrays without additional content');
      }
      for (const key of keys) {
        if (Array.isArray(item) && key === 'length') continue;
        const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
        if (typeof key !== 'string' || key === 'generatedAt' || !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined) {
          throw new Error('ChartSnapshot contains unsupported content');
        }
        check(descriptor.value);
      }
      ancestors.delete(item);
    } else if (!['string', 'boolean', 'number'].includes(typeof item)) {
      throw new Error('ChartSnapshot requires plain JSON content');
    }
  }
  check(value);
  return canonicalStringify(value);
}

/** Re-resolve effective input, never source spelling or today's fallback values. */
function currentSpec(spec: CalculationSpec): CalculationSpec {
  if (spec?.schemaVersion !== 1 || spec.identity?.scope !== 'analyze-sync-natal-intent') {
    throw new Error('Unsupported ChartSnapshot calculation scope');
  }
  const { input, settings } = spec.identity;
  const [year, month, day] = input.date.split('-').map(Number);
  const [hour, minute] = (input.time ?? '12:00').split(':').map(Number);
  const current = createCalculationSpec({
    year, month, day, hour, minute, timeKnown: input.time !== null,
    timeAccuracy: input.timeAccuracy, gender: input.gender, name: input.name,
    birthplace: { label: 'CalculationSpec', lat: input.lat, lng: input.lng, timezone: input.timezone },
    useTrueSolarTime: settings.bazi.clock === 'trueSolar',
    ziHourConvention: settings.bazi.ziHourConvention,
  });
  if (strictCanonical(current.identity) !== strictCanonical(spec.identity) || current.specHash !== spec.specHash) {
    throw new Error('ChartSnapshot requires the complete current calculation identity; historical/async replay is unsupported');
  }
  return current;
}

const trusted = new WeakSet<object>();

function checkConfiguration() {
  const supported = {
    mutagens: {}, brightness: {}, yearDivide: 'normal', ageDivide: 'normal',
    dayDivide: 'forward', horoscopeDivide: 'normal', algorithm: 'default',
  };
  if (strictCanonical(astro.getConfig()) !== strictCanonical(supported)) {
    throw new Error('ChartSnapshot requires default iztro configuration');
  }
}

/**
 * Calculate the five existing sync natal systems with no period context.
 * Errors are explicit, never cached as valid snapshots. Unknown birth time is
 * an explicit skipped state. No report or old snapshot is changed/backfilled.
 */
export function createChartSnapshot(requested: CalculationSpec): ChartSnapshot {
  const spec = currentSpec(requested);
  // createAstrolabe explicitly selects zh-TW, as in the existing sync engine.
  // Reject unsupported global calculator settings without resetting them.
  checkConfiguration();
  const { input, settings } = spec.identity;
  const ctx = createTimeContext({
    date: input.date, time: input.time, timeAccuracy: input.timeAccuracy,
    gender: input.gender, name: input.name,
    birthplace: { label: 'CalculationSpec', lat: input.lat, lng: input.lng, timezone: input.timezone },
  }, { dstOverlap: settings.time.dstOverlap });
  const baziOptions = { useTrueSolarTime: settings.bazi.clock === 'trueSolar', ziHourConvention: settings.bazi.ziHourConvention };
  const ziweiOptions = { useTrueSolarTime: settings.ziwei.clock === 'trueSolar', ziHourConvention: settings.ziwei.ziHourConvention };
  const baziBasis = createBaziNatalBasisProvider(ctx, baziOptions);
  const ziweiBasis = createZiweiNatalBasisProvider(ctx, ziweiOptions)(ctx, ziweiOptions);
  const unknown = { status: 'skipped', reason: 'time_unknown' } as const;
  const bazi: ChartSnapshot['natal']['bazi'] = input.time === null ? unknown : {
    status: 'computed', chart: { pillars: baziBasis(ctx, baziOptions).pillars, luckCycles: baziBasis(ctx, baziOptions).luckCycles }, warnings: [],
  };
  const time = ziweiBasis.time;
  const ziwei: ChartSnapshot['natal']['ziwei'] = time === null ? unknown : {
    status: 'computed', chart: {
      time, primary: ziweiBasis.natalFor(time),
      alternatives: time.alternatives.map(alternative => ({ time: alternative, natal: ziweiBasis.natalFor(alternative) })),
    }, warnings: [],
  };
  const numerology = new NumerologyEngine().natal(profileDateToBirthData(ctx));
  const { personalYear: _year, personalMonth: _month, personalYears: _years, ...numerologyNatal } = extractNumerologyChart(numerology.components);
  const tzolkin = tzolkinCalculator.calculate(ctx);
  const mingGua = mingGuaCalculator.calculate(ctx);
  // The existing date-only adapters report errors rather than throw. Do not
  // label their empty failure charts as successfully computed natal data.
  if (tzolkin.chart.kin === null || mingGua.chart.gua === null) throw new Error('ChartSnapshot natal calculation failed');
  const content = {
    schemaVersion: CHART_SNAPSHOT_SCHEMA_VERSION, scope: 'analyze-sync-natal' as const,
    specHash: spec.specHash, identity: spec.identity,
    natal: {
      bazi, ziwei,
      numerology: { status: 'computed' as const, chart: numerologyNatal, warnings: [...numerology.errors] },
      tzolkin: { status: 'computed' as const, chart: tzolkin.chart, warnings: tzolkin.warnings },
      mingGua: { status: 'computed' as const, chart: mingGua.chart, warnings: mingGua.warnings },
    },
  };
  checkConfiguration();
  const snapshot = freezeDeep(structuredClone({ ...content, snapshotId: `sn1-${fnv1a64Hex(strictCanonical(content))}` }));
  trusted.add(snapshot);
  return snapshot;
}

/**
 * Compare a serialized candidate with a freshly calculated, trusted expected
 * snapshot. A matching hash is never sufficient: identity and full natal bytes
 * must match. Returns our owned immutable snapshot, never caller-owned data.
 * This is validation, not a persisted cache or cross-version replay promise.
 */
export function validateChartSnapshot(candidate: unknown, expected: ChartSnapshot): ChartSnapshot {
  if (!trusted.has(expected)) throw new Error('ChartSnapshot expected value must be trusted');
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error('Invalid ChartSnapshot content');
  const value = candidate as ChartSnapshot;
  if (strictCanonical(value.identity) !== strictCanonical(expected.identity)) throw new Error('ChartSnapshot identity mismatch');
  if (strictCanonical(value) !== strictCanonical(expected)) throw new Error('ChartSnapshot content mismatch');
  return expected;
}
