/** batch 工具與 get_chart conventions。使用測試樣本 sky（非真人資料）。 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { MAX_RESPONSE_CHARS } from '../src/envelope';
import { MAX_BATCH_CALLS } from '../src/tools/index';
import { makeFixture } from './helpers';

const ASOF = '2026-09-30';
const base = { profileId: 'sky', asOf: ASOF };
let fx: Awaited<ReturnType<typeof makeFixture>>;
beforeAll(async () => { fx = await makeFixture(); });
afterAll(() => fx.cleanup());

describe('batch', () => {
  test('依序執行並各自回結果，結果與單獨呼叫一致', async () => {
    const calls = [
      { tool: 'list_profiles' },
      { tool: 'get_timeline', args: { ...base, domain: 'career' } },
      { tool: 'list_signals', args: { ...base, limit: 2 } },
    ];
    const { json, isError } = await fx.call('batch', { calls });
    expect(isError).toBe(false);
    expect(json.data.count).toBe(3);
    expect(json.data.results.map((r: any) => [r.index, r.tool, r.ok])).toEqual([[0, 'list_profiles', true], [1, 'get_timeline', true], [2, 'list_signals', true]]);
    const single = await fx.call('get_timeline', { ...base, domain: 'career' });
    expect(json.data.results[1].data).toEqual(single.json.data);
    expect(json.data.results[1].asOf).toBe(ASOF);
    // caveats 合併去重
    const codes = json.caveats.map((c: any) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toContain('scores_uncalibrated');
  }, 120_000);

  test('部分失敗：失敗的呼叫帶結構化錯誤，其餘照常', async () => {
    const { json, isError } = await fx.call('batch', {
      calls: [
        { tool: 'get_signal', args: { ...base, signalId: 'sig_0000000000000000' } },
        { tool: 'get_profile', args: { profileId: 'ghost' } },
        { tool: 'no_such_tool' },
        { tool: 'list_signals', args: { ...base, limit: 1, domain: 'nope' } },
        { tool: 'list_signals', args: { ...base, limit: 1 } },
      ],
    });
    expect(isError).toBe(false);
    const r = json.data.results;
    expect(r.map((x: any) => x.ok)).toEqual([false, false, false, false, true]);
    expect(r[0].error.code).toBe('unknown_signal');
    expect(r[1].error.code).toBe('profile_not_found');
    expect(r[2].error.code).toBe('unsupported');
    expect(r[3].error.code).toBe('invalid_args');
    expect(r[4].data.signals.length).toBe(1);
  }, 120_000);

  test('不可巢狀；不允許 import_profile', async () => {
    const { json } = await fx.call('batch', {
      calls: [
        { tool: 'batch', args: { calls: [{ tool: 'list_profiles' }] } },
        { tool: 'import_profile', args: { path: '~/x.fortune.json' } },
        { tool: 'list_profiles' },
      ],
    });
    const r = json.data.results;
    expect(r[0]).toMatchObject({ ok: false, error: { code: 'invalid_args' } });
    expect(r[0].error.message).toContain('nested');
    expect(r[1]).toMatchObject({ ok: false, error: { code: 'unsupported' } });
    expect(r[2].ok).toBe(true);
  });

  test(`最多 ${MAX_BATCH_CALLS} 個、至少 1 個；多餘欄位被拒`, async () => {
    const eight = Array.from({ length: MAX_BATCH_CALLS }, () => ({ tool: 'list_question_categories' }));
    expect((await fx.call('batch', { calls: eight })).isError).toBe(false);
    const nine = [...eight, { tool: 'list_question_categories' }];
    const over = await fx.call('batch', { calls: nine });
    expect(over.isError).toBe(true);
    expect(over.json.error.code).toBe('invalid_args');
    expect((await fx.call('batch', { calls: [] })).json.error.code).toBe('invalid_args');
    expect((await fx.call('batch', { calls: [{ tool: 'list_profiles', extra: 1 }] })).json.error.code).toBe('invalid_args');
  });

  test('總回應受大小上限約束：超過的後續呼叫回 response_too_large，不讓整批失敗', async () => {
    // get_timeline detail:true 約 22 KB，三個必定超過 60 KB 上限
    const heavy = { tool: 'get_timeline', args: { ...base, detail: true } };
    const { json, text, isError } = await fx.call('batch', { calls: [heavy, heavy, heavy, heavy] });
    expect(isError).toBe(false);
    expect(text.length).toBeLessThanOrEqual(MAX_RESPONSE_CHARS);
    const r = json.data.results;
    expect(r[0].ok).toBe(true);
    const tooLarge = r.filter((x: any) => !x.ok && x.error.code === 'response_too_large');
    expect(tooLarge.length).toBeGreaterThan(0);
  }, 120_000);
});

describe('get_chart conventions', () => {
  const SYSTEMS = ['bazi', 'ziwei', 'numerology', 'tzolkin', 'mingGua', 'jyotish', 'humanDesign'];

  test('每個系統都有 conventions（items / source / notRecorded）', async () => {
    for (const system of SYSTEMS) {
      const { json, isError } = await fx.call('get_chart', { ...base, system });
      expect(isError).toBe(false);
      const c = json.data.conventions;
      expect(c, system).toBeDefined();
      expect(Object.keys(c.items).length).toBeGreaterThan(0);
      expect(Array.isArray(c.source)).toBe(true);
      expect(Array.isArray(c.notRecorded)).toBe(true);
      // 不含姓名
      expect(JSON.stringify(c)).not.toContain('王小明');
    }
  }, 120_000);

  test('口徑取自 core 實際設定：八字晚子時＋真太陽時、吠陀 Lahiri／平均交點／整宮／365.25、人類圖真交點', async () => {
    const bazi = (await fx.call('get_chart', { ...base, system: 'bazi', detail: 'full' })).json.data;
    expect(bazi.chart.conventions).toMatchObject({ useTrueSolarTime: true, ziHourConvention: 'late', yearMonthBasis: 'jie-instant' });
    expect(bazi.conventions.items.ziHourConvention).toContain('晚子');
    expect(bazi.conventions.items.useTrueSolarTime).toContain('開');

    const jy = (await fx.call('get_chart', { ...base, system: 'jyotish', detail: 'full' })).json.data;
    expect(jy.chart.settings).toMatchObject({ ayanamsa: 'lahiri', node: 'mean', dashaYearDays: 365.25, houseSystem: 'whole_sign' });
    expect(jy.conventions.items.zodiac).toContain('Lahiri');
    expect(jy.conventions.items.node).toContain('平交點');
    expect(jy.conventions.items.houseSystem).toContain('整宮');
    expect(jy.conventions.items.vimshottariYear).toContain('365.25');
    expect(jy.conventions.items.ephemeris).toContain('Moshier');

    const hd = (await fx.call('get_chart', { ...base, system: 'humanDesign', detail: 'full' })).json.data;
    expect(hd.chart.node).toBe('true');
    expect(hd.conventions.items.node).toContain('真交點');
    expect(hd.conventions.items.ephemeris).toContain('Moshier');

    const zw = (await fx.call('get_chart', { ...base, system: 'ziwei', detail: 'full' })).json.data;
    expect(zw.chart.time).toMatchObject({ basis: 'trueSolar', ziHourConvention: 'splitMidnight' });
    expect(zw.conventions.items.ziHourConvention).toContain('分早晚子');
  }, 120_000);

  test('查不到的口徑寫「未明確記錄」而不是猜', async () => {
    const num = (await fx.call('get_chart', { ...base, system: 'numerology' })).json.data.conventions;
    expect(num.items.nameNumbers).toContain('未明確記錄');
    expect(num.notRecorded).toContain('nameNumbers.letterTable');
  }, 120_000);
});
