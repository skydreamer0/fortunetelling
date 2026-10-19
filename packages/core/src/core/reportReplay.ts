/** Opt-in Report8 current-build sync replay. Legacy analyze()/Report7 stay intact. */
import { analyzeWithSnapshot, type AnalyzeInput, type Report } from './analyze';
import { createCalculationSpec, type CalculationSpec } from './calculationSpec';
import { createChartSnapshotSession } from './chartSnapshotSession';
import type { ChartSnapshot } from './chartSnapshot';
import type { TimelineOptions, TimelineCooperativeControl } from '../timeline/buildTimeline';
import type { BacktestTimelineOptions } from '../backtest/timeline';
import { VERSION } from './version';

export const REPLAY_REPORT_SCHEMA_VERSION = 8 as const;
export interface ReportCalculation {
  readonly scope: 'analyze-sync-natal';
  readonly specHash: string;
  readonly snapshotId: string;
  readonly excludedSystems: readonly ['jyotish', 'humanDesign'];
}
export interface ReplayReport extends Report {
  schemaVersion: typeof REPLAY_REPORT_SCHEMA_VERSION;
  calculation: ReportCalculation;
  replay: { schemaVersion: 1; spec: CalculationSpec; snapshot: ChartSnapshot };
}

/** Own JSON-shaped data without executing caller getters; undefined object fields match JSON omission. */
type Json = null | string | boolean | number | Json[] | { [key: string]: Json };
function own(value: unknown, seen = new Set<object>()): Json {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object' || seen.has(value)) throw new TypeError('Replay requires acyclic JSON data');
  if (!(Array.isArray(value) ? Object.getPrototypeOf(value) === Array.prototype : [Object.prototype, null].includes(Object.getPrototypeOf(value)))) throw new TypeError('Replay requires plain own data');
  seen.add(value);
  const out: Json[] | { [key: string]: Json } = Array.isArray(value) ? [] : {};
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === 'length') continue;
    const d = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== 'string' || !d.enumerable || !('value' in d)) throw new TypeError('Replay rejects accessors/hidden data');
    if (Array.isArray(value) && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) throw new TypeError('Replay requires plain arrays');
    if (d.value === undefined && !Array.isArray(value)) continue;
    Object.defineProperty(out, key, { value: own(d.value, seen), enumerable: true, writable: true, configurable: true });
  }
  if (Array.isArray(value) && Object.keys(out).length !== value.length) throw new TypeError('Replay rejects sparse arrays');
  seen.delete(value);
  return out;
}
// Unlike portable canonicalStringify, this comparison never drops nested
// generatedAt or any other field. Only the explicitly selected outer report
// metadata is outside the replay contract.
function stable(value: unknown): string {
  const sort = (item: unknown): unknown => Array.isArray(item) ? item.map(sort)
    : item !== null && typeof item === 'object'
      ? Object.fromEntries(Object.entries(item).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, sort(v)]))
      : item;
  return JSON.stringify(sort(value));
}
const equal = (a: unknown, b: unknown) => stable(a) === stable(b);
const cache = new WeakMap<object, { key: string; session: ReturnType<typeof bind> }>();
function metadata(session: ReturnType<typeof createChartSnapshotSession>): ReportCalculation {
  return Object.freeze({ scope: 'analyze-sync-natal', specHash: session.snapshot.specHash,
    snapshotId: session.snapshot.snapshotId, excludedSystems: Object.freeze(['jyotish', 'humanDesign'] as const) });
}
function anchor(report: Report) {
  return { version: report.version, schemaVersion: report.schemaVersion, asOf: report.asOf,
    input: report.input, timeContext: report.timeContext, timeline: report.timeline, signals: report.signals };
}
function keyOf(report: ReplayReport) {
  return stable({ ...anchor(report), calculation: report.calculation, replay: report.replay });
}
function bind(report: Report, session: ReturnType<typeof createChartSnapshotSession>) {
  if (!report.timeline) throw new Error('Replay requires a recorded timeline');
  const settings = session.snapshot.identity.settings.bazi;
  const fixed = {
    useTrueSolarTime: settings.clock === 'trueSolar', ziHourConvention: settings.ziHourConvention,
    systems: [...report.timeline.systems], systemWeights: { ...report.timeline.systemWeights },
    consensusThreshold: report.timeline.thresholds.theta, conflictThreshold: report.timeline.thresholds.tau,
  };
  const calculation = metadata(session);
  function options<T extends Partial<TimelineOptions> | Partial<BacktestTimelineOptions>>(value: T) {
    if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError('Replay projection requires options');
    // Projection options contain Infinity for the existing all-signals path; only
    // the recorded identity-bearing fields are compared, never normalized away.
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(value).some(k => typeof k !== 'string' || !('value' in descriptors[k]))) throw new TypeError('Replay rejects option accessors');
    const allowed = new Set([...Object.keys(fixed), 'asOf', 'years', 'fromYear', 'toYear', 'includeMonths', 'topSignalsPerDomain']);
    for (const [key, d] of Object.entries(descriptors)) {
      if (!allowed.has(key) || !d.enumerable) throw new Error(`Unsupported replay projection option: ${key}`);
      if (!(key in fixed) && d.value !== undefined && !['string', 'number', 'boolean'].includes(typeof d.value)) throw new TypeError('Replay period options must be scalar');
    }
    for (const k of Object.keys(fixed) as (keyof typeof fixed)[]) {
      if (k in value && !equal(own(value[k as keyof T]), fixed[k])) throw new Error(`Replay projection mismatch: ${k}`);
    }
    const { useTrueSolarTime: _clock, ziHourConvention: _zi, ...recorded } = fixed;
    const { useTrueSolarTime: _requestedClock, ziHourConvention: _requestedZi, ...period } = value;
    return { ...period, ...recorded };
  }
  return Object.freeze({
    calculation,
    timeline(value: TimelineOptions) { return { ...session.timeline(options(value)), calculation }; },
    async timelineCooperatively(value: TimelineOptions, control: TimelineCooperativeControl) {
      return { ...await session.timelineCooperatively(options(value), control), calculation };
    },
    backtest(value: BacktestTimelineOptions) { return { ...session.backtest(options(value)), calculation }; },
  });
}

