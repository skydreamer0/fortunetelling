/** Current-build async timeline execution record. Not a natal snapshot or historical runtime. */
import type { TimeContext } from '../time/types';
import type { Timeline, TimelineOptions } from './buildTimeline';
import { createAsyncEphemerisCalculationSpec } from '../core/asyncEphemerisCalculationSpec';
import { VERSION } from '../core/version';
import { TZDB_VERSION } from '../time/tzdb';
import dependencies from '../core/calculationDependencies.json';
import ephemerisDependencies from './ephemerisDependencies.json';
import { fnv1a64Hex } from '../signals/signalId';
import { astro } from 'iztro';
import baziRules from '../rules/bazi/catalog.json';
import tenGodRules from '../rules/bazi/tenGodCatalog.json';
import ziweiRules from '../rules/ziwei/catalog.json';
import ziweiTraits from '../traits/ziwei.json';
import ziweiModifiers from '../traits/ziweiModifiers.json';
import numerologyRules from './numerologyCatalog.json';

/** Own data descriptors; never invoke external getters or preserve mutable aliases. */
export function ownAsyncData<T>(input: T, seen = new Set<object>()): T {
  if (input === null || input === undefined || ['string', 'boolean', 'number'].includes(typeof input)) return input;
  if (typeof input !== 'object' || seen.has(input)) throw new TypeError('Async replay requires acyclic data');
  if (!(Array.isArray(input) ? Object.getPrototypeOf(input) === Array.prototype : [Object.prototype, null].includes(Object.getPrototypeOf(input)))) throw new TypeError('Async replay requires plain data');
  seen.add(input);
  const out: Record<string, unknown> | unknown[] = Array.isArray(input) ? [] : {};
  for (const key of Reflect.ownKeys(input)) {
    if (Array.isArray(input) && key === 'length') continue;
    const d = Object.getOwnPropertyDescriptor(input, key)!;
    if (typeof key !== 'string' || !d.enumerable || !('value' in d)) throw new TypeError('Async replay rejects accessors/hidden properties');
    if (Array.isArray(input) && !/^(0|[1-9]\d*)$/.test(key)) throw new TypeError('Async replay requires plain arrays');
    Object.defineProperty(out, key, { value: ownAsyncData(d.value, seen), writable: true, enumerable: true, configurable: true });
  }
  if (Array.isArray(input) && Object.keys(out).length !== input.length) throw new TypeError('Async replay rejects sparse arrays');
  seen.delete(input);
  return out as T;
}

/** Complete-field canonical serialization; unlike portable canonicalization no metadata keys are omitted. */
function canonical(value: unknown, omitOptionalUndefined = false): string {
  const sort = (v: unknown): unknown => {
    if (v === undefined) throw new TypeError('Undefined replay array value');
    if (typeof v === 'number' && !Number.isFinite(v)) throw new TypeError('Non-finite replay data');
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([, x]) => !omitOptionalUndefined || x !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, x]) => [k, sort(x)]));
    return v;
  };
  return JSON.stringify(sort(value));
}
const hash = (v: unknown) => fnv1a64Hex(canonical(v, true));
const equal = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const allowedOptions = ['asOf', 'years', 'fromYear', 'includeMonths', 'topSignalsPerDomain', 'systems', 'systemWeights', 'bandCuts', 'consensusThreshold', 'conflictThreshold', 'name', 'useTrueSolarTime', 'ziHourConvention', 'ephemeris'];
type StoredOptions = Omit<TimelineOptions, 'topSignalsPerDomain'> & { topSignalsPerDomain?: number | 'all' };
export interface AsyncTimelineRecord {
  schemaVersion: 1;
  execution: { scope: 'async-timeline'; specHash: string; resultHash: string };
  spec: {
    implementation: 'async-timeline-replay-v1';
    versions: { core: string; tzdb: string; dependencies: typeof dependencies; ephemerisDependencies: typeof ephemerisDependencies };
    ruleDigests: Record<string, string>;
    iztroConfiguration: ReturnType<typeof astro.getConfig>;
    context: TimeContext;
    options: StoredOptions;
    ephemeris: ReturnType<typeof createAsyncEphemerisCalculationSpec>;
  };
  timeline: Timeline;
}

