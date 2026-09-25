import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCopyPrompt, COPY_PROMPT_VERSION, DEFAULT_COPY_MAX_CHARS } from '../src/copyPrompt';
import { checkPastedAnswer, PASTE_FLAG_LABELS } from '../src/pasteCheck';
import { REDACTED } from '../src/payload';
import { buildCorpus, isInCorpus, VOCAB } from '../src/vocab';
import { loadQuestion, loadReport } from './helpers';

const HEADINGS = ['## 總覽', '## 本年與未來五年', '## 各領域', '## 共識與分歧', '## 問題的回答', '## 資料限制'];

function jsonBlock(text: string): string {
  const m = /```json\n([\s\S]*?)\n```/.exec(text);
  if (!m) throw new Error('no json block');
  return m[1];
}

describe('buildCopyPrompt — de-identification (D-029)', () => {
  test('no name, birthplace, birth date/time or coordinates anywhere in the text', () => {
    const report = loadReport();
    for (const focus of ['overview', 'year', 'question'] as const) {
      const { text } = buildCopyPrompt(report, { focus, question: '什麼時候適合買車？', questionAnswer: loadQuestion() });
      for (const secret of ['王小明', '台北市大安區', '1991-10-05', '1991', '14:30', '25.03', '121.54']) {
        expect({ focus, secret, found: text.includes(secret) }).toEqual({ focus, secret, found: false });
      }
      expect(/"(lat|lng|latitude|longitude|label)":/.test(jsonBlock(text))).toBe(false);
    }
  });

  test('the name / birthplace typed into the question is redacted too', () => {
    const { text } = buildCopyPrompt(loadReport(), { question: '王小明 住 台北市大安區，何時買車？' });
    expect(text).not.toContain('王小明');
    expect(text).not.toContain('台北市大安區');
    expect(text).toContain(`「${REDACTED} 住 ${REDACTED}，何時買車？」`);
  });
});

describe('buildCopyPrompt — content', () => {
  const report = loadReport();
  const prompt = buildCopyPrompt(report, { question: '2026 下半年什麼時候適合買車？', questionAnswer: loadQuestion() });

  test('rules adapted from §9: data only, no re-derivation, citations, 高共識 ≥ 3, contradictions, tendencies, D-033', () => {
    const t = prompt.text;
    expect(t.startsWith(`# 命理報告解讀請求（${COPY_PROMPT_VERSION}）`)).toBe(true);
    expect(t).toContain('只使用下方「資料」區塊的內容');
    expect(t).toContain('不要重新排盤或推算');
    expect(t).toContain('干支、星曜、行星名稱一律不要提');
    expect(t).toContain('〔sig_xxxxxxxxxxxxxxxx〕');
    expect(t).toContain('三套以上不同系統');
    expect(t).toContain('「高共識」');
    expect(t).toContain('必須保留矛盾');
    expect(t).toContain('不是命定');
    expect(t).toContain('注定');
    expect(t).toContain('吉／凶');
    expect(t).toContain('未校準的研究用相對指標');
    expect(t).toContain('這份資料無法回答');
  });

  test('output format spec: markdown headings in order, 問題的回答 only with a question', () => {
    let last = -1;
    for (const h of HEADINGS) {
      const i = prompt.text.indexOf(`\n${h}\n`);
      expect({ h, found: i > last }).toEqual({ h, found: true });
      last = i;
    }
    const plain = buildCopyPrompt(report, { focus: 'overview' });
    expect(plain.text).not.toContain('## 問題的回答');
    expect(plain.text).not.toContain('## 使用者的問題');
    expect(plain.text).toContain('## 資料限制');
    const year = buildCopyPrompt(report, { focus: 'year' });
    expect(year.text).toContain('重點放在「本年與未來五年」：先寫 2026 年');
  });

  test('data block is the de-identified payload JSON; every cited id in the text exists in it', () => {
    const json = jsonBlock(prompt.text);
    expect(json).toBe(prompt.payload.payloadJson);
    const payload = JSON.parse(json);
    expect(payload.profile).toEqual({ gender: 'female', timeAccuracy: 'exact', timezone: 'Asia/Taipei' });
    const ids = new Set(payload.signals.map((s: { id: string }) => s.id));
    const cited = [...prompt.text.matchAll(/〔(sig_[0-9a-f]+)〕/g)].map((m) => m[1]);
    expect(cited.length).toBeGreaterThan(0);
    for (const id of cited) expect(ids.has(id)).toBe(true);
  });

  test('question at the end, with the site ranking clearly labelled as computed (not AI)', () => {
    const t = prompt.text;
    const qi = t.indexOf('## 使用者的問題');
    expect(qi).toBeGreaterThan(t.indexOf('```json'));
    expect(t).toContain('「2026 下半年什麼時候適合買車？」');
    expect(t).toContain('Question Engine 確定性計算，不是 AI 產生');
    expect(t).toContain('購車時機（vehicle_purchase）；範圍 2026-07～2026-12');
    expect(t).toMatch(/1\. 2026-12：分數 [\d.]+/);
    expect(t).toMatch(/2\. 2026-11：/);
    expect(t).toMatch(/3\. 2026-08：/);
    expect(t.trimEnd().endsWith('請開始解讀。')).toBe(true);
    // Question source signals are protected: kept in the data even when budget is tight.
    const small = buildCopyPrompt(report, { questionAnswer: loadQuestion(), maxChars: 16_000 });
    expect(small.payload.payload.timeline).not.toBeNull();
    const keptIds = small.payload.signalIds;
    for (const w of small.payload.payload.question!.top) {
      expect(w.supportSignalIds.length + w.riskSignalIds.length).toBeGreaterThan(0);
      for (const id of [...w.supportSignalIds, ...w.riskSignalIds]) expect(keptIds.has(id)).toBe(true);
    }
  });

  test('free-text question without a ranking → question kept, no ranking, still a full prompt', () => {
    const { text } = buildCopyPrompt(report, { question: '我適合養貓嗎？' });
    expect(text).toContain('「我適合養貓嗎？」');
    expect(text).not.toContain('網站計算的月份排名');
    expect(text).not.toContain('Question Engine 確定性計算');
    expect(text).toContain('網站沒有為這個問題計算月份排名');
    expect(text).toContain('## 問題的回答');
    expect(text).toContain('```json');
  });
});

