import { describe, expect, test } from 'bun:test';
import { checkAnswer } from '../src/checkAnswer';
import { EXPERIMENTAL_SYSTEMS } from '../src/validate';

const FULL_SIGNALS: Record<string, string> = {
  sig_ba2100001234abcd: 'bazi',
  sig_21e100001234abcd: 'ziwei',
  sig_a57000001234abcd: 'westernAstrology',
  sig_f1a000001234abcd: 'jyotish',
  sig_d00000011234abcd: 'humanDesign',
  sig_00a000001234abcd: 'numerology',
};
/** 呼叫端負責解析前綴：唯一才回訊號，ambiguous 與查不到回 null。 */
const signalLookup = (id: string) => {
  const hits = Object.keys(FULL_SIGNALS).filter((full) => full.startsWith(id));
  return hits.length === 1 ? { system: FULL_SIGNALS[hits[0]] } : null;
};
const run = (text: string) => checkAnswer(text, { signalLookup });
const codes = (text: string) => run(text).issues.map((i) => i.code);

describe('checkAnswer (a) 引用', () => {
  test('全部存在 → ok', () => {
    const r = run('這段時期事業面傾向有支撐〔sig_ba210000〕，另一套系統也指向同方向〔sig_21e10000〕。');
    expect(r.ok).toBe(true);
    expect(r.citedIds).toEqual(['sig_21e10000', 'sig_ba210000']);
    expect(r.unknownCitations).toEqual([]);
  });
  test('不存在的 id 被標出，並指出段落', () => {
    const r = run('第一段〔sig_ba210000〕\n\n第二段引用了 sig_deadbeef 這個訊號。');
    expect(r.ok).toBe(false);
    expect(r.unknownCitations).toEqual(['sig_deadbeef']);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toMatchObject({ code: 'unknown_citation', paragraph: 1, values: ['sig_deadbeef'] });
  });
});

describe('checkAnswer (a2) 短編號與前綴', () => {
  test('短編號（sig_ + 8 位）通過，citedIds 回傳回答寫的編號', () => {
    const r = run('事業面傾向有支撐〔sig_ba210000〕。');
    expect(r.ok).toBe(true);
    expect(r.citedIds).toEqual(['sig_ba210000']);
  });
  test('完整編號與 8～16 位前綴都能解析', () => {
    expect(run('傾向有支撐〔sig_ba2100001234abcd〕').ok).toBe(true);
    expect(run('傾向有支撐〔sig_ba2100001〕').ok).toBe(true);
  });
  test('大小寫不分，先轉小寫再交給 lookup', () => {
    const seen: string[] = [];
    const lookup = (id: string) => {
      seen.push(id);
      return signalLookup(id);
    };
    const r = checkAnswer('傾向有支撐〔SIG_BA210000〕〔sig_BA210000〕〔Sig_ba210000〕', { signalLookup: lookup });
    expect(r.ok).toBe(true);
    expect(r.citedIds).toEqual(['sig_ba210000']);
    expect([...new Set(seen)]).toEqual(['sig_ba210000']);
  });
  test('少於 8 位不當作編號（不呼叫 lookup、也不標 unknown）', () => {
    const seen: string[] = [];
    const lookup = (id: string) => {
      seen.push(id);
      return signalLookup(id);
    };
    const r = checkAnswer('傾向有支撐〔sig_ba2100〕', { signalLookup: lookup });
    expect(r.citedIds).toEqual([]);
    expect(seen).toEqual([]);
  });
  test('未知前綴被標 unknown_citation，值為回答寫的編號', () => {
    const r = run('這段時期有支撐〔sig_deadbeef〕。');
    expect(r.ok).toBe(false);
    expect(r.issues[0]).toMatchObject({ code: 'unknown_citation', values: ['sig_deadbeef'] });
  });
  test('ambiguous 前綴（lookup 回 null）也標 unknown，不猜', () => {
    const r = checkAnswer('這段時期有支撐〔sig_aaaaaaaa〕。', { signalLookup: () => null });
    expect(r.unknownCitations).toEqual(['sig_aaaaaaaa']);
  });
});

describe('checkAnswer (b) 用語', () => {
  test('保證／一定會／確定發生／宿命論', () => {
    expect(codes('明年一定會升遷〔sig_ba210000〕')).toContain('honesty_violation');
    expect(codes('我保證這個月會成功〔sig_ba210000〕')).toContain('honesty_violation');
    expect(codes('這件事確定發生〔sig_ba210000〕')).toContain('honesty_violation');
    expect(codes('今年是大凶之年〔sig_ba210000〕')).toContain('honesty_violation');
    const r = run('你注定如此，而且絕對不會變〔sig_ba210000〕');
    expect(r.issues[0].values).toEqual(expect.arrayContaining(['注定', '絕對']));
  });
  test('否定形式（不保證、不一定會）不算違規', () => {
    expect(run('這只是傾向，不保證發生，也不一定會如此〔sig_ba210000〕').ok).toBe(true);
  });
  test('語氣平和的傾向描述通過', () => {
    expect(run('這段時期可能偏向變動，建議留意現金流〔sig_ba210000〕').ok).toBe(true);
  });
});

describe('checkAnswer (c) 高共識與 experimental', () => {
  test('三套已驗證系統 → 通過', () => {
    expect(run('財運屬高共識〔sig_ba210000〕〔sig_21e10000〕〔sig_a5700000〕').ok).toBe(true);
  });
  test('少於三套 → high_consensus_unsupported', () => {
    expect(codes('財運屬高共識〔sig_ba210000〕〔sig_21e10000〕')).toEqual(['high_consensus_unsupported']);
  });
  test('用 experimental 湊滿三套 → experimental_as_consensus', () => {
    const r = run('財運屬高共識〔sig_ba210000〕〔sig_21e10000〕〔sig_f1a00000〕');
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toMatchObject({ code: 'experimental_as_consensus', values: ['jyotish'] });
  });
  test('三套已驗證 + 一套 experimental → 通過', () => {
    expect(run('財運屬高共識〔sig_ba210000〕〔sig_21e10000〕〔sig_a5700000〕，吠陀占星也有提到〔sig_f1a00000〕').ok).toBe(true);
  });
  test('同一句把吠陀占星與高共識並列 → 標示', () => {
    const r = run('吠陀占星也支持這個高共識〔sig_ba210000〕〔sig_21e10000〕〔sig_a5700000〕');
    expect(r.issues.map((i) => i.code)).toEqual(['experimental_as_consensus']);
    expect(r.issues[0].values).toEqual(expect.arrayContaining(['吠陀']));
  });
  test('說「吠陀占星不算高共識」是誠實的說法，不標示', () => {
    expect(run('吠陀占星屬 experimental，不算高共識的依據〔sig_f1a00000〕。').ok).toBe(true);
  });
  test('人類圖已通過交叉驗證（M5-03）：可計入三套已驗證系統', () => {
    expect(run('財運屬高共識〔sig_ba210000〕〔sig_21e10000〕〔sig_d0000001〕').ok).toBe(true);
    expect(run('人類圖與其他系統都支持這個高共識〔sig_ba210000〕〔sig_21e10000〕〔sig_d0000001〕').ok).toBe(true);
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
    const t = '一定會〔sig_ba210000〕〔sig_x1〕';
    expect(JSON.stringify(run(t))).toBe(JSON.stringify(run(t)));
  });
});
