/**
 * systems／verifiedOnly、experimentalSensitivity、answer_question 精簡回傳、get_timeline 逐月表格。
 * 使用測試樣本 sky（非真人資料）。
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { answerQuestion, buildConsensus, canonicalStringify, listQuestionCategories, restrictTimeline } from '@fortune/core';
import { compactAnswer } from '../src/answerSummary';
import { monthSignalProvider, slimAnswer } from '../src/tools/questions';
import baseline from './fixtures/systemsBaseline.json';
import agreementDelta from './fixtures/systemsBaseline.v0.6.0.delta.json';
import abstentionDelta from './fixtures/systemsBaseline.v0.7.0.delta.json';
function expectedHash(key: string): string {
  const delta = (agreementDelta.changes as Record<string, {before:string; after:string}>)[key];
  expect(delta.before).toBe((baseline as Record<string,string>)[key]);
  const next = (abstentionDelta.changes as Record<string,{before:string;after:string}>)[key];
  if(next) { expect(next.before).toBe(delta.after); return next.after; }
  return delta.after;
}
import { makeFixture } from './helpers';

const ASOF = '2026-09-30';
const RANGE = { start: '2027-01', end: '2027-12' };
const NEW_FIELDS = ['systemsUsed', 'excludedSystems', 'experimentalIncluded', 'experimentalSensitivity', 'monthsFormat', 'yearsFormat'];
const sha = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const ID = /sig_[0-9a-f]{16}/g;
const SHORT_ID = /sig_[0-9a-f]{8}(?![0-9a-f])/g;

let fx: Awaited<ReturnType<typeof makeFixture>>;
beforeAll(async () => { fx = await makeFixture(); });
afterAll(() => fx.cleanup());

const aq = (extra: Record<string, unknown> = {}) =>
  fx.call('answer_question', { profileId: 'sky', category: 'vehicle_purchase', range: RANGE, asOf: ASOF, ...extra });

/** 移除這次新增的欄位與敏感度 caveat，用來和改動前的錄製比對。 */
function stripNew(json: any) {
  const copy = JSON.parse(JSON.stringify(json));
  for (const k of NEW_FIELDS) delete copy.data[k];
  copy.caveats = copy.caveats.filter((c: any) => c.code !== 'experimental_sensitive');
  return copy;
}

/**
 * 把輸出中的短編號還原成完整編號（用 analysis 的前綴解析），好和「短編號功能之前」錄下的基準比對：
 * 這樣基準的差異就只剩 timeline 預設格式，編號縮短本身不會讓雜湊改變。
 */
async function expandIds(json: any) {
  const analysis = await fx.ctx.analyzer.get('sky', ASOF);
  const text = JSON.stringify(json).replace(SHORT_ID, m => {
    const hit = analysis.findSignal(m);
    if (!hit) throw new Error(`short id ${m} does not resolve`);
    return hit.id;
  });
  return JSON.parse(text);
}

describe('不指定系統：保留舊基準並套用 D-045 字面差異', () => {
  test('answer_question detail:true 的完整結構（去掉新欄位）符合已審查 v0.6.0 字面差異', async () => {
    for (const [cat, start, end] of [['vehicle_purchase', '2027-01', '2027-12'], ['job_change', '2026-10', '2028-09']]) {
      const r = await fx.call('answer_question', { profileId: 'sky', category: cat, range: { start, end }, asOf: ASOF, detail: true });
      expect(sha((await expandIds(stripNew(r.json))).data)).toBe(expectedHash(`aq-detail|${cat}`));
    }
  }, 120_000);

  test('get_timeline／get_consensus（去掉新欄位、短編號還原）與改動前逐位元相同', async () => {
    // 改動前錄下的基準；短編號與 yearTable 預設格式是這次刻意的改動：
    //  - detail:true 與 get_consensus：短編號還原後與舊基準完全相同；
    //  - 其餘 get_timeline 預設呼叫：年度區塊改成 yearTable（刻意改格式），基準改成「去掉年度區塊後的其餘部分」，
    //    其雜湊是用改動前的程式碼重算的（`|noYears` 鍵），所以逐月部分仍與改動前逐位元相同。
    const base = { profileId: 'sky', asOf: ASOF };
    const cases: [string, Record<string, unknown>, Record<string, unknown>, boolean][] = [
      ['get_timeline', base, {}, true],
      ['get_timeline', { ...base, months: { start: '2027-01', end: '2027-12' }, domain: 'wealth' }, { monthsFormat: 'cells' }, true],
      ['get_timeline', { ...base, months: { start: '2027-01', end: '2027-12' }, domain: 'wealth', detail: true }, {}, false],
      ['get_timeline', { ...base, months: { start: '2027-01', end: '2027-03' } }, {}, true],
      ['get_consensus', base, {}, false],
      ['get_consensus', { ...base, detail: true }, {}, false],
    ];
    for (const [name, args, extra, noYears] of cases) {
      const r = await fx.call(name, { ...args, ...extra });
      const j = await expandIds(stripNew(r.json));
      if (noYears) {
        delete j.data.years;
        delete j.data.yearTable;
        j.versionsHash = 'X';
      } else {
        j.versionsHash = baseline.$versionsHash;
      }
      const key = `${name}|${JSON.stringify(args)}${noYears ? '|noYears' : ''}`;
      expect(sha(canonicalStringify(j))).toBe(expectedHash(key));
    }
  }, 120_000);

  test('不指定時 systemsUsed = 全部參與系統，experimentalIncluded = true', async () => {
    const { json } = await aq();
    expect(json.data.systemsUsed).toEqual(['bazi', 'ziwei', 'numerology', 'jyotish', 'humanDesign']);
    expect(json.data.excludedSystems).toEqual([]);
    expect(json.data.experimentalIncluded).toBe(true);
  }, 120_000);
});

