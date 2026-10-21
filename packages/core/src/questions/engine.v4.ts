/** V4 fail-closed consumer. No legacy scoring, inferred groups, thresholds or D045 votes. */
import catalog from './catalog.v4.json';
import { monthWindows, normalizeSystems, validateQuestionRequest } from './engine';
import { canonicalJson, fnv1a64Hex } from '../signals/signalId';
import { validatedSignalsV4 } from './directional.v4';
import { SYSTEM_IDS, type Signal, type SignalWindow, type SystemId } from '../signals/types';
import type { QuestionCatalog, QuestionRange, QuestionRequest, SignalProvider, SystemFilterInfo } from './types';

export const QUESTION_V4_MODEL_VERSION = 'question-v4-diagnostic-1' as const;
/** Full manifest accompanies this diagnostic fingerprint; it is not authentication. */
export function questionModelIdentityV4() {
  const manifest = structuredClone(catalog);
  return { modelVersion: QUESTION_V4_MODEL_VERSION, fingerprint: `q4_${fnv1a64Hex(canonicalJson(manifest))}`, manifest };
}
export type QuestionModelIdentityV4 = ReturnType<typeof questionModelIdentityV4>;
export interface QuestionDiagnosticWindowV4 {
  window: SignalWindow; rank: null;
  coverage: 'unresolved'; groupMetrics: null;
  signalIds: string[]; signals: Signal[];
  /** Individual contributions only. Not sums, group assignments, recommendations or calibrated strength. */
  directionalDiagnostics: Array<{ signalId: string; activity: number; support: number; pressure: number }>;
}
export interface QuestionAnswerV4 {
  answerVersion: 4; catalogVersion: 4; categoryVersion?: number;
  category: string; range: QuestionRange | null; unsupported?: true;
  status: 'insufficient_evidence' | 'unsupported';
  abstentionReasons: Array<{ code: 'unsupported_category' | 'source_unavailable' | 'grouping_unresolved' | 'coverage_unresolved' | 'model_policy_unavailable'; message: string }>;
  model: QuestionModelIdentityV4;
  ranking: QuestionDiagnosticWindowV4[]; top: [];
  systemFilter?: SystemFilterInfo;
}
export interface AnswerOptionsV4 {
  modelVersion?: typeof QUESTION_V4_MODEL_VERSION;
  systems?: readonly SystemId[];
}
const unresolvedReasons: QuestionAnswerV4['abstentionReasons'] = [
  { code: 'grouping_unresolved', message: '尚未採用正式來源分組與流派相依政策；逐訊號方向不等於獨立證據。' },
  { code: 'coverage_unresolved', message: '尚未具備完整已評估、缺輸入、不適用、不可用與失敗的 coverage 及有效分母。' },
  { code: 'model_policy_unavailable', message: 'Question v4 尚無已採用的最低支持、最大壓力與最低方向量政策，因此不推薦月份。' },
];
/** A null source is unavailable, never evaluated zero. Supplied but empty arrays still lack coverage attestation. */
export function answerQuestionV4(request: QuestionRequest | unknown, provider: SignalProvider | null, opts: AnswerOptionsV4 = {}): QuestionAnswerV4 {
  if (Object.keys(opts).some(key => !['modelVersion', 'systems'].includes(key)) ||
      (opts.modelVersion !== undefined && opts.modelVersion !== QUESTION_V4_MODEL_VERSION)) throw new Error('Question v4: unsupported model/options; no legacy fallback');
  const systems = opts.systems === undefined ? null : normalizeSystems(opts.systems);
  const validated = validateQuestionRequest(request, catalog as unknown as QuestionCatalog);
  if (!validated.ok && !validated.unsupported) throw new Error(`Question v4: ${validated.errors.join('; ')}`);
  const input = request as QuestionRequest;
  const base: QuestionAnswerV4 = { answerVersion: 4, catalogVersion: 4, category: input?.category ?? '', range: validated.ok ? validated.value.range : null,
    status: validated.ok ? 'insufficient_evidence' : 'unsupported', model: questionModelIdentityV4(),
    ranking: [], top: [], abstentionReasons: validated.ok ? structuredClone(unresolvedReasons) : [{ code: 'unsupported_category', message: '問事目錄不支援這個類別。' }] };
  if (!validated.ok) return { ...base, unsupported: true };
  const category = catalog.categories.find(item => item.id === validated.value.category)!;
  base.categoryVersion = category.version;
  const seen = new Set<SystemId>();
  if (!provider) base.abstentionReasons.unshift({ code: 'source_unavailable', message: '月份資料未取得或計算失敗；不把未取得當作已評估無訊號。' });
  else base.ranking = monthWindows(validated.value.range).map(window => {
    // Validate unknown systems/conflicting duplicates even when excluded: malformed provenance must not disappear silently.
    const raw = validatedSignalsV4(provider({ ...window }));
    for (const signal of raw) seen.add(signal.system);
    const signals = raw.filter(signal => (!systems || systems.includes(signal.system)) && category.domains.some(d => d.domain === signal.domain) &&
      (!(category.ruleIds as Record<string, string[]>)[signal.system]?.length || (category.ruleIds as Record<string, string[]>)[signal.system].includes(signal.ruleId)));
    return { window, rank: null, coverage: 'unresolved', groupMetrics: null, signals, signalIds: signals.map(s => s.id),
      directionalDiagnostics: signals.map(signal => ({ signalId: signal.id, activity: signal.intensity,
        support: signal.intensity * Math.max(signal.valence, 0), pressure: signal.intensity * Math.max(-signal.valence, 0) })) };
  });
  if (systems) base.systemFilter = { systemsRequested: systems, systemsUsed: SYSTEM_IDS.filter(s => systems.includes(s) && seen.has(s)), systemsExcluded: SYSTEM_IDS.filter(s => !systems.includes(s) && seen.has(s)) };
  return base;
}
/** JSON export preserves complete evidence and version metadata; it never reranks diagnostics. */
export function serializeQuestionAnswerV4(answer: QuestionAnswerV4): string {
  if (answer.answerVersion !== 4 || canonicalJson(answer.model) !== canonicalJson(questionModelIdentityV4()) ||
      !['insufficient_evidence', 'unsupported'].includes(answer.status) || answer.top.length !== 0 || answer.ranking.some(row => row.rank !== null)) {
    throw new Error('Question v4: invalid version or recommendation state');
  }
  if (answer.catalogVersion !== 4) throw new Error('Question v4: invalid catalog version');
  const requested = answer.systemFilter?.systemsRequested;
  if (answer.systemFilter) {
    const filter = answer.systemFilter;
    for (const values of [filter.systemsRequested, filter.systemsUsed, filter.systemsExcluded]) {
      if (!Array.isArray(values) || canonicalJson(SYSTEM_IDS.filter(s => values.includes(s))) !== canonicalJson(values)) throw new Error('Question v4: invalid system filter');
    }
    if (!requested?.length || filter.systemsUsed.some(s => !requested.includes(s)) || filter.systemsExcluded.some(s => requested.includes(s))) throw new Error('Question v4: inconsistent system filter');
  }
  const unavailable = answer.abstentionReasons.some(reason => reason.code === 'source_unavailable');
  const rows = new Map(answer.ranking.map(row => [row.window.start, row]));
  const rebuilt = answerQuestionV4({category: answer.category, range: answer.range}, unavailable ? null : window => {
    const row = rows.get(window.start);
    if (!row) throw new Error('Question v4: missing diagnostic window');
    return row.signals;
  }, requested ? {systems: requested} : {});
  // Usage provenance describes the original unfiltered source, which the export does not contain.
  // Validate its shape above; do not pretend this serializer authenticates its upstream origin.
  if (answer.systemFilter) rebuilt.systemFilter = structuredClone(answer.systemFilter);
  if (canonicalJson(answer) !== canonicalJson(rebuilt)) throw new Error('Question v4: inconsistent evidence/diagnostics');
  return JSON.stringify(answer);
}
