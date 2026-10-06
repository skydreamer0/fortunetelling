import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { makeFixture } from './helpers';

let fx: Awaited<ReturnType<typeof makeFixture>>;
beforeAll(async () => { fx = await makeFixture(); });
afterAll(() => fx.cleanup());

const ASOF = '2026-09-30';

describe('every cited signal id is resolvable (ROADMAP M1 completion criterion)', () => {
  test.each([
    ['vehicle_purchase', '2027-01', '2027-12'],
    ['job_change', '2026-10', '2028-09'],
  ])('answer_question %s %s..%s', async (category, start, end) => {
    const { json, isError } = await fx.call('answer_question', { profileId: 'sky', category, range: { start, end }, asOf: ASOF });
    expect(isError).toBe(false);
    const cited = [...new Set(JSON.stringify(json.data).match(/sig_[0-9a-f]+/g) ?? [])];
    expect(cited.length).toBeGreaterThan(0);
    for (const signalId of cited) {
      // 輸出是短編號（碰撞時才是完整編號），而且每個都要能解析回同一筆訊號
      expect(signalId).toMatch(/^sig_[0-9a-f]{8}$|^sig_[0-9a-f]{16}$/);
      const res = await fx.call('get_signal', { profileId: 'sky', asOf: ASOF, signalId });
      expect(res.isError).toBe(false);
      expect(res.json.data.signal.id.startsWith(signalId)).toBe(true);
      expect(res.json.data.shortId).toBe(signalId);
    }
  }, 120_000);

  test('detail:true 的問事回答引用的每個編號也都可取得（短編號，含非前 3 名的月份）', async () => {
    const { json } = await fx.call('answer_question', { profileId: 'sky', category: 'vehicle_purchase', range: { start: '2027-01', end: '2027-12' }, asOf: ASOF, detail: true });
    const cited = [...new Set(JSON.stringify(json.data).match(/sig_[0-9a-f]+/g) ?? [])];
    expect(cited.length).toBeGreaterThan(3);
    for (const signalId of cited) {
      const res = await fx.call('get_signal', { profileId: 'sky', asOf: ASOF, signalId });
      expect(res.isError).toBe(false);
      expect(res.json.data.shortId).toBe(signalId);
    }
  }, 120_000);

  test('ids cited by get_timeline / list_conflicts resolve too', async () => {
    const tl = await fx.call('get_timeline', { profileId: 'sky', asOf: ASOF, range: { start: '2026', end: '2028' }, domain: 'wealth' });
    expect(tl.isError).toBe(false);
    const ids = [...new Set(JSON.stringify(tl.json.data).match(/sig_[0-9a-f]+/g) ?? [])].slice(0, 25);
    expect(ids.length).toBeGreaterThan(0);
    for (const signalId of ids) {
      expect((await fx.call('get_signal', { profileId: 'sky', asOf: ASOF, signalId })).isError).toBe(false);
    }
  }, 60_000);

  test('a range outside the resolvable window is rejected, not silently uncitable', async () => {
    const { json, isError } = await fx.call('answer_question', {
      profileId: 'sky', category: 'vehicle_purchase', range: { start: '2050-01', end: '2050-12' }, asOf: ASOF,
    });
    expect(isError).toBe(true);
    expect(json.error.code).toBe('invalid_args');
    expect(json.error.hint).toContain('get_signal');
  });

  test('an id that never existed is unknown_signal', async () => {
    const { json } = await fx.call('get_signal', { profileId: 'sky', asOf: ASOF, signalId: 'sig_0000000000000000' });
    expect(json.error.code).toBe('unknown_signal');
  }, 60_000);
});
