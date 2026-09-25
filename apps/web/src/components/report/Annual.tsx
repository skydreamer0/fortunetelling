/** 貳 本年 — the year's observation themes. */

import type { Report } from '../../model/types';
import { EmptyNote, Gloss, Section, Sources } from '../ui/primitives';

export function Annual({ report }: { report: Report }) {
  const annual = report.insights?.annual;
  const liuNian = report.engines.find(item => item.engineId === 'bazi')
    ?.components.find(item => item.category === 'liuNian')?.value as { ganZhi: string } | undefined;

  return (
    <Section id="ch-year" index="貳" title="本年" lede={annual?.headline}>
      {!annual?.themes?.length ? (
        <EmptyNote>本年資料不足，不產生年度推論。</EmptyNote>
      ) : (
        <div className="year">
          <div className="year__stamp" aria-hidden="true">
            <span className="year__number">{annual.year}</span>
            {liuNian && <span className="year__ganzhi">{liuNian.ganZhi}</span>}
          </div>
          <div className="year__themes">
            {annual.themes.map(theme => (
              <article key={theme.id} className="year__theme">
                <h3 className="year__title">{theme.title}</h3>
                <p><Gloss text={theme.text} /></p>
                <Sources items={theme.sources} />
              </article>
            ))}
          </div>
        </div>
      )}
      {annual?.limitations?.[0] && <p className="footnote">※ {annual.limitations[0]}</p>}
    </Section>
  );
}
