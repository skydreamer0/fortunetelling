/**
 * Interpretation payload (V5-03, ARCHITECTURE-V2 §9).
 *
 * `buildInterpretationPayload(report, { question })` turns a Report v4 (plus an
 * optional Question Engine answer) into the ONLY data the model ever sees:
 *   { profile (de-identified), charts, signals, timeline, question }
 *
 * - De-identified (D-029): never copies `input.name`, `birthplace.label`,
 *   birth date/time or coordinates; any leftover occurrence of the name / label
 *   strings anywhere in the payload is replaced by 〔已移除〕.
 * - Deterministic (D-014): no clock, no `generatedAt`/`computedAt`/`durationMs`;
 *   engines sorted by id, signals sorted by id, keys canonicalised on
 *   serialisation. Same report → byte-identical `payloadJson`.
 * - Size budget: when the serialised payload exceeds `maxChars`, the
 *   lowest-intensity signals are dropped first (question source signals last),
 *   and the drop is recorded in `payload.truncation`.
 *
 * Pure data shaping only — reads JSON already computed by `@fortune/core`;
 * never calls a calculator (D-021).
 */
import type {
  Domain,
  QuestionAnswer,
  RankedWindow,
  Signal,
  SignalConflict,
  SignalWindow,
  SystemId,
  Timeline,
  TimelineCell,
  Trait,
} from '@fortune/core';
import { canonicalJson } from './canonical';

export const PAYLOAD_VERSION = 1;
/** Default serialised-size budget (characters of canonical JSON). */
export const DEFAULT_MAX_PAYLOAD_CHARS = 120_000;
export const REDACTED = '〔已移除〕';

// ─── loose input shapes (Report v4 is produced by JS; only the fields we read) ─

export interface ReportComponentLike {
  id: string;
  name?: string;
  category?: string;
  value?: unknown;
  meta?: unknown;
}
export interface ReportEngineLike {
  engineId: string;
  engineName?: string;
  components?: ReportComponentLike[];
  errors?: string[];
}
export interface ReportLike {
  schemaVersion?: number;
  generatedAt?: string;
  asOf?: string;
  input?: { name?: string; birthplace?: { label?: string } | null } & Record<string, unknown>;
  engines?: ReportEngineLike[];
  timeContext?: {
    profile?: {
      gender?: string;
      timeAccuracy?: string;
      birthplace?: { label?: string; timezone?: string } | null;
    };
    flags?: Array<{ id?: string; code?: string; detail?: string } & Record<string, unknown>>;
  } | null;
  signals?: Signal[];
  timeline?: Timeline | null;
}

// ─── payload shapes ─────────────────────────────────────────────────────────

export interface PayloadSignal {
  id: string;
  system: SystemId;
  ruleId: string;
  domain: Domain;
  trait: Trait;
  intensity: number;
  valence: number;
  window: SignalWindow;
  evidence: { text: string };
}

export interface PayloadChartComponent {
  id: string;
  name?: string;
  category?: string;
  value: unknown;
}

export interface PayloadChart {
  system: string;
  name?: string;
  components: PayloadChartComponent[];
  errors?: string[];
}

export interface PayloadTimelineDomain {
  domain: Domain;
  score: number;
  band: string;
  consensus: number;
  highConsensus: boolean;
  /** Systems that emitted signals for this (domain, cell). */
  systems: SystemId[];
  conflict: SignalConflict | null;
  /** Top signal ids of this cell (only ids present in `signals`). */
  topSignalIds: string[];
}

export interface PayloadTimelineCell {
  window: SignalWindow;
  domains: PayloadTimelineDomain[];
}

export interface PayloadTimeline {
  asOf: string;
  systems: SystemId[];
  skippedSystems: Array<{ system: string; reason: string }>;
  bandCuts: unknown;
  years: PayloadTimelineCell[];
  months: PayloadTimelineCell[];
}

export interface PayloadRankedWindow {
  rank: number;
  window: SignalWindow;
  score: number;
  band: string;
  consensus: number;
  highConsensus: boolean;
  conflict: Array<SignalConflict & { domain: Domain }> | null;
  supportSignalIds: string[];
  riskSignalIds: string[];
}

export interface PayloadQuestion {
  category: string;
  range: { start: string; end: string } | null;
  unsupported: boolean;
  catalogVersion: number;
  top: PayloadRankedWindow[];
}

export interface PayloadTruncation {
  maxChars: number;
  signalsTotal: number;
  signalsKept: number;
  signalsDropped: number;
  /** Lowest intensity among dropped signals (null when nothing dropped). */
  droppedMaxIntensity: number | null;
  /** True when even after dropping every droppable signal the payload is over budget. */
  overBudget: boolean;
}

