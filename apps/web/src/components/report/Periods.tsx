/** 陸 運程 — 八字大運 and 紫微大限 as horizontal decade strips. */

import { useState } from 'react';
import { periodsBySystem } from '../../model/selectors';
import type { Period, Report } from '../../model/types';
import { Radar, niceMax } from '../ui/Radar';
import { EmptyNote, Gloss, Section } from '../ui/primitives';

function shortLabel(period: Period): string {
  return period.label.match(/\s(.+?)(?:大運|大限)/)?.[1] ?? period.label;
}

function Strip({ title, periods }: { title: string; periods: Period[] }) {
  const currentIndex = Math.max(0, periods.findIndex(period => period.isCurrent));
  const [active, setActive] = useState(currentIndex);
  const period = periods[active];
  const start = periods[0].range[0];
  const end = periods[periods.length - 1].range[1];

  return (
    <div className="strip">
      <h3 className="subhead">{title}<small>{periods.length} 步・{start}–{end}</small></h3>
      <div className="strip__track" role="radiogroup" aria-label={`${title}時間軸`}>
        {periods.map((item, index) => (
          <label key={item.label} className={`strip__step${item.isCurrent ? ' is-current' : ''}`}>
            <input type="radio" name={`strip-${title}`} checked={index === active} onChange={() => setActive(index)} />
            <span className="strip__year">{item.range[0]}</span>
            <span className="strip__name">{shortLabel(item)}</span>
          </label>
        ))}
      </div>
      <article className="strip__detail" aria-live="polite">
        <header>
          <p className="strip__label">{period.label}{period.isCurrent && <span className="badge">目前</span>}</p>
        </header>
        <div className="split">
          <ul className="strip__summary">
            {period.summary.map(line => <li key={line}><Gloss text={line} /></li>)}
          </ul>
          {period.radar && (
            <Radar size={260} title={period.radar.title} unit={period.radar.axes[0]?.unit}
              max={period.radar.axes[0]?.unit === '%' ? niceMax(period.radar.axes.map(axis => axis.value)) : 100}
              labels={period.radar.axes.map(axis => axis.label)}
              series={[{ name: period.radar.title, values: period.radar.axes.map(axis => axis.value), tone: 'secondary' }]} />
          )}
        </div>
      </article>
    </div>
  );
}

export function Periods({ report }: { report: Report }) {
  const groups = periodsBySystem(report);
  return (
    <Section id="ch-periods" index="陸" title="運程" lede="十年一段的長期背景。點選任一段查看當期的五行／宮位輪廓變化。">
      {groups.length === 0
        ? <EmptyNote>目前沒有可呈現的時期演化資料（通常是出生時辰不確定）。</EmptyNote>
        : groups.map(group => <Strip key={group.system} title={group.title} periods={group.periods} />)}
      {report.evolution?.narrative && (
        <details className="audit">
          <summary>文字版時間軸</summary>
          <p className="prose"><Gloss text={report.evolution.narrative} /></p>
        </details>
      )}
    </Section>
  );
}
