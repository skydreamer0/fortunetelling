/**
 * Immutable construction contract for the EXISTING sync analyze entry.
 * This describes natal calculation intent, not a ChartSnapshot or a whole report.
 * Period/asOf, output metadata and source spellings are deliberately not identity.
 * Old reports are never inferred, parsed, migrated or backfilled through this API.
 */
import type { AnalyzeInput } from './analyze';
import { BirthData } from './models/BirthData';
import { resolveAnalyzeInput, toZiweiZiConvention, type BirthplaceSource } from './analyzeInput';
import { VERSION } from './version';
import type { BirthProfile } from '../profile/types';
import { canonicalZoneName, TZDB_VERSION } from '../time/tzdb/index';
import { canonicalize, canonicalStringify } from '../portable/canonical';
import { fnv1a64Hex } from '../signals/signalId';
import { BAZI_CALCULATOR_VERSION } from '../calculators/bazi/calculator';
import { ZIWEI_CALCULATOR_VERSION } from '../calculators/ziwei/calculator';
import { NUMEROLOGY_CALCULATOR_VERSION } from '../calculators/numerology/calculator';
import { TZOLKIN_CALCULATOR_VERSION } from '../calculators/tzolkin/calculator';
import { MINGGUA_CALCULATOR_VERSION } from '../calculators/mingGua/calculator';
import dependencies from './calculationDependencies.json';
import baziCatalog from '../rules/bazi/catalog.json';
import baziTenGodCatalog from '../rules/bazi/tenGodCatalog.json';
import ziweiCatalog from '../rules/ziwei/catalog.json';
import ziweiTraits from '../traits/ziwei.json';
import ziweiModifiers from '../traits/ziweiModifiers.json';
import numerologyCatalog from '../timeline/numerologyCatalog.json';

export const CALCULATION_SPEC_SCHEMA_VERSION = 1 as const;

export type DeepReadonly<T> = T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;

type EffectiveInput = Pick<BirthProfile, 'date' | 'time' | 'timeAccuracy' | 'gender'> & {
  name: string;
  lat: number;
  lng: number;
  /** Bundled canonical zone; raw alias/case stays in source. */
  timezone: string;
};

type EffectiveSettings = {
  time: { dstOverlap: 'earlier'; dstGap: 'shift-forward-by-gap' };
  bazi: {
    clock: 'civil' | 'trueSolar';
    ziHourConvention: 'late' | 'early';
    dayBoundarySect: 1 | 2;
    yearMonthBasis: 'jie-instant';
  };
  ziwei: {
    clock: 'civil' | 'trueSolar';
    ziHourConvention: 'splitMidnight' | 'nextDayAt23';
    fixLeap: true;
    language: 'zh-TW';
  };
  numerology: { dateBasis: 'civil-local-date'; nameBasis: 'latin-letters' };
  dreamspell: { dateBasis: 'civil-local-date' };
  minggua: { clock: 'civil-local-time-read-as-utc+8'; unknownTime: 'local-noon' };
  /** These systems have no natal engine in sync analyze, regardless of global initialization. */
  ephemeris: { mode: 'excluded'; systems: ['jyotish', 'humanDesign'] };
};

function freezeDeep<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

const ruleDigest = (catalog: unknown): string =>
  `fnv1a64-${fnv1a64Hex(canonicalStringify(catalog))}`;

// Content digests do not silently turn a missing catalog version into zero.
// Code/evaluator changes are covered by VERSION; the dependency manifest is
// checked against the complete locked iztro/lunar-javascript dependency closure.
function versionIdentity() {
  return {
    contract: CALCULATION_SPEC_SCHEMA_VERSION,
    core: VERSION,
    calculators: {
      bazi: BAZI_CALCULATOR_VERSION,
      ziwei: ZIWEI_CALCULATOR_VERSION,
      numerology: NUMEROLOGY_CALCULATOR_VERSION,
      tzolkin: TZOLKIN_CALCULATOR_VERSION,
      mingGua: MINGGUA_CALCULATOR_VERSION,
    },
    dependencies: structuredClone(dependencies),
    data: { tzdb: TZDB_VERSION },
    rules: {
      bazi: ruleDigest(baziCatalog),
      baziTenGod: ruleDigest(baziTenGodCatalog),
      ziwei: ruleDigest(ziweiCatalog),
      ziweiTraits: ruleDigest(ziweiTraits),
      ziweiModifiers: ruleDigest(ziweiModifiers),
      numerology: ruleDigest(numerologyCatalog),
    },
  };
}

export type CalculationIdentity = DeepReadonly<{
  schemaVersion: typeof CALCULATION_SPEC_SCHEMA_VERSION;
  scope: 'analyze-sync-natal-intent';
  input: EffectiveInput;
  settings: EffectiveSettings;
  versions: ReturnType<typeof versionIdentity>;
}>;

