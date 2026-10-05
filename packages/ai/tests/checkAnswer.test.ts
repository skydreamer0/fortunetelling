import { describe, expect, test } from 'bun:test';
import { checkAnswer } from '../src/checkAnswer';
import { EXPERIMENTAL_SYSTEMS } from '../src/validate';

const SIGNALS: Record<string, string> = {
  sig_bazi01: 'bazi',
  sig_ziwei01: 'ziwei',
  sig_astro01: 'westernAstrology',
  sig_jyo01: 'jyotish',
  sig_hd01: 'humanDesign',
  sig_num01: 'numerology',
};
const signalLookup = (id: string) => (SIGNALS[id] ? { system: SIGNALS[id] } : undefined);
const run = (text: string) => checkAnswer(text, { signalLookup });
const codes = (text: string) => run(text).issues.map((i) => i.code);

describe('checkAnswer (a) 引用', () => {
  test('全部存在 → ok', () => {
    const r = run('這段時期事業面傾向有支撐〔sig_bazi01〕，另一套系統也指向同方向〔sig_ziwei01〕。');
    expect(r.ok).toBe(true);
    expect(r.citedIds).toEqual(['sig_bazi01', 'sig_ziwei01']);
    expect(r.unknownCitations).toEqual([]);
  });
  test('不存在的 id 被標出，並指出段落', () => {
    const r = run('第一段〔sig_bazi01〕\n\n第二段引用了 sig_nope999 這個訊號。');
    expect(r.ok).toBe(false);
    expect(r.unknownCitations).toEqual(['sig_nope999']);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toMatchObject({ code: 'unknown_citation', paragraph: 1, values: ['sig_nope999'] });
  });
});

describe('checkAnswer (b) 用語', () => {
  test('保證／一定會／確定發生／宿命論', () => {
    expect(codes('明年一定會升遷〔sig_bazi01〕')).toContain('honesty_violation');
    expect(codes('我保證這個月會成功〔sig_bazi01〕')).toContain('honesty_violation');
    expect(codes('這件事確定發生〔sig_bazi01〕')).toContain('honesty_violation');
    expect(codes('今年是大凶之年〔sig_bazi01〕')).toContain('honesty_violation');
    const r = run('你注定如此，而且絕對不會變〔sig_bazi01〕');
    expect(r.issues[0].values).toEqual(expect.arrayContaining(['注定', '絕對']));
  });
  test('否定形式（不保證、不一定會）不算違規', () => {
    expect(run('這只是傾向，不保證發生，也不一定會如此〔sig_bazi01〕').ok).toBe(true);
  });
  test('語氣平和的傾向描述通過', () => {
    expect(run('這段時期可能偏向變動，建議留意現金流〔sig_bazi01〕').ok).toBe(true);
  });
});

describe('checkAnswer (c) 高共識與 experimental', () => {
  test('三套已驗證系統 → 通過', () => {
    expect(run('財運屬高共識〔sig_bazi01〕〔sig_ziwei01〕〔sig_astro01〕').ok).toBe(true);
  });
  test('少於三套 → high_consensus_unsupported', () => {
    expect(codes('財運屬高共識〔sig_bazi01〕〔sig_ziwei01〕')).toEqual(['high_consensus_unsupported']);
  });
  test('用 experimental 湊滿三套 → experimental_as_consensus', () => {
    const r = run('財運屬高共識〔sig_bazi01〕〔sig_ziwei01〕〔sig_jyo01〕');
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toMatchObject({ code: 'experimental_as_consensus', values: ['jyotish'] });
  });
  test('三套已驗證 + 一套 experimental → 通過', () => {
    expect(run('財運屬高共識〔sig_bazi01〕〔sig_ziwei01〕〔sig_astro01〕，吠陀占星也有提到〔sig_jyo01〕').ok).toBe(true);
  });
  test('同一句把吠陀占星與高共識並列 → 標示', () => {
    const r = run('吠陀占星也支持這個高共識〔sig_bazi01〕〔sig_ziwei01〕〔sig_astro01〕');
    expect(r.issues.map((i) => i.code)).toEqual(['experimental_as_consensus']);
    expect(r.issues[0].values).toEqual(expect.arrayContaining(['吠陀']));
  });
  test('說「吠陀占星不算高共識」是誠實的說法，不標示', () => {
    expect(run('吠陀占星屬 experimental，不算高共識的依據〔sig_jyo01〕。').ok).toBe(true);
  });
  test('人類圖已驗證但只有出生盤基線：不算高共識的一票，說明原因', () => {
    const r = run('財運屬高共識〔sig_bazi01〕〔sig_ziwei01〕〔sig_hd01〕');
    expect(r.issues.map((i) => i.code)).toEqual(['high_consensus_unsupported']);
    expect(r.issues[0].detail).toContain('humanDesign');
    expect(run('財運屬高共識〔sig_bazi01〕〔sig_ziwei01〕〔sig_num01〕').ok).toBe(true);
  });
  test('預設 experimental 清單與 core 一致', () => {
    expect([...EXPERIMENTAL_SYSTEMS]).toEqual(['jyotish']);
  });
});

describe('checkAnswer 其他', () => {
  test('空白文字沒有段落也沒有問題', () => {
    expect(run('   ')).toMatchObject({ ok: true, paragraphCount: 0, issues: [] });
  });
  test('決定性：同輸入同輸出', () => {
    const t = '一定會〔sig_bazi01〕〔sig_x1〕';
    expect(JSON.stringify(run(t))).toBe(JSON.stringify(run(t)));
  });
});
