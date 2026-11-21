import { useState, type FormEvent } from 'react';
import { loadCore } from '../../lib/calendar';
import { chartCandidates, compareChosenTimes, proposedTime, type Comparison } from '../../model/chartCandidates';
import type { Report } from '../../model/types';

function ComparisonTable({ comparison }: { comparison: Comparison }) {
  return <table className="candidate-charts__table">
    <caption>{comparison.label}</caption>
    <thead><tr><th scope="col">部件</th>{comparison.columns.map((value, i) => <th key={i} scope="col">{value}</th>)}</tr></thead>
    <tbody>{comparison.rows.map(row => <tr key={row.label} data-differs={row.a !== row.b || undefined}>
      <th scope="row">{row.label}{row.a !== row.b && <small>不同</small>}</th><td>{row.a}</td><td>{row.b}</td>
    </tr>)}</tbody>
  </table>;
}

export function ChartCandidates({ report }: { report: Report }) {
  const replay = report.replay;
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [chosen, setChosen] = useState<Comparison[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!replay) return null;
  const automatic = chartCandidates(replay.snapshot);
  if (!automatic.length && replay.snapshot.identity.input.timeAccuracy === 'exact') return null;

  async function compare(event: FormEvent) {
    event.preventDefault();
    if (!replay || busy) return;
    setChosen([]);
    setError('');
    setBusy(true);
    try {
      if (first === second) throw new Error('請填兩個不同的候選時間。');
      const a = proposedTime(replay, first);
      const b = proposedTime(replay, second);
      const core = await loadCore();
      setChosen(compareChosenTimes(core.birthTimeSnapshot(a, report.asOf), core.birthTimeSnapshot(b, report.asOf), first, second));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '無法比較這兩個時間。');
    } finally {
      setBusy(false);
    }
  }

  return <details className="candidate-charts">
    <summary>出生時間與口徑：並列比較候選盤</summary>
    <p>候選盤只是假設，不代表推定實際出生時間，也不會更改原命盤或查詢紀錄。</p>
    {automatic.map((item, i) => <ComparisonTable key={i} comparison={item} />)}
    {automatic.length === 0 && <p>沒有自動產生候選盤。若有兩個可能的時間，可手動比較。</p>}
    <form className="candidate-charts__form" onSubmit={compare}>
      <label>假設 A <input type="time" value={first} required disabled={busy} onChange={e => { setFirst(e.target.value); setChosen([]); }} /></label>
      <label>假設 B <input type="time" value={second} required disabled={busy} onChange={e => { setSecond(e.target.value); setChosen([]); }} /></label>
      <button className="button button--quiet" disabled={busy} type="submit">{busy ? '比較中…' : '比較同日兩個民用時間'}</button>
    </form>
    {error && <p role="alert">{error}</p>}
    <div aria-live="polite">{chosen.map(item => <ComparisonTable key={item.label} comparison={item} />)}</div>
  </details>;
}