describe('answer_question systems／verifiedOnly', () => {
  test('指定全部系統＝不指定', async () => {
    const plain = (await aq()).json.data;
    const all = (await aq({ systems: ['humanDesign', 'jyotish', 'numerology', 'ziwei', 'bazi'] })).json.data;
    expect(all.ranking).toEqual(plain.ranking);
    expect(all.top).toEqual(plain.top);
    expect(all.systemsUsed).toEqual(plain.systemsUsed);
    expect(all.excludedSystems).toEqual([]);
  }, 120_000);

  test('子集＝core 只取該子集訊號重算；verifiedOnly 等於指定已驗證系統', async () => {
    const analysis = await fx.ctx.analyzer.get('sky', ASOF);
    const subset = ['bazi', 'ziwei'] as const;
    const { json } = await aq({ systems: [...subset], detail: true });
    const direct = answerQuestion({ category: 'vehicle_purchase', range: RANGE }, w => monthSignalProvider(analysis)(w).filter(s => (subset as readonly string[]).includes(s.system)));
    const expected = JSON.parse(JSON.stringify(slimAnswer(direct, true, analysis.shortIds)));
    expect(json.data.top).toEqual(expected.top);
    expect(json.data.ranking).toEqual(expected.ranking);
    expect(json.data.systemsUsed).toEqual(['bazi', 'ziwei']);
    expect(json.data.excludedSystems).toEqual(['numerology', 'jyotish', 'humanDesign']);
    expect(json.data.experimentalIncluded).toBe(false);
    expect(json.caveats.some((c: any) => c.code === 'systems_excluded')).toBe(true);
    expect(json.caveats.some((c: any) => c.code.startsWith('experimental:'))).toBe(false);

    const verified = (await aq({ verifiedOnly: true })).json.data;
    const explicit = (await aq({ systems: ['bazi', 'ziwei', 'numerology', 'humanDesign'] })).json.data;
    expect(verified.ranking).toEqual(explicit.ranking);
    expect(verified.top).toEqual(explicit.top);
    expect(verified.systemsUsed).toEqual(['bazi', 'ziwei', 'numerology', 'humanDesign']);
    expect(verified.experimentalIncluded).toBe(false);
    // verifiedOnly 與 systems 可併用：從指定清單再拿掉實驗性系統
    const both = (await aq({ systems: ['bazi', 'jyotish'], verifiedOnly: true })).json.data;
    expect(both.systemsUsed).toEqual(['bazi']);
  }, 120_000);

  test('invalid_args：未知系統（列出可用名稱）、空清單、篩完沒有系統', async () => {
    const unknown = await aq({ systems: ['bazi', 'astrology'] });
    expect(unknown.isError).toBe(true);
    expect(unknown.json.error.code).toBe('invalid_args');
    expect(unknown.json.error.details.unknown).toEqual(['astrology']);
    expect(unknown.json.error.details.availableSystems).toEqual(['bazi', 'ziwei', 'numerology', 'jyotish', 'humanDesign']);
    // 沒有時間序列規則的系統也不在可用名單內
    expect((await aq({ systems: ['tzolkin'] })).json.error.details.availableSystems).not.toContain('tzolkin');
    expect((await aq({ systems: [] })).json.error.code).toBe('invalid_args');
    const none = await aq({ systems: ['jyotish'], verifiedOnly: true });
    expect(none.json.error.code).toBe('invalid_args');
    expect((await aq({ systems: 'bazi' })).json.error.code).toBe('invalid_args');
  }, 120_000);
});

