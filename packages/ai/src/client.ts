/**
 * Provider-agnostic AI entry points (V5-03/V5-04).
 *
 *   interpret(report, { complete, question? })  → validated Interpretation
 *   parseQuestion(text, { complete, today })    → QuestionRequest | unsupported | error
 *
 * `complete` is injected: any function that takes a CompletionRequest and
 * resolves to the model's raw JSON text. `createAnthropicComplete` (./anthropic)
 * is the Claude implementation; tests inject mocks (no network).
 *
 * Interpretations are cached by sha256(payloadJson, promptVersion, model). The
 * cache stores the RAW model output and re-runs validation on every hit, so a
 * tightened validator applies to old cache entries too.
 */
import type { QuestionAnswer, QuestionRequest } from '@fortune/core';
import { canonicalJson, sha256Hex } from './canonical';
import { validateQuestionRequest } from './core-pure';
import { buildInterpretationPayload, type PayloadTruncation, type ReportLike } from './payload';
import {
  INTERPRET_PROMPT_VERSION,
  INTERPRET_SYSTEM_PROMPT,
  QUESTION_PROMPT_VERSION,
  QUESTION_SYSTEM_PROMPT,
} from './prompts';
import {
  INTERPRETATION_SCHEMA,
  parseInterpretationOutput,
  questionParseSchema,
  UNSUPPORTED_CATEGORY,
  type InterpretationSection,
  type JsonSchema,
} from './schema';
import { validateSections, type DroppedSection } from './validate';

// ─── provider contract ──────────────────────────────────────────────────────

export interface CompletionUserPart {
  text: string;
  /** Hint: stable across calls, worth a prompt-cache breakpoint. */
  cache?: boolean;
}

export interface CompletionRequest {
  purpose: 'interpret' | 'parse_question';
  /** Static, versioned system prompt (cacheable prefix). */
  system: string;
  user: CompletionUserPart[];
  /** JSON schema the response must follow (structured outputs). */
  schema: JsonSchema;
  maxTokens: number;
}

/** Resolves to the model's raw text (expected: JSON matching `schema`). */
export type CompleteFn = ((request: CompletionRequest) => Promise<string>) & { model?: string };

export class AiOutputError extends Error {
  readonly raw: string;
  constructor(message: string, raw: string) {
    super(message);
    this.name = 'AiOutputError';
    this.raw = raw;
  }
}

// ─── cache ──────────────────────────────────────────────────────────────────

export interface InterpretationCacheStore {
  get(key: string): string | undefined | Promise<string | undefined>;
  set(key: string, value: string): void | Promise<void>;
}

export function createMemoryStore(): InterpretationCacheStore & { size(): number; clear(): void } {
  const map = new Map<string, string>();
  return {
    get: (k) => map.get(k),
    set: (k, v) => {
      map.set(k, v);
    },
    size: () => map.size,
    clear: () => map.clear(),
  };
}

/** Process-wide default store (in-memory). Inject `store` to persist elsewhere. */
export const defaultInterpretationStore = createMemoryStore();

export async function interpretationCacheKey(payloadJson: string, promptVersion: string, model: string): Promise<string> {
  return sha256Hex(canonicalJson({ payload: payloadJson, promptVersion, model }));
}

// ─── interpret ──────────────────────────────────────────────────────────────

export const INTERPRETATION_SCHEMA_VERSION = 1;

/** Standalone Interpretation object (§11: not part of the Report). */
export interface Interpretation {
  schemaVersion: typeof INTERPRETATION_SCHEMA_VERSION;
  promptVersion: string;
  model: string;
  cacheKey: string;
  report: { schemaVersion: number | null; generatedAt: string | null };
  question: { category: string; unsupported: boolean } | null;
  sections: InterpretationSection[];
  dropped: DroppedSection[];
  truncation: PayloadTruncation;
  cached: boolean;
}

export interface InterpretOptions {
  complete: CompleteFn;
  question?: QuestionAnswer | null;
  /** Model id for the cache key; defaults to `complete.model`. */
  model?: string;
  store?: InterpretationCacheStore;
  maxPayloadChars?: number;
  maxTokens?: number;
}

export const INTERPRET_USER_INSTRUCTION =
  '請依系統指令，只根據上面的 <payload> 撰寫解讀段落，並以指定的 JSON schema 輸出。';

