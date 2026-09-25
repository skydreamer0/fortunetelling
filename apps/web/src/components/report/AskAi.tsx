/**
 * 問 AI — copy-paste prompt (D-035, V5-05).
 *
 * The site assembles one self-contained prompt (rules + output format +
 * de-identified report data + optional question and the site's deterministic
 * month ranking) that the reader pastes into their OWN chat AI. No API key, no
 * server: nothing is sent anywhere by this page. The optional paste-back box
 * runs the same program checks as the AI layer (citations exist, no chart terms
 * outside the data, no fatalistic wording) — advisory only.
 */

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { buildCopyPrompt, checkPastedAnswer, type CopyPromptFocus, type PasteCheckResult } from '@fortune/ai/copy';
import { localQuestion, matchQuestionCategory, questionRange, type LocalQuestion } from '../../model/askAi';
import type { Report } from '../../model/types';
import { Section } from '../ui/primitives';

export const ASK_AI_CHAPTER_ID = 'ch-ask';

const FOCUS_OPTIONS: ReadonlyArray<{ value: CopyPromptFocus; label: string }> = [
  { value: 'overview', label: '總覽' },
  { value: 'year', label: '本年' },
  { value: 'question', label: '我有問題' },
];

export type CopyOutcome = 'clipboard' | 'selected' | 'failed';

/**
 * Copy with the Clipboard API; when it is missing or refused, fall back to
 * selecting the preview text (and trying the legacy copy command).
 */
export async function copyText(
  text: string,
  env: { clipboard?: { writeText(value: string): Promise<void> } | null; select?: () => boolean },
): Promise<CopyOutcome> {
  if (env.clipboard?.writeText) {
    try {
      await env.clipboard.writeText(text);
      return 'clipboard';
    } catch {
      // fall through to the selection fallback
    }
  }
  return env.select?.() ? 'selected' : 'failed';
}

const COPY_MESSAGES: Record<CopyOutcome, string> = {
  clipboard: '已複製。貼到你自己的 AI 對話框即可。',
  selected: '已選取全文，請按 Ctrl+C（手機請長按選單）複製。',
  failed: '無法自動複製，請手動選取上方文字複製。',
};