// Immutable build identity is shared, so constructing a spec does not rehash
// every rule catalog on every analysis. Caller/source values are never shared.
const CURRENT_VERSIONS = freezeDeep(versionIdentity());

export type CalculationSpec = DeepReadonly<{
  schemaVersion: typeof CALCULATION_SPEC_SCHEMA_VERSION;
  source: {
    /** BirthData already applied constructor defaults; it is not original raw input. */
    kind: 'AnalyzeInput' | 'BirthData';
    input: Partial<AnalyzeInput>;
    birthplaceSource: BirthplaceSource;
  };
  identity: CalculationIdentity;
  /** Non-cryptographic diagnostic identity, never authentication or a cache hit by itself. */
  specHash: string;
}>;

const INPUT_FIELDS = [
  'year', 'month', 'day', 'hour', 'minute', 'timeKnown', 'gender', 'name',
  'longitude', 'latitude', 'birthplace', 'cityId', 'timeAccuracy',
  'useTrueSolarTime', 'ziHourConvention',
] as const;

function copySource(input: AnalyzeInput | BirthData): Partial<AnalyzeInput> {
  const raw = input instanceof BirthData ? input.toJSON() : input;
  const source: Record<string, unknown> = {};
  for (const key of INPUT_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
    const value = (raw as unknown as Record<string, unknown>)[key];
    if (key === 'birthplace' && value !== null && typeof value === 'object') {
      // Keep supported source data, not unrelated caller fields or private payloads.
      const bp = value as Record<string, unknown>;
      source[key] = { label: bp.label, lat: bp.lat, lng: bp.lng, timezone: bp.timezone };
    } else {
      source[key] = value;
    }
  }
  return canonicalize(source) as Partial<AnalyzeInput>;
}

/** Internal digest primitive; not a parser or validator for persisted/untrusted specs. */
export function hashCalculationIdentity(identity: CalculationIdentity): string {
  return `cs1-${fnv1a64Hex(canonicalStringify(identity))}`;
}

/** Shared entrance used by analyze; retains its legacy report/source spelling. */
export function resolveCalculationSpec(input: AnalyzeInput | BirthData) {
  const resolved = resolveAnalyzeInput(input);
  const { profile, options, birthplaceSource } = resolved;
  const timezone = canonicalZoneName(profile.birthplace.timezone);
  // Current profile validation already enforces bundled zones. Never silently
  // create a cross-host identity if future validation permits unversioned Intl.
  if (timezone === null) throw new Error('CalculationSpec requires a bundled, versioned timezone');
  const clock = options.useTrueSolarTime ? 'trueSolar' : 'civil';
  const settings: EffectiveSettings = {
    time: { dstOverlap: 'earlier', dstGap: 'shift-forward-by-gap' },
    bazi: {
      clock, ziHourConvention: options.ziHourConvention,
      dayBoundarySect: options.ziHourConvention === 'early' ? 1 : 2,
      yearMonthBasis: 'jie-instant',
    },
    ziwei: { clock, ziHourConvention: toZiweiZiConvention(options.ziHourConvention), fixLeap: true, language: 'zh-TW' },
    numerology: { dateBasis: 'civil-local-date', nameBasis: 'latin-letters' },
    dreamspell: { dateBasis: 'civil-local-date' },
    minggua: { clock: 'civil-local-time-read-as-utc+8', unknownTime: 'local-noon' },
    ephemeris: { mode: 'excluded', systems: ['jyotish', 'humanDesign'] },
  };
  const identity: CalculationIdentity = {
    schemaVersion: CALCULATION_SPEC_SCHEMA_VERSION,
    scope: 'analyze-sync-natal-intent',
    input: {
      date: profile.date, time: profile.time, timeAccuracy: profile.timeAccuracy,
      gender: profile.gender, name: profile.name ?? '',
      lat: profile.birthplace.lat, lng: profile.birthplace.lng, timezone,
    },
    settings,
    versions: CURRENT_VERSIONS,
  };
  const spec = freezeDeep<CalculationSpec>({
    schemaVersion: CALCULATION_SPEC_SCHEMA_VERSION,
    source: { kind: input instanceof BirthData ? 'BirthData' : 'AnalyzeInput', input: copySource(input), birthplaceSource },
    identity,
    specHash: hashCalculationIdentity(identity),
  });
  // Downstream gets the effective spec choices, not another set of defaults.
  return {
    ...resolved,
    options: {
      useTrueSolarTime: spec.identity.settings.bazi.clock === 'trueSolar',
      ziHourConvention: spec.identity.settings.bazi.ziHourConvention,
    },
    spec,
  };
}

/**
 * Build current sync analyze natal intent. Does not calculate a chart, read a
 * clock, initialize ephemeris, mutate inputs, or interpret a historical report.
 * Both source and identity are deeply immutable. Compare canonical identity
 * payloads as well as hashes before any future cache reuse.
 */
export function createCalculationSpec(input: AnalyzeInput | BirthData): CalculationSpec {
  return resolveCalculationSpec(input).spec;
}
