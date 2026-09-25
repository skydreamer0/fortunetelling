/** Report page: title block, sticky chapter index and the chapters. */

import { useEffect, useRef, useState } from 'react';
import { cityById, cityLabel } from '../../lib/cities';
import { birthLabel, notices } from '../../model/selectors';
import type { Report } from '../../model/types';
import { Annual } from './Annual';
import { Charts } from './Charts';
import { Domains } from './Domains';
import { Guidance } from './Guidance';
import { LifeEvents } from './LifeEvents';
import { Method } from './Method';
import { Overview } from './Overview';
import { Periods } from './Periods';
import { Scenarios } from './Scenarios';
import { Timeline } from './Timeline';

export const CHAPTERS = [
  { id: 'ch-overview', index: '壹', label: '命格' },
  { id: 'ch-year', index: '貳', label: '本年' },
  { id: 'ch-timeline', index: '參', label: '時序' },
  { id: 'ch-events', index: '驗', label: '事件' },
  { id: 'ch-domains', index: '肆', label: '領域' },
  { id: 'ch-charts', index: '伍', label: '命盤' },
  { id: 'ch-periods', index: '陸', label: '運程' },
  { id: 'ch-scenarios', index: '柒', label: '情境' },
  { id: 'ch-guidance', index: '捌', label: '建議' },
  { id: 'ch-method', index: '附', label: '方法' },
] as const;

/** Track which chapter currently crosses the reading line (upper third of the viewport). */
function useActiveChapter(): string {
  const [active, setActive] = useState<string>(CHAPTERS[0].id);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting);
      if (visible.length) setActive(visible[visible.length - 1].target.id);
    }, { rootMargin: '-30% 0px -65% 0px' });
    document.querySelectorAll('[data-chapter]').forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, []);
  return active;
}

export function ReportView({ report, onBack }: { report: Report; onBack: () => void }) {
  const active = useActiveChapter();
  const navRef = useRef<HTMLElement>(null);
  const { date, time } = birthLabel(report.input);
  const { unavailable, warnings } = notices(report);
  const city = cityById(report.input.cityId);

  // Keep the active chapter visible in the horizontally scrolling mobile index.
  useEffect(() => {
    const link = navRef.current?.querySelector<HTMLElement>(`[href="#${active}"]`);
    const nav = navRef.current;
    if (link && nav && nav.scrollWidth > nav.clientWidth) {
      nav.scrollTo({ left: link.offsetLeft - nav.clientWidth / 2 + link.clientWidth / 2, behavior: 'smooth' });
    }
  }, [active]);

  return (
    <article className="report">
      <header className="report__head">
        <div className="report__actions">
          <button type="button" className="button button--quiet" onClick={onBack}>← 重新輸入</button>
          <button type="button" className="button button--quiet" onClick={() => window.print()}>列印／存成 PDF</button>
        </div>
        <p className="eyebrow">命書</p>
        <h1 className="report__title">{report.input.name || `${report.input.gender === 'female' ? '女' : '男'}命`}</h1>
        <p className="report__meta">
          <span>{report.input.calendarType === 'lunar' ? '農曆輸入・' : ''}國曆 {date}</span>
          <span>{time}</span>
          <span>{report.input.gender === 'female' ? '女' : '男'}</span>
          {city && <span>{cityLabel(city)}</span>}
          <span>基準日 {report.asOf}</span>
        </p>
      </header>

      <nav className="chapters" aria-label="報告章節" ref={navRef}>
        <ol>
          {CHAPTERS.map(chapter => (
            <li key={chapter.id}>
              <a href={`#${chapter.id}`} aria-current={active === chapter.id ? 'location' : undefined}>
                <span className="chapters__index">{chapter.index}</span>{chapter.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {(unavailable.length > 0 || warnings.length > 0) && (
        <aside className="notice" role="note">
          {unavailable.length > 0 && <p><strong>計算範圍</strong>{unavailable.join(' ')}</p>}
          {warnings.length > 0 && <p><strong>引擎提示</strong>{warnings.join('；')}</p>}
        </aside>
      )}

      <Overview report={report} />
      <Annual report={report} />
      <Timeline report={report} />
      <LifeEvents report={report} />
      <Domains report={report} />
      <Charts report={report} />
      <Periods report={report} />
      <Scenarios report={report} />
      <Guidance report={report} />
      <Method report={report} />
    </article>
  );
}
