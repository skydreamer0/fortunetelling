/**
 * Output schemas (ARCHITECTURE-V2 §8, §9).
 *
 * Sent to the model as structured outputs (`output_config.format` json_schema)
 * so the response is schema-shaped JSON; parsed and re-checked here anyway —
 * the program never trusts the model (V5-04).
 */
import { listQuestionCategories } from './core-pure';

export interface InterpretationSection {
  heading: string;
  text: string;
  citations: string[];
}

export interface InterpretationOutput {
  sections: InterpretationSection[];
}

export type JsonSchema = Record<string, unknown>;

export const INTERPRETATION_SCHEMA: JsonSchema = Object.freeze({
  type: 'object',
  properties: {
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          heading: { type: 'string', description: '段落標題（繁體中文）' },
          text: { type: 'string', description: '段落內文（繁體中文）' },
          citations: {
            type: 'array',
            items: { type: 'string' },
            description: '本段引用的 signals[].id，至少一個',
          },
        },
        required: ['heading', 'text', 'citations'],
        additionalProperties: false,
      },
    },
  },
  required: ['sections'],
  additionalProperties: false,
}) as JsonSchema;

/** Sentinel category for questions outside the catalog (never improvise, §8). */
export const UNSUPPORTED_CATEGORY = 'unsupported';

export interface QuestionParseOutput {
  category: string;
  range: { start: string; end: string };
}

/** Closed enum = catalog ids + 'unsupported'. */
export function questionParseSchema(): JsonSchema {
  const ids = listQuestionCategories().map((c) => c.id);
  return {
    type: 'object',
    properties: {
      category: { type: 'string', enum: [...ids, UNSUPPORTED_CATEGORY] },
      range: {
        type: 'object',
        properties: {
          start: { type: 'string', description: "YYYY-MM" },
          end: { type: 'string', description: "YYYY-MM" },
        },
        required: ['start', 'end'],
        additionalProperties: false,
      },
    },
    required: ['category', 'range'],
    additionalProperties: false,
  };
}

/** Structural check of parsed model JSON (independent of the API's own enforcement). */
export function parseInterpretationOutput(raw: string):
  | { ok: true; value: { sections: unknown[] } }
  | { ok: false; error: string } {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: `model output is not valid JSON: ${(e as Error).message}` };
  }
  if (!data || typeof data !== 'object' || !Array.isArray((data as { sections?: unknown }).sections)) {
    return { ok: false, error: 'model output must be an object with a sections array' };
  }
  return { ok: true, value: { sections: (data as { sections: unknown[] }).sections } };
}

export function isSection(v: unknown): v is InterpretationSection {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.heading === 'string' &&
    typeof s.text === 'string' &&
    Array.isArray(s.citations) &&
    s.citations.every((c) => typeof c === 'string')
  );
}
