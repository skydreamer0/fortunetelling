/** Opt-in, current-build Jyotish record. No persistence, migration or legacy API changes. */
import { initEphemeris, ephemerisInfo } from '../calculators/astro/ephemeris';
import { jyotishCalculator, JYOTISH_CALCULATOR_VERSION, type JyotishConfig, type JyotishChart } from '../calculators/jyotish/calculator';
import { normalizeAsOf } from '../calculators/birthData';
import type { ChartResult } from '../calculators/types';
import { createTimeContext } from '../time/createTimeContext';
import type { TimeContext } from '../time/types';
import { TZDB_VERSION } from '../time/tzdb';
import { resolveJyotishChartSettings } from './ephemerisSettings';
import { VERSION } from './version';
import dependencies from './calculationDependencies.json';
import ephemerisDependencies from '../timeline/ephemerisDependencies.json';
import { fnv1a64Hex } from '../signals/signalId';

type Presence = { state: 'absent' | 'undefined' | 'null' } | { state: 'value'; value: string | number } | { state: 'date'; value: string };
const keys = ['asOf', 'ayanamsa', 'node', 'dashaYearDays'] as const;
type RawConfig = Record<typeof keys[number], Presence>;
export type StandaloneJyotishInput = {
  asOf: string | Date;
  ayanamsa?: JyotishConfig['ayanamsa'] | null;
  node?: JyotishConfig['node'] | null;
  dashaYearDays?: number | null;
};
export interface StandaloneEphemerisRecord {
  schemaVersion: 1;
  scope: 'standalone-jyotish';
  implementation: 'standalone-jyotish-replay-v1';
  versions: { core: string; calculator: string; tzdb: string; dependencies: typeof dependencies; ephemerisDependencies: typeof ephemerisDependencies; runtime: ReturnType<typeof ephemerisInfo> };
  context: TimeContext;
  rawConfig: RawConfig;
  effective: ReturnType<typeof resolveJyotishChartSettings>;
  asOf: string;
  result: ChartResult<JyotishChart>;
  resultHash: string;
}

