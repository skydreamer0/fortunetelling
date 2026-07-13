/** @fileoverview Read-only rendering for Report.stateTable (Block H②). */

function esc(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

const SYSTEM_NAMES = Object.freeze({
  bazi: '八字',
  ziwei: '紫微斗數',
  numerology: '生命靈數',
  minggua: '八宅命卦',
  dreamspell: '馬雅曆 Kin',
  vedic: '吠陀占星',
  humandesign: '人類圖'
});

function sourceChips(sources) {
  return (sources ?? []).map(source => {
    const sysName = SYSTEM_NAMES[source.system] || source.system;
    return `
      <span class="state-source-chip tag tag--${esc(source.system)}"
        title="${esc(source.system)}/${esc(source.componentId)}">
        ${esc(sysName)} · ${esc(source.name)}
      </span>
    `;
  }).join('');
}

function scenarioBody(scenario) {
  if (scenario.insufficientData || scenario.cells.length === 0) {
    return `
      <div class="empty-state state-table__empty">
        <span class="empty-state__icon" aria-hidden="true">∅</span>
        <p class="empty-state__text">資料不足，不產生情境推論。</p>
      </div>
    `;
  }

  return scenario.cells.map(cell => `
    <div class="state-cell">
      <div class="state-cell__sources">${sourceChips(cell.sources)}</div>
      <p class="state-cell__expression">${esc(cell.expression)}</p>
      <span class="tag tag--unverified">⚠ 待驗證</span>
    </div>
  `).join('');
}

/** Render all five report scenarios without deriving new claims. */
export function buildStateTablePanel(stateTable) {
  if (stateTable?.pending) {
    return '<div class="empty-state"><p class="empty-state__text">狀態切換資料尚未完成。</p></div>';
  }

  const scenarios = stateTable?.scenarios ?? [];
  return `
    <div class="state-table-container">
      <div class="state-table" aria-label="狀態切換表">
        ${scenarios.map(scenario => `
          <section class="state-table__scenario" data-scenario-id="${esc(scenario.id)}">
            <header class="state-table__header">
              <span class="state-table__index" aria-hidden="true">${String(scenarios.indexOf(scenario) + 1).padStart(2, '0')}</span>
              <h4>${esc(scenario.name)}</h4>
            </header>
            <div class="state-table__cells">${scenarioBody(scenario)}</div>
          </section>
        `).join('')}
      </div>
    </div>
  `;
}
