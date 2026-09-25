/** 肆 領域 — career / relationship / wealth / wellbeing cards. */

import type { Report } from '../../model/types';
import { EmptyNote, Gloss, Meter, Section, Sources } from '../ui/primitives';

/** Four display bands; the numeric score stays visible for auditing. */
export function band(score: number): string {
  if (score >= 75) return '高';
  if (score >= 55) return '中高';
  if (score >= 35) return '中';
  return '低';
}

export function Domains({ report }: { report: Report }) {
  const domains = report.insights?.domains ?? [];
  return (
    <Section id="ch-domains" index="肆" title="領域"
      lede="把紫微宮位力量、八字十神結構與目前大限放在同一張卡片上讀。分數是宮位力量，不是好壞評等。">
      {domains.length === 0 ? <EmptyNote>人生領域資料不足。</EmptyNote> : (
        <div className="domains">
          {domains.map(domain => (
            <article key={domain.id} className="domain">
              <header className="domain__head">
                <div>
                  <h3 className="domain__title">{domain.title}</h3>
                  <p className="domain__focus">{domain.focus}</p>
                </div>
                {domain.score == null ? (
                  <span className="domain__score domain__score--empty">未計算</span>
                ) : (
                  <span className="domain__score">
                    <span className="domain__number">{domain.score}</span>
                    <span className="domain__band">{band(domain.score)}</span>
                  </span>
                )}
              </header>
              {domain.score != null && <Meter value={domain.score} label={`${domain.palace}宮力量 ${domain.score} 分`} />}
              <p className="domain__insight"><Gloss text={domain.insight} /></p>
              {domain.stage && <p className="domain__stage">{domain.stage}</p>}
              {domain.metrics?.length > 0 && (
                <dl className="metrics">
                  {domain.metrics.map(metric => (
                    <div key={metric.label}>
                      <dt>{metric.label}</dt>
                      <dd>{metric.value}<small>{metric.unit === '分' ? '分' : '%'}</small></dd>
                    </div>
                  ))}
                </dl>
              )}
              <Sources items={domain.sources} />
              {domain.limitations?.map(text => <p key={text} className="footnote">※ {text}</p>)}
            </article>
          ))}
        </div>
      )}
    </Section>
  );
}
