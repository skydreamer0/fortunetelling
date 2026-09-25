/** 柒 建議 — low-stakes balancing prompts (color, direction, numbers). */

import type { Report } from '../../model/types';
import { EmptyNote, Section, Sources } from '../ui/primitives';

export function Guidance({ report }: { report: Report }) {
  const guidance = report.insights?.guidance;
  return (
    <Section id="ch-guidance" index="柒" title="建議" lede="只作為生活上的小提醒；色彩、方位與數字不是結果保證。">
      {!guidance ? <EmptyNote>平衡建議資料不足。</EmptyNote> : (
        <>
          <div className="guidance">
            <article className="guidance__item">
              <h3 className="subhead">五行平衡</h3>
              {guidance.balance ? (
                <>
                  <p className="guidance__lead">從「{guidance.balance.element}」開始小幅調整</p>
                  <p>{guidance.balance.text}</p>
                  <dl className="pairs">
                    <div><dt>色彩</dt><dd>{guidance.balance.color}</dd></div>
                    <div><dt>方位</dt><dd>{guidance.balance.direction}</dd></div>
                    <div><dt>習慣</dt><dd>{guidance.balance.habit}</dd></div>
                  </dl>
                  <p className="footnote">※ {guidance.balance.limitation}</p>
                </>
              ) : <p>時辰資料不足，未判定五行調整方向。</p>}
            </article>
            <article className="guidance__item">
              <h3 className="subhead">八宅四吉方</h3>
              {guidance.directions?.length ? (
                <dl className="pairs">
                  {guidance.directions.map(item => (
                    <div key={item.name}><dt>{item.name}</dt><dd>{item.direction}<small>{item.code}</small></dd></div>
                  ))}
                </dl>
              ) : <p>沒有可用的方位資料。</p>}
              <p className="footnote">適合拿來安排書桌、床頭或常坐位置的朝向。</p>
            </article>
            <article className="guidance__item">
              <h3 className="subhead">{guidance.numberLabel}</h3>
              {guidance.numbers?.length ? (
                <p className="guidance__numbers">{guidance.numbers.map(number => <span key={number}>{number}</span>)}</p>
              ) : <p>沒有可用的數字資料。</p>}
              <p className="footnote">可用於日誌標記或習慣提醒，不代表事件保證。</p>
            </article>
          </div>
          <Sources items={guidance.sources} />
          {guidance.limitations?.map(text => <p key={text} className="footnote">※ {text}</p>)}
        </>
      )}
    </Section>
  );
}
