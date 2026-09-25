/** Landing / intake page: introduction, mode switch, form and recent queries. */

import { useState } from 'react';
import type { RecentQuery } from '../../lib/store';
import type { BirthInput } from '../../model/types';
import { BirthForm, EXAMPLE_INPUT } from './BirthForm';
import { CompatForm } from './CompatForm';
import { shichenLabel } from './fields';

export type Mode = 'single' | 'compat';

const SYSTEMS = [
  { id: 'bazi', name: '八字', note: '四柱、十神、大運' },
  { id: 'ziwei', name: '紫微斗數', note: '十二宮、四化、大限' },
  { id: 'numerology', name: '生命靈數', note: '主命數、九宮格、流年數' },
  { id: 'dreamspell', name: '馬雅曆', note: 'Kin、調性、圖騰' },
  { id: 'minggua', name: '八宅命卦', note: '東西四命、吉凶方位' },
];

interface InputViewProps {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  lastInput: BirthInput | null;
  lastPair: { first: BirthInput; second: BirthInput } | null;
  recent: RecentQuery[];
  onAnalyze: (input: BirthInput) => void;
  onCompare: (first: BirthInput, second: BirthInput) => void;
  onClearRecent: () => void;
}

export function InputView({ mode, onModeChange, lastInput, lastPair, recent, onAnalyze, onCompare, onClearRecent }: InputViewProps) {
  // Re-keying the form resets its internal state when a recent query or the example is chosen.
  const [seed, setSeed] = useState<{ key: number; input: BirthInput | null }>({ key: 0, input: lastInput });
  const load = (input: BirthInput) => setSeed(previous => ({ key: previous.key + 1, input }));

  return (
    <div className="intake">
      <aside className="intake__intro">
        <p className="eyebrow">命理綜合分析</p>
        <h1 className="intake__title">
          {mode === 'single' ? <>一個生辰，<br />五種讀法。</> : <>兩張命盤，<br />放在一起讀。</>}
        </h1>
        <p className="intake__lede">
          {mode === 'single'
            ? '同時排出八字、紫微斗數、生命靈數、馬雅曆與八宅命卦。每一句結論都標出它來自哪個部件，方便你自己核對。'
            : '比較兩人的五行共同分布、生命靈數與八宅分組。只描述互補與重疊，不判定合或不合。'}
        </p>
        <ol className="intake__systems">
          {SYSTEMS.map(system => (
            <li key={system.id} data-system={system.id}>
              <span className="intake__system-name">{system.name}</span>
              <span className="intake__system-note">{system.note}</span>
            </li>
          ))}
        </ol>
        <p className="intake__privacy">
          <span className="seal-mark" aria-hidden="true">私</span>
          排盤在你的瀏覽器內完成，出生資料不會上傳，也不需要登入。
        </p>
      </aside>

      <div className="intake__main">
        <div className="mode" role="radiogroup" aria-label="分析模式">
          {([['single', '單人命盤'], ['compat', '雙人合盤']] as const).map(([value, label]) => (
            <label key={value} className="mode__option">
              <input type="radio" name="mode" checked={mode === value} onChange={() => onModeChange(value)} />
              <span>{label}</span>
            </label>
          ))}
        </div>

        <div className="sheet">
          {mode === 'single'
            ? <BirthForm key={seed.key} initial={seed.input} onSubmit={onAnalyze} onExample={() => load(EXAMPLE_INPUT)} />
            : <CompatForm initial={lastPair} onSubmit={onCompare} />}
        </div>

        {mode === 'single' && recent.length > 0 && (
          <section className="recent" aria-labelledby="recent-title">
            <header className="recent__head">
              <h2 id="recent-title" className="recent__title">最近查詢</h2>
              <span className="recent__note">只存在這台裝置</span>
              <button type="button" className="link-button" onClick={onClearRecent}>清除</button>
            </header>
            <ul className="recent__list">
              {recent.map(item => {
                const input = item.input;
                return (
                  <li key={item.fingerprint}>
                    <button type="button" className="recent__item" onClick={() => load(input)}>
                      <span className="recent__name">{input.name || `${input.gender === 'female' ? '女' : '男'}命`}</span>
                      <span className="recent__meta">
                        {`${input.year}.${String(input.month).padStart(2, '0')}.${String(input.day).padStart(2, '0')}　${input.timeKnown ? shichenLabel(input.hour) : '時辰不確定'}`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
