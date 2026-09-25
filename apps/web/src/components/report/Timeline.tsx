/**
 * 參 時序 — Timeline (ARCHITECTURE-V2 §7): domains × 5 years, the asOf year's
 * months, and a detail panel listing the rules behind any cell.
 *
 * Reads only `model/selectors` (D-015). Scores stay 0–100 in the data; the grid
 * shows the four bands 低／中／中高／高 and exposes the number on hover, focus,
 * in the detail panel and in the data table.
 */

import { useMemo, useState, type KeyboardEvent } from 'react';
import {
  BAND_ORDER, HEADLINE_DOMAINS, findTimelineCell, selectTimelineMeta, selectTimelineMonths, selectTimelineYears,
  type TimelineCellView, type TimelineConflictSide, type TimelineGrid, type TimelineMeta,
} from '../../model/selectors';
import type { Report } from '../../model/types';
import { EmptyNote, Section } from '../ui/primitives';

const formatScore = (score: number) => (Number.isInteger(score) ? String(score) : score.toFixed(1));

function cellLabel(cell: TimelineCellView): string {
  const when = cell.grain === 'year' ? `${cell.periodLabel} 年` : cell.periodLabel;
  if (cell.empty) return `${cell.domainLabel} ${when}：無規則觸發`;
  const notes = [cell.highConsensus ? '高共識' : '', cell.conflict ? '系統間有分歧' : ''].filter(Boolean).join('，');
  return `${cell.domainLabel} ${when}：${cell.band}，${formatScore(cell.score)} 分${notes ? `，${notes}` : ''}`;
}

/** Only rows whose domain is in `domains` (keeps the grid's period columns). */
export function pickRows(grid: TimelineGrid, domains: readonly string[], include = true): TimelineGrid {
  return { ...grid, rows: grid.rows.filter(row => domains.includes(row.domain) === include) };
}

/** Arrow keys / Home / End move focus between cells of one table (roving tabindex). */
function moveFocus(event: KeyboardEvent<HTMLTableElement>) {
  const target = event.target as HTMLElement;
  const row = Number(target.dataset.r);
  const col = Number(target.dataset.c);
  if (!Number.isInteger(row) || !Number.isInteger(col)) return;
  const delta: Record<string, [number, number]> = {
    ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0],
  };
  let next: HTMLElement | null = null;
  const table = event.currentTarget;
  if (event.key in delta) {
    const [dr, dc] = delta[event.key];
    next = table.querySelector<HTMLElement>(`[data-r="${row + dr}"][data-c="${col + dc}"]`);
  } else if (event.key === 'Home') {
    next = table.querySelector<HTMLElement>(`[data-r="${row}"][data-c="0"]`);
  } else if (event.key === 'End') {
    const cells = table.querySelectorAll<HTMLElement>(`[data-r="${row}"]`);
    next = cells[cells.length - 1] ?? null;
  }
  if (!next) return;
  event.preventDefault();
  table.querySelectorAll<HTMLElement>('[data-r]').forEach(node => { node.tabIndex = -1; });
  next.tabIndex = 0;
  next.focus();
}

interface TimelineTableProps {
  grid: TimelineGrid;
  caption: string;
  selected: string | null;
  onSelect: (key: string) => void;
  className?: string;
}

/**
 * One band grid as a real table: row headers = domains, column headers = periods,
 * each cell a toggle button. Hook-free so tests can walk the element tree.
 */
