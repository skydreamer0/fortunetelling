/**
 * Interpretation payload (V5-03, ARCHITECTURE-V2 §9).
 *
 * `buildInterpretationPayload(report, { question })` turns a Report v4 (plus an
 * optional Question Engine answer) into the ONLY data the model ever sees:
 *   { profile (de-identified), charts, signals, timeline, question }
 *
 * - De-identified (D-029): never copies `input.name`, `birthplace.label`,
 *   birth date/time or coordinates; any leftover occurrence of the name / label
 *   strings anywhere in the payload is replaced by `[name]` / `[place]` (shared core/export/redact).
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
import { questionContextOf, type QuestionCheckContext } from './questionPolicy';
import { scrubDeep, sensitiveStringsOf, shortIdCollisions, shortSignalId, directionalVotes, evidenceMatchesContext, validAgreementThresholds,
  HIGH_CONSENSUS_MIN_SYSTEMS, type DirectionalEvidence, type AgreementThresholds, type SensitiveStrings } from './core-pure';

export const PAYLOAD_VERSION = 4;
/** Default serialised-size budget (characters of canonical JSON). */
export const DEFAULT_MAX_PAYLOAD_CHARS = 120_000;

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

/** Source disagreement remains present even when a side has no attached citations. */
export interface PayloadConflict extends SignalConflict {
  /** Original side references not supplied in this payload (selection, missing source, or budget). */
  omittedCount: { positive: number; negative: number };
}

export interface PayloadTimelineDomain {
  domain: Domain;
  score: number;
  band: string;
  consensus: number;
  activityAgreement: number;
  highConsensus: boolean;
  directionalEvidence: DirectionalEvidence | null;
  /** Systems that emitted signals for this (domain, cell). */
  systems: SystemId[];
  conflict: PayloadConflict | null;
  /** Top signal ids of this cell (only ids present in `signals`). */
  topSignalIds: string[];
}

export interface PayloadTimelineCell {
  window: SignalWindow;
  domains: PayloadTimelineDomain[];
}

export interface PayloadTimeline {
  thresholds: AgreementThresholds | null;
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
  activityAgreement: number;
  highConsensus: boolean;
  directionalEvidence: DirectionalEvidence[];
  conflict: Array<PayloadConflict & { domain: Domain }> | null;
  supportSignalIds: string[];
  riskSignalIds: string[];
}

export interface PayloadQuestion extends QuestionCheckContext {
  thresholds: AgreementThresholds | null;
  category: string;
  range: { start: string; end: string } | null;
  unsupported: boolean;
  catalogVersion: number;
  top: PayloadRankedWindow[];
}

export interface PayloadTruncation {
  /** 字數預算；`budget: false` 時為 null（不限）。 */
  maxChars: number | null;
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
  /**
   * 是否把姓名與出生地標籤替換為 `[name]`／`[place]`（D-029）。預設 true（向下相容）。
   * 本機對話（MCP）不經外部網路，可關閉；對外分享或複製 prompt 請維持開啟。
   */
  redact?: boolean;
  /**
   * 是否套用字數預算（超過就先丟強度最低的訊號）。預設 true（向下相容）。
   * 設為 false 等同不設上限（`truncation.maxChars` 為 null），仍使用同一 AI 候選投影。
   */
  budget?: boolean;
  /**
   * 給模型看的訊號編號用短編號（`sig_` + 8 位）；與其他訊號碰撞的維持完整編號（碰撞以
   * AI 已選的 Report 訊號 ∪ 問事來源訊號為範圍判斷）。預設 false（完整編號、API 路徑不變）。
   * `BuiltPayload.signalIds` 永遠是完整編號。
   */
  shortIds?: boolean;
}

/** 本機使用的選項：同一 AI 候選投影，不去識別化、不限字數。對外送出的路徑不得使用。 */
export const LOCAL_PAYLOAD_OPTIONS = Object.freeze({ redact: false, budget: false }) satisfies BuildPayloadOptions;

