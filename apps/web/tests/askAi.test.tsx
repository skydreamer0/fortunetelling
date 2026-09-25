import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as core from '@fortune/core';
import { buildCopyPrompt, checkPastedAnswer } from '@fortune/ai/copy';
import { renderToStaticMarkup } from 'react-dom/server';
import { AskAi, PasteCheckView, QuestionStatus, copyText } from '../src/components/report/AskAi';
import { CHAPTERS, ReportView } from '../src/components/report/ReportView';
import { localQuestion, matchQuestionCategory, questionRange } from '../src/model/askAi';
import type { BirthInput, Report } from '../src/model/types';

const INPUT: BirthInput = {
  name: '王小明', year: 1995, month: 7, day: 16, hour: 22, minute: 0, timeKnown: true,
  gender: 'male', calendarType: 'solar', cityId: 'tainan', timeAccuracy: 'exact',
};
const report = core.analyze(INPUT as any, { asOf: '2026-09-25' }) as unknown as Report;

describe('問 AI section', () => {
  test('is a chapter right after 驗 事件, with preview, char count, copy button, steps and privacy note', () => {
    const index = CHAPTERS.findIndex(chapter => chapter.id === 'ch-ask');
    expect(CHAPTERS[index - 1].id).toBe('ch-events');
    const html = renderToStaticMarkup(<ReportView report={report} onBack={() => {}} />);
    expect(html).toContain('id="ch-ask"');
    expect(html.indexOf('id="ch-events"')).toBeLessThan(html.indexOf('id="ch-ask"'));
    expect(html).toContain('複製 prompt');
    expect(html).toContain('# 命理報告解讀請求');
    expect(html).toContain('不含姓名、出生地、出生日期與時間');
    expect(html).toContain('由你決定');
    expect(html).toContain('貼回 AI 的回答來檢查');
    for (const label of ['總覽', '本年', '我有問題']) expect(html).toContain(`<span>${label}</span>`);
    expect(html).toMatch(/class="ask__num">[\d,]+<\/span> 字/);
  });

  test('the rendered prompt is de-identified (no name, birthplace, birth date/time, coordinates)', () => {
    const html = renderToStaticMarkup(<AskAi report={report} />);
    for (const secret of ['王小明', 'Tainan', '台南', '1995-07-16', '22:00', '22.99', '120.18']) {
      expect({ secret, found: html.includes(secret) }).toEqual({ secret, found: false });
    }
  });

  test('print stylesheet hides the section', () => {
    const css = readFileSync(join(import.meta.dir, '..', 'src', 'styles', 'print.css'), 'utf8');
    expect(css).toMatch(/\.ask\s*\{\s*display: none|, \.ask \{ display: none !important; \}/);
  });
});

describe('copy button', () => {
  test('uses the Clipboard API with the full prompt text', async () => {
    const written: string[] = [];
    const outcome = await copyText('PROMPT', { clipboard: { writeText: async (value: string) => { written.push(value); } }, select: () => true });
    expect(outcome).toBe('clipboard');
    expect(written).toEqual(['PROMPT']);
  });

  test('falls back to selecting the textarea when the clipboard is missing or refused', async () => {
    let selected = 0;
    const select = () => { selected += 1; return true; };
    expect(await copyText('x', { clipboard: { writeText: async () => { throw new Error('denied'); } }, select })).toBe('selected');
    expect(await copyText('x', { clipboard: null, select })).toBe('selected');
    expect(selected).toBe(2);
    expect(await copyText('x', { clipboard: null })).toBe('failed');
  });
});

describe('question → category by keywords (no AI) + local Question Engine', () => {
  test('keyword mapping and month ranges', () => {
    expect(matchQuestionCategory('什麼時候適合買車')).toBe('vehicle_purchase');
    expect(matchQuestionCategory('今年適合換工作嗎')).toBe('job_change');
    expect(matchQuestionCategory('明年感情如何')).toBe('relationship_timing');
    expect(matchQuestionCategory('想創業')).toBe('startup_timing');
    expect(matchQuestionCategory('什麼時候買房')).toBe('property_purchase');
    expect(matchQuestionCategory('搬家好嗎')).toBe('relocation');
    expect(matchQuestionCategory('考試順利嗎')).toBe('study_exam');
    expect(matchQuestionCategory('投資時機')).toBe('investment');
    expect(matchQuestionCategory('我適合養貓嗎？')).toBeNull();
    expect(matchQuestionCategory('買車還是買房')).toBeNull(); // two categories → no guess
    expect(questionRange('2026～2027 什麼時候適合買車？', '2026-09-25')).toEqual({ start: '2026-09', end: '2027-12' });
    expect(questionRange('什麼時候適合買車', '2026-09-25')).toEqual({ start: '2026-09', end: '2027-08' });
    expect(questionRange('明年適合買車嗎', '2026-09-25')).toEqual({ start: '2027-01', end: '2027-12' });
    expect(questionRange('2020 年買車', '2026-09-25')).toEqual({ start: '2026-09', end: '2027-08' });
    expect(questionRange('2026 到 2030', '2026-09-25')).toEqual({ start: '2026-09', end: '2029-08' });
  });

  test('「什麼時候適合買車」 → vehicle_purchase, local ranking, top months in the prompt', () => {
    const question = '2026～2027 什麼時候適合買車？';
    const local = localQuestion(report, question)!;
    expect(local.category).toBe('vehicle_purchase');
    expect(local.categoryName).toBe('購車時機');
    expect(local.range).toEqual({ start: '2026-09', end: '2027-12' });
    const top = local.answer!.top;
    expect(top).toHaveLength(3);
    const prompt = buildCopyPrompt(report as never, { focus: 'question', question, questionAnswer: local.answer });
    expect(prompt.text).toContain(`「${question}」`);
    expect(prompt.text).toContain('Question Engine 確定性計算，不是 AI 產生');
    for (const window of top) expect(prompt.text).toContain(`${window.rank}. ${window.window.start.slice(0, 7)}：`);
    expect(prompt.charCount).toBeLessThanOrEqual(24_000);
    const status = renderToStaticMarkup(<QuestionStatus text={question} local={local} ranking={false} />);
    expect(status).toContain('購車時機');
    expect(status).toContain(top.map(window => window.window.start.slice(0, 7)).join('、'));
  });

  test('unknown question → no ranking, prompt still built with the question', () => {
    const question = '我適合養貓嗎？';
    expect(localQuestion(report, question)).toBeNull();
    const prompt = buildCopyPrompt(report as never, { focus: 'question', question });
    expect(prompt.text).toContain(`「${question}」`);
    expect(prompt.text).not.toContain('Question Engine 確定性計算');
    expect(prompt.text).toContain('```json');
    const status = renderToStaticMarkup(<QuestionStatus text={question} local={null} ranking={false} />);
    expect(status).toContain('沒有對應到網站的問事類別');
  });
});

describe('paste-back checker UI', () => {
  test('shows per-paragraph flags with neutral wording', () => {
    const prompt = buildCopyPrompt(report as never, {});
    const id = prompt.payload.payload.signals[0].id;
    const answer = [
      '## 總覽',
      `這段時期的訊號偏向調整〔${id}〕。`,
      '這段時期會有很多變化，建議多留意合約與溝通細節，並保留一些緩衝時間。',
      `這一年注定大凶〔sig_ffffffffffffffff〕。`,
    ].join('\n\n');
    const html = renderToStaticMarkup(<PasteCheckView result={checkPastedAnswer(prompt.payload, answer)} />);
    expect(html).toContain('2 段有需要留意的地方');
    expect(html).toContain('沒有引用來源');
    expect(html).toContain('引用不存在');
    expect(html).toContain('sig_ffffffffffffffff');
    expect(html).toContain('宿命論用語');
    expect(html).toContain('不判斷內容對錯');
    const clean = renderToStaticMarkup(<PasteCheckView result={checkPastedAnswer(prompt.payload, `這段時期偏向調整〔${id}〕。`)} />);
    expect(clean).toContain('沒有發現需要留意的段落');
  });
});