/** Pure paste-back result view (exported for tests). */
export function PasteCheckView({ result }: { result: PasteCheckResult }) {
  const flagged = result.paragraphs.filter(paragraph => paragraph.flags.length > 0);
  return (
    <div className="ask__check" aria-live="polite">
      <p className="ask__summary">
        共 {result.paragraphs.length} 段，引用了 {result.citedIds.length} 個訊號；
        {flagged.length === 0 ? '程式比對沒有發現需要留意的段落。' : `${flagged.length} 段有需要留意的地方：`}
      </p>
      {flagged.length > 0 && (
        <ol className="ask__flags">
          {flagged.map(paragraph => (
            <li key={paragraph.index} className="ask__flag-item">
              <p className="ask__excerpt">
                <span className="ask__para">第 {paragraph.index + 1} 段{paragraph.heading ? `・${paragraph.heading}` : ''}</span>
                {paragraph.text.length > 90 ? `${paragraph.text.slice(0, 90)}…` : paragraph.text}
              </p>
              <ul className="ask__chips">
                {paragraph.flags.map(flag => (
                  <li key={flag.code} className="ask__chip" data-flag={flag.code}>
                    {flag.label}{flag.values.length > 0 && <span className="ask__values">：{flag.values.join('、')}</span>}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
      <p className="ask__method">
        這是程式比對，不判斷內容對錯：只檢查引用的 sig_ 編號是否存在、是否提到資料裡沒有的干支／星曜／行星、
        內容段落有沒有引用，以及是否出現宿命論用語。網站無法控制外部 AI 的回答，是否採信由你判斷。
      </p>
    </div>
  );
}

/** Mapping status under the question box (exported for tests). */
export function QuestionStatus({ text, local, ranking }: { text: string; local: LocalQuestion | null; ranking: boolean }) {
  if (!text.trim()) return <p className="ask__status">可留空；留空時 AI 只做整體解讀。</p>;
  if (ranking) return <p className="ask__status" aria-busy="true">對應到網站的問事類別，正在計算月份排名（約 1–2 秒）…</p>;
  if (!local) {
    return <p className="ask__status">沒有對應到網站的問事類別：prompt 只附上你的問題，不附月份排名。</p>;
  }
  const top = local.answer?.top ?? [];
  return (
    <p className="ask__status" data-category={local.category}>
      對應問事類別「{local.categoryName}」，範圍 {local.range.start}～{local.range.end}。
      {top.length > 0
        ? <>網站計算的前 {top.length} 個月份：<strong>{top.map(window => window.window.start.slice(0, 7)).join('、')}</strong>（已附在 prompt 裡，由程式計算，不是 AI）。</>
        : '這份報告無法計算月份排名，prompt 只附上你的問題。'}
    </p>
  );
}

export function AskAi({ report, clipboard }: {
  report: Report;
  /** Injected for tests; defaults to `navigator.clipboard`. */
  clipboard?: { writeText(value: string): Promise<void> } | null;
}) {
  const [focus, setFocus] = useState<CopyPromptFocus>('overview');
  const [question, setQuestion] = useState('');
  const [pasted, setPasted] = useState('');
  const [copyState, setCopyState] = useState<CopyOutcome | null>(null);
  const previewRef = useRef<HTMLTextAreaElement>(null);

  const askText = focus === 'question' ? question : '';
  const deferredQuestion = useDeferredValue(askText);
  // Only the category + range decide the (expensive) local ranking; typing other words reuses it.
  const category = matchQuestionCategory(deferredQuestion);
  const range = category ? questionRange(deferredQuestion, report.asOf) : null;
  const localKey = category && range ? `${category}|${range.start}|${range.end}` : '';
  // The ranking needs one timeline build per calendar year (~1 s each), so it runs after
  // paint, only when the category or range changes; the prompt is rebuilt when it lands.
  const [ranked, setRanked] = useState<{ key: string; local: LocalQuestion } | null>(null);
  const questionRef = useRef(deferredQuestion);
  questionRef.current = deferredQuestion;
  useEffect(() => {
    if (!localKey || ranked?.key === localKey) return;
    const timer = setTimeout(() => {
      const result = localQuestion(report, questionRef.current);
      if (result) setRanked({ key: localKey, local: result });
    }, 30);
    return () => clearTimeout(timer);
  }, [report, localKey, ranked?.key]);
  const local = localKey && ranked?.key === localKey ? ranked.local : null;
  const ranking = Boolean(localKey) && !local;

  const prompt = useMemo(() => buildCopyPrompt(report as never, {
    focus,
    question: deferredQuestion || undefined,
    questionAnswer: local?.answer ?? null,
  }), [report, focus, deferredQuestion, local]);

  const deferredPasted = useDeferredValue(pasted);
  const check = useMemo(
    () => (deferredPasted.trim() ? checkPastedAnswer(prompt.payload, deferredPasted) : null),
    [prompt.payload, deferredPasted],
  );

  async function copy() {
    const outcome = await copyText(prompt.text, {
      clipboard: clipboard !== undefined ? clipboard : (typeof navigator !== 'undefined' ? navigator.clipboard : null),
      select: () => {
        const node = previewRef.current;
        if (!node) return false;
        node.focus();
        node.select();
        try {
          document.execCommand?.('copy');
        } catch {
          // selection alone is enough for a manual copy
        }
        return true;
      },
    });
    setCopyState(outcome);
  }

  return (
    <Section id={ASK_AI_CHAPTER_ID} index="問" title="AI 解讀" className="ask"
      lede="網站把報告整理成一段指令，你貼到自己慣用的 AI（ChatGPT、Claude、Gemini…）就能得到文字解讀。不需要金鑰，網站也不會替你送出任何資料。">
      <p className="ask__privacy" role="note">
        <strong>隱私</strong>prompt 不含姓名、出生地、出生日期與時間，只有計算結果（命盤摘要、訊號、分數）。
        要不要貼、貼給哪個 AI，由你決定。
      </p>

      <div className="ask__controls">
        <fieldset className="segmented">
          <legend className="field__label">解讀重點</legend>
          <div className="segmented__track">
            {FOCUS_OPTIONS.map(option => (
              <label key={option.value} className="segmented__option">
                <input type="radio" name="ask-focus" value={option.value} checked={focus === option.value}
                  onChange={() => { setFocus(option.value); setCopyState(null); }} />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {focus === 'question' && (
          <label className="field ask__question">
            <span className="field__label">你的問題（選填）</span>
            <textarea className="input ask__textarea" rows={2} maxLength={500} value={question}
              placeholder="例：2026～2027 什麼時候適合買車？"
              onChange={event => { setQuestion(event.target.value); setCopyState(null); }} />
            <QuestionStatus text={deferredQuestion} local={local} ranking={ranking} />
          </label>
        )}
      </div>

      <div className="ask__preview">
        <div className="ask__preview-head">
          <span className="field__label">prompt 預覽（唯讀）</span>
          <span className="ask__count">
            <span className="ask__num">{prompt.charCount.toLocaleString('en-US')}</span> 字
            {prompt.truncated && '・為符合聊天長度已精簡（prompt 內有說明）'}
          </span>
        </div>
        <textarea ref={previewRef} className="input ask__textarea ask__prompt" readOnly rows={12}
          value={prompt.text} aria-label="AI prompt 預覽" spellCheck={false} />
        <div className="ask__actions">
          <button type="button" className="button button--seal" onClick={copy}>複製 prompt</button>
          {copyState && <span className="ask__copied" role="status">{COPY_MESSAGES[copyState]}</span>}
        </div>
      </div>

      <ol className="ask__steps">
        <li>按「複製 prompt」。</li>
        <li>開啟你自己的 AI 對話（ChatGPT、Claude、Gemini 等），貼上後送出。</li>
        <li>回答裡的〔sig_…〕是訊號編號，可以對照本報告；想檢查回答，把它貼回下方。</li>
      </ol>

      <details className="ask__paste" open={pasted.length > 0 || undefined}>
        <summary>貼回 AI 的回答來檢查（選填）</summary>
        <label className="field">
          <span className="field__label">AI 的回答</span>
          <textarea className="input ask__textarea" rows={6} value={pasted}
            placeholder="把 AI 的完整回答貼在這裡" onChange={event => setPasted(event.target.value)} />
        </label>
        {check && <PasteCheckView result={check} />}
      </details>
    </Section>
  );
}