describe('experimentalSensitivity', () => {
  test('不排名時不經敏感度欄位洩露推薦月份', async () => {
    const {json}=await aq();
    expect(json.data.status).toBe('no_clear_advantage');
    expect(json.data.top).toEqual([]);
    expect(json.data.experimentalSensitivity).toBeNull();
    expect(json.caveats.some((c:any)=>c.code==='experimental_sensitive')).toBe(false);
    // A different selected system set can legitimately cross the gate; it has its own context.
    const verified=(await aq({verifiedOnly:true})).json.data;
    expect(verified.status).toBe('ranked');
    expect(verified.top[0].score).toBe(36.0019);
    expect(verified.questionContext.verifiedOnly).toBe(true);
  },120_000);

  test('不翻轉（sky 置產 2026-10～2027-09；M5-04 人類圖改發行運訊號後，原用的感情範圍會翻轉，改用此範圍）：changed=false，沒有提醒', async () => {
    const { json } = await fx.call('answer_question', { profileId: 'sky', category: 'property_purchase', range: { start: '2026-10', end: '2027-09' }, asOf: ASOF });
    const s = json.data.experimentalSensitivity;
    if (json.data.status === 'ranked') {
      expect(s.changed).toBe(false);
      expect(s.top3All.map((x:any)=>x.month)).toEqual(s.top3VerifiedOnly.map((x:any)=>x.month));
    } else { expect(s).toBeNull(); expect(json.data.top).toEqual([]); }
    expect(json.caveats.some((c: any) => c.code === 'experimental_sensitive')).toBe(false);
  }, 120_000);
});

describe('answer_question 精簡回傳', () => {
  test('精簡與 detail 的排名、分數完全一致；引用的 id 都在 detail 裡且可用 get_signal 查到', async () => {
    for (const extra of [{}, { verifiedOnly: true }, { systems: ['ziwei', 'jyotish'] }]) {
      const compact = (await aq(extra)).json.data;
      const detail = (await aq({ ...extra, detail: true })).json.data;
      expect(compact.detailOmitted).toBe(true);
      expect(compact.rankingColumns).toEqual(['month', 'score', 'band']);
      expect(compact.ranking.length).toBe(12);
      expect(compact.ranking.slice(0, detail.ranking.length)).toEqual(detail.ranking.map((r: any) => [r.window.start.slice(0, 7), r.score, r.band]));
      expect(compact.status).toBe(detail.status);
      expect(compact.top.length).toBe(compact.status==='ranked'?3:0);
      if(compact.status!=='ranked') expect(detail.ranking.every((r:any)=>r.rank===null)).toBe(true);
      compact.top.forEach((t: any, i: number) => {
        const d = detail.top[i];
        expect([t.rank, t.month, t.score, t.band, t.highConsensus]).toEqual([d.rank, d.window.start.slice(0, 7), d.score, d.band, d.highConsensus]);
        expect(t.domains.length).toBe(d.domainScores.length);
        expect(t.signalIds.length).toBeLessThanOrEqual(3);
        for (const id of t.signalIds) expect(d.signalIds).toContain(id);
        expect(t.oneLine.startsWith(`${t.month} 第 ${t.rank} 名`)).toBe(true);
      });
      expect(compact.experimentalSensitivity).toEqual(detail.experimentalSensitivity);
      for (const k of ['systemsUsed', 'excludedSystems', 'experimentalIncluded']) expect(compact[k]).toEqual(detail[k]);
      for (const id of new Set(JSON.stringify(compact).match(ID) ?? [])) {
        const r = await fx.call('get_signal', { profileId: 'sky', asOf: ASOF, signalId: id });
        expect(r.isError).toBe(false);
      }
    }
  }, 180_000);

  test('與 core 直接算的 compactAnswer 相同（MCP 只包裝）', async () => {
    const analysis = await fx.ctx.analyzer.get('sky', ASOF);
    const direct = compactAnswer(answerQuestion({ category: 'vehicle_purchase', range: RANGE }, monthSignalProvider(analysis)), analysis.shortIds);
    const { json } = await aq();
    expect(json.data.top).toEqual(JSON.parse(JSON.stringify(direct.top)));
    expect(json.data.ranking).toEqual(JSON.parse(JSON.stringify(direct.ranking)));
  }, 120_000);

  test('典型 12 個月回應 < 4 KB（每個類別）', async () => {
    for (const c of listQuestionCategories()) {
      const { text, isError } = await fx.call('answer_question', { profileId: 'sky', category: c.id, range: RANGE, asOf: ASOF });
      expect(isError).toBe(false);
      expect(Buffer.byteLength(text, 'utf8')).toBeLessThan(4096);
    }
    const full = (await aq({ detail: true })).text;
    console.log('answer_question bytes: compact', Buffer.byteLength((await aq()).text), 'detail', Buffer.byteLength(full));
  }, 180_000);
});

