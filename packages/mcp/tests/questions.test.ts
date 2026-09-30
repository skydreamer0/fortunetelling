import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { answerQuestion, type BirthProfile } from '@fortune/core';
import { monthSignalProvider, slimAnswer } from '../src/tools/questions';
import { makeFixture } from './helpers';

const AMY: BirthProfile = {
  date: '1988-11-02',
  time: '14:10',
  timeAccuracy: 'exact',
  gender: 'male',
  name: 'Amy',
  birthplace: { label: 'Taipei, Taiwan', lat: 25.033, lng: 121.5654, timezone: 'Asia/Taipei' },
};
const ASOF = '2026-09-30';
const RANGE = { start: '2027-01', end: '2027-12' };

let fx: Awaited<ReturnType<typeof makeFixture>>;
beforeAll(async () => { fx = await makeFixture({ amy: AMY }); });
afterAll(() => fx.cleanup());

describe('list_question_categories', () => {
  test('non-empty, contains vehicle_purchase, asOf null', async () => {
    const { isError, json } = await fx.call('list_question_categories');
    expect(isError).toBe(false);
    expect(json.asOf).toBeNull();
    const ids = json.data.categories.map((c: any) => c.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).toContain('vehicle_purchase');
    expect(Array.isArray(json.data.categories[0].domains)).toBe(true);
  });
});

describe('answer_question', () => {
  const args = { profileId: 'sky', category: 'vehicle_purchase', range: RANGE, asOf: ASOF };
  test('top ≤3 with window and score; deterministic', async () => {
    const r1 = await fx.call('answer_question', args);
    expect(r1.isError).toBe(false);
    const { top, rankingTotal, ranking } = r1.json.data;
    expect(top.length).toBeGreaterThan(0);
    expect(top.length).toBeLessThanOrEqual(3);
    for (const t of top) {
      expect(t.window.start).toMatch(/^2027-/);
      expect(typeof t.score).toBe('number');
    }
    expect(rankingTotal).toBe(12);
    expect(ranking.length).toBeLessThanOrEqual(12);
    expect(r1.json.data.catalogVersion).toBeDefined();
    expect(r1.json.data.conventions).toBeDefined();
    const r2 = await fx.call('answer_question', args);
    expect(r2.text).toBe(r1.text);
  }, 120_000);
  test('matches core answerQuestion with an equivalent provider (pure wrapper)', async () => {
    const { json } = await fx.call('answer_question', args);
    const analysis = await fx.ctx.analyzer.get('sky', ASOF);
    const direct = slimAnswer(answerQuestion({ category: 'vehicle_purchase', range: RANGE }, monthSignalProvider(analysis)));
    expect(json.data.top).toEqual(JSON.parse(JSON.stringify(direct.top)));
    expect(json.data.ranking).toEqual(JSON.parse(JSON.stringify(direct.ranking)));
  }, 120_000);
  test('unknown category → unsupported, not an error', async () => {
    const { isError, json } = await fx.call('answer_question', { ...args, category: 'nope_xyz' });
    expect(isError).toBe(false);
    expect(json.data.unsupported).toBe(true);
    expect(json.data.availableCategories).toContain('vehicle_purchase');
  }, 120_000);
  test('range over 36 months → invalid_args', async () => {
    const { isError, json } = await fx.call('answer_question', { ...args, range: { start: '2027-01', end: '2030-02' } });
    expect(isError).toBe(true);
    expect(json.error.code).toBe('invalid_args');
  });
  test('bad month format → invalid_args; unknown profile → profile_not_found', async () => {
    expect((await fx.call('answer_question', { ...args, range: { start: '2027-1', end: '2027-12' } })).json.error.code).toBe('invalid_args');
    expect((await fx.call('answer_question', { ...args, profileId: 'ghost' })).json.error.code).toBe('profile_not_found');
  }, 120_000);
});

describe('compare_profiles', () => {
  const args = { profileIdA: 'sky', profileIdB: 'amy', asOf: ASOF };
  test('no names, generatedAt or birth dates; deterministic', async () => {
    const r1 = await fx.call('compare_profiles', args);
    expect(r1.isError).toBe(false);
    for (const bad of ['王小明', 'Amy', 'generatedAt', '1990-05-17', '1988-11-02', '"input"']) expect(r1.text).not.toContain(bad);
    expect(r1.json.data.people.map((p: any) => p.label)).toEqual(['A', 'B']);
    expect(r1.json.caveats.some((c: any) => c.code === 'compare_scope')).toBe(true);
    const codes = r1.json.caveats.map((c: any) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    const r2 = await fx.call('compare_profiles', args);
    expect(r2.text).toBe(r1.text);
  }, 120_000);
  test('same id → invalid_args; missing profile → profile_not_found', async () => {
    expect((await fx.call('compare_profiles', { ...args, profileIdB: 'sky' })).json.error.code).toBe('invalid_args');
    expect((await fx.call('compare_profiles', { ...args, profileIdB: 'ghost' })).json.error.code).toBe('profile_not_found');
  }, 120_000);
});
