/** Explicit opt-in research observations. No storage, scoring or implicit v1 upgrade. */
import { DOMAINS, type Domain } from '../signals/types';
import { LIFE_EVENT_CATEGORIES, validateLifeEvent, type LifeEventCategory, type LifeEventConfidence } from './lifeEvents';

export type ObservationStatus = 'event_recorded' | 'confirmed_absent' | 'unknown';
export type ObservationLabel = 'unreviewed' | 'confirmed' | 'disputed';
export type ObservationJsonValue = null | boolean | number | string | ObservationJsonValue[] | { [key: string]: ObservationJsonValue };
export interface LifeObservationV2 {
  schemaVersion: 2;
  id: string;
  /** Caller-assigned opaque IDs. Pseudonyms are not a guarantee of anonymity. */
  personId: string;
  clusterId: string;
  eventType: LifeEventCategory;
  domains: Domain[];
  date: { nominal: string; precision: 'day' | 'month'; confidence: LifeEventConfidence };
  /** No favorable/adverse meaning is inferred from event presence. Pending #29. */
  direction: 'unknown';
  observationStatus: ObservationStatus;
  labelStatus: ObservationLabel;
  /** Half-open, explicitly observed window; never inferred from a missing event. */
  observedWindow: { start: string; endExclusive: string } | null;
  recordedAt: string | null;
  source: { kind: 'legacy_v1' | 'synthetic' | 'self_report' | 'record'; reference: string | null };
  /** Exact JSON-compatible legacy input, including unrecognized fields. */
  legacyV1: ObservationJsonValue;
}
function fail(reason: string): never { throw new TypeError(reason); }
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('Expected observation object');
  return value as Record<string, unknown>;
};
function keys(value: Record<string, unknown>, expected: string[]): void {
  if (Object.keys(value).sort().join('\0') !== [...expected].sort().join('\0')) fail('Missing or unsupported observation fields');
}
function text(value: unknown, limit = 64): value is string { return typeof value === 'string' && value.trim().length > 0 && value.length <= limit; }
function member(choices: readonly string[], value: unknown): value is string { return typeof value === 'string' && choices.includes(value); }
function opaque(value: unknown): value is string { return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value); }
function validDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4)), month = Number(value.slice(5, 7)), day = Number(value.slice(8));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]!;
}
/** Lossless JSON clone. Reject unsupported values instead of silently dropping them. */
export function cloneObservationJson(input: unknown): ObservationJsonValue {
  let nodes = 0;
  const active = new Set<object>();
  const visit = (value: unknown, depth: number): ObservationJsonValue => {
    if (++nodes > 10_000 || depth > 32) return fail('Observation JSON exceeds bounded size/depth');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'string') { if (value.length > 10_000) return fail('Observation string too long'); return value; }
    if (typeof value === 'number') { if (!Number.isFinite(value) || Object.is(value, -0)) return fail('Non-lossless JSON number'); return value; }
    if (typeof value !== 'object') return fail('Non-JSON observation value');
    if (active.has(value)) return fail('Cyclic observation JSON');
    const prototype = Object.getPrototypeOf(value);
    if (Array.isArray(value) ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) return fail('Observation JSON must use plain objects and arrays');
    if (Object.getOwnPropertySymbols(value).length) return fail('Symbol observation fields are not JSON');
    active.add(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (Array.isArray(value) && key === 'length') continue;
      if (!descriptor.enumerable || !('value' in descriptor)) return fail('Non-data observation property');
    }
    let result: ObservationJsonValue;
    if (Array.isArray(value)) {
      if (Object.keys(value).length !== value.length || Object.keys(value).some((key, index) => key !== String(index))) return fail('Sparse/extended observation array');
      const children: ObservationJsonValue[] = [];
      for (let index = 0; index < value.length; index++) children.push(visit(descriptors[String(index)]!.value, depth + 1));
      result = children;
    } else result = Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, visit(descriptor.value, depth + 1)]));
    active.delete(value);
    return result;
  };
  return visit(input, 0);
}
export function readLifeObservationV2(input: unknown): LifeObservationV2 {
  const value = record(cloneObservationJson(input));
  keys(value, ['schemaVersion', 'id', 'personId', 'clusterId', 'eventType', 'domains', 'date', 'direction', 'observationStatus', 'labelStatus', 'observedWindow', 'recordedAt', 'source', 'legacyV1']);
  if (value.schemaVersion !== 2 || !text(value.id) || !opaque(value.personId) || !opaque(value.clusterId)) fail('Explicit v2 and opaque person/cluster IDs required');
  if (!(LIFE_EVENT_CATEGORIES as readonly unknown[]).includes(value.eventType)) fail('Unknown observation event type');
  if (!Array.isArray(value.domains) || !value.domains.length || value.domains.some(domain => !(DOMAINS as readonly unknown[]).includes(domain)) || new Set(value.domains).size !== value.domains.length) fail('Invalid observation domains');
  const date = record(value.date); keys(date, ['nominal', 'precision', 'confidence']);
  const month = typeof date.nominal === 'string' && /^\d{4}-\d{2}$/.test(date.nominal) && validDay(`${date.nominal}-01`);
  if (!(date.precision === 'month' && month || date.precision === 'day' && validDay(date.nominal)) || !member(['certain', 'approx'], date.confidence)) fail('Invalid nominal date/precision');
  if (value.direction !== 'unknown') fail('Directional semantics are not defined by this research schema');
  if (!member(['event_recorded', 'confirmed_absent', 'unknown'], value.observationStatus) || !member(['unreviewed', 'confirmed', 'disputed'], value.labelStatus)) fail('Invalid observation/label status');
  if (value.observedWindow !== null) {
    const window = record(value.observedWindow); keys(window, ['start', 'endExclusive']);
    if (!validDay(window.start) || !validDay(window.endExclusive) || window.start >= window.endExclusive) fail('Invalid half-open observed window');
    const nominalStart = date.precision === 'month' ? `${date.nominal}-01` : String(date.nominal);
    // The complete precision interval must be observed, not just its first day.
    // Compare inclusive final days so December 9999 never rolls into year 10000.
    let nominalLast = nominalStart;
    if (date.precision === 'month') {
      for (const day of ['31', '30', '29', '28']) {
        const candidate = `${date.nominal}-${day}`;
        if (validDay(candidate)) { nominalLast = candidate; break; }
      }
    }
    if (nominalStart < window.start || nominalLast >= window.endExclusive) fail('Nominal precision interval not fully covered by observed window');
  }
  if (value.observationStatus === 'confirmed_absent' && (value.labelStatus !== 'confirmed' || value.observedWindow === null)) fail('Absence requires explicit confirmed label and observed window');
  if (value.recordedAt !== null && (typeof value.recordedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.recordedAt) || !Number.isFinite(Date.parse(value.recordedAt)) || new Date(value.recordedAt).toISOString() !== value.recordedAt)) fail('Invalid explicit recordedAt');
  const source = record(value.source); keys(source, ['kind', 'reference']);
  if (!member(['legacy_v1', 'synthetic', 'self_report', 'record'], source.kind) || !(source.reference === null || text(source.reference, 500))) fail('Invalid observation source');
  if (source.kind === 'legacy_v1') {
    if (!validateLifeEvent(value.legacyV1).ok) fail('Invalid retained v1 payload');
    const legacy = record(value.legacyV1);
    if (value.id !== legacy.id || value.eventType !== legacy.category || JSON.stringify(value.domains) !== JSON.stringify(legacy.domains) || date.nominal !== legacy.date || date.confidence !== legacy.confidence) fail('Legacy projection does not match retained input');
    if (value.observationStatus !== 'event_recorded' || value.labelStatus !== 'unreviewed' || value.observedWindow !== null || value.recordedAt !== null || source.reference !== null) fail('Legacy migration cannot invent reviewed labels, observation windows or timestamps');
  } else if (value.legacyV1 !== null) fail('Only a legacy migration can retain legacyV1');
  // All fields above have been checked; retain caller ordering without normalization.
  return value as unknown as LifeObservationV2;
}
export function migrateLifeEventV1(input: unknown, identity: { personId: string; clusterId: string }): LifeObservationV2 {
  const legacyV1 = cloneObservationJson(input);
  if (!validateLifeEvent(legacyV1).ok) return fail('Expected valid legacy v1 event, never v2/future version');
  const legacy = record(legacyV1);
  return readLifeObservationV2({ schemaVersion: 2, id: legacy.id, ...identity, eventType: legacy.category, domains: legacy.domains,
    date: { nominal: legacy.date, precision: String(legacy.date).length === 7 ? 'month' : 'day', confidence: legacy.confidence },
    direction: 'unknown', observationStatus: 'event_recorded', labelStatus: 'unreviewed', observedWindow: null, recordedAt: null,
    source: { kind: 'legacy_v1', reference: null }, legacyV1 });
}
export function restoreLifeEventV1(input: unknown): ObservationJsonValue {
  const value = readLifeObservationV2(input);
  if (value.source.kind !== 'legacy_v1') return fail('Observation has no legacy source');
  return cloneObservationJson(value.legacyV1);
}