describe('buildCopyPrompt — size and determinism', () => {
  test('respects maxChars (default 24 000); smaller budgets drop lowest-intensity signals and say so', () => {
    const report = loadReport();
    const def = buildCopyPrompt(report);
    expect(def.charCount).toBe(def.text.length);
    expect(def.charCount).toBeLessThanOrEqual(DEFAULT_COPY_MAX_CHARS);
    expect(def.truncated).toBe(true); // 506 signals do not fit a chat message
    expect(def.text).toContain('為符合聊天輸入長度，資料已精簡');
    const t = def.payload.payload.truncation;
    expect(t.signalsDropped).toBeGreaterThan(0);
    const keptMin = Math.min(...def.payload.payload.signals.map((s) => s.intensity));
    expect(keptMin).toBeGreaterThanOrEqual(t.droppedMaxIntensity!);
    expect(def.text).toContain(`${t.signalsKept}／${t.signalsTotal}`);

    for (const maxChars of [40_000, 16_000, 12_000]) {
      const p = buildCopyPrompt(report, { maxChars, question: '何時買車', questionAnswer: loadQuestion() });
      expect({ maxChars, ok: p.charCount <= maxChars }).toEqual({ maxChars, ok: true });
    }
    const big = buildCopyPrompt(report, { maxChars: 40_000 });
    expect(big.payload.payload.signals.length).toBeGreaterThan(def.payload.payload.signals.length);
  });

  test('deterministic: same input → same text, regardless of signal / engine order or generatedAt', () => {
    const a = buildCopyPrompt(loadReport(), { question: '何時買車', questionAnswer: loadQuestion() });
    const r2 = loadReport();
    r2.generatedAt = '2099-01-01T00:00:00.000Z';
    r2.signals = [...(r2.signals ?? [])].reverse();
    r2.engines = [...(r2.engines ?? [])].reverse();
    const b = buildCopyPrompt(r2, { question: '何時買車', questionAnswer: loadQuestion() });
    expect(b.text).toBe(a.text);
    expect(buildCopyPrompt(loadReport(), { question: '何時買車', questionAnswer: loadQuestion() }).text).toBe(a.text);
  });
});