export function TimelineTable({ grid, caption, selected, onSelect, className = '' }: TimelineTableProps) {
  const cells = grid.rows.flatMap(row => row.cells);
  const tabStop = cells.find(cell => cell.key === selected)?.key
    ?? cells.find(cell => cell.isCurrent)?.key ?? cells[0]?.key;
  return (
    <table className={`tl-grid tl-grid--${grid.grain} ${className}`} onKeyDown={moveFocus}>
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col" className="tl-grid__corner"><span className="sr-only">領域</span></th>
          {grid.periods.map(period => (
            <th key={period.start} scope="col" className={period.isCurrent ? 'tl-grid__period is-current' : 'tl-grid__period'}
              aria-current={period.isCurrent ? 'date' : undefined}>
              {period.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {grid.rows.map((row, r) => (
          <tr key={row.domain}>
            <th scope="row" className="tl-grid__domain">
              <span className="tl-grid__icon" aria-hidden="true">{row.icon}</span>{row.label}
            </th>
            {row.cells.map((cell, c) => (
              <td key={cell.key} className={cell.isCurrent ? 'is-current' : undefined}>
                <button
                  type="button"
                  className="tl-cell"
                  data-band={cell.empty ? 'none' : cell.band}
                  data-key={cell.key}
                  data-r={r}
                  data-c={c}
                  tabIndex={cell.key === tabStop ? 0 : -1}
                  aria-pressed={cell.key === selected}
                  aria-label={cellLabel(cell)}
                  title={cell.empty ? '此期間沒有規則觸發' : `${formatScore(cell.score)} 分`}
                  onClick={() => onSelect(cell.key)}
                >
                  <span className="tl-cell__band" aria-hidden="true">{cell.empty ? '—' : cell.band}</span>
                  {(cell.highConsensus || cell.conflict) && (
                    <span className="tl-cell__marks" aria-hidden="true">
                      {cell.highConsensus && <span className="tl-cell__mark tl-cell__mark--consensus">共</span>}
                      {cell.conflict && <span className="tl-cell__mark tl-cell__mark--conflict">歧</span>}
                    </span>
                  )}
                  {!cell.empty && <span className="tl-cell__score" aria-hidden="true">{formatScore(cell.score)}</span>}
                </button>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ConflictList({ title, items }: { title: string; items: TimelineConflictSide[] }) {
  return (
    <div className="tl-conflict__side">
      <p className="tl-conflict__title">{title}</p>
      <ul>
        {items.map(item => (
          <li key={item.id}>
            <span className="tl-conflict__system">{item.systemName}</span>
            <span>{item.label}</span>
            {item.text && <span className="tl-conflict__text">{item.text}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Detail panel: why a cell has its band — every top signal with its evidence. */
export function TimelineDetail({ cell }: { cell: TimelineCellView | null }) {
  if (!cell) {
    return (
      <aside className="tl-detail tl-detail--idle" aria-live="polite">
        <p>點選任一格，查看是哪些規則造成這個標示。</p>
      </aside>
    );
  }
  const when = cell.grain === 'year' ? `${cell.periodLabel} 年` : `${cell.start.slice(0, 4)} 年 ${cell.periodLabel}`;
  return (
    <aside className="tl-detail" aria-live="polite" aria-labelledby="tl-detail-title">
      <header className="tl-detail__head">
        <p className="tl-detail__kicker">
          {when}{cell.isCurrent ? (cell.grain === 'year' ? '・今年' : '・本月') : ''}
        </p>
        <h3 id="tl-detail-title" className="tl-detail__title">
          <span aria-hidden="true">{cell.icon}</span>{cell.domainLabel}
        </h3>
        <p className="tl-detail__score">
          <span className="tl-detail__band" data-band={cell.empty ? 'none' : cell.band}>{cell.empty ? '無訊號' : cell.band}</span>
          <span className="tl-detail__number">{formatScore(cell.score)}</span><small>／100</small>
        </p>
      </header>

      <div className="tl-detail__flags">
        {cell.highConsensus && <span className="tl-badge tl-badge--consensus">高共識</span>}
        {!cell.empty && (
          <span className="tl-detail__consensus">
            {cell.consensus} 個系統訊號達門檻・來源：{cell.systems.join('、') || '—'}
          </span>
        )}
      </div>

      {cell.conflict && (
        <div className="tl-conflict" role="note">
          <p className="tl-conflict__head">系統間有分歧</p>
          <p className="tl-conflict__lede">不同系統對這個領域給出相反方向的訊號；分數不會把兩者互相抵銷，兩邊都列出。</p>
          <div className="tl-conflict__sides">
            <ConflictList title="偏支持" items={cell.conflict.positive} />
            <ConflictList title="偏壓力" items={cell.conflict.negative} />
          </div>
        </div>
      )}

      {cell.empty ? (
        <p className="tl-detail__empty">此期間沒有規則觸發，分數以 0 計。這表示沒有可用訊號，不表示這個領域低落。</p>
      ) : (
        <ol className="tl-signals" aria-label="主要訊號">
          {cell.topSignals.map(signal => (
            <li key={signal.id} className="tl-signal" data-system={signal.system}>
              <p className="tl-signal__head">
                <span className="tl-signal__system">{signal.systemName}</span>
                <span className="tl-signal__rule">{signal.ruleLabel}</span>
                <code className="tl-signal__id">{signal.ruleId}</code>
              </p>
              <p className="tl-signal__text">{signal.text}</p>
              <p className="tl-signal__meta">
                <span>特徵：{signal.traitLabel}</span>
                <span>方向：{signal.direction}</span>
                <span className="tl-signal__intensity">
                  強度 {Math.round(signal.intensity * 100)}%
                  <span className="tl-signal__bar" aria-hidden="true"><span style={{ width: `${Math.round(signal.intensity * 100)}%` }} /></span>
                </span>
              </p>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}

function Legend({ cuts }: { cuts: TimelineMeta['bandCuts'] }) {
  const ranges = [`0–${cuts[0]}`, `${cuts[0]}–${cuts[1]}`, `${cuts[1]}–${cuts[2]}`, `${cuts[2]}–100`];
  return (
    <ul className="tl-legend" aria-label="標示說明">
      {BAND_ORDER.map((band, index) => (
        <li key={band}><span className="tl-legend__swatch" data-band={band} aria-hidden="true" />{band}<small>{ranges[index]}</small></li>
      ))}
      <li><span className="tl-legend__swatch" data-band="none" aria-hidden="true" />—<small>無訊號</small></li>
      <li><span className="tl-cell__mark tl-cell__mark--consensus" aria-hidden="true">共</span><small>高共識</small></li>
      <li><span className="tl-cell__mark tl-cell__mark--conflict" aria-hidden="true">歧</span><small>系統間有分歧</small></li>
    </ul>
  );
}

function DataTable({ grid, caption }: { grid: TimelineGrid; caption: string }) {
  return (
    <table className="audit__table tl-data">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">領域</th>
          {grid.periods.map(period => <th key={period.start} scope="col">{period.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {grid.rows.map(row => (
          <tr key={row.domain}>
            <th scope="row">{row.label}</th>
            {row.cells.map(cell => (
              <td key={cell.key}>{cell.empty ? '—' : `${cell.band} ${formatScore(cell.score)}`}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function defaultSelection(years: TimelineGrid | null): string | null {
  const first = years?.rows[0];
  return first?.cells.find(cell => cell.isCurrent)?.key ?? first?.cells[0]?.key ?? null;
}

interface TimelineViewProps {
  years: TimelineGrid | null;
  months: TimelineGrid | null;
  meta: TimelineMeta | null;
  schemaVersion: number;
  selected: string | null;
  onSelect: (key: string) => void;
}

/** Stateless body of the chapter (selection is owned by `Timeline`). */
export function TimelineView({ years, months, meta, schemaVersion, selected, onSelect }: TimelineViewProps) {
  if (!years || !meta) {
    return (
      <EmptyNote>
        這份報告沒有時序資料（報告格式 v{schemaVersion}）。時序需要新版計算核心產生；其他章節不受影響。
      </EmptyNote>
    );
  }
  const headline = pickRows(years, HEADLINE_DOMAINS);
  const others = pickRows(years, HEADLINE_DOMAINS, false);
  const monthStrip = months ? pickRows(months, HEADLINE_DOMAINS) : null;
  const cell = findTimelineCell(selected, years, months);
  const span = `${years.periods[0]?.label}–${years.periods[years.periods.length - 1]?.label}`;
  const asOfYear = meta.asOf.slice(0, 4);

  return (
    <div className="timeline">
      <div className="timeline__main">
        <div className="timeline__block">
          <h3 className="subhead">{span} 各領域訊號強度</h3>
          <Legend cuts={meta.bandCuts} />
          <div className="tl-scroll">
            <TimelineTable grid={headline} caption={`${span} 主要四領域`} selected={selected} onSelect={onSelect} />
          </div>
          {others.rows.length > 0 && (
            <details className="audit tl-more">
              <summary>其他 {others.rows.length} 個領域（{others.rows.map(row => row.label).join('、')}）</summary>
              <div className="tl-scroll">
                <TimelineTable grid={others} caption={`${span} 其他領域`} selected={selected} onSelect={onSelect} />
              </div>
            </details>
          )}
        </div>

        {monthStrip && (
          <div className="timeline__block">
            <h3 className="subhead">{asOfYear} 年逐月</h3>
            <div className="tl-scroll">
              <TimelineTable grid={monthStrip} caption={`${asOfYear} 年逐月，主要四領域`} selected={selected} onSelect={onSelect} />
            </div>
          </div>
        )}
      </div>

      <div className="timeline__side">
        <TimelineDetail cell={cell} />
      </div>

      <div className="timeline__notes">
        <details className="audit">
          <summary>分數資料表</summary>
          <p className="audit__lede">每格為「標示 分數」，分數 0–100；「—」表示該期間沒有規則觸發。</p>
          <div className="tl-scroll">
            <DataTable grid={years} caption={`${span} 各領域分數`} />
          </div>
          {months && (
            <div className="tl-scroll">
              <DataTable grid={months} caption={`${asOfYear} 年逐月各領域分數`} />
            </div>
          )}
        </details>

        <ul className="footnote tl-footnote">
          <li>
            納入系統：{meta.systems.join('、') || '無'}。
            {meta.skipped.length > 0 && <>未納入：{meta.skipped.map(item => `${item.name}（${item.reason}）`).join('、')}。</>}
          </li>
          <li>
            分數是規則訊號的彙整強度，代表這段期間該領域被觸發得多或少、強或弱，不代表順利與否；方向請看每則訊號的「支持／壓力」。
          </li>
          <li>
            分數尚未經過校準，屬研究用的觀察訊號，不是預測。標示切點為 {meta.bandCuts.join('／')}。
          </li>
          <li>
            年格以國曆整年計；八字以立春、紫微以農曆新年換年，所以每年頭約五到七週實際屬於前一個流年。
          </li>
        </ul>
      </div>
    </div>
  );
}

export function Timeline({ report, initialSelected }: { report: Report; initialSelected?: string | null }) {
  const years = useMemo(() => selectTimelineYears(report), [report]);
  const months = useMemo(() => selectTimelineMonths(report), [report]);
  const meta = useMemo(() => selectTimelineMeta(report), [report]);
  const [selected, setSelected] = useState<string | null>(() => initialSelected ?? defaultSelection(years));

  return (
    <Section id="ch-timeline" index="參" title="時序"
      lede="未來五年與今年各月，十個生活領域被多少規則觸發。點選任一格，可以看到背後的規則與原文依據。">
      <TimelineView years={years} months={months} meta={meta} schemaVersion={report.schemaVersion}
        selected={selected} onSelect={setSelected} />
    </Section>
  );
}
