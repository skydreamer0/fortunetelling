import { describe, expect, test } from 'bun:test';
import { AiOutputError, createAnthropicComplete, createMemoryStore, interpret, interpretationCacheKey } from '../src/client';
import { buildInterpretationPayload } from '../src/payload';
import { INTERPRET_PROMPT_VERSION, INTERPRET_SYSTEM_PROMPT } from '../src/prompts';
import { INTERPRETATION_SCHEMA } from '../src/schema';
import { loadReport, mockComplete } from './helpers';

const report = loadReport();
const { payload } = buildInterpretationPayload(report);
const sid = payload.signals[0].id;
const good = JSON.stringify({
  sections: [{ heading: '概覽', text: '這段時期的訊號以變動為主，分數為未校準的相對指標。', citations: [sid] }],
});

describe('interpret — request shape', () => {
  test('static system prompt, payload as cacheable user part, schema attached', async () => {
    const { fn, calls } = mockComplete([good]);
    const r = await interpret(report, { complete: fn, store: createMemoryStore() });
    expect(r.sections).toHaveLength(1);
    expect(r.cached).toBe(false);
    expect(r.model).toBe('mock-model');
    expect(r.promptVersion).toBe(INTERPRET_PROMPT_VERSION);
    expect(r.report).toEqual({ schemaVersion: 4, generatedAt: report.generatedAt ?? null });
    const req = calls[0];
    expect(req.system).toBe(INTERPRET_SYSTEM_PROMPT);
    expect(req.schema).toBe(INTERPRETATION_SCHEMA);
    expect(req.user[0].cache).toBe(true);
    expect(req.user[0].text.startsWith('<payload>')).toBe(true);
    expect(req.user.map((p) => p.text).join('')).not.toContain('王小明');
  });
});

describe('interpret — cache', () => {
  test('identical input → cache hit (complete called once)', async () => {
    const store = createMemoryStore();
    const { fn, calls } = mockComplete([good]);
    const a = await interpret(report, { complete: fn, store });
    // Different generatedAt / computedAt must not change the key.
    const again = loadReport();
    again.generatedAt = '2099-01-01T00:00:00Z';
    const b = await interpret(again, { complete: fn, store });
    expect(calls).toHaveLength(1);
    expect(a.cached).toBe(false);
    expect(b.cached).toBe(true);
    expect(b.cacheKey).toBe(a.cacheKey);
    expect(b.sections).toEqual(a.sections);
    expect(store.size()).toBe(1);
  });

  test('different model or payload → different key', async () => {
    const built = buildInterpretationPayload(report);
    const k1 = await interpretationCacheKey(built.payloadJson, INTERPRET_PROMPT_VERSION, 'm1');
    const k2 = await interpretationCacheKey(built.payloadJson, INTERPRET_PROMPT_VERSION, 'm2');
    const k3 = await interpretationCacheKey(built.payloadJson, 'interpret-v0', 'm1');
    const k4 = await interpretationCacheKey(built.payloadJson + ' ', INTERPRET_PROMPT_VERSION, 'm1');
    expect(new Set([k1, k2, k3, k4]).size).toBe(4);
    expect(k1).toMatch(/^[0-9a-f]{64}$/);
  });

  test('malformed model output throws AiOutputError and is not cached', async () => {
    const store = createMemoryStore();
    const { fn, calls } = mockComplete(['not json', good]);
    await expect(interpret(report, { complete: fn, store })).rejects.toBeInstanceOf(AiOutputError);
    expect(store.size()).toBe(0);
    const r = await interpret(report, { complete: fn, store });
    expect(r.sections).toHaveLength(1);
    expect(calls).toHaveLength(2);
  });
});

describe('createAnthropicComplete (fake client, no network)', () => {
  function fakeClient(message: unknown) {
    const params: unknown[] = [];
    const client = {
      beta: {
        messages: {
          stream: (p: unknown) => {
            params.push(p);
            return { finalMessage: async () => message };
          },
        },
      },
    };
    return { client, params };
  }

  test('caches system + payload, requests structured JSON, opts into fallbacks', async () => {
    const { client, params } = fakeClient({ stop_reason: 'end_turn', content: [{ type: 'text', text: good }] });
    const complete = createAnthropicComplete({ client: client as never });
    expect(complete.model).toBe('claude-fable-5-1');
    const out = await complete({
      purpose: 'interpret',
      system: 'SYS',
      user: [{ text: 'P', cache: true }, { text: 'Q' }],
      schema: INTERPRETATION_SCHEMA,
      maxTokens: 1000,
    });
    expect(out).toBe(good);
    const p = params[0] as Record<string, any>;
    expect(p.model).toBe('claude-fable-5-1');
    expect(p.system).toEqual([{ type: 'text', text: 'SYS', cache_control: { type: 'ephemeral' } }]);
    expect(p.messages[0].content).toEqual([
      { type: 'text', text: 'P', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'Q' },
    ]);
    expect(p.output_config.format).toEqual({ type: 'json_schema', schema: INTERPRETATION_SCHEMA });
    expect(p.fallbacks).toBe('default');
    expect(p.betas).toEqual(['server-side-fallback-2026-07-01']);
    expect(p.thinking).toBeUndefined();
    expect(p.temperature).toBeUndefined();
  });

  test('refusal and max_tokens stops are errors', async () => {
    const refused = fakeClient({ stop_reason: 'refusal', stop_details: { category: 'cyber', explanation: 'no' }, content: [] });
    const c1 = createAnthropicComplete({ client: refused.client as never, model: 'claude-sonnet-5' });
    const req = { purpose: 'interpret' as const, system: 's', user: [{ text: 'u' }], schema: {}, maxTokens: 10 };
    await expect(c1(req)).rejects.toThrow('declined');
    expect((refused.params[0] as Record<string, unknown>).fallbacks).toBeUndefined();
    const cut = fakeClient({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"sec' }] });
    await expect(createAnthropicComplete({ client: cut.client as never })(req)).rejects.toThrow('max_tokens');
  });
});