describe('checkPastedAnswer — paste-back checker', () => {
  const prompt = buildCopyPrompt(loadReport(), { focus: 'overview' });
  const signals = prompt.payload.payload.signals;
  const [s1, s2] = signals;
  const corpus = buildCorpus(prompt.payload.payloadJson, prompt.payload.payload);
  const missingGanzhi = VOCAB.find((e) => e.kind === 'ganzhi' && !isInCorpus(e, corpus))!.term;

  test('a clean answer passes', () => {
    const answer = [
      '## 總覽',
      `這段時期的訊號偏向變動與調整，屬於傾向而不是定論，可以預留彈性〔${s1.id}〕。`,
      `## 各領域\n部分系統在這個領域提示壓力，可能需要放慢節奏、先整理計畫〔${s1.id}〕〔${s2.id}〕。`,
      '## 資料限制\n分數是未校準的相對指標，資料也省略了強度較低的訊號，所以只能看出大方向，不能當成機率。',
    ].join('\n\n');
    const r = checkPastedAnswer(prompt.payload, answer);
    expect(r.flaggedCount).toBe(0);
    expect(r.ok).toBe(true);
    expect(r.citedIds).toEqual([s1.id, s2.id].sort());
    expect(r.paragraphs.map((p) => p.heading)).toEqual(['總覽', '總覽', '各領域', '資料限制']);
  });

  test('flags each violation type per paragraph, with neutral labels', () => {
    const answer = [
      `這段時期適合整理財務〔sig_ffffffffffffffff〕〔${s1.id}〕。`,
      `依${missingGanzhi}流年與 Saturn 的位置，這段時期會有變化〔${s1.id}〕。`,
      '這一年的事業會有明顯的轉折，建議多留意合約細節與溝通方式，並保留一些緩衝時間。',
      `你是天生的領導者，這一年注定大凶〔${s1.id}〕。`,
      `事業方向高共識〔${s1.id}〕。`,
    ].join('\n\n');
    const r = checkPastedAnswer(prompt.payload, answer);
    const codes = r.paragraphs.map((p) => p.flags.map((f) => f.code));
    expect(codes).toEqual([
      ['unknown_citation'],
      ['unverified_term'],
      ['no_citation'],
      ['fatalism'],
      ['high_consensus_unsupported'],
    ]);
    expect(r.paragraphs[0].flags[0]).toEqual({ code: 'unknown_citation', label: '引用不存在', values: ['sig_ffffffffffffffff'] });
    expect(r.paragraphs[1].flags[0].label).toBe('提到資料中沒有的干支／星曜／行星');
    expect(r.paragraphs[1].flags[0].values).toEqual([missingGanzhi, 'Saturn'].sort());
    expect(r.paragraphs[2].flags[0].label).toBe('沒有引用來源');
    expect(r.paragraphs[3].flags[0].label).toBe('宿命論用語');
    expect(r.paragraphs[3].flags[0].values).toEqual(expect.arrayContaining(['你是', '注定', '大凶']));
    expect(r.flaggedCount).toBe(5);
    expect(r.ok).toBe(false);
    expect(Object.values(PASTE_FLAG_LABELS)).toContain('宿命論用語');
  });

  test('「高共識」 is fine with citations from ≥ 3 systems; 紫微斗數 as a system name is not a star', () => {
    const report = loadReport();
    const three = ['bazi', 'ziwei', 'numerology'].map((sys) => report.signals!.find((s) => s.system === sys)!.id);
    const r = checkPastedAnswer(report, `紫微斗數、八字與靈數在這裡高共識${three.map((id) => `〔${id}〕`).join('')}。`);
    expect(r.ok).toBe(true);
  });

  test('accepts a report (full data) or a bare payload; pure and deterministic', () => {
    const report = loadReport();
    const outside = report.signals!.find((s) => !prompt.payload.signalIds.has(s.id))!;
    const text = `這段時期可能有調整〔${outside.id}〕。`;
    expect(checkPastedAnswer(report, text).ok).toBe(true); // exists in the full report
    expect(checkPastedAnswer(prompt.payload, text).paragraphs[0].flags[0].code).toBe('unknown_citation'); // not in the pasted data
    expect(checkPastedAnswer(prompt.payload.payload, text)).toEqual(checkPastedAnswer(prompt.payload, text));
  });
});

describe('browser entry stays SDK-free (D-035)', () => {
  test('copy.ts and its local imports never reach ./client, ./anthropic or @anthropic-ai', () => {
    const src = join(import.meta.dir, '..', 'src');
    const seen = new Set<string>();
    const queue = ['copy.ts'];
    while (queue.length) {
      const file = queue.shift()!;
      if (seen.has(file)) continue;
      seen.add(file);
      const code = readFileSync(join(src, file), 'utf8');
      for (const m of code.matchAll(/^\s*(?:import|export)\s+(type\s+)?[^'"]*?from\s+['"]([^'"]+)['"]/gm)) {
        const spec = m[2];
        expect(spec).not.toContain('@anthropic-ai');
        if (m[1] || !spec.startsWith('./')) continue;
        expect(['./client', './anthropic']).not.toContain(spec);
        queue.push(`${spec.slice(2)}.ts`);
      }
    }
    expect([...seen].sort()).toEqual(['canonical.ts', 'copy.ts', 'copyPrompt.ts', 'core-pure.ts', 'pasteCheck.ts', 'payload.ts', 'schema.ts', 'validate.ts', 'vocab.ts'].sort());
  });
});
