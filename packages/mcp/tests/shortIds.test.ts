/**
 * 短訊號編號：輸出縮短、輸入容錯（完整／短／前綴／大小寫）、ambiguous／none／invalid、碰撞退回完整編號。
 * 使用測試樣本 sky（非真人資料）。
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Signal } from '@fortune/core';
import { SignalIndex } from '../src/signalIndex';
import { makeFixture } from './helpers';

const ASOF = '2026-09-30';
const base = { profileId: 'sky', asOf: ASOF };
const SHORT = /^sig_[0-9a-f]{8}$/;
let fx: Awaited<ReturnType<typeof makeFixture>>;
let analysis: Awaited<ReturnType<typeof fx.ctx.analyzer.get>>;

beforeAll(async () => {
  fx = await makeFixture();
  analysis = await fx.ctx.analyzer.get('sky', ASOF);
}, 120_000);
afterAll(() => fx.cleanup());

const fake = (id: string) => ({ id, system: 'bazi' }) as unknown as Signal;

describe('輸出一律是短編號', () => {
  test('預設回應裡沒有 16 位的完整編號（除非碰撞）', async () => {
    const calls: [string, Record<string, unknown>][] = [
      ['list_signals', { ...base, limit: 50 }],
      ['get_timeline', base],
      ['get_timeline', { ...base, months: { start: '2027-01', end: '2027-03' }, domain: 'wealth' }],
      ['get_consensus', base],
      ['list_conflicts', base],
      ['answer_question', { ...base, category: 'vehicle_purchase', range: { start: '2027-01', end: '2027-12' } }],
      ['answer_question', { ...base, category: 'vehicle_purchase', range: { start: '2027-01', end: '2027-12' }, detail: true }],
    ];
    for (const [name, args] of calls) {
      const { text, isError, json } = await fx.call(name, args);
      expect(isError).toBe(false);
      const ids = text.match(/sig_[0-9a-f]+/g) ?? [];
      if (name === 'get_consensus') expect(json.data.headlines.agreements).toEqual([]);
      else expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) expect(id).toMatch(SHORT);
    }
  }, 120_000);

  test('get_signal 回完整 id 與短 shortId', async () => {
    const row = (await fx.call('list_signals', { ...base, limit: 1 })).json.data.signals[0];
    const { json } = await fx.call('get_signal', { ...base, signalId: row.id });
    expect(json.data.signal.id).toMatch(/^sig_[0-9a-f]{16}$/);
    expect(json.data.shortId).toBe(row.id);
    expect(json.data.signal.id.startsWith(row.id)).toBe(true);
  }, 120_000);

  test('已知宇宙裡沒有碰撞（sky）：shortIds 對全部訊號都縮短且可唯一解析', () => {
    const shorts = analysis.shortIds(analysis.signals.map(s => s.id));
    expect(shorts.every(s => SHORT.test(s))).toBe(true);
    expect(new Set(shorts).size).toBe(analysis.signals.length);
  });
});

describe('輸入容錯（get_signal）', () => {
  test('完整編號、短編號、10 位前綴、大寫都解析到同一筆', async () => {
    const full = analysis.signals[5].id;
    const forms = [full, full.slice(0, 12), full.slice(0, 14), full.toUpperCase(), `  ${full.slice(0, 12)} `];
    for (const signalId of forms) {
      const { isError, json } = await fx.call('get_signal', { ...base, signalId });
      expect(isError).toBe(false);
      expect(json.data.signal.id).toBe(full);
    }
  }, 120_000);

  test('前綴太短或不是編號 → unknown_signal；查不到的合法編號 → unknown_signal', async () => {
    for (const signalId of ['sig_abc', 'nope', 'sig_zzzzzzzz', 'sig_00000000', 'sig_0000000000000000']) {
      const { isError, json } = await fx.call('get_signal', { ...base, signalId });
      expect(isError).toBe(true);
      expect(json.error.code).toBe('unknown_signal');
    }
  }, 120_000);

  test('解析月份訊號（asOf 年以外的年份）：先查已快取，找不到再逐年擴大', async () => {
    const fresh = await makeFixture();
    try {
      const a = await fresh.ctx.analyzer.get('sky', ASOF);
      // 2029 年的月訊號，不在 timeline 全部訊號與其他年份裡
      const target = [...a.monthSignals(2029).values()].flat().find(s => !a.signals.some(x => x.id === s.id));
      expect(target).toBeDefined();
      const fresh2 = await makeFixture();
      try {
        const { json, isError } = await fresh2.call('get_signal', { ...base, signalId: target!.id.slice(0, 12) });
        expect(isError).toBe(false);
        expect(json.data.signal.id).toBe(target!.id);
      } finally {
        await fresh2.cleanup();
      }
    } finally {
      await fresh.cleanup();
    }
  }, 120_000);
});

describe('check_answer 接受短編號、前綴與大小寫', () => {
  test('短編號／大寫／前綴都算存在', async () => {
    const full = analysis.signals[3].id;
    const text = `這段時期傾向有支撐〔${full.slice(0, 12)}〕與〔${full.slice(0, 12).toUpperCase().replace('SIG_', 'sig_')}〕。`;
    const { json } = await fx.call('check_answer', { ...base, answerText: text });
    expect(json.data.unknownCitations).toEqual([]);
    expect(json.data.ok).toBe(true);
  }, 120_000);

  test('查不到的短編號仍被標出', async () => {
    const { json } = await fx.call('check_answer', { ...base, answerText: '傾向順利〔sig_00000000〕。' });
    expect(json.data.unknownCitations).toEqual(['sig_00000000']);
  }, 120_000);
});

describe('SignalIndex：exact / unique / ambiguous / none / invalid', () => {
  const ids = ['sig_aaaaaaaa11111111', 'sig_aaaaaaaa22222222', 'sig_bbbbbbbb33333333'];
  const make = (extraYear: string[] = []) =>
    new SignalIndex(ids.map(fake), { min: 2020, max: 2030, center: 2026 }, year => (year === 2027 ? extraYear.map(fake) : []));

  test('exact（完整編號）與 unique（短編號）', () => {
    const idx = make();
    expect(idx.resolve('sig_bbbbbbbb33333333')).toMatchObject({ status: 'exact' });
    expect(idx.resolve('sig_bbbbbbbb')).toMatchObject({ status: 'unique', signal: { id: 'sig_bbbbbbbb33333333' } });
    expect(idx.resolve('SIG_BBBBBBBB')).toMatchObject({ status: 'unique' });
    expect(idx.resolve('sig_aaaaaaaa11111111')).toMatchObject({ status: 'exact' });
  });

  test('ambiguous：同前綴對到多筆，列出候選完整編號；加長前綴可解開', () => {
    const idx = make();
    expect(idx.resolve('sig_aaaaaaaa')).toEqual({ status: 'ambiguous', matches: ['sig_aaaaaaaa11111111', 'sig_aaaaaaaa22222222'] });
    expect(idx.resolve('sig_aaaaaaaa1')).toMatchObject({ status: 'unique', signal: { id: 'sig_aaaaaaaa11111111' } });
  });

  test('none / invalid', () => {
    const idx = make();
    expect(idx.resolve('sig_cccccccc').status).toBe('none');
    expect(idx.resolve('sig_abc').status).toBe('invalid');
    expect(idx.resolve('hello').status).toBe('invalid');
  });

  test('找不到時逐年擴大：其他年份的訊號被併入後才解析得到；歧義也會在擴大後出現', () => {
    const idx = make(['sig_cccccccc44444444', 'sig_bbbbbbbb55555555']);
    expect(idx.resolve('sig_cccccccc')).toMatchObject({ status: 'unique', signal: { id: 'sig_cccccccc44444444' } });
    // 2027 年併入後，bbbbbbbb 與 bbbbbbbb55555555 同前綴 → ambiguous
    expect(idx.resolve('sig_bbbbbbbb')).toEqual({ status: 'ambiguous', matches: ['sig_bbbbbbbb33333333', 'sig_bbbbbbbb55555555'] });
  });

  test('碰撞者保留完整編號，其餘縮短（輸出內每個編號都可唯一解析）', () => {
    const idx = make();
    expect(idx.shortIds([...ids])).toEqual(['sig_aaaaaaaa11111111', 'sig_aaaaaaaa22222222', 'sig_bbbbbbbb']);
    // 輸出的每個編號都能被唯一解析回自己
    for (const out of idx.shortIds([...ids])) {
      const r = idx.resolve(out);
      expect(['exact', 'unique']).toContain(r.status);
    }
  });

  test('每年只建一次', () => {
    const calls: number[] = [];
    const idx = new SignalIndex([fake('sig_aaaaaaaa11111111')], { min: 2024, max: 2028, center: 2026 }, year => {
      calls.push(year);
      return [];
    });
    idx.resolve('sig_00000000');
    idx.resolve('sig_11111111');
    expect(calls.sort()).toEqual([2024, 2025, 2026, 2027, 2028]);
  });
});

describe('get_signal ambiguous_signal 錯誤形狀', () => {
  test('回結構化錯誤並列出候選的完整編號', async () => {
    const fakeAnalysis = {
      ...analysis,
      resolveSignal: () => ({ status: 'ambiguous' as const, matches: ['sig_aaaaaaaa11111111', 'sig_aaaaaaaa22222222'] }),
    };
    const ctx = { ...fx.ctx, analyzer: { get: async () => fakeAnalysis } as any };
    const { callTool } = await import('../src/tools/index');
    const res = await callTool('get_signal', { ...base, signalId: 'sig_aaaaaaaa' }, ctx);
    expect(res.isError).toBe(true);
    const err = JSON.parse(res.text).error;
    expect(err.code).toBe('ambiguous_signal');
    expect(err.details.matches).toEqual(['sig_aaaaaaaa11111111', 'sig_aaaaaaaa22222222']);
  });
});
