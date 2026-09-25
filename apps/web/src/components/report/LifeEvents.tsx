/**
 * 驗 人生事件 — V4-03/V4-04 (ARCHITECTURE-V2 §10.1, D-029, D-033).
 *
 * The reader records things that already happened (year-month, category,
 * domains, note, confidence). Events live only in this browser (localStorage,
 * keyed by a profile fingerprint). On demand the panel builds the person's
 * year-by-year timeline since age 15 and runs the pre-registered backtest:
 * per-domain hit rate vs the person's own random-year baseline. With a handful
 * of events every row is 「樣本不足，僅供參考」— the panel says so and never
 * claims predictive validity.
 */

import { useMemo, useState, type FormEvent } from 'react';
import {
  buildBacktestTimeline, runBacktest, suggestedDomains, validateLifeEvent,
  type BacktestTimeline, type LifeEvent, type LifeEventCategory, type TimeContext,
} from '../../lib/core';
import { cleanEvents, createLifeEventStore, profileKeyOf, type LifeEventStore } from '../../lib/lifeEvents';
import {
  CATEGORY_OPTIONS, DOMAIN_OPTIONS, INSUFFICIENT_LABEL, canBacktest, selectBacktestView, selectEventList,
  type BacktestRowView, type BacktestView,
} from '../../model/backtest';
import type { Report } from '../../model/types';
import { EmptyNote, Section } from '../ui/primitives';

export const LIFE_EVENTS_CHAPTER_ID = 'ch-events';

interface FormState {
  id: string | null;
  month: string;
  category: LifeEventCategory;
  domains: string[];
  description: string;
  confidence: 'certain' | 'approx';
  domainsTouched: boolean;
}

const emptyForm = (): FormState => ({
  id: null, month: '', category: 'job_change', domains: suggestedDomains('job_change'),
  description: '', confidence: 'certain', domainsTouched: false,
});