export function asyncExecutionSpec(context: TimeContext, options: TimelineOptions): AsyncTimelineRecord['spec'] {
  const ctx = ownAsyncData(context), opts = ownAsyncData(options);
  if (Object.keys(opts).some(key => !allowedOptions.includes(key))) throw new TypeError('Unsupported async replay option');
  const ephemeris = createAsyncEphemerisCalculationSpec(opts.ephemeris);
  const stored: StoredOptions = { ...opts, ephemeris: ownAsyncData(ephemeris.identity.settings),
    ...(opts.topSignalsPerDomain === Infinity ? { topSignalsPerDomain: 'all' as const } : {}) } as StoredOptions;
  const spec: AsyncTimelineRecord['spec'] = { implementation: 'async-timeline-replay-v1',
    versions: { core: VERSION, tzdb: TZDB_VERSION, dependencies: ownAsyncData(dependencies), ephemerisDependencies: ownAsyncData(ephemerisDependencies) },
    ruleDigests: Object.fromEntries(Object.entries({ baziRules, tenGodRules, ziweiRules, ziweiTraits, ziweiModifiers, numerologyRules }).map(([key, rules]) => [key, hash(rules)])),
    iztroConfiguration: ownAsyncData(astro.getConfig()), context: ctx, options: stored, ephemeris };
  canonical(spec, true); // Reject unrepresentable data before awaiting WASM.
  return spec;
}
export function executionOptions(spec: AsyncTimelineRecord['spec']): TimelineOptions {
  return { ...ownAsyncData(spec.options), ...(spec.options.topSignalsPerDomain === 'all' ? { topSignalsPerDomain: Infinity } : {}) } as TimelineOptions;
}
function freezeDeep<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

export function recordAsyncTimeline(spec: AsyncTimelineRecord['spec'], timeline: Timeline): AsyncTimelineRecord {
  // Normalize legal optional undefined only after the real timeline validators ran.
  // Input ownership must preserve presence: nested undefined may be malformed.
  return freezeDeep(JSON.parse(canonical({ schemaVersion: 1, execution: { scope: 'async-timeline', specHash: `ats1-${hash(spec)}`, resultHash: `atr1-${hash(timeline)}` }, spec, timeline }, true)) as AsyncTimelineRecord);
}

/** Recompute the real current implementation and compare full spec/result, never trust hashes alone. */
export async function replayAsyncTimelineUsing(value: unknown, build: (ctx: TimeContext, opts: TimelineOptions) => Promise<Timeline>): Promise<AsyncTimelineRecord> {
  const record = ownAsyncData(value) as AsyncTimelineRecord;
  canonical(record); // A replay record is JSON data; reject undefined, including extra fields.
  if (!record || record.schemaVersion !== 1 || !record.spec || record.spec.implementation !== 'async-timeline-replay-v1') throw new Error('Unsupported async replay version');
  const spec = asyncExecutionSpec(record.spec.context, executionOptions(record.spec));
  if (!equal(spec, record.spec)) throw new Error('Async execution version/source mismatch');
  const verify = () => verifyAsyncEnvironment(spec);
  const timeline = await build(spec.context, executionOptions(spec));
  verify();
  const actual = recordAsyncTimeline(spec, timeline);
  if (!equal(actual, record)) throw new Error('Async replay content mismatch');
  return actual;
}

export function verifyAsyncEnvironment(spec: AsyncTimelineRecord['spec']): void {
  if (!equal(spec.iztroConfiguration, ownAsyncData(astro.getConfig()))) throw new Error('Async replay environment changed');
}
