/** 柒 情境 — five situational hypotheses, each tied to its source components. */

import type { Report } from '../../model/types';
import { EmptyNote, Section, Sources } from '../ui/primitives';

export function Scenarios({ report }: { report: Report }) {
  const scenarios = report.stateTable?.scenarios ?? [];
  return (
    <Section id="ch-scenarios" index="柒" title="情境" lede="同一個人在不同場合會切換不同面向。以下都是待驗證的假說，請用實際經驗核對。">
      {report.stateTable?.pending || scenarios.length === 0 ? <EmptyNote>情境資料尚未產生。</EmptyNote> : (
        <ol className="scenarios">
          {scenarios.map((scenario, index) => (
            <li key={scenario.id} className="scenario">
              <details open={index === 0}>
                <summary>
                  <span className="scenario__index">{String(index + 1).padStart(2, '0')}</span>
                  <span className="scenario__name">{scenario.name}</span>
                  <span className="scenario__count">
                    {scenario.insufficientData || scenario.cells.length === 0 ? '資料不足' : `${scenario.cells.length} 則`}
                  </span>
                </summary>
                {scenario.insufficientData || scenario.cells.length === 0
                  ? <EmptyNote>資料不足，不產生這個情境的推論。</EmptyNote>
                  : scenario.cells.map(cell => (
                    <div key={cell.expression} className="scenario__cell">
                      <p>{cell.expression}</p>
                      <Sources items={cell.sources} />
                    </div>
                  ))}
              </details>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}
