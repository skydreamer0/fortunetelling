/**
 * Live smoke test against the Claude API. Runs ONLY when ANTHROPIC_API_KEY is
 * set (never in CI by default). Model override: FORTUNE_AI_MODEL.
 */
import { describe, expect, test } from 'bun:test';
import { createAnthropicComplete, createMemoryStore, interpret, parseQuestion } from '../src/client';
import { loadQuestion, loadReport } from './helpers';

const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
const model = process.env.FORTUNE_AI_MODEL || undefined;

describe.skipIf(!hasKey)('live Claude smoke test', () => {
  test(
    'parseQuestion classifies a catalog question',
    async () => {
      const complete = createAnthropicComplete({ model });
      const r = await parseQuestion('2027 年哪幾個月適合買車？', { complete, today: '2026-09-25' });
      expect(r.status).toBe('ok');
      if (r.status === 'ok') expect(r.request.category).toBe('vehicle_purchase');
    },
    300_000,
  );

  test(
    'interpret returns validated, cited sections',
    async () => {
      const complete = createAnthropicComplete({ model });
      const r = await interpret(loadReport(), {
        complete,
        question: loadQuestion(),
        store: createMemoryStore(),
        maxPayloadChars: 60_000,
      });
      for (const s of r.sections) expect(s.citations.length).toBeGreaterThan(0);
      expect(r.sections.length + r.dropped.length).toBeGreaterThan(0);
      console.log(`[live] kept ${r.sections.length}, dropped ${r.dropped.length}`, JSON.stringify(r.dropped.map((d) => d.reasons)));
    },
    600_000,
  );
});
