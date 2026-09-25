/** 壹 命格 — four pillars, identity ledger and the traceable summary. */

import { ELEMENT_KEY, identity, pillars } from '../../model/selectors';
import type { Report } from '../../model/types';
import { EmptyNote, Gloss, Section } from '../ui/primitives';

const NUMERALS = ['一', '二', '三', '四', '五', '六'];

export function Overview({ report }: { report: Report }) {
  const columns = pillars(report);
  const rows = identity(report);
  const sentences = report.summary?.sentences ?? [];

  return (
    <Section id="ch-overview" index="壹" title="命格" lede="先看整體輪廓，再往下核對各系統的計算細節。">
      <div className="overview">
        {columns ? (
          <figure className="pillars" aria-label="八字四柱">
            {columns.map(column => (
              <div key={column.key} className={`pillar${column.key === 'day' ? ' pillar--day' : ''}`}>
                <span className="pillar__label">{column.label}</span>
                <span className="pillar__char" data-element={column.stemElement ? ELEMENT_KEY[column.stemElement] : undefined}>
                  {column.stem}
                </span>
                <span className="pillar__char" data-element={column.branchElement ? ELEMENT_KEY[column.branchElement] : undefined}>
                  {column.branch}
                </span>
                <span className="pillar__elements">{column.stemElement}{column.branchElement}</span>
                {column.key === 'day' && <span className="pillar__tag">日主</span>}
              </div>
            ))}
            <figcaption className="sr-only">由左至右為時、日、月、年柱；日柱天干為日主。</figcaption>
          </figure>
        ) : (
          <div className="pillars pillars--empty">
            <EmptyNote>時辰不確定，八字四柱未排出。</EmptyNote>
          </div>
        )}

        <dl className="ledger-list">
          {rows.map(row => (
            <div key={row.system} className="ledger-list__row" data-system={row.system}>
              <dt>{row.label}</dt>
              <dd>
                <span className="ledger-list__value">{row.value}</span>
                <span className="ledger-list__sub">{row.sub}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {sentences.length > 0 ? (
        <ol className="reading">
          {sentences.map((sentence, index) => (
            <li key={sentence.id} className="reading__item">
              <span className="reading__index" aria-hidden="true">{NUMERALS[index] ?? index + 1}</span>
              <div>
                <p className="reading__text"><Gloss text={sentence.text} /></p>
                <p className="reading__source">
                  {sentence.sources.map(source => (
                    <span key={source.componentId} data-system={source.engineId}>
                      {source.engineName}・{source.componentName}
                    </span>
                  ))}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyNote>可用的結構資料不足，因此不補寫推論。</EmptyNote>
      )}
      {report.summary?.limitations?.length > 0 && (
        <p className="footnote">※ {report.summary.limitations.join(' ')}</p>
      )}
    </Section>
  );
}