/** Copy plain JSON data using descriptors, never calling getters or freezing input. */
function own<T>(value: T, seen = new Set<object>()): T {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object' || seen.has(value)) throw new TypeError('Expected finite acyclic JSON data');
  const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
  if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) throw new TypeError('Expected plain data');
  seen.add(value);
  const result = array ? [] : {};
  for (const key of Reflect.ownKeys(value)) {
    if (array && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== 'string' || !descriptor.enumerable || !('value' in descriptor)) throw new TypeError('Hidden fields, symbols and accessors are unsupported');
    if (array && !/^(0|[1-9]\d*)$/.test(key)) throw new TypeError('Expected plain array');
    Object.defineProperty(result, key, { value: own(descriptor.value, seen), enumerable: true, configurable: true, writable: true });
  }
  if (array && Object.keys(result).length !== value.length) throw new TypeError('Sparse arrays are unsupported');
  seen.delete(value);
  return result as T;
}
function canonical(value: unknown): string {
  const sort = (v: unknown): unknown => Array.isArray(v) ? v.map(sort) : v !== null && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, x]) => [k, sort(x)])) : v;
  return JSON.stringify(sort(value));
}
const equal = (a: unknown, b: unknown) => canonical(a) === canonical(b);
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function rawInput(input: StandaloneJyotishInput): RawConfig {
  if (!input || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw new TypeError('Expected plain config');
  for (const key of Reflect.ownKeys(input)) {
    const d = Object.getOwnPropertyDescriptor(input, key)!;
    if (typeof key !== 'string' || !keys.includes(key as typeof keys[number]) || !d.enumerable || !('value' in d)) throw new TypeError('Unsupported config field/descriptor');
  }
  return Object.fromEntries(keys.map(key => {
    const d = Object.getOwnPropertyDescriptor(input, key);
    let p: Presence;
    if (!d) p = { state: 'absent' };
    else if (d.value === undefined) p = { state: 'undefined' };
    else if (d.value === null) p = { state: 'null' };
    else if (key === 'asOf' && d.value instanceof Date) {
      if (Object.getPrototypeOf(d.value) !== Date.prototype || Reflect.ownKeys(d.value).length) throw new TypeError('Expected unadorned Date');
      p = { state: 'date', value: Date.prototype.toISOString.call(d.value) };
    } else {
      if (!['string', 'number'].includes(typeof d.value) || typeof d.value === 'number' && !Number.isFinite(d.value)) throw new TypeError('Invalid config value');
      p = { state: 'value', value: d.value };
    }
    return [key, p];
  })) as RawConfig;
}
function restore(raw: RawConfig): StandaloneJyotishInput {
  const input: Record<string, unknown> = {};
  if (!raw || !equal(Object.keys(raw).sort(), [...keys].sort())) throw new TypeError('Invalid raw config keys');
  for (const key of keys) {
    const p = raw[key];
    if (!p || typeof p !== 'object') throw new TypeError('Invalid presence');
    if (p.state === 'absent') { if (!equal(p, { state: 'absent' })) throw new TypeError('Invalid absence'); }
    else if (p.state === 'undefined' || p.state === 'null') {
      if (!equal(p, { state: p.state })) throw new TypeError('Invalid nullish descriptor');
      input[key] = p.state === 'null' ? null : undefined;
    } else if (p.state === 'value') {
      if (!equal(Object.keys(p).sort(), ['state', 'value']) || !['string', 'number'].includes(typeof p.value)) throw new TypeError('Invalid value descriptor');
      input[key] = p.value;
    } else if (p.state === 'date' && key === 'asOf') {
      if (!equal(Object.keys(p).sort(), ['state', 'value']) || typeof p.value !== 'string') throw new TypeError('Invalid date descriptor');
      const date = new Date(p.value);
      if (date.toISOString() !== p.value) throw new TypeError('Noncanonical date descriptor');
      input[key] = date;
    } else throw new TypeError('Unsupported presence');
  }
  if (!equal(rawInput(input as StandaloneJyotishInput), raw)) throw new TypeError('Invalid raw config');
  return input as StandaloneJyotishInput;
}
function prepare(context: TimeContext, input: StandaloneJyotishInput) {
  const rawConfig = rawInput(input), config = restore(rawConfig), ctx = own(context);
  if (!ctx || !ctx.profile) throw new TypeError('Missing context');
  // Accept either explicit DST-overlap resolution; reject forged/incomplete context and extra fields.
  const matches = (['earlier', 'later'] as const).some(dstOverlap => equal(createTimeContext(ctx.profile, { dstOverlap }), ctx));
  if (!matches) throw new TypeError('Context must be a complete current TimeContext');
  if (typeof config.asOf !== 'string' && !(config.asOf instanceof Date)) throw new TypeError('asOf is required');
  const asOf = normalizeAsOf(config.asOf, 'Standalone Jyotish replay').ymd;
  const effective = resolveJyotishChartSettings(config as JyotishConfig);
  if (!['lahiri', 'raman', 'krishnamurti'].includes(effective.ayanamsa) || !['mean', 'true'].includes(effective.node)
      || typeof effective.dashaYearDays !== 'number' || !Number.isFinite(effective.dashaYearDays) || effective.dashaYearDays <= 0) throw new TypeError('Invalid effective settings');
  return { rawConfig, config, context: ctx, effective, asOf };
}
function versionIdentity(): StandaloneEphemerisRecord['versions'] {
  return own({ core: VERSION, calculator: JYOTISH_CALCULATOR_VERSION, tzdb: TZDB_VERSION, dependencies, ephemerisDependencies, runtime: ephemerisInfo() });
}
/** Input ownership completes synchronously before initialization's first await. */
export async function captureStandaloneJyotish(context: TimeContext, input: StandaloneJyotishInput): Promise<StandaloneEphemerisRecord> {
  const prepared = prepare(context, input);
  await initEphemeris();
  const result = own(jyotishCalculator.calculate(prepared.context, prepared.config as JyotishConfig));
  // own rejects all non-finite intermediates exposed in the complete result. Calculator throws on invalid dates.
  if (result.chart.timeKnown && (!result.chart.dasha || result.chart.planets.length !== 9 || result.components.length === 0)) throw new RangeError('Incomplete Jyotish result');
  return freeze({ schemaVersion: 1, scope: 'standalone-jyotish', implementation: 'standalone-jyotish-replay-v1',
    versions: versionIdentity(), context: prepared.context, rawConfig: prepared.rawConfig, effective: prepared.effective,
    asOf: prepared.asOf, result, resultHash: `sjr1-${fnv1a64Hex(canonical(result))}` });
}
/** Recompute and compare the entire record. A matching hash is not authenticity evidence. */
export async function replayStandaloneJyotish(value: unknown): Promise<StandaloneEphemerisRecord> {
  const record = own(value) as StandaloneEphemerisRecord;
  const envelopeKeys = ['schemaVersion', 'scope', 'implementation', 'versions', 'context', 'rawConfig', 'effective', 'asOf', 'result', 'resultHash'];
  if (!record || Array.isArray(record) || typeof record !== 'object' || !equal(Object.keys(record).sort(), envelopeKeys.sort())) throw new TypeError('Invalid standalone replay envelope fields');
  if (record.schemaVersion !== 1 || record.scope !== 'standalone-jyotish' || record.implementation !== 'standalone-jyotish-replay-v1') throw new TypeError('Unsupported standalone replay version');
  const prepared = prepare(record.context, restore(record.rawConfig));
  await initEphemeris();
  if (!equal(record.versions, versionIdentity()) || !equal(record.effective, prepared.effective) || record.asOf !== prepared.asOf) throw new Error('Standalone replay version/settings mismatch');
  const actual = await captureStandaloneJyotish(prepared.context, prepared.config);
  if (!equal(record, actual)) throw new Error('Standalone replay full content mismatch');
  return actual;
}
