/**
 * 貼回 Claude 桌面版的回答來檢查（M4-03）。
 *
 * 與「複製 prompt」那條路的 `checkPastedAnswer` 不同：這裡的回答來自本機 MCP，引用的是
 * `get_signal`／`answer_question` 回傳的 sig_ 編號，所以用跟 MCP `check_answer` 同一個
 * `checkAnswer`，以報告本身的訊號（含月份訊號）查編號。只標示、不改寫，是否採信由讀者判斷。
 */

import { useRef, useState } from 'react';
import { checkAnswer, type AnswerIssueCode, type CheckAnswerResult } from '@fortune/ai/mcp';
import { reportSignalLookup } from '../../model/askAi';
import type { Report } from '../../model/types';

const ISSUE_LABELS: Record<AnswerIssueCode, string> = {
  unknown_citation: '引用的訊號編號查不到',
  honesty_violation: '宿命論或保證式用語',
  experimental_as_consensus: '把實驗性系統算進高共識',
  high_consensus_unsupported: '「高共識」引用的已驗證系統不足 3 套',
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
        這是程式比對，不判斷內容對錯：只檢查引用的 sig_ 編號是否存在於這份報告、有沒有宿命論或保證式用語，
        以及「高共識」是否有至少 3 套已驗證系統支持（吠陀占星是實驗性系統，不計入）。
      </p>
    </div>
  );
}

export function AnswerCheck({ report }: { report: Report }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<CheckAnswerResult | null>(null);
  const [busy, setBusy] = useState(false);
  // One lookup per report: month signals are built per year (~1 s each) and cached inside it.
  const lookupRef = useRef<{ report: Report; lookup: ReturnType<typeof reportSignalLookup> } | null>(null);

  function run() {
    if (!text.trim()) return;
    setBusy(true);
    // Let the "checking" state paint first: an unknown id scans every year of month signals.
    setTimeout(() => {
      if (lookupRef.current?.report !== report) lookupRef.current = { report, lookup: reportSignalLookup(report) };
      try {
        setResult(checkAnswer(text, { signalLookup: lookupRef.current.lookup }));
      } finally {
        setBusy(false);
      }
    }, 30);
  }

  return (
    <div className="ask__paste-block">
      <label className="field">
        <span className="field__label">Claude 的回答（選填）</span>
        <textarea className="input ask__textarea" rows={6} value={text} maxLength={20000}
          placeholder="把 Claude 桌面版的完整回答貼在這裡"
          onChange={event => { setText(event.target.value); setResult(null); }} />
      </label>
      <div className="ask__actions">
        <button type="button" className="button button--quiet" onClick={run} disabled={busy || !text.trim()}>
          檢查引用的訊號
        </button>
        {busy && <span className="ask__copied" role="status" aria-busy="true">正在對照訊號編號（最久約十幾秒）…</span>}
      </div>
      {result && !busy && <AnswerCheckView result={result} />}
    </div>
  );
}
