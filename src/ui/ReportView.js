/**
 * @fileoverview 報告呈現（App 層，非核心）。
 *
 * 只消費 `analyze()` 產出的 `Report`，不做任何命理計算。量化區塊以
 * Chart.js 呈現 `report.radars`，並保留可展開的文字降級內容。
 *
 * @module ui/ReportView
 */

import { renderTextBar } from '../visualization/TextFallback.js';
import { renderRadarChart } from '../visualization/RadarChart.js';
import { renderBarChart } from '../visualization/BarChart.js';

/** 簡易 HTML escape（使用者輸入的姓名等）。 */
function esc(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/** 從引擎結果陣列找指定引擎。 */
function engineById(report, id) {
  return report.engines.find(e => e.engineId === id) ?? null;
}

/** 引擎內指定 category 的第一個部件 value。 */
function firstValue(engine, category) {
  return engine?.components.find(c => c.category === category)?.value ?? null;
}

// ─── Overview cards ─────────────────────────────────────────────────────────

function buildOverviewCards(report) {
  const cards = [];

  const ziwei = engineById(report, 'ziwei');
  if (ziwei) {
    const svb = firstValue(ziwei, 'soulVsBody');
    const soulStars = svb?.soul.majorStars.map(s => s.name).join('、') || '（無主星，借對宮）';
    cards.push({
      icon: '✦', label: '紫微斗數', value: soulStars,
      sub: `五行局：${esc(ziwei.meta.fiveElementsClass ?? '')}｜身宮：${esc(svb?.body.name ?? '')}`,
    });
  }

  const numerology = engineById(report, 'numerology');
  if (numerology) {
    const lifePath = firstValue(numerology, 'lifePath');
    const expression = firstValue(numerology, 'expression');
    cards.push({
      icon: '◈', label: '生命靈數',
      value: lifePath ? `${lifePath.number}${lifePath.isMaster ? '（大師數）' : ''}` : '—',
      sub: expression ? `表達數 ${expression.number}` : '（無姓名，僅計生日）',
    });
  }

  const minggua = engineById(report, 'minggua');
  if (minggua) {
    const gua = firstValue(minggua, 'mingGua');
    cards.push({
      icon: '☰', label: '八宅命卦', value: gua ? `${gua.name}卦（${gua.elementZh}）` : '—',
      sub: gua ? `${gua.groupName}｜伏位 ${gua.bestDirection}` : '',
    });
  }

  const dreamspell = engineById(report, 'dreamspell');
  if (dreamspell) {
    const kin = firstValue(dreamspell, 'kin');
    cards.push({
      icon: '◉', label: '馬雅曆 Kin',
      value: kin ? `Kin ${kin.kin}` : '—',
      sub: esc(dreamspell.meta.fullSignature ?? ''),
    });
  }

  return cards.map(c => `
    <div class="overview-card">
      <span class="overview-card__icon" aria-hidden="true">${c.icon}</span>
      <p class="overview-card__label">${c.label}</p>
      <p class="overview-card__value">${c.value}</p>
      <p class="overview-card__sub">${c.sub}</p>
    </div>
  `).join('');
}

// ─── Layer table (區塊 H①) ──────────────────────────────────────────────────

function buildLayerTable(report) {
  const rows = report.layers.layerDefinitions.map(def => {
    const comps = report.layers.byLayer[def.code] ?? [];
    const compList = comps.map(c =>
      `[${esc(c.sourceSystem)}] ${esc(c.name)}${c.unclassified ? ' ⚠未分類' : ''}`
    ).join('、') || '（無）';
    const lc = def.code.toLowerCase();
    return `
      <tr class="layer-row layer-row--${lc}">
        <td><span class="layer-badge layer-badge--${lc}">${def.code}</span></td>
        <td>${esc(def.name)}<br /><small>${esc(def.timeScale)}</small></td>
        <td>${esc(def.languageRule)}</td>
        <td class="layer-components">${compList}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="layer-table-container">
      <table class="layer-table">
        <thead>
          <tr><th>層級</th><th>名稱</th><th>語言規則</th><th>部件（${report.layers.components.length}）</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

// ─── Radar / bar charts (區塊 G) ────────────────────────────────────────────

function rulesById(scoringRules) {
  return new Map(
    Object.values(scoringRules?.byRadarType ?? {})
      .flat()
      .map(rule => [rule.id, rule]),
  );
}

function buildAxisRules(radar, ruleMap) {
  return radar.axes.map(axis => {
    const rule = ruleMap.get(axis.ruleId);
    return `
      <li class="radar-rule">
        <div><strong>${esc(axis.label)}</strong> ${esc(axis.value)}${esc(axis.unit)}</div>
        <code>${esc(rule?.formula ?? axis.ruleId)}</code>
        ${rule?.description ? `<p>${esc(rule.description)}</p>` : ''}
      </li>
    `;
  }).join('');
}

function buildHighAxisNotes(radar) {
  const highAxes = radar.axes.filter(axis => axis.value >= 60);
  if (highAxes.length === 0) return '';
  return highAxes.map(axis => `
    <div class="radar-axis-notes">
      <h5>${esc(axis.label)} ${esc(axis.value)}${esc(axis.unit)}</h5>
      <p><strong>資產面</strong>：${(axis.assets ?? []).map(esc).join('、') || '—'}</p>
      <p><strong>負債面</strong>：${(axis.liabilities ?? []).map(esc).join('、') || '—'}</p>
    </div>
  `).join('');
}

function buildTextFallback(radar) {
  const maxValue = radar.kind === 'bar'
    ? Math.max(1, ...radar.axes.map(axis => axis.value))
    : 100;
  return radar.axes.map(axis =>
    renderTextBar(axis.label, axis.value, maxValue, { labelWidth: 8, barWidth: 24 })
  ).join('\n');
}

/** Build the report's chart cards from already-computed Report data. */
export function buildRadarSection(report) {
  if (!report.radars?.length) {
    return '<div class="empty-state"><p class="empty-state__text">目前沒有可呈現的量化資料。</p></div>';
  }
  const ruleMap = rulesById(report.scoringRules);

  return `<div class="radar-grid">${report.radars.map((radar, index) => `
    <article class="radar-card animate-slideUp stagger-${Math.min(index + 1, 6)}">
      <header class="radar-card__header">
        <div>
          <span class="tag tag--${esc(radar.system)}">${esc(radar.system)}</span>
          <h4 class="radar-card__title">${esc(radar.title)}</h4>
        </div>
      </header>
      <div class="radar-card__chart chart-container chart-container--${radar.kind === 'bar' ? 'bar' : 'radar'}">
        <canvas data-radar-id="${esc(radar.id)}" role="img" aria-label="${esc(radar.title)}"></canvas>
      </div>
      ${buildHighAxisNotes(radar)}
      <details class="radar-rules">
        <summary>各軸計分規則</summary>
        <ul>${buildAxisRules(radar, ruleMap)}</ul>
      </details>
      <details class="radar-fallback">
        <summary>文字長條（無圖形環境使用）</summary>
        <pre>${esc(buildTextFallback(radar))}</pre>
      </details>
    </article>
  `).join('')}</div>`;
}

// ─── Pending shells (區塊 G 雷達 / H②③) ────────────────────────────────────

function buildPendingBlocks(report) {
  const items = [
    { icon: '⇄', text: `狀態切換表（區塊 H②）— 里程碑 D${report.stateTable.pending ? '' : ''}` },
    { icon: '∿', text: '時期演化雷達與敘事（區塊 H③）— 里程碑 D' },
  ];
  return items.map(i => `
    <div class="empty-state">
      <span class="empty-state__icon" aria-hidden="true">${i.icon}</span>
      <p class="empty-state__text">${i.text}</p>
    </div>
  `).join('');
}

// ─── Main render ────────────────────────────────────────────────────────────

/**
 * @param {HTMLElement} container
 * @param {import('../core/analyze.js').Report} report
 * @param {Object} options
 * @param {() => void} options.onBack
 */
export function renderReport(container, report, { onBack }) {
  const warnings = report.engines.flatMap(e => e.errors.map(msg => `[${e.engineName}] ${msg}`));

  container.innerHTML = `
    <div class="report-header">
      <button type="button" class="report-back-btn" id="report-back">← 重新輸入</button>
      <h2 class="report-title">命理綜合分析報告${report.input.name ? `：${esc(report.input.name)}` : ''}</h2>
      <div class="report-meta">
        <span class="report-meta-item">評估基準日 ${report.asOf}</span>
        <span class="report-meta-item">生日 ${report.input.year}-${String(report.input.month).padStart(2, '0')}-${String(report.input.day).padStart(2, '0')} ${String(report.input.hour).padStart(2, '0')}:${String(report.input.minute).padStart(2, '0')}</span>
        <span class="report-meta-item">v${report.version}｜schema ${report.schemaVersion}</span>
      </div>
    </div>

    ${warnings.length > 0 ? `
      <div class="empty-state">
        <span class="empty-state__icon">⚠</span>
        <p class="empty-state__text">${warnings.map(esc).join('<br />')}</p>
      </div>` : ''}

    <div class="overview-grid">${buildOverviewCards(report)}</div>

    <h3 class="section-title"><span class="title-accent" aria-hidden="true">◈</span> 系統動靜屬性表（區塊 H①）</h3>
    <p class="section-subtitle">L0 可寫「你是」；L1/L2 只能寫「這段時期」；L3 只能寫「在某情境下」。所有結果為待驗證假說。</p>
    ${buildLayerTable(report)}

    <h3 class="section-title"><span class="title-accent" aria-hidden="true">◈</span> 量化呈現</h3>
    <p class="section-subtitle">圖形只呈現報告中的既有數值；展開卡片可逐軸覆核公式與文字長條。</p>
    ${buildRadarSection(report)}

    <h3 class="section-title"><span class="title-accent" aria-hidden="true">◈</span> 待完成區塊</h3>
    ${buildPendingBlocks(report)}
  `;

  container.querySelector('#report-back').addEventListener('click', onBack);

  for (const radar of report.radars ?? []) {
    const canvas = [...container.querySelectorAll('canvas[data-radar-id]')]
      .find(node => node.dataset.radarId === radar.id);
    if (radar.kind === 'bar') renderBarChart(canvas, radar);
    else renderRadarChart(canvas, radar);
  }
}
