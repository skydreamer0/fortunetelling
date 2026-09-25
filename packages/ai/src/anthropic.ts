/**
 * Claude implementation of `CompleteFn` (official `@anthropic-ai/sdk`).
 *
 * - Structured outputs: `output_config.format = { type: 'json_schema', schema }`.
 * - Prompt caching: `cache_control: ephemeral` on the static system prompt, and
 *   on user parts flagged `cache` (the payload), so re-asking about the same
 *   report reuses the prefix. Prefixes below the model's minimum cacheable
 *   length silently don't cache (check `usage.cache_read_input_tokens`).
 * - Streaming + `finalMessage()` so long generations don't hit HTTP timeouts.
 * - Server-side refusal fallbacks (`fallbacks: 'default'`) on the models that
 *   support them; a final `refusal` / `max_tokens` stop is surfaced as an error.
 * - Thinking is left at the model default (always-on adaptive on Claude Fable 5.1);
 *   no sampling params (rejected on current models).
 */
import Anthropic from '@anthropic-ai/sdk';
import type { CompleteFn, CompletionRequest } from './client';

/** Default: the most capable generally available Claude model. */
export const DEFAULT_ANTHROPIC_MODEL = 'claude-fable-5-1';

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-fable-5', 'claude-opus-5']);

export interface AnthropicCompleteOptions {
  /** Defaults to the SDK's credential resolution (ANTHROPIC_API_KEY, …). */
  apiKey?: string;
  model?: string;
  /** Pre-built client (tests, custom baseURL / proxy). */
  client?: Anthropic;
  /** Server-side refusal fallback; default on for models that support it. */
  fallbacks?: boolean;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  /** Needed only for BYOK use inside a browser (see README). */
  dangerouslyAllowBrowser?: boolean;
  timeoutMs?: number;
}

export class AiRefusalError extends Error {
  readonly category: string | null;
  constructor(message: string, category: string | null) {
    super(message);
    this.name = 'AiRefusalError';
    this.category = category;
  }
}

export function createAnthropicComplete(options: AnthropicCompleteOptions = {}): CompleteFn {
  const model = options.model ?? DEFAULT_ANTHROPIC_MODEL;
  const client =
    options.client ??
    new Anthropic({
      ...(options.apiKey ? { apiKey: options.apiKey } : {}),
      ...(options.dangerouslyAllowBrowser ? { dangerouslyAllowBrowser: true } : {}),
      ...(options.timeoutMs ? { timeout: options.timeoutMs } : {}),
    });
  const useFallbacks = options.fallbacks ?? FALLBACK_MODELS.has(model);

  const complete = async (req: CompletionRequest): Promise<string> => {
    const stream = client.beta.messages.stream({
      model,
      max_tokens: req.maxTokens,
      system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
      messages: [
        {
          role: 'user',
          content: req.user.map((p) =>
            p.cache
              ? { type: 'text' as const, text: p.text, cache_control: { type: 'ephemeral' as const } }
              : { type: 'text' as const, text: p.text },
          ),
        },
      ],
      output_config: {
        format: { type: 'json_schema', schema: req.schema },
        ...(options.effort ? { effort: options.effort } : {}),
      },
      ...(useFallbacks ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
    });
    const message = await stream.finalMessage();

    if (message.stop_reason === 'refusal') {
      const details = (message as { stop_details?: { category?: string | null; explanation?: string | null } | null })
        .stop_details;
      throw new AiRefusalError(
        `model declined the request${details?.explanation ? `: ${details.explanation}` : ''}`,
        details?.category ?? null,
      );
    }
    if (message.stop_reason === 'max_tokens') {
      throw new Error(`model output truncated at max_tokens (${req.maxTokens})`);
    }
    return message.content
      .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('');
  };
  return Object.assign(complete, { model });
}
