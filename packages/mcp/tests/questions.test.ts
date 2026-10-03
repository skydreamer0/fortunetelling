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
    const { top, ranking } = r1.json.data;
    expect(top.length).toBeGreaterThan(0);
    expect(top.length).toBeLessThanOrEqual(3);
    for (const t of top) {
      expect(t.month).toMatch(/^2027-/);
      expect(typeof t.score).toBe('number');
    }
    expect(ranking.length).toBe(12);
    expect(r1.json.data.catalogVersion).toBeDefined();
    // 預設是精簡版：沒有 conventions 長文，也沒有完整結構
    expect(r1.json.data.conventions).toBeUndefined();
    expect(r1.json.data.detailOmitted).toBe(true);
    expect(r1.json.data.categoryResolvedFrom).toBe('explicit');
    expect(r1.json.data.rangeResolvedFrom).toBe('explicit');
    expect(r1.json.versions).toBeUndefined();
    expect(r1.json.versionsHash).toMatch(/^[0-9a-f]{12}$/);
    expect(r1.json.caveats.length).toBeGreaterThan(0);
    const r2 = await fx.call('answer_question', args);
    expect(r2.text).toBe(r1.text);
  }, 120_000);
  test('detail:true matches core answerQuestion with an equivalent provider (pure wrapper)', async () => {
    const { json } = await fx.call('answer_question', { ...args, detail: true });
    const analysis = await fx.ctx.analyzer.get('sky', ASOF);
    const direct = slimAnswer(answerQuestion({ category: 'vehicle_purchase', range: RANGE }, monthSignalProvider(analysis)), true);
    expect(json.data.top).toEqual(JSON.parse(JSON.stringify(direct.top)));
    expect(json.data.conventions).toBeDefined();
    expect(json.data.ranking).toEqual(JSON.parse(JSON.stringify(direct.ranking)));
  }, 120_000);
  test('compact cites at most 3 ids per month; detail:true returns everything incl. conventions', async () => {
    const slim = (await fx.call('answer_question', args)).json.data;
    const full = (await fx.call('answer_question', { ...args, detail: true })).json.data;
    expect(full.conventions).toBeDefined();
    expect(full.conventionsOmitted).toBeUndefined();
    expect(full.detailOmitted).toBeUndefined();
    expect(slim.top.length).toBe(full.top.length);
    slim.top.forEach((w: any, i: number) => {
      const f = full.top[i];
      expect(w.signalIds.length).toBeLessThanOrEqual(3);
      expect(f.signalIds.length).toBe(f.signalIdsTotal);
      for (const id of w.signalIds) expect(f.signalIds).toContain(id);
    });
    // every id the slim answer cites is also in the full answer (truncation never invents ids)
    const fullIds = new Set(JSON.stringify(full).match(/sig_[0-9a-f]{16}/g));
    for (const id of new Set(JSON.stringify(slim).match(/sig_[0-9a-f]{16}/g))) expect(fullIds.has(id)).toBe(true);
  }, 120_000);
  test('unknown category → unsupported, not an error', async () => {
    const { isError, json } = await fx.call('answer_question', { ...args, category: 'nope_xyz' });
    expect(isError).toBe(false);
    expect(json.data.unsupported).toBe(true);
    expect(json.data.availableCategories).toContain('vehicle_purchase');
    expect(json.data.conventions).toBeUndefined();
    expect(json.data.conventionsOmitted).toBe(true);
    expect(json.data.categoryResolvedFrom).toBe('explicit');
  }, 120_000);
  test('range omitted → asOf month + 11 months, stated in the response', async () => {
    const { json, isError } = await fx.call('answer_question', { profileId: 'sky', category: 'vehicle_purchase', asOf: ASOF });
    expect(isError).toBe(false);
    expect(json.data.range).toEqual({ start: '2026-09', end: '2027-08' });
    expect(json.data.rangeResolvedFrom).toBe('default');
    expect(json.data.ranking.length).toBe(12);
  }, 120_000);
  test('category omitted: question picks it, and says so', async () => {
    const { json, isError } = await fx.call('answer_question', { profileId: 'sky', question: '我想買車，哪幾個月好？', range: RANGE, asOf: ASOF });
    expect(isError).toBe(false);
    expect(json.data.category).toBe('vehicle_purchase');
    expect(json.data.categoryResolvedFrom).toBe('question');
    const explicit = await fx.call('answer_question', args);
    expect(json.data.top).toEqual(explicit.json.data.top);
  }, 120_000);
  test('explicit category wins over question', async () => {
    const { json } = await fx.call('answer_question', { ...args, question: '我想換工作' });
    expect(json.data.category).toBe('vehicle_purchase');
    expect(json.data.categoryResolvedFrom).toBe('explicit');
  }, 120_000);
  test('unroutable / tied / missing question+category → invalid_args with availableCategories', async () => {
    for (const extra of [{ question: '今天天氣如何' }, { question: '想買房也想搬家' }, {}]) {
      const { isError, json } = await fx.call('answer_question', { profileId: 'sky', range: RANGE, asOf: ASOF, ...extra });
      expect(isError).toBe(true);
      expect(json.error.code).toBe('invalid_args');
      expect(json.error.details.availableCategories).toContain('vehicle_purchase');
      expect(json.error.details.availableCategories.length).toBe(8);
    }
    const tied = await fx.call('answer_question', { profileId: 'sky', question: '想買房也想搬家', asOf: ASOF });
    expect(tied.json.error.details.candidates).toEqual(['property_purchase', 'relocation']);
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
