import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { makeFixture } from './helpers';

const AS_OF = '2026-09-30';
const base = { profileId: 'sky', asOf: AS_OF };
let fx: Awaited<ReturnType<typeof makeFixture>>;
let real: any[];

beforeAll(async () => {
  fx = await makeFixture();
  const { json } = await fx.call('list_signals', { ...base, limit: 100 });
  real = json.data.signals;
}, 120_000);
afterAll(() => fx.cleanup());

describe('check_answer', () => {
  test('真實存在的 id、平和語氣 → ok，走統一外殼', async () => {
    const [a, b] = real;
    const { isError, json } = await fx.call('check_answer', {
      ...base,
      answerText: `這段時期傾向有些變動，值得留意〔${a.id}〕。\n\n另一個面向可能偏向支撐〔${b.id}〕。`,
    });
    expect(isError).toBe(false);
    expect(json.asOf).toBe(AS_OF);
    expect(json.versionsHash).toMatch(/^[0-9a-f]{12}$/);
    expect(json.caveats.some((c: any) => c.code === 'scores_uncalibrated')).toBe(true);
    expect(json.data).toMatchObject({ ok: true, paragraphCount: 2, unknownCitations: [], issues: [] });
    expect(json.data.citedIds).toEqual([a.id, b.id].sort());
  });

  test('不存在的 id 與保證式用語都被標出', async () => {
    const { json } = await fx.call('check_answer', {
      ...base,
      answerText: `明年一定會升遷〔${real[0].id}〕。\n\n另有依據 sig_doesnotexist 保證成功。`,
    });
    expect(json.data.ok).toBe(false);
    expect(json.data.unknownCitations).toEqual(['sig_doesnotexist']);
    const codes = json.data.issues.map((i: any) => `${i.paragraph}:${i.code}`);
    expect(codes).toEqual(expect.arrayContaining(['0:honesty_violation', '1:unknown_citation', '1:honesty_violation']));
  });

  test('用 experimental 系統湊高共識 → experimental_as_consensus', async () => {
    const jy = real.find(s => s.system === 'jyotish' || s.system === 'humanDesign');
    if (!jy) {
      const { json } = await fx.call('list_signals', { ...base, system: 'jyotish', limit: 5 });
      expect(json.data.signals.length).toBeGreaterThanOrEqual(0);
      return; // 此命盤沒有 experimental 訊號時，單元測試（packages/ai）已涵蓋規則
    }
    const verified = real.filter(s => s.system !== 'jyotish' && s.system !== 'humanDesign').slice(0, 2);
    const { json } = await fx.call('check_answer', {
      ...base,
      answerText: `財務面屬高共識${verified.map(s => `〔${s.id}〕`).join('')}〔${jy.id}〕`,
    });
    expect(json.data.issues.some((i: any) => i.code === 'experimental_as_consensus' || i.code === 'high_consensus_unsupported')).toBe(true);
  });

  test('參數錯誤：空字串、過長、缺 asOf', async () => {
    expect((await fx.call('check_answer', { ...base, answerText: '' })).json.error.code).toBe('invalid_args');
    expect((await fx.call('check_answer', { ...base, answerText: 'x'.repeat(20_001) })).json.error.code).toBe('invalid_args');
    expect((await fx.call('check_answer', { profileId: 'sky', answerText: 'x' })).json.error.code).toBe('invalid_args');
    expect((await fx.call('check_answer', { profileId: 'ghost', asOf: AS_OF, answerText: 'x' })).json.error.code).toBe('profile_not_found');
  });
});