export interface InterpretationPayload {
  payloadVersion: typeof PAYLOAD_VERSION;
  report: { schemaVersion: number | null; asOf: string | null };
  /** De-identified (D-029): no name, no birth date/time, no birthplace label or coordinates. */
  profile: { gender: string | null; timeAccuracy: string | null; timezone: string | null };
  timeFlags: string[];
  charts: PayloadChart[];
  signals: PayloadSignal[];
  timeline: PayloadTimeline | null;
  question: PayloadQuestion | null;
  /** Fixed caveats the model must respect (D-033). */
  notes: string[];
  truncation: PayloadTruncation;
}

export interface BuildPayloadOptions {
  question?: QuestionAnswer | null;
  /** Serialised-size budget in characters; default 120 000. */
  maxChars?: number;
}

export interface BuiltPayload {
  payload: InterpretationPayload;
  /** Canonical JSON of `payload` — exactly what is sent to the model and hashed. */
  payloadJson: string;
  /** Every signal id the model may cite. */
  signalIds: Set<string>;
}

export const PAYLOAD_NOTES: readonly string[] = Object.freeze([
  'scores（0–100）與 band 為未校準的相對指標（D-033）：只平均有發出訊號的系統，不同領域之間、不同年份之間不可直接比較。',
  'timeline 與 question 內的 id 皆指向 signals[].id；只有 signals 陣列內的 id 可以被引用。',
  'charts 為程式確定性計算的結果；不得重新推算或補充任何干支、星曜、宮位、行星位置。',
]);

// ─── helpers ────────────────────────────────────────────────────────────────

/** Keys never copied from chart values: provenance/library noise and coordinates. */
const DROP_VALUE_KEYS = new Set(['convention', 'meta', 'library', 'lat', 'lng', 'latitude', 'longitude', 'label']);

/** Recursively drops null / '' / noise keys so the payload stays compact. */
function compactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(compactValue);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (DROP_VALUE_KEYS.has(k)) continue;
      if (v === null || v === undefined || v === '') continue;
      out[k] = compactValue(v);
    }
    return out;
  }
  return value;
}

function toPayloadSignal(s: Signal): PayloadSignal {
  return {
    id: s.id,
    system: s.system,
    ruleId: s.ruleId,
    domain: s.domain,
    trait: s.trait,
    intensity: s.intensity,
    valence: s.valence,
    window: { grain: s.window.grain, start: s.window.start, end: s.window.end },
    evidence: { text: s.evidence?.text ?? '' },
  };
}

function buildCharts(engines: ReportEngineLike[] | undefined): PayloadChart[] {
  return [...(engines ?? [])]
    .filter((e) => e && typeof e.engineId === 'string')
    .sort((a, b) => (a.engineId < b.engineId ? -1 : a.engineId > b.engineId ? 1 : 0))
    .map((e) => {
      const chart: PayloadChart = {
        system: e.engineId,
        name: e.engineName,
        components: (e.components ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          category: c.category,
          value: compactValue(c.value),
        })),
      };
      if (e.errors && e.errors.length > 0) chart.errors = [...e.errors];
      return chart;
    });
}

function buildTimelineCells(cells: TimelineCell[] | undefined): PayloadTimelineCell[] {
  return (cells ?? []).map((cell) => ({
    window: { grain: cell.window.grain, start: cell.window.start, end: cell.window.end },
    domains: cell.domains
      .filter((d) => d.score > 0 || (d.topSignals?.length ?? 0) > 0)
      .map((d) => ({
        domain: d.domain,
        score: d.score,
        band: d.band,
        consensus: d.consensus,
        highConsensus: d.highConsensus,
        systems: Object.keys(d.perSystem ?? {}).sort() as SystemId[],
        conflict: d.conflict,
        topSignalIds: (d.topSignals ?? []).map((s) => s.id),
      })),
  }));
}

function buildQuestion(answer: QuestionAnswer): PayloadQuestion {
  return {
    category: answer.category,
    range: answer.range ? { start: answer.range.start, end: answer.range.end } : null,
    unsupported: answer.unsupported === true,
    catalogVersion: answer.catalogVersion,
    top: (answer.top ?? []).map((w: RankedWindow) => ({
      rank: w.rank,
      window: { grain: w.window.grain, start: w.window.start, end: w.window.end },
      score: w.score,
      band: w.band,
      consensus: w.consensus,
      highConsensus: w.highConsensus,
      conflict: w.conflict,
      supportSignalIds: w.supportSignals.map((s) => s.id),
      riskSignalIds: w.riskSignals.map((s) => s.id),
    })),
  };
}

/** Replace every occurrence of the sensitive strings inside any string of `value`. */
function scrub(value: unknown, secrets: string[]): unknown {
  if (secrets.length === 0) return value;
  if (typeof value === 'string') {
    let s = value;
    for (const secret of secrets) if (s.includes(secret)) s = s.split(secret).join(REDACTED);
    return s;
  }
  if (Array.isArray(value)) return value.map((v) => scrub(v, secrets));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = scrub(v, secrets);
    return out;
  }
  return value;
}

