/**
 * 貼回 Claude 桌面版的回答來檢查（M4-03）。
 *
 * 與「複製 prompt」那條路的 `checkPastedAnswer` 不同：這裡的回答來自本機 MCP，引用的是
 * `get_signal`／`answer_question` 回傳的 sig_ 編號，所以用跟 MCP `check_answer` 同一個
 * `checkAnswer`，以報告本身的訊號（含月份訊號）查編號。編號可貼短編號（sig_ 加 8 位）、完整編號或
 * 至少 8 位的前綴：前綴要在這份報告裡唯一才算數，對到多筆或查不到都標「查不到」，不猜。
 * 只標示、不改寫，是否採信由讀者判斷。
 */

import { useEffect, useRef, useState } from 'react';
import { checkAnswer, type AnswerIssueCode, type CheckAnswerResult } from '@fortune/ai/mcp';
import { reportSignalLookup } from '../../model/askAi';
import type { Report } from '../../model/types';

const ISSUE_LABELS: Record<AnswerIssueCode, string> = {
  unknown_citation: '引用的訊號編號查不到',
  honesty_violation: '宿命論或保證式用語',
  experimental_as_consensus: '把實驗性系統算進高共識',
  high_consensus_unsupported: '「高共識」缺乏至少 3 套同向計算證據',
};

/** Pure result view (exported for tests). */
export function AnswerCheckView({ result }: { result: CheckAnswerResult }) {
  return (
    <div className="ask__check" aria-live="polite">
      <p className="ask__summary">
        共 {result.paragraphCount} 段，引用了 {result.citedIds.length} 個訊號；
        {result.ok ? '程式比對沒有發現需要留意的地方。' : `${result.issues.length} 個地方需要留意：`}
      </p>
      {result.issues.length > 0 && (
        <ol className="ask__flags">
          {result.issues.map((issue, index) => (
            <li key={`${issue.paragraph}-${issue.code}-${index}`} className="ask__flag-item">
              <p className="ask__excerpt">
                <span className="ask__para">第 {issue.paragraph + 1} 段</span>{issue.excerpt}
              </p>
              <ul className="ask__chips">
                <li className="ask__chip" data-flag={issue.code}>
                  {ISSUE_LABELS[issue.code]}
                  {issue.values.length > 0 && <span className="ask__values">：{issue.values.join('、')}</span>}
                </li>
              </ul>
            </li>
          ))}
        </ol>
      )}
      <p className="ask__method">
        這是程式比對，不判斷內容對錯：只檢查引用的 sig_ 編號（短編號 sig_ 加 8 位、完整編號都可以，前綴要唯一）是否存在於這份報告、有沒有宿命論或保證式用語，
        以及「高共識」是否有同一領域／時間窗至少 3 套正權重、非實驗性系統的同向證據；共同關注不等於高共識，缺證據只表示無法確認。
      </p>
    </div>
  );
}

export function AnswerCheck({ report }: { report: Report }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<{ report: Report; text: string; value: CheckAnswerResult } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ report: Report; text: string } | null>(null);
  // One lookup per report: month signals are built per year (~1 s each) and cached inside it.
  const lookupRef = useRef<{ report: Report; lookup: ReturnType<typeof reportSignalLookup> } | null>(null);

  const active = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const currentReport = useRef(report);
  currentReport.current = report;
  function cancel() {
    generation.current++;
    active.current?.abort();
    active.current = null;
  }
  useEffect(() => {
    cancel();
    setBusy(false);
    setResult(null);
    setFailure(null);
    return cancel;
  }, [report]);

  async function run() {
    if (!text.trim() || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    const request = ++generation.current;
    const isCurrent = () => !controller.signal.aborted && request === generation.current && currentReport.current === report;
    setBusy(true);
    setResult(null);
    setFailure(null);
    if (lookupRef.current?.report !== report) lookupRef.current = { report, lookup: reportSignalLookup(report) };
    const lookup = lookupRef.current.lookup;
    try {
      // Reuse the authoritative citation parser without any expensive lookup work.
      const ids = checkAnswer(text, { signalLookup: () => null }).citedIds;
      await lookup.prepare(ids, controller.signal);
      if (!isCurrent()) return;
      const value = checkAnswer(text, { signalLookup: lookup, directionalEvidence: () => lookup.directionalEvidence() });
      if (isCurrent()) setResult({ report, text, value });
    } catch {
      if (isCurrent()) setFailure({ report, text });
    } finally {
      if (isCurrent()) {
        active.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <div className="ask__paste-block">
      <label className="field">
        <span className="field__label">Claude 的回答（選填）</span>
        <textarea className="input ask__textarea" rows={6} value={text} maxLength={20000}
          placeholder="把 Claude 桌面版的完整回答貼在這裡（引用的 sig_ 編號可以是短編號）"
          onChange={event => { cancel(); setBusy(false); setText(event.target.value); setResult(null); setFailure(null); }} />
      </label>
      <div className="ask__actions">
        <button type="button" className="button button--quiet" onClick={run} disabled={busy || !text.trim()}>
          檢查引用的訊號
        </button>
        {busy && <span className="ask__copied" role="status" aria-busy="true">正在對照訊號編號（最久約十幾秒）…</span>}
      </div>
      {failure && failure.report === report && failure.text === text && !busy && <p role="alert">訊號檢查未完成，請重試</p>}
      {result && result.report === report && result.text === text && !busy && <AnswerCheckView result={result.value} />}
    </div>
  );
}
