/** Two-person comparison: shared element distribution, numerology and 八宅 grouping. */

import { shichenLabel } from '../input/fields';
import type { CompatibilityResult } from '../../model/types';
import { Radar, niceMax } from '../ui/Radar';
import { Section } from '../ui/primitives';

const MARKS = ['甲', '乙'];

export function CompatReport({ result, onBack }: { result: CompatibilityResult; onBack: () => void }) {
  const { elements, numerology, minggua, narrative } = result;
  return (
    <article className="report">
      <header className="report__head">
        <div className="report__actions">
          <button type="button" className="button button--quiet" onClick={onBack}>← 重新輸入</button>
          <button type="button" className="button button--quiet" onClick={() => window.print()}>列印／存成 PDF</button>
        </div>
        <p className="eyebrow">合盤</p>
        <h1 className="report__title">{result.people[0].name}<span className="report__times">×</span>{result.people[1].name}</h1>
        <p className="report__meta"><span>基準日 {result.asOf}</span><span>只比較既有數值，不判定合或不合</span></p>
      </header>

      <div className="couple">
        {result.people.map((person, index) => (
          <div key={person.label} className="couple__person">
            <span className="seal-mark">{MARKS[index]}</span>
            <div>
              <p className="couple__name">{person.name}</p>
              <p className="couple__meta">
                {`${person.input.year}.${String(person.input.month).padStart(2, '0')}.${String(person.input.day).padStart(2, '0')}　${person.input.timeKnown === false ? '時辰不確定' : shichenLabel(person.input.hour)}`}
              </p>
            </div>
            <dl className="couple__facts">
              <div><dt>生命靈數</dt><dd>{person.lifePath ?? '—'}</dd></div>
              <div><dt>八宅</dt><dd>{person.mingGua ?? '—'}</dd></div>
            </dl>
          </div>
        ))}
      </div>

      <Section id="cp-summary" index="壹" title="互補與提醒">
        <div className="duo">
          <p><strong className="duo__tag duo__tag--good">互補</strong>{narrative.strength}</p>
          <p><strong className="duo__tag duo__tag--watch">提醒</strong>{narrative.watchpoint}</p>
        </div>
      </Section>

      <Section id="cp-elements" index="貳" title="五行共同分布" lede={elements.available ? undefined : elements.limitation}>
        {elements.available && (
          <>
            <div className="split">
              <Radar title="兩人五行占比疊圖" unit="%" max={niceMax(elements.axes.flatMap(axis => [axis.firstShare, axis.secondShare]))}
                labels={elements.axes.map(axis => axis.label)}
                series={[
                  { name: `甲・${result.people[0].name}`, values: elements.axes.map(axis => axis.firstShare), tone: 'primary' },
                  { name: `乙・${result.people[1].name}`, values: elements.axes.map(axis => axis.secondShare), tone: 'secondary' },
                ]} />
              <div>
                <p className="compat-totals">
                  <span>整體互補<strong>{elements.overallComplement}</strong></span>
                  <span>共同集中<strong>{elements.overallFriction}</strong></span>
                </p>
                <table className="audit__table">
                  <thead><tr><th scope="col">五行</th><th scope="col">甲</th><th scope="col">乙</th><th scope="col">互補</th><th scope="col">集中</th></tr></thead>
                  <tbody>
                    {elements.axes.map(axis => (
                      <tr key={axis.label}>
                        <th scope="row">{axis.label}</th>
                        <td>{axis.firstShare}%</td><td>{axis.secondShare}%</td><td>{axis.complement}</td><td>{axis.friction}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <details className="audit">
                  <summary>公式</summary>
                  <p>互補：<code>{elements.formula.complement}</code></p>
                  <p>集中：<code>{elements.formula.friction}</code></p>
                  <p className="footnote">※ {elements.limitation}</p>
                </details>
              </div>
            </div>
          </>
        )}
      </Section>

      <Section id="cp-others" index="參" title="數字與方位">
        <div className="guidance">
          <article className="guidance__item">
            <h3 className="subhead">生命靈數</h3>
            {numerology.available ? (
              <>
                <p className="compat-numbers">
                  <span>{numerology.first.number}<small>{numerology.first.theme}</small></span>
                  <i aria-hidden="true">↔</i>
                  <span>{numerology.second.number}<small>{numerology.second.theme}</small></span>
                </p>
                <p className="guidance__lead">{numerology.dynamic}</p>
                <p>{numerology.text}</p>
              </>
            ) : <p>沒有可用的生命靈數資料。</p>}
          </article>
          <article className="guidance__item">
            <h3 className="subhead">八宅命卦</h3>
            <p className="guidance__lead">{minggua.sameGroup ? '同組空間偏好' : '分屬東西四命'}</p>
            <p>{minggua.text ?? '沒有可用的八宅資料。'}</p>
            {minggua.sharedDirections?.length > 0 && <p>共同吉方：{minggua.sharedDirections.join('、')}</p>}
          </article>
        </div>
      </Section>

      <Section id="cp-limits" index="附" title="閱讀邊界">
        <ul className="method__list">
          {narrative.limitations.map(text => <li key={text}>{text}</li>)}
        </ul>
      </Section>
    </article>
  );
}
