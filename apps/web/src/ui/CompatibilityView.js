import { renderCompatibilityChart } from '../visualization/CompatibilityChart.js';
import { initGlossary } from './Glossary.js';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function personCard(person) {
  return `<article class="compat-person-summary">
    <span class="compat-person-summary__label">${esc(person.label)}</span>
    <div><h3>${esc(person.name)}</h3><p>${person.input.year}.${String(person.input.month).padStart(2, '0')}.${String(person.input.day).padStart(2, '0')} · ${person.input.timeKnown === false ? '時辰不確定' : `${String(person.input.hour).padStart(2, '0')}:00`}</p></div>
    <dl><div><dt>生命靈數</dt><dd>${esc(person.lifePath ?? '—')}</dd></div><div><dt>八宅</dt><dd>${esc(person.mingGua ?? '—')}</dd></div></dl>
  </article>`;
}

function elementFallback(elements) {
  return `<div class="compat-axis-table" role="table" aria-label="合盤五行數值">
    <div class="compat-axis-row compat-axis-row--head" role="row"><span>五行</span><span>A</span><span>B</span><span>互補</span><span>摩擦</span></div>
    ${elements.axes.map(axis => `<div class="compat-axis-row" role="row"><strong>${esc(axis.label)}</strong><span>${esc(axis.firstShare)}%</span><span>${esc(axis.secondShare)}%</span><span>${esc(axis.complement)}</span><span>${esc(axis.friction)}</span></div>`).join('')}
  </div>`;
}

export function renderCompatibilityReport(container, result, { onBack, onPrint = () => window.print() } = {}) {
  if (container.__themeChartHandler) document.removeEventListener('fortune-theme-change', container.__themeChartHandler);
  for (const chart of container.__chartInstances ?? []) chart.destroy();
  if (container.__compatThemeHandler) document.removeEventListener('fortune-theme-change', container.__compatThemeHandler);
  container.__compatChart?.destroy();
  const [first, second] = result.people;
  const elements = result.elements;
  container.innerHTML = `
    <div class="report-header compatibility-report__header">
      <div class="report-actions"><button type="button" class="report-back-btn" id="compat-back">← 重新輸入</button><button type="button" class="report-print-btn" id="compat-print">列印／儲存 PDF</button></div>
      <p class="compatibility-report__eyebrow">TWO-PERSON · TRANSPARENT COMPARISON</p>
      <h2 class="report-title">${esc(first.name)} × ${esc(second.name)} 合盤比較</h2>
      <p class="report-meta-item">評估基準日 ${esc(result.asOf)}｜schema ${esc(result.schemaVersion)}</p>
    </div>
    <div class="compat-person-summaries">${personCard(first)}<span class="compat-person-summaries__link" aria-hidden="true">×</span>${personCard(second)}</div>

    <section class="compat-narrative border-double" aria-labelledby="compat-summary-title">
      <p class="compatibility-report__eyebrow">先看共同節奏</p><h3 id="compat-summary-title">互補與提醒</h3>
      <div><p><strong>互補：</strong>${esc(result.narrative.strength)}</p><p><strong>提醒：</strong>${esc(result.narrative.watchpoint)}</p></div>
    </section>

    <section class="compat-section" aria-labelledby="compat-elements-title">
      <div class="compat-section__heading"><div><p class="compatibility-report__eyebrow">五行共同分布</p><h3 id="compat-elements-title">互補軸／摩擦軸疊圖</h3></div>
      ${elements.available ? `<div class="compat-overall"><span>整體互補 <strong>${esc(elements.overallComplement)}</strong></span><span>共同集中 <strong>${esc(elements.overallFriction)}</strong></span></div>` : ''}</div>
      ${elements.available ? `<div class="compat-chart-wrap"><canvas id="compat-chart" role="img" aria-label="五行互補與摩擦雷達疊圖"></canvas></div>${elementFallback(elements)}
        <details class="radar-rules"><summary>查看公開公式</summary><p>互補：${esc(elements.formula.complement)}</p><p>摩擦：${esc(elements.formula.friction)}</p><p>${esc(elements.limitation)}</p></details>`
        : `<div class="report-scope-note"><strong>五行比較未計算</strong><p>${esc(elements.limitation)}</p></div>`}
    </section>

    <section class="compat-reading-grid" aria-label="跨系統合盤解讀">
      <article class="compat-reading-card"><p class="compatibility-report__eyebrow">生命靈數</p><h3>${esc(result.numerology.dynamic ?? '資料不足')}</h3><p>${esc(result.numerology.text ?? '沒有可用的生命靈數資料。')}</p>${result.numerology.available ? `<div class="compat-number-pair"><span>${esc(result.numerology.first.number)}<small>${esc(result.numerology.first.theme)}</small></span><i>↔</i><span>${esc(result.numerology.second.number)}<small>${esc(result.numerology.second.theme)}</small></span></div>` : ''}</article>
      <article class="compat-reading-card"><p class="compatibility-report__eyebrow">八宅命卦</p><h3>${result.minggua.sameGroup ? '同組空間偏好' : '分區協調'}</h3><p>${esc(result.minggua.text ?? '沒有可用的八宅資料。')}</p>${result.minggua.sharedDirections?.length ? `<p class="compat-shared-directions">共同吉方：${result.minggua.sharedDirections.map(esc).join('、')}</p>` : ''}</article>
    </section>
    <section class="compat-limitations"><h3>閱讀邊界</h3>${result.narrative.limitations.map(text => `<p>※ ${esc(text)}</p>`).join('')}</section>`;

  container.querySelector('#compat-back').addEventListener('click', onBack);
  container.querySelector('#compat-print').addEventListener('click', onPrint);
  initGlossary(container);

  const renderChart = () => {
    container.__compatChart?.destroy();
    const canvas = container.querySelector('#compat-chart');
    container.__compatChart = canvas ? renderCompatibilityChart(canvas, elements) : null;
  };
  container.__compatThemeHandler = renderChart;
  document.addEventListener('fortune-theme-change', renderChart);
  renderChart();
}
