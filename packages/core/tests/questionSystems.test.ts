/**
 * 問事排名可指定系統（answerQuestion 的 systems）、實驗性系統敏感度、restrictTimeline。
 * 真實案例用測試樣本 sky（1990-05-17 08:30 台南，非真人資料）。
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import baseline from './fixtures/questionSystems.baseline.json';
import agreementDelta from './fixtures/questionSystems.v0.6.0.delta.json';
import {
  EXPERIMENTAL_SYSTEM_IDS,
  QUESTION_CATALOG,
  answerQuestion,
  experimentalSensitivity,
  getQuestionCategory,
  listQuestionCategories,
  monthWindows,
  normalizeSystems,
  type QuestionRequest,
  type SignalProvider,
} from '../src/questions/index';
import { SYSTEM_IDS, createSignal, type CreateSignalParams, type Signal, type SignalWindow, type SystemId } from '../src/signals/index';
import { buildTimeline, restrictTimeline, restrictTimelineCell, type Timeline } from '../src/timeline/index';
import { initEphemeris } from '../src/calculators/astro/index';
import { EXPERIMENTAL_SYSTEMS } from '../src/portable/versions';
import { createTimeContext } from '../src/time/index';
import type { BirthProfile } from '../src/profile/index';

const SKY: BirthProfile = {
  date: '1990-05-17',
  time: '08:30',
  timeAccuracy: 'exact',
  gender: 'female',
  birthplace: { label: 'Tainan, Taiwan', lat: 22.9999, lng: 120.2269, timezone: 'Asia/Taipei' },
};
const ASOF = '2026-09-30';
const VERIFIED: SystemId[] = ['bazi', 'ziwei', 'numerology'];

let provider: SignalProvider;
let fullTimeline: Timeline;
let ctx: ReturnType<typeof createTimeContext>;

beforeAll(async () => {
  await initEphemeris();
  ctx = createTimeContext(SKY);
  // 與 MCP 的 monthSignalProvider 同樣的建法：每年一個 timeline，保留全部訊號。
  const cache = new Map<number, Map<string, Signal[]>>();
  const monthSignals = (year: number) => {
    let m = cache.get(year);
    if (!m) {
      m = new Map();
      const cells = buildTimeline(ctx, { asOf: year === 2026 ? ASOF : `${year}-01-01`, years: 1, includeMonths: true, topSignalsPerDomain: Infinity }).months;
      for (const cell of cells) {
        const byId = new Map<string, Signal>();
        for (const d of cell.domains) for (const s of d.topSignals) byId.set(s.id, s);
        m.set(cell.window.start.slice(0, 7), [...byId.values()]);
      }
      cache.set(year, m);
    }
    return m;
  };
  provider = (w: SignalWindow) => monthSignals(Number(w.start.slice(0, 4))).get(w.start.slice(0, 7)) ?? [];
  fullTimeline = buildTimeline(ctx, { asOf: ASOF, topSignalsPerDomain: Infinity });
}, 120_000);

const sha = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');

describe('不指定 systems：保留舊基準並套用 D-045 字面差異', () => {
  test('16 個（類別 × 範圍）只接受已審查的 v0.6.0 sha256', () => {
    const entries = Object.entries(baseline).filter(([k]) => !k.startsWith('$'));
    expect(entries.length).toBe(16);
    for (const [key, hash] of entries) {
      const [category, start, end] = key.split('|');
      const a = answerQuestion({ category, range: { start, end } }, provider);
      expect(a.systemFilter).toBeUndefined();
      const delta = (agreementDelta.changes as Record<string, {before:string; after:string}>)[key];
      expect(delta.before).toBe(hash);
      expect(`${key} ${sha(a)}`).toBe(`${key} ${delta.after}`);
    }
  });
});

describe('指定 systems', () => {
  const req: QuestionRequest = { category: 'vehicle_purchase', range: { start: '2027-01', end: '2027-12' } };

  test('指定全部系統＝不指定（排名、分數、來源訊號都相同，只多 systemFilter）', () => {
    const plain = answerQuestion(req, provider);
    for (const systems of [[...SYSTEM_IDS], ['bazi', 'ziwei', 'numerology', 'jyotish', 'humanDesign'] as SystemId[]]) {
      const all = answerQuestion(req, provider, { systems });
      const { systemFilter, ...rest } = all;
      expect(JSON.stringify(rest)).toBe(JSON.stringify(plain));
      expect(systemFilter!.systemsExcluded).toEqual([]);
      expect(systemFilter!.systemsUsed).toEqual(['bazi', 'ziwei', 'numerology', 'jyotish', 'humanDesign']);
    }
  });

  test('子集＝provider 只回傳那些系統（篩選發生在去重與計分之前）', () => {
    for (const subset of [['bazi', 'ziwei'], VERIFIED, ['jyotish'], ['ziwei', 'humanDesign']] as SystemId[][]) {
      const viaOption = answerQuestion(req, provider, { systems: subset });
      const viaProvider = answerQuestion(req, (w) => provider(w).filter((s) => subset.includes(s.system)));
      const { systemFilter, ...rest } = viaOption;
      expect(JSON.stringify(rest)).toBe(JSON.stringify(viaProvider));
      for (const r of viaOption.ranking) for (const s of [...r.supportSignals, ...r.riskSignals]) expect(subset).toContain(s.system);
      expect(systemFilter!.systemsRequested).toEqual(SYSTEM_IDS.filter((s) => subset.includes(s)));
      expect(systemFilter!.systemsExcluded).toEqual((['bazi', 'ziwei', 'numerology', 'jyotish', 'humanDesign'] as SystemId[]).filter((s) => !subset.includes(s as SystemId)));
    }
  });

  test('子集的排名＝獨立寫的簡單程式只取該子集訊號重算的結果', () => {
    for (const category of listQuestionCategories().map((c) => c.id)) {
      for (const subset of [['bazi', 'ziwei'], VERIFIED] as SystemId[][]) {
        const r = { category, range: { start: '2027-01', end: '2027-12' } };
        const engine = answerQuestion(r, provider, { systems: subset }).ranking;
        const naive = naiveRanking(r, provider, subset);
        expect(engine.map((x) => x.window.start.slice(0, 7))).toEqual(naive.map((x) => x.month));
        engine.forEach((x, i) => expect(Math.abs(x.score - naive[i].score)).toBeLessThan(1e-3));
      }
    }
  });

  test('deterministic；未知系統、空清單會丟錯', () => {
    const a = answerQuestion(req, provider, { systems: ['ziwei', 'bazi', 'bazi'] });
    expect(JSON.stringify(answerQuestion(req, provider, { systems: ['bazi', 'ziwei'] }))).toBe(JSON.stringify(a));
    expect(() => answerQuestion(req, provider, { systems: ['astrology' as SystemId] })).toThrow(/unknown system/);
    expect(() => answerQuestion(req, provider, { systems: [] })).toThrow(/non-empty/);
    expect(normalizeSystems(['humanDesign', 'bazi'])).toEqual(['bazi', 'humanDesign']);
    expect(EXPERIMENTAL_SYSTEM_IDS).toEqual(['jyotish']);
    expect([...EXPERIMENTAL_SYSTEM_IDS] as string[]).toEqual([...EXPERIMENTAL_SYSTEMS]);
  });

  test('沒有訊號的領域以 0 計入、權重留在分母；領域內沒發聲的系統不稀釋平均', () => {
    const w = monthWindows({ start: '2027-03', end: '2027-03' })[0];
    const one = (system: SystemId, ruleId: string, domain: 'wealth' | 'contract', target: string) =>
      sig(w, { system, ruleId, domain, trait: 'opportunity', intensity: 0.6, target });
    const p: SignalProvider = () => [one('bazi', 'test.rule', 'wealth', 'a'), one('jyotish', 'jyotish.transit.slow', 'contract', 'b')];
    const r = { category: 'vehicle_purchase', range: { start: '2027-03', end: '2027-03' } };
    const both = answerQuestion(r, p).ranking[0];
    const baziOnly = answerQuestion(r, p, { systems: ['bazi'] }).ranking[0];
    const wealth = (x: typeof both) => x.domainScores.find((d) => d.domain === 'wealth')!;
    const contract = (x: typeof both) => x.domainScores.find((d) => d.domain === 'contract')!;
    // wealth 只有 bazi 發聲：拿掉 jyotish 不影響它（jyotish 沒在 wealth 發聲，不計入平均）
    expect(wealth(baziOnly)).toEqual(wealth(both));
    // contract 只有 jyotish：拿掉後該領域沒有訊號 → 0，但權重仍在分母，月分數下降
    expect(contract(baziOnly).score).toBe(0);
    expect(contract(baziOnly).signalIds).toEqual([]);
    expect(baziOnly.score).toBeLessThan(both.score);
    const cat = getQuestionCategory('vehicle_purchase')!;
    const wSum = cat.domains.reduce((a, d) => a + d.weight, 0);
    const wWealth = cat.domains.find((d) => d.domain === 'wealth')!.weight;
    expect(baziOnly.score).toBeCloseTo((wWealth * wealth(baziOnly).score) / wSum, 3);
  });
});

describe('experimentalSensitivity', () => {
  const r = { category: 'vehicle_purchase', range: { start: '2027-01', end: '2027-03' } };
  const w = (ym: string) => monthWindows({ start: ym, end: ym })[0];
  const mk = (ym: string, system: SystemId, ruleId: string, intensity: number, target: string) =>
    sig(w(ym), { system, ruleId, domain: 'wealth', trait: 'opportunity', intensity, target });

  test('會翻轉：實驗性系統把另一個月推上第 1 名 → changed', () => {
    const p: SignalProvider = (win) => {
      const ym = win.start.slice(0, 7);
      if (ym === '2027-01') return [mk(ym, 'bazi', 'test.rule', 0.7, 'a')];
      if (ym === '2027-02') return [mk(ym, 'bazi', 'test.rule', 0.5, 'b'), mk(ym, 'jyotish', 'jyotish.transit.slow', 0.99, 'c')];
      return [mk(ym, 'ziwei', 'ziwei.month.mutagen', 0.2, 'd')];
    };
    const s = experimentalSensitivity(r, p)!;
    expect(s.changed).toBe(true);
    expect(s.top3All.map((x) => x.month)).toEqual(['2027-02', '2027-01', '2027-03']);
    expect(s.top3VerifiedOnly.map((x) => x.month)).toEqual(['2027-01', '2027-02', '2027-03']);
    expect(s.systemsVerifiedOnly).not.toContain('jyotish');
    expect(s.systemsAll).toContain('jyotish');
    // 兩邊都等於直接用 answerQuestion 指定系統的結果
    const all = answerQuestion(r, p, { systems: s.systemsAll }).top;
    expect(s.top3All).toEqual(all.map((x) => ({ month: x.window.start.slice(0, 7), score: x.score, band: x.band })));
    expect(JSON.stringify(experimentalSensitivity(r, p))).toBe(JSON.stringify(s));
  });

  test('不翻轉：實驗性系統只改分數不改名次 → changed=false', () => {
    const p: SignalProvider = (win) => {
      const ym = win.start.slice(0, 7);
      if (ym === '2027-01') return [mk(ym, 'bazi', 'test.rule', 0.9, 'a'), mk(ym, 'jyotish', 'jyotish.transit.slow', 0.3, 'c')];
      if (ym === '2027-02') return [mk(ym, 'bazi', 'test.rule', 0.5, 'b')];
      return [];
    };
    const s = experimentalSensitivity(r, p)!;
    expect(s.changed).toBe(false);
    expect(s.top3All.map((x) => x.month)).toEqual(s.top3VerifiedOnly.map((x) => x.month));
    expect(s.top3All[0].score).not.toBe(s.top3VerifiedOnly[0].score);
  });

  test('沒有實驗性系統可比時不翻轉；不支援的類別回 null', () => {
    const p: SignalProvider = (win) => [mk(win.start.slice(0, 7), 'bazi', 'test.rule', 0.5, 'a')];
    expect(experimentalSensitivity(r, p, { experimental: [] })!.changed).toBe(false);
    expect(experimentalSensitivity({ category: 'lottery', range: r.range }, p)).toBeNull();
  });

  test('sky 真實訊號：結果穩定可重現（記錄是否翻轉）', () => {
    const s = experimentalSensitivity({ category: 'vehicle_purchase', range: { start: '2027-01', end: '2027-12' } }, provider)!;
    expect(s.top3All.length).toBe(3);
    expect(s.systemsVerifiedOnly).toEqual(['bazi', 'ziwei', 'numerology', 'tzolkin', 'mingGua', 'humanDesign']);
    expect(JSON.stringify(experimentalSensitivity({ category: 'vehicle_purchase', range: { start: '2027-01', end: '2027-12' } }, provider))).toBe(JSON.stringify(s));
    console.log('sky vehicle_purchase 2027 sensitivity:', JSON.stringify(s.top3All), JSON.stringify(s.top3VerifiedOnly), s.changed);
  });
});

describe('restrictTimeline', () => {
  test('等於 buildTimeline({ systems })；不指定篩選的 timeline 不受影響', () => {
    for (const subset of [VERIFIED, ['bazi', 'jyotish']] as SystemId[][]) {
      const restricted = restrictTimeline(fullTimeline, subset);
      const direct = buildTimeline(ctx, { asOf: ASOF, topSignalsPerDomain: Infinity, systems: subset });
      expect(JSON.stringify(restricted)).toBe(JSON.stringify(direct));
    }
    const all = restrictTimeline(fullTimeline, [...SYSTEM_IDS]);
    expect(JSON.stringify(all)).toBe(JSON.stringify(fullTimeline));
  }, 60_000);

  test('截斷過的 topSignals 無法還原 → 丟錯；未知系統丟錯', () => {
    const truncated = buildTimeline(ctx, { asOf: ASOF, years: 1 });
    expect(() => restrictTimeline(truncated, VERIFIED)).toThrow(/topSignalsPerDomain/);
    expect(() => restrictTimelineCell(fullTimeline.years[0], ['x' as SystemId], fullTimeline)).toThrow(/unknown system/);
  });
});

// ─── 工具 ──────────────────────────────────────────────────────────────────────

function sig(window: SignalWindow, over: Partial<CreateSignalParams>): Signal {
  return createSignal({
    system: 'bazi', ruleId: 'test.rule', ruleVersion: 1, domain: 'wealth', trait: 'opportunity',
    intensity: 0.5, valence: 0.3, window, target: 't', ...over,
  });
}

/**
 * 獨立重寫的簡化版計分（不呼叫 aggregateSignals／answerQuestion），系統權重皆 1：
 * 每領域每系統 noisy-OR → 跨系統平均（只算有發聲的系統）→ a·activity + s·support − r·risk，
 * 月分數 = 領域加權平均（沒有訊號的領域以 0 計入）。
 */