/** New opt-in report format; the original source and one owned snapshot are retained. */
export function analyzeReplayReport(input: AnalyzeInput, options: { asOf?: Date | string | null } = {}): ReplayReport {
  const owned = own(input) as unknown as AnalyzeInput;
  if (!options || ![Object.prototype, null].includes(Object.getPrototypeOf(options))) throw new TypeError('Replay requires plain analysis options');
  for (const key of Reflect.ownKeys(options)) {
    const d = Object.getOwnPropertyDescriptor(options, key)!;
    if (key !== 'asOf' || !d.enumerable || !('value' in d)) throw new TypeError('Replay rejects analysis option accessors/unknown fields');
  }
  const asOf = options.asOf;
  if (asOf !== null && asOf !== undefined && typeof asOf !== 'string' && !(asOf instanceof Date && Object.getPrototypeOf(asOf) === Date.prototype)) throw new TypeError('Invalid replay asOf');
  const ownedOptions = { asOf: asOf instanceof Date ? new Date(Date.prototype.getTime.call(asOf)) : asOf };
  const spec = createCalculationSpec(owned);
  const session = createChartSnapshotSession(spec);
  const report: ReplayReport = { ...analyzeWithSnapshot(owned, ownedOptions, session.snapshot), schemaVersion: 8,
    calculation: metadata(session), replay: { schemaVersion: 1, spec, snapshot: session.snapshot } };
  cache.set(report, { key: keyOf(report), session: bind(report, session) });
  return report;
}

/** Current-build reconstruction only; never infer identity for old Report7 or execute historical versions. */
export function createReportReplaySession(value: unknown) {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError('Replay requires a plain report');
  const selected: Record<string, unknown> = {};
  for (const key of ['version', 'schemaVersion', 'asOf', 'input', 'timeContext', 'timeline', 'signals', 'calculation', 'replay']) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) throw new TypeError('Replay requires own report data');
    selected[key] = own(descriptor.value);
  }
  const report = selected as unknown as ReplayReport;
  if (report.schemaVersion !== 8 || report.version !== VERSION || report.replay?.schemaVersion !== 1) throw new Error('Unsupported replay report version');
  const key = keyOf(report);
  const hit = cache.get(value as object);
  if (hit?.key === key) return hit.session;
  const spec = createCalculationSpec(report.replay.spec.source.input as AnalyzeInput);
  if (!equal(spec, report.replay.spec)) throw new Error('Replay CalculationSpec mismatch');
  const session = createChartSnapshotSession(spec, report.replay.snapshot);
  if (!equal(metadata(session), report.calculation)) throw new Error('Replay calculation mismatch');
  const computed = analyzeWithSnapshot(spec.source.input as AnalyzeInput, { asOf: report.asOf }, session.snapshot);
  if (!equal(anchor({ ...computed, schemaVersion: 8 }), anchor(report))) throw new Error('Replay report source/timeline mismatch');
  const result = bind(report, session);
  cache.set(value as object, { key, session: result });
  return result;
}
