/** 捌 建議 — count-only elements, plus separate direction and number reminders. */

import type { Report } from '../../model/types';
import { EmptyNote, Section, Sources } from '../ui/primitives';

export function Guidance({ report }: { report: Report }) {
  const guidance = report.insights?.guidance;
  return (
    <Section id="ch-guidance" index="捌" title="建議" lede="五行只描述出現次數；八宅方位與數字只作為生活提醒，不是結果保證。">
      {!guidance ? <EmptyNote>建議資料不足。</EmptyNote> : (
        <>
          <div className="guidance">
            <article className="guidance__item">
              <h3 className="subhead">五行出現次數</h3>
              {guidance.balance ? (
                <>
                  <p>{report.insights.version === 2
                    ? guidance.balance.text
                    : '此報告僅有五行出現次數資料，未判定旺衰或喜忌，不能據此提出補缺建議。'}</p>
                  <p className="footnote">※ {guidance.balance.limitation}</p>
                </>
              ) : <p>可用的五行出現次數資料不足，未判定旺衰或喜忌，不能據此提出補缺建議。</p>}
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