function naiveRanking(req: QuestionRequest, p: SignalProvider, systems: SystemId[]) {
  const cat = getQuestionCategory(req.category)!;
  const { activityWeight: a, supportWeight: sw, riskWeight: rw } = QUESTION_CATALOG.scoring;
  const sup = new Set<string>(cat.traitPreferences.supportive);
  const rsk = new Set<string>(cat.traitPreferences.risky);
  const rows = monthWindows(req.range).map((w) => {
    const seen = new Map<string, Signal>();
    for (const s of p(w)) {
      if (!systems.includes(s.system)) continue;
      if (!cat.domains.some((d) => d.domain === s.domain)) continue;
      const subset = cat.ruleIds[s.system];
      if (subset && subset.length > 0 && !subset.includes(s.ruleId)) continue;
      seen.set(s.id, s);
    }
    const list = [...seen.values()];
    let num = 0;
    let den = 0;
    for (const { domain, weight } of cat.domains) {
      den += weight;
      const inDomain = list.filter((s) => s.domain === domain);
      const sys = [...new Set(inDomain.map((s) => s.system))];
      if (sys.length === 0) continue;
      const noisyOr = (xs: Signal[]) => 1 - xs.reduce((m, s) => m * (1 - s.intensity), 1);
      const mean = (pick: (s: Signal) => boolean) =>
        (100 * sys.reduce((acc, y) => acc + noisyOr(inDomain.filter((s) => s.system === y && pick(s))), 0)) / sys.length;
      const activity = mean(() => true);
      const support = mean((s) => sup.has(s.trait));
      const risk = mean((s) => rsk.has(s.trait));
      num += weight * Math.min(100, Math.max(0, a * activity + sw * support - rw * risk));
    }
    return { month: w.start.slice(0, 7), score: den > 0 ? num / den : 0 };
  });
  return rows.sort((x, y) => y.score - x.score || (x.month < y.month ? -1 : 1));
}