describe('get_timeline／get_consensus systems 與逐月表格', () => {
  const base = { profileId: 'sky', asOf: ASOF };
  test('get_timeline systems：年度 cell 等於 core restrictTimeline', async () => {
    const analysis = await fx.ctx.analyzer.get('sky', ASOF);
    const { json } = await fx.call('get_timeline', { ...base, verifiedOnly: true, domain: 'career', detail: true });
    expect(json.data.systems).toEqual(['bazi', 'ziwei', 'numerology', 'humanDesign']);
    expect(json.data.systemsUsed).toEqual(['bazi', 'ziwei', 'numerology', 'humanDesign']);
    expect(json.data.excludedSystems).toEqual(['jyotish']);
    expect(json.data.experimentalIncluded).toBe(false);
    const expected = restrictTimeline(analysis.timeline, ['bazi', 'ziwei', 'numerology', 'humanDesign']);
    json.data.years.forEach((y: any, i: number) => {
      const cell = expected.years[i].domains.find(d => d.domain === 'career')!;
      expect(y.domains[0].score).toBe(cell.score);
      // 回應是 canonical JSON（key 排序），所以比對排序後的系統清單
      expect(Object.keys(y.domains[0].perSystem).sort()).toEqual(Object.keys(cell.perSystem).sort());
    });
    // 預設年度表與 detail 的 cell 數值一致，systems 欄 = perSystem 的系統
    const table = (await fx.call('get_timeline', { ...base, verifiedOnly: true, domain: 'career' })).json.data.yearTable.rows;
    expect(table.length).toBe(json.data.years.length);
    table.forEach((row: any[], i: number) => {
      expect(row[2]).toBe(json.data.years[i].domains[0].score);
      expect(row[7]).toEqual(Object.keys(json.data.years[i].domains[0].perSystem).sort());
    });
  }, 120_000);

  test('逐月：指定 domain 預設為每月一列的表格，與 cells 格式數值一致；systems 也套用到逐月', async () => {
    const months = { start: '2027-01', end: '2027-12' };
    for (const extra of [{}, { systems: ['bazi', 'ziwei'] }]) {
      const table = (await fx.call('get_timeline', { ...base, months, domain: 'wealth', ...extra })).json.data;
      const cells = (await fx.call('get_timeline', { ...base, months, domain: 'wealth', monthsFormat: 'cells', ...extra })).json.data;
      expect(table.monthsFormat).toBe('table');
      expect(table.months).toBeUndefined();
      expect(table.monthTable.domain).toBe('wealth');
      expect(table.monthTable.columns[0]).toBe('month');
      expect(table.monthTable.rows.length).toBe(12);
      table.monthTable.rows.forEach((row: any[], i: number) => {
        const d = cells.months[i].domains[0];
        expect(row).toEqual([cells.months[i].window.start.slice(0, 7), d.score, d.band, d.consensus, d.highConsensus, d.hasConflict, d.topSignalIds, d.topSignalIdsTotal, d.activityAgreement, d.agreementDirections]);
      });
    }
    const plain = (await fx.call('get_timeline', { ...base, months, domain: 'wealth' })).json.data.monthTable.rows;
    const sub = (await fx.call('get_timeline', { ...base, months, domain: 'wealth', systems: ['bazi', 'ziwei'] })).json.data.monthTable.rows;
    expect(sub).not.toEqual(plain);
    expect((await fx.call('get_timeline', { ...base, months, monthsFormat: 'table' })).json.error.code).toBe('invalid_args');
    expect((await fx.call('get_timeline', { ...base, systems: ['nope'] })).json.error.details.availableSystems.length).toBe(5);
  }, 120_000);

  test('get_consensus verifiedOnly：只從已驗證系統重算共識', async () => {
    const analysis = await fx.ctx.analyzer.get('sky', ASOF);
    const { json } = await fx.call('get_consensus', { ...base, verifiedOnly: true, detail: true });
    expect(json.data.systems).toEqual(['bazi', 'ziwei', 'numerology', 'humanDesign']);
    expect(json.data.experimentalIncluded).toBe(false);
    const expected = buildConsensus(restrictTimeline(analysis.timeline, ['bazi', 'ziwei', 'numerology', 'humanDesign']));
    expect(json.data.conflictCount).toBe(expected.headlines.conflicts.length);
    for (const y of json.data.years) for (const a of y.highConsensus) {
      for (const s of a.systems) expect(['bazi', 'ziwei', 'numerology', 'humanDesign']).toContain(s);
    }
    expect((await fx.call('get_consensus', { ...base, systems: ['x'] })).json.error.code).toBe('invalid_args');
  }, 120_000);
});