export async function interpret(report: ReportLike, options: InterpretOptions): Promise<Interpretation> {
  const { complete } = options;
  const model = options.model ?? complete.model ?? 'unknown';
  const store = options.store ?? defaultInterpretationStore;
  const built = buildInterpretationPayload(report, { question: options.question, maxChars: options.maxPayloadChars });
  const cacheKey = await interpretationCacheKey(built.payloadJson, INTERPRET_PROMPT_VERSION, model);

  let raw = await store.get(cacheKey);
  const cached = raw !== undefined;
  if (raw === undefined) {
    raw = await complete({
      purpose: 'interpret',
      system: INTERPRET_SYSTEM_PROMPT,
      user: [
        { text: `<payload>\n${built.payloadJson}\n</payload>`, cache: true },
        { text: INTERPRET_USER_INSTRUCTION },
      ],
      schema: INTERPRETATION_SCHEMA,
      maxTokens: options.maxTokens ?? 32_000,
    });
  }

  const parsed = parseInterpretationOutput(raw);
  if (!parsed.ok) throw new AiOutputError(parsed.error, raw); // never cached
  if (!cached) await store.set(cacheKey, raw);

  const { kept, dropped } = validateSections(parsed.value.sections, {
    payload: built.payload,
    payloadJson: built.payloadJson,
  });

  return {
    schemaVersion: INTERPRETATION_SCHEMA_VERSION,
    promptVersion: INTERPRET_PROMPT_VERSION,
    model,
    cacheKey,
    report: { schemaVersion: report.schemaVersion ?? null, generatedAt: report.generatedAt ?? null },
    question: built.payload.question
      ? { category: built.payload.question.category, unsupported: built.payload.question.unsupported }
      : null,
    sections: kept,
    dropped,
    truncation: built.payload.truncation,
    cached,
  };
}

// ─── parseQuestion ──────────────────────────────────────────────────────────

export type ParseQuestionResult =
  | { status: 'ok'; request: QuestionRequest; promptVersion: string }
  | { status: 'unsupported'; errors: string[]; promptVersion: string }
  | { status: 'error'; errors: string[]; raw?: string; promptVersion: string };

export interface ParseQuestionOptions {
  complete: CompleteFn;
  /** 'YYYY-MM-DD' used to resolve 今年／明年; defaults to today's local date. */
  today?: string;
  maxTokens?: number;
}

const MAX_QUESTION_CHARS = 500;

function localToday(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * NL question → `{ category, range }`, validated by core `validateQuestionRequest`
 * (closed enum; unknown category → unsupported, never improvised — §8).
 */
export async function parseQuestion(text: string, options: ParseQuestionOptions): Promise<ParseQuestionResult> {
  const promptVersion = QUESTION_PROMPT_VERSION;
  const question = typeof text === 'string' ? text.trim() : '';
  if (question.length === 0) return { status: 'error', errors: ['question is empty'], promptVersion };
  if (question.length > MAX_QUESTION_CHARS) {
    return { status: 'error', errors: [`question longer than ${MAX_QUESTION_CHARS} characters`], promptVersion };
  }
  const today = options.today ?? localToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return { status: 'error', errors: [`today must be YYYY-MM-DD, got ${today}`], promptVersion };

  let raw: string;
  try {
    raw = await options.complete({
      purpose: 'parse_question',
      system: QUESTION_SYSTEM_PROMPT,
      user: [{ text: `<today>${today}</today>\n<question>\n${question}\n</question>` }],
      schema: questionParseSchema(),
      maxTokens: options.maxTokens ?? 4_096,
    });
  } catch (e) {
    return { status: 'error', errors: [`completion failed: ${(e as Error).message}`], promptVersion };
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return { status: 'error', errors: [`model output is not valid JSON: ${(e as Error).message}`], raw, promptVersion };
  }
  if (data && typeof data === 'object' && (data as { category?: unknown }).category === UNSUPPORTED_CATEGORY) {
    return { status: 'unsupported', errors: ['question is outside the catalog'], promptVersion };
  }
  const v = validateQuestionRequest(data);
  if (v.ok) return { status: 'ok', request: v.value, promptVersion };
  if (v.unsupported) return { status: 'unsupported', errors: v.errors, promptVersion };
  return { status: 'error', errors: v.errors, raw, promptVersion };
}

// Claude implementation lives in ./anthropic (SDK-specific); re-exported here for convenience.
export {
  createAnthropicComplete,
  AiRefusalError,
  DEFAULT_ANTHROPIC_MODEL,
  type AnthropicCompleteOptions,
} from './anthropic';
