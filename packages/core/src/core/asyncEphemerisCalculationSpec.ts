/**
 * Ephemeris SETTINGS intent for timeline execution (#53 partial).
 * This is not birth/chart/report identity and must never be a result-cache key.
 * It leaves sync CalculationSpec/cs1 and historical reports unchanged.
 */
import { SE_SIDM, type Ayanamsa } from '../calculators/astro/ephemeris';
import { HUMAN_DESIGN_CALCULATOR_VERSION } from '../calculators/humanDesign/calculator';
import { JYOTISH_CALCULATOR_VERSION } from '../calculators/jyotish/calculator';
import hdCatalog from '../calculators/humanDesign/catalog.json';
import jyotishCatalog from '../calculators/jyotish/catalog.json';
import { canonicalStringify } from '../portable/canonical';
import { fnv1a64Hex } from '../signals/signalId';
import type { DeepReadonly } from './calculationSpec';
import { VERSION } from './version';

export const ASYNC_EPHEMERIS_SPEC_SCHEMA_VERSION = 1 as const;

export interface AsyncEphemerisCalculationOptions {
  jyotish?: { ayanamsa?: Ayanamsa; node?: 'mean' | 'true' };
  humanDesign?: { node?: 'mean' | 'true'; sampleDays?: { year?: number; month?: number } };
}

export type AsyncEphemerisSettings = DeepReadonly<{
  jyotish: { ayanamsa: Ayanamsa; node: 'mean' | 'true' };
  humanDesign: { node: 'mean' | 'true'; sampleDays: { year: number; month: number } };
}>;

function freezeDeep<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

const digest = (value: unknown) => `fnv1a64-${fnv1a64Hex(canonicalStringify(value))}`;
const VERSIONS = freezeDeep({
  core: VERSION,
  calculators: { jyotish: JYOTISH_CALCULATOR_VERSION, humanDesign: HUMAN_DESIGN_CALCULATOR_VERSION },
  rules: { jyotish: digest(jyotishCatalog), humanDesign: digest(hdCatalog) },
});

// Existing implementation facts, not choices of algorithms that are not implemented.
const CONVENTIONS = freezeDeep({
  ephemeris: 'moshier' as const,
  jyotish: { houseSystem: 'whole_sign' as const, dashaYearDays: 365.25, transitMethod: 'window-midpoint' as const },
  humanDesign: { transitMethod: 'fixed-step-inclusive-tail' as const, convergence: 'unverified' as const },
});

export type AsyncEphemerisCalculationSpec = DeepReadonly<{
  schemaVersion: typeof ASYNC_EPHEMERIS_SPEC_SCHEMA_VERSION;
  identity: {
    scope: 'timeline-ephemeris-settings';
    settings: AsyncEphemerisSettings;
    conventions: typeof CONVENTIONS;
    versions: typeof VERSIONS;
  };
  /** Diagnostic settings hash only. Does not identify birth data, periods or a complete result. */
  specHash: string;
}>;

function record(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new TypeError(`${label} must be a plain object`);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !keys.includes(key)) throw new TypeError(`${label}: unsupported setting ${String(key)}`);
  }
  return value as Record<string, unknown>;
}

// Omission is distinct from an explicitly malformed/nullish setting.
function choice<T extends string>(obj: Record<string, unknown>, key: string, fallback: T, allowed: readonly T[]): T {
  const value = Object.hasOwn(obj, key) ? obj[key] : fallback;
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new TypeError(`ephemeris ${key}: unsupported value`);
  return value as T;
}

function sampleDays(obj: Record<string, unknown>, key: 'year' | 'month', fallback: number): number {
  const value = Object.hasOwn(obj, key) ? obj[key] : fallback;
  // A public resource bound, not an accuracy tolerance: prevents non-progressing
  // floating-point increments and unbounded sampling work in a calendar cell.
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1 / 24 || value > 366) {
    throw new RangeError(`humanDesign sampleDays.${key} must be between 1/24 and 366 days`);
  }
  return value;
}

/** Pure construction. Does not load WASM, calculate, or certify sampling precision. */
export function createAsyncEphemerisCalculationSpec(options: AsyncEphemerisCalculationOptions = {}): AsyncEphemerisCalculationSpec {
  const input = record(options, ['jyotish', 'humanDesign'], 'ephemeris');
  const jyotish = Object.hasOwn(input, 'jyotish') ? record(input.jyotish, ['ayanamsa', 'node'], 'jyotish') : {};
  const hd = Object.hasOwn(input, 'humanDesign') ? record(input.humanDesign, ['node', 'sampleDays'], 'humanDesign') : {};
  const steps = Object.hasOwn(hd, 'sampleDays') ? record(hd.sampleDays, ['year', 'month'], 'sampleDays') : {};
  const rule = hdCatalog.rules.find(entry => entry.id === 'humanDesign.transit.gates');
  const defaults = rule?.params.sampleDays;
  if (!defaults) throw new Error('humanDesign catalog: missing transit sampleDays');
  const settings: AsyncEphemerisSettings = {
    jyotish: {
      ayanamsa: choice(jyotish, 'ayanamsa', 'lahiri', Object.keys(SE_SIDM) as Ayanamsa[]),
      node: choice(jyotish, 'node', 'mean', ['mean', 'true']),
    },
    humanDesign: {
      node: choice(hd, 'node', 'true', ['mean', 'true']),
      sampleDays: { year: sampleDays(steps, 'year', defaults.year), month: sampleDays(steps, 'month', defaults.month) },
    },
  };
  const identity: AsyncEphemerisCalculationSpec['identity'] = {
    scope: 'timeline-ephemeris-settings', settings, conventions: CONVENTIONS, versions: VERSIONS,
  };
  return freezeDeep({ schemaVersion: ASYNC_EPHEMERIS_SPEC_SCHEMA_VERSION, identity, specHash: `aes1-${fnv1a64Hex(canonicalStringify(identity))}` });
}