function sensitiveStrings(report: ReportLike): string[] {
  const out = new Set<string>();
  const add = (s: unknown) => {
    if (typeof s === 'string' && s.trim().length >= 2) out.add(s.trim());
  };
  add(report.input?.name);
  add(report.input?.birthplace?.label);
  add(report.timeContext?.profile?.birthplace?.label);
  // Longest first so a label containing the name is replaced whole.
  return [...out].sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
}

// ─── main ───────────────────────────────────────────────────────────────────

export function buildInterpretationPayload(report: ReportLike, options: BuildPayloadOptions = {}): BuiltPayload {
  const maxChars = options.maxChars ?? DEFAULT_MAX_PAYLOAD_CHARS;
  const answer = options.question ?? null;

  // All candidate signals: report.signals ∪ question source signals (de-duplicated by id).
  const byId = new Map<string, Signal>();
  for (const s of report.signals ?? []) if (s && typeof s.id === 'string') byId.set(s.id, s);
  const protectedIds = new Set<string>();
  for (const w of answer?.top ?? []) {
    for (const s of [...w.supportSignals, ...w.riskSignals]) {
      if (!byId.has(s.id)) byId.set(s.id, s);
      protectedIds.add(s.id);
    }
  }
  const all = [...byId.values()].map(toPayloadSignal);

  const tc = report.timeContext ?? null;
  const tl = report.timeline ?? null;
  const base: Omit<InterpretationPayload, 'signals' | 'truncation'> = {
    payloadVersion: PAYLOAD_VERSION,
    report: { schemaVersion: report.schemaVersion ?? null, asOf: report.asOf ?? null },
    profile: {
      gender: tc?.profile?.gender ?? null,
      timeAccuracy: tc?.profile?.timeAccuracy ?? null,
      timezone: tc?.profile?.birthplace?.timezone ?? null,
    },
    timeFlags: (tc?.flags ?? [])
      .map((f) => [f.id ?? f.code ?? '', f.detail ?? ''].filter(Boolean).join(': '))
      .filter(Boolean)
      .sort(),
    charts: buildCharts(report.engines),
    timeline: tl
      ? {
          asOf: tl.asOf,
          systems: [...tl.systems],
          skippedSystems: tl.skippedSystems.map((s) => ({ system: s.system, reason: s.reason })),
          bandCuts: tl.bandCuts,
          years: buildTimelineCells(tl.years),
          months: buildTimelineCells(tl.months),
        }
      : null,
    question: answer ? buildQuestion(answer) : null,
    notes: [...PAYLOAD_NOTES],
  };

  // ── size budget: greedy keep by priority (protected, intensity desc, id asc) ──
  const placeholderTrunc: PayloadTruncation = {
    maxChars,
    signalsTotal: all.length,
    signalsKept: all.length,
    signalsDropped: all.length,
    droppedMaxIntensity: 0.123456789,
    overBudget: false,
  };
  const baseSize = canonicalJson({ ...base, signals: [], truncation: placeholderTrunc }).length + 64;
  const priority = [...all].sort((a, b) => {
    const pa = protectedIds.has(a.id) ? 1 : 0;
    const pb = protectedIds.has(b.id) ? 1 : 0;
    if (pa !== pb) return pb - pa;
    if (a.intensity !== b.intensity) return b.intensity - a.intensity;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const kept: PayloadSignal[] = [];
  const dropped: PayloadSignal[] = [];
  let size = baseSize;
  let full = false; // strict order: once one signal does not fit, every lower-priority one is dropped too
  for (const s of priority) {
    const len = canonicalJson(s).length + 1;
    if (!full && size + len <= maxChars) {
      kept.push(s);
      size += len;
    } else {
      full = true;
      dropped.push(s);
    }
  }
  kept.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const keptIds = new Set(kept.map((s) => s.id));

  // Drop references to signals that are not in the payload.
  const filterIds = (ids: string[]) => ids.filter((id) => keptIds.has(id));
  if (base.timeline) {
    for (const cell of [...base.timeline.years, ...base.timeline.months]) {
      for (const d of cell.domains) d.topSignalIds = filterIds(d.topSignalIds);
    }
  }
  if (base.question) {
    for (const w of base.question.top) {
      w.supportSignalIds = filterIds(w.supportSignalIds);
      w.riskSignalIds = filterIds(w.riskSignalIds);
    }
  }

  const truncation: PayloadTruncation = {
    maxChars,
    signalsTotal: all.length,
    signalsKept: kept.length,
    signalsDropped: dropped.length,
    droppedMaxIntensity: dropped.length ? Math.max(...dropped.map((s) => s.intensity)) : null,
    overBudget: baseSize > maxChars,
  };

  const secrets = sensitiveStrings(report);
  const payload = scrub({ ...base, signals: kept, truncation }, secrets) as InterpretationPayload;
  return { payload, payloadJson: canonicalJson(payload), signalIds: keptIds };
}