export interface BuiltPayload {
  payload: InterpretationPayload;
  /** Canonical JSON of `payload` — exactly what is sent to the model and hashed. */
  payloadJson: string;
  /** Every signal the model may cite — always FULL ids, even when `shortIds` shortened the payload. */
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

type IdMapper = (id: string) => string;

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

/** Keep source full IDs until each fresh budget render can test exact membership. */
function prepareConflict(source: SignalConflict | null): PayloadConflict | null {
  return source ? { positive: [...source.positive], negative: [...source.negative], omittedCount: { positive: 0, negative: 0 } } : null;
}

function projectConflict(source: PayloadConflict, kept: ReadonlySet<string>, sid: IdMapper): PayloadConflict {
  const positive = source.positive.filter(id => kept.has(id));
  const negative = source.negative.filter(id => kept.has(id));
  return {
    positive: positive.map(sid), negative: negative.map(sid),
    omittedCount: { positive: source.positive.length - positive.length, negative: source.negative.length - negative.length },
  };
}

function mapEvidence(proof: DirectionalEvidence, sid: IdMapper): DirectionalEvidence {
  return { ...proof, window: { ...proof.window }, thresholds: { ...proof.thresholds },
    perSystem: Object.fromEntries(Object.entries(proof.perSystem).map(([system, value]) => [system, { ...value!, signalIds: value!.signalIds.map(sid) }])) };
}
function proofStats(proof: DirectionalEvidence | null) {
  const votes = directionalVotes(proof);
  const consensus = votes ? Math.max(votes.positive.systems.length, votes.negative.systems.length) : 0;
  return { consensus, highConsensus: consensus >= HIGH_CONSENSUS_MIN_SYSTEMS };
}
function buildTimelineCells(cells: TimelineCell[] | undefined, sid: IdMapper, timeline: Timeline): PayloadTimelineCell[] {
  return (cells ?? []).map((cell) => ({
    window: { grain: cell.window.grain, start: cell.window.start, end: cell.window.end },
    domains: cell.domains
      .filter((d) => d.score > 0 || (d.topSignals?.length ?? 0) > 0)
      .map((d) => {
        const proof = timeline.schemaVersion >= 2 && evidenceMatchesContext(d.directionalEvidence, {
          domain: d.domain, window: cell.window, thresholds: timeline.thresholds, systemWeights: timeline.systemWeights,
          systems: timeline.systems, perSystem: d.perSystem,
        }) ? mapEvidence(d.directionalEvidence, sid) : null;
        return {
        domain: d.domain,
        score: d.score,
        band: d.band,
        ...proofStats(proof),
        activityAgreement: d.activityAgreement ?? d.consensus,
        directionalEvidence: proof,
        systems: Object.keys(d.perSystem ?? {}).sort() as SystemId[],
        conflict: prepareConflict(d.conflict),
        topSignalIds: (d.topSignals ?? []).map((s) => sid(s.id)),
      }; }),
  }));
}

function buildQuestion(answer: QuestionAnswer, sid: IdMapper): PayloadQuestion {
  return {
    ...questionContextOf(answer),
    thresholds: validAgreementThresholds(answer.thresholds) ? { ...answer.thresholds } : null,
    category: answer.category,
    range: answer.range ? { start: answer.range.start, end: answer.range.end } : null,
    unsupported: answer.unsupported === true,
    catalogVersion: answer.catalogVersion,
    top: (questionContextOf(answer).status === 'ranked' ? answer.top ?? [] : []).map((w: RankedWindow) => {
      const proofs = (w.domainScores ?? []).flatMap(domain => evidenceMatchesContext(domain.directionalEvidence, {
        domain: domain.domain, window: w.window, thresholds: answer.thresholds, signalIds: domain.signalIds,
      }) ? [mapEvidence(domain.directionalEvidence, sid)] : []);
      const consensus = Math.max(0, ...proofs.map(proof => proofStats(proof).consensus));
      return {
      rank: w.rank,
      window: { grain: w.window.grain, start: w.window.start, end: w.window.end },
      score: w.score,
      band: w.band,
      consensus,
      activityAgreement: w.activityAgreement ?? w.consensus,
      highConsensus: consensus >= HIGH_CONSENSUS_MIN_SYSTEMS,
      directionalEvidence: proofs,
      conflict: w.conflict?.map(conflict => ({ ...prepareConflict(conflict)!, domain: conflict.domain })) ?? null,
      supportSignalIds: w.supportSignals.map((s) => sid(s.id)),
      riskSignalIds: w.riskSignals.map((s) => sid(s.id)),
    }; }),
  };
}

/** 依序套用去識別化（共用 core 的 `scrubDeep`，佔位符為 `[name]`／`[place]`，D-029、M2-03）。 */
export function scrubReport<T>(value: T, parts: SensitiveStrings[]): T {
  return parts.reduce((v, p) => scrubDeep(v, p), value);
}

/**
 * 必須抹除的姓名與出生地標籤（D-029）。出生地標籤可能同時出現在 `input` 與 `timeContext`，
 * 兩者不同時各自成一組，逐組抹除。
 */
export function sensitiveParts(report: ReportLike): SensitiveStrings[] {
  const base = sensitiveStringsOf({ name: report.input?.name, birthplace: { label: report.input?.birthplace?.label } });
  const parts: SensitiveStrings[] = [base];
  const fromContext = sensitiveStringsOf({ birthplace: { label: report.timeContext?.profile?.birthplace?.label } });
  if (fromContext.place && fromContext.place !== base.place) parts.push({ name: null, place: fromContext.place });
  return parts;
}

// ─── main ───────────────────────────────────────────────────────────────────

/** Internal compatibility projection; Report7 completeness does not change AI selection. */
export function selectInterpretationReport(report: ReportLike): ReportLike {
  if ((report.schemaVersion ?? 0) < 7 || !report.timeline) return report;
  const selected = new Set([...report.timeline.years, ...report.timeline.months]
    .flatMap(cell => cell.domains.flatMap(domain => domain.topSignals.map(signal => signal.id))));
  return { ...report, signals: report.signals?.filter(signal => selected.has(signal.id)) };
}

export function buildInterpretationPayload(report: ReportLike, options: BuildPayloadOptions = {}): BuiltPayload {
  return buildInterpretationPayloadFromSelection(selectInterpretationReport(report), options);
}

/** Internal builder for copyPrompt, which fixes selection before level/refill trimming. */
export function buildInterpretationPayloadFromSelection(report: ReportLike, options: BuildPayloadOptions = {}): BuiltPayload {
  const budgeted = options.budget !== false;
  const maxChars = budgeted ? (options.maxChars ?? DEFAULT_MAX_PAYLOAD_CHARS) : Number.POSITIVE_INFINITY;
  const reportedMax = Number.isFinite(maxChars) ? maxChars : null;
  const answer = options.question ?? null;

  // All candidate signals: selected Report signals ∪ question source signals (de-duplicated by id).
  const byId = new Map<string, Signal>();
  for (const s of report.signals ?? []) if (s && typeof s.id === 'string') byId.set(s.id, s);
  const protectedIds = new Set<string>();
  for (const w of answer && questionContextOf(answer).status === 'ranked' ? answer.top : []) {
    for (const s of [...w.supportSignals, ...w.riskSignals]) {
      if (!byId.has(s.id)) byId.set(s.id, s);
      protectedIds.add(s.id);
    }
  }
  const all = [...byId.values()].map(toPayloadSignal);
  const colliding = options.shortIds ? new Set(shortIdCollisions(byId.keys()).flat()) : new Set<string>();
  const sid: IdMapper = (id) => (options.shortIds && !colliding.has(id) ? shortSignalId(id) : id);

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
          thresholds: tl.schemaVersion >= 2 && validAgreementThresholds(tl.thresholds) ? { ...tl.thresholds } : null,
          systems: [...tl.systems],
          skippedSystems: tl.skippedSystems.map((s) => ({ system: s.system, reason: s.reason })),
          bandCuts: tl.bandCuts,
          years: buildTimelineCells(tl.years, sid, tl),
          months: buildTimelineCells(tl.months, sid, tl),
        }
      : null,
    question: answer ? buildQuestion(answer, sid) : null,
    notes: [...PAYLOAD_NOTES],
  };

  // ── size budget: greedy keep by priority (protected, intensity desc, id asc) ──
  const priority = [...all].sort((a, b) => {
    const pa = protectedIds.has(a.id) ? 1 : 0;
    const pb = protectedIds.has(b.id) ? 1 : 0;
    if (pa !== pb) return pb - pa;
    if (a.intensity !== b.intensity) return b.intensity - a.intensity;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const parts = options.redact === false ? [] : sensitiveParts(report);
  // Measure the actual, redacted payload after pruning references. Estimating the
  // untrimmed base can discard every signal even when thousands of chars fit.
  // Each attempt starts fresh: a smaller prefix must not destroy later proofs.
  const renderPrefix = (count: number, overBudget = false): BuiltPayload => {
    const candidate = structuredClone(base);
    const kept = priority.slice(0, count).sort((a, b) => a.id.localeCompare(b.id));
    const dropped = priority.slice(count);
    const keptIds = new Set(kept.map(s => s.id));
  // Drop references to signals that are not in the payload.
  const keptShort = new Set(kept.map((s) => sid(s.id)));
  const filterIds = (ids: string[]) => ids.filter((id) => keptShort.has(id));
  // Keep raw qualification values, but remove systems with no citeable evidence.
  // This never reruns noisy-OR on the truncated signal subset.
  const trimProof = (proof: DirectionalEvidence | null): DirectionalEvidence | null => {
    if (!proof) return null;
    const perSystem = Object.fromEntries(Object.entries(proof.perSystem).flatMap(([system, value]) => {
      const signalIds = filterIds(value!.signalIds);
      return signalIds.length ? [[system, { ...value!, signalIds }]] : [];
    }));
    return { ...proof, perSystem };
  };
  if (candidate.timeline) {
    for (const cell of [...candidate.timeline.years, ...candidate.timeline.months]) {
      for (const d of cell.domains) {
        d.topSignalIds = filterIds(d.topSignalIds);
        if (d.conflict) d.conflict = projectConflict(d.conflict, keptIds, sid);
        d.directionalEvidence = trimProof(d.directionalEvidence);
        Object.assign(d, proofStats(d.directionalEvidence));
      }
    }
  }
  if (candidate.question) {
    for (const w of candidate.question.top) {
      w.supportSignalIds = filterIds(w.supportSignalIds);
      if (w.conflict) w.conflict = w.conflict.map(conflict => ({ ...projectConflict(conflict, keptIds, sid), domain: conflict.domain }));
      w.riskSignalIds = filterIds(w.riskSignalIds);
      w.directionalEvidence = w.directionalEvidence.map(proof => trimProof(proof)!).filter(Boolean);
      w.consensus = Math.max(0, ...w.directionalEvidence.map(proof => proofStats(proof).consensus));
      w.highConsensus = w.consensus >= HIGH_CONSENSUS_MIN_SYSTEMS;
    }
  }

    const truncation: PayloadTruncation = {
      maxChars: reportedMax,
      signalsTotal: all.length,
      signalsKept: kept.length,
      signalsDropped: dropped.length,
      droppedMaxIntensity: dropped.length ? Math.max(...dropped.map(s => s.intensity)) : null,
      overBudget,
    };
    const payload = scrubReport({ ...candidate, signals: kept.map(s => ({ ...s, id: sid(s.id) })), truncation }, parts) as InterpretationPayload;
    return { payload, payloadJson: canonicalJson(payload), signalIds: keptIds };
  };
  const complete = renderPrefix(priority.length);
  if (!budgeted || complete.payloadJson.length <= maxChars) return complete;
  const empty = renderPrefix(0);
  if (empty.payloadJson.length > maxChars) return renderPrefix(0, true);
  // Keep only a priority prefix. Adding signals restores their references too,
  // so measure complete candidates instead of budgeting each signal in isolation.
  let low = 0, high = priority.length;
  let best = empty;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = renderPrefix(middle);
    if (candidate.payloadJson.length <= maxChars) { low = middle; best = candidate; }
    else high = middle;
  }
  if (best.payloadJson.length > maxChars) throw new Error('payload budget invariant violated');
  return best;
}
