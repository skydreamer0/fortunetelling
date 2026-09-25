import { describe, expect, test } from 'bun:test';
import { parseQuestion } from '../src/client';
import { QUESTION_SYSTEM_PROMPT } from '../src/prompts';
import { questionParseSchema, UNSUPPORTED_CATEGORY } from '../src/schema';
import { mockComplete } from './helpers';

describe('parseQuestion', () => {
  test('valid category/range passes core validateQuestionRequest', async () => {
    const { fn, calls } = mockComplete([JSON.stringify({ category: 'vehicle_purchase', range: { start: '2026-01', end: '2027-12' } })]);
    const r = await parseQuestion('2026～2027 何時適合買車？', { complete: fn, today: '2026-09-25' });
    expect(r).toEqual({
      status: 'ok',
      request: { category: 'vehicle_purchase', range: { start: '2026-01', end: '2027-12' } },
      promptVersion: expect.any(String),
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].purpose).toBe('parse_question');
    expect(calls[0].system).toBe(QUESTION_SYSTEM_PROMPT);
    expect(calls[0].user[0].text).toContain('<today>2026-09-25</today>');
    expect(calls[0].user[0].text).toContain('何時適合買車');
  });

  test('model says unsupported → unsupported', async () => {
    const { fn } = mockComplete([JSON.stringify({ category: UNSUPPORTED_CATEGORY, range: { start: '2026-09', end: '2027-08' } })]);
    const r = await parseQuestion('我前世是誰？', { complete: fn, today: '2026-09-25' });
    expect(r.status).toBe('unsupported');
  });

  test('category outside the catalog (model ignored the enum) → unsupported via core', async () => {
    const { fn } = mockComplete([JSON.stringify({ category: 'lottery_numbers', range: { start: '2026-09', end: '2026-12' } })]);
    const r = await parseQuestion('樂透號碼？', { complete: fn, today: '2026-09-25' });
    expect(r.status).toBe('unsupported');
  });

  test('malformed JSON → error, not a throw', async () => {
    const { fn } = mockComplete(['{"category": "vehicle_purchase", "range": ']);
    const r = await parseQuestion('何時買車？', { complete: fn, today: '2026-09-25' });
    expect(r.status).toBe('error');
    if (r.status === 'error') {
      expect(r.errors[0]).toContain('not valid JSON');
      expect(r.raw).toBeDefined();
    }
  });

  test('schema-invalid range (too long / reversed / bad format / extra key) → error', async () => {
    for (const bad of [
      { category: 'vehicle_purchase', range: { start: '2026-01', end: '2030-12' } },
      { category: 'vehicle_purchase', range: { start: '2027-01', end: '2026-01' } },
      { category: 'vehicle_purchase', range: { start: '2026/01', end: '2026-12' } },
      { category: 'vehicle_purchase', range: { start: '2026-01', end: '2026-12' }, note: 'x' },
    ]) {
      const { fn } = mockComplete([JSON.stringify(bad)]);
      const r = await parseQuestion('何時買車？', { complete: fn, today: '2026-09-25' });
      expect(r.status).toBe('error');
    }
  });

  test('completion failure and empty input → error', async () => {
    const failing = Object.assign(async () => {
      throw new Error('network down');
    }, { model: 'x' });
    expect((await parseQuestion('何時買車？', { complete: failing, today: '2026-09-25' })).status).toBe('error');
    const { fn, calls } = mockComplete(['{}']);
    expect((await parseQuestion('   ', { complete: fn })).status).toBe('error');
    expect(calls).toHaveLength(0);
  });

  test('schema enum is the catalog + unsupported; prompt lists every category', () => {
    const schema = questionParseSchema() as { properties: { category: { enum: string[] } } };
    const ids = schema.properties.category.enum;
    expect(ids).toContain('vehicle_purchase');
    expect(ids[ids.length - 1]).toBe(UNSUPPORTED_CATEGORY);
    for (const id of ids) expect(QUESTION_SYSTEM_PROMPT).toContain(id);
  });
});