const newId = () => `ev-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function Row({ row }: { row: BacktestRowView }) {
  return (
    <tr data-insufficient={row.insufficient || undefined}>
      <th scope="row">{row.label}</th>
      <td>{row.n}</td>
      <td>{row.hits}</td>
      <td>{row.hitRate}</td>
      <td>{row.baseline}</td>
      <td>{row.lift}</td>
      <td className="life__status">{row.status}<span className="life__sub">{row.validation}</span></td>
    </tr>
  );
}

function ResultTable({ caption, rows }: { caption: string; rows: BacktestRowView[] }) {
  return (
    <div className="life__table-wrap">
      <table className="life__table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">項目</th><th scope="col">事件數</th><th scope="col">命中</th>
            <th scope="col">命中率</th><th scope="col">基準線</th><th scope="col">倍數</th><th scope="col">判讀</th>
          </tr>
        </thead>
        <tbody>{rows.map(row => <Row key={row.key} row={row} />)}</tbody>
      </table>
    </div>
  );
}

/** Pure results view (exported for tests). */
export function BacktestResults({ view }: { view: BacktestView }) {
  return (
    <div className="life__results">
      {view.allInsufficient && (
        <p className="life__warning" role="note">
          <strong>{INSUFFICIENT_LABEL}</strong>
          每一列的事件數都少於 {view.minSample} 筆。這麼少的事件，命中與否主要是運氣，
          不能拿來判斷時間軸準不準，也不會調整任何權重。
        </p>
      )}
      <ResultTable caption={`各領域：事件落在自己時間軸前 25% 年份的比例（${view.range}）`} rows={[...view.domains, view.overall]} />
      <details className="life__more">
        <summary>各系統與逐筆明細</summary>
        <ResultTable caption="各系統（只算該系統有觸及的領域）" rows={view.systems} />
        <ul className="life__trials">
          {view.trials.map(trial => (
            <li key={trial.key}>
              {trial.year}・{trial.domain}：{trial.score} 分，{trial.hit ? '落在前 25%' : '未落在前 25%'}（{trial.split}）
            </li>
          ))}
        </ul>
      </details>
      <p className="life__method">
        方法（事先固定）：事件所在年份的領域分數，若落在你自己 {view.range} 各年份的前 25%，算一次命中；
        基準線是「隨便挑一年」會命中的比例（約 25%）。倍數 = 命中率 ÷ 基準線。事件隨機分成訓練與驗證兩組，
        只有驗證組達 {view.minSample} 筆以上才可能用來產生新版權重。{view.disclaimer}
      </p>
    </div>
  );
}

export function LifeEvents({ report, store: injected }: { report: Report; store?: LifeEventStore }) {
  const store = useMemo(() => injected ?? createLifeEventStore(), [injected]);
  const profileKey = useMemo(() => profileKeyOf(report.input), [report.input]);
  const [events, setEvents] = useState<LifeEvent[]>(() => store.list(profileKey));
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<BacktestTimeline | null>(null);
  const [computing, setComputing] = useState(false);
  const backtestable = canBacktest(report);

  const result = useMemo(
    () => (timeline && events.length > 0 ? runBacktest(events, timeline, { seed: profileKey }) : null),
    [timeline, events, profileKey],
  );
  const view = result ? selectBacktestView(result) : null;
  const list = selectEventList(events);

  const refresh = () => setEvents(store.list(profileKey));

  function submit(event: FormEvent) {
    event.preventDefault();
    const candidate = {
      id: form.id ?? newId(),
      date: form.month,
      category: form.category,
      domains: form.domains,
      description: form.description.trim() || undefined,
      confidence: form.confidence,
    };
    const checked = validateLifeEvent(candidate);
    if (!checked.ok) {
      setError(!/^\d{4}-\d{2}$/.test(form.month) ? '請填年月。' : form.domains.length === 0 ? '請至少勾選一個領域。' : '資料不完整。');
      return;
    }
    if (store.upsert(profileKey, checked.value)) {
      setError(null);
      refresh();
    } else {
      // Storage unavailable (e.g. private mode): keep the event in memory for this page only.
      setError('無法寫入這個瀏覽器的儲存空間（可能是私密瀏覽模式），事件只保留到關閉頁面。');
      setEvents(current => cleanEvents([...current.filter(item => item.id !== checked.value.id), checked.value]));
    }
    setForm(emptyForm());
  }

  function edit(id: string) {
    const found = events.find(item => item.id === id);
    if (!found) return;
    setForm({
      id: found.id, month: found.date.slice(0, 7), category: found.category, domains: [...found.domains],
      description: found.description ?? '', confidence: found.confidence, domainsTouched: true,
    });
  }

  function remove(id: string) {
    store.remove(profileKey, id);
    setEvents(current => current.filter(item => item.id !== id));
    if (form.id === id) setForm(emptyForm());
  }

  function removeAll() {
    if (typeof window !== 'undefined' && !window.confirm('刪除這份命盤在本機的全部人生事件？此動作無法復原。')) return;
    store.clearProfile(profileKey);
    setEvents([]);
    setForm(emptyForm());
  }

  function compute() {
    setComputing(true);
    // Yield a frame so the busy state paints; the build is synchronous (~1 s).
    setTimeout(() => {
      try {
        setTimeline(buildBacktestTimeline(report.timeContext as unknown as TimeContext, { asOf: report.asOf }));
        setError(null);
      } catch (cause) {
        setError(`回驗計算失敗：${(cause as Error).message}`);
      } finally {
        setComputing(false);
      }
    }, 30);
  }

  const toggleDomain = (domain: string) => setForm(current => ({
    ...current,
    domainsTouched: true,
    domains: current.domains.includes(domain) ? current.domains.filter(item => item !== domain) : [...current.domains, domain],
  }));

  return (
    <Section id={LIFE_EVENTS_CHAPTER_ID} index="驗" title="人生事件" className="life"
      lede="記下已經發生的轉折，對照時序表：它們是否落在你自己時間軸的高分年份。這是自我檢驗，不是預測。">
      <p className="life__privacy" role="note">
        <strong>隱私</strong>人生事件只存在這個瀏覽器（localStorage），不會上傳到任何伺服器；按「刪除全部」或清除瀏覽器資料即永久移除。
      </p>

      <form className="life__form" onSubmit={submit} aria-label={form.id ? '編輯人生事件' : '新增人生事件'}>
        <label className="field">
          <span className="field__label">年月</span>
          <input className="input input--date" type="month" required value={form.month}
            onChange={e => setForm({ ...form, month: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">類別</span>
          <select className="input" value={form.category} onChange={e => {
            const category = e.target.value as LifeEventCategory;
            setForm({ ...form, category, domains: form.domainsTouched ? form.domains : suggestedDomains(category) });
          }}>
            {CATEGORY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <fieldset className="field life__domains">
          <legend className="field__label">相關領域（回驗以領域計）</legend>
          <div className="life__checks">
            {DOMAIN_OPTIONS.map(option => (
              <label key={option.domain} className="check">
                <input type="checkbox" checked={form.domains.includes(option.domain)} onChange={() => toggleDomain(option.domain)} />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="field life__note">
          <span className="field__label">備註（選填）</span>
          <input className="input" type="text" maxLength={500} value={form.description} placeholder="例：北上、進醫院藥局"
            onChange={e => setForm({ ...form, description: e.target.value })} />
        </label>
        <fieldset className="segmented">
          <legend className="field__label">時間確定程度</legend>
          <div className="segmented__track">
            {([['certain', '確定'], ['approx', '大約']] as const).map(([value, label]) => (
              <label key={value} className="segmented__option">
                <input type="radio" name="life-confidence" value={value} checked={form.confidence === value}
                  onChange={() => setForm({ ...form, confidence: value })} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="life__actions">
          <button type="submit" className="button button--seal">{form.id ? '儲存修改' : '新增事件'}</button>
          {form.id && <button type="button" className="button button--quiet" onClick={() => setForm(emptyForm())}>取消編輯</button>}
        </div>
        {error && <p className="life__error" role="alert">{error}</p>}
      </form>

      {list.length === 0 ? (
        <EmptyNote>還沒有事件。至少記下幾件確定年份的大事（畢業、換工作、搬家…）再看回驗。</EmptyNote>
      ) : (
        <>
          <ol className="life__list" aria-label="已記錄的人生事件">
            {list.map(item => (
              <li key={item.id} className="life__item">
                <span className="life__date">{item.date}{item.approx ? '（約）' : ''}</span>
                <span className="life__what">{item.category}・{item.domains}{item.description ? `：${item.description}` : ''}</span>
                <span className="life__item-actions">
                  <button type="button" className="button button--quiet" onClick={() => edit(item.id)}>編輯</button>
                  <button type="button" className="button button--quiet" onClick={() => remove(item.id)}>刪除</button>
                </span>
              </li>
            ))}
          </ol>
          <div className="life__actions">
            <button type="button" className="button button--quiet life__delete-all" onClick={removeAll}>刪除全部</button>
          </div>
        </>
      )}

      {!backtestable ? (
        <EmptyNote>這份報告沒有時間脈絡（舊版報告），請重新排盤後再回驗。</EmptyNote>
      ) : list.length > 0 && (
        <div className="life__backtest">
          {!timeline && (
            <button type="button" className="button button--quiet" onClick={compute} disabled={computing} aria-busy={computing || undefined}>
              {computing ? '計算中…' : '計算回驗（逐年時間軸，約需 1 秒）'}
            </button>
          )}
          {view && <BacktestResults view={view} />}
        </div>
      )}
    </Section>
  );
}
