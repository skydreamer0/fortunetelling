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
import { buildStateTablePanel } from './StateTablePanel.js';
import { buildEvolutionPanel } from './EvolutionPanel.js';

const SYSTEM_NAMES = Object.freeze({
  bazi: '八字',
  ziwei: '紫微斗數',
  numerology: '生命靈數',
  minggua: '八宅命卦',
  dreamspell: '馬雅曆 Kin',
  vedic: '吠陀占星',
  humandesign: '人類圖'
});

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

  const bazi = engineById(report, 'bazi');
  if (bazi) {
    const dm = firstValue(bazi, 'dayMaster');
    const natal = firstValue(bazi, 'natal');
    if (dm && natal) {
      cards.push({
        icon: '☯', label: '八字命盤',
        value: `日主：${esc(dm.stem)}${esc(dm.element)}（${esc(dm.yinYang)}）`,
        sub: `年：${esc(natal.year)}｜月：${esc(natal.month)}｜日：${esc(natal.day)}｜時：${esc(natal.time)}`,
      });
    }
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
    const compList = comps.map(c => {
      const sysName = SYSTEM_NAMES[c.sourceSystem] || c.sourceSystem;
      return `[${esc(sysName)}] ${esc(c.name)}${c.unclassified ? ' ⚠未分類' : ''}`;
    }).join('、') || '（無）';
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
    <details class="layer-table-details">
      <summary class="layer-table-summary">查看系統分層與動靜屬性覆核 (技術細節)</summary>
      <div class="layer-table-container" style="margin-top: var(--space-4);">
        <table class="layer-table">
          <thead>
            <tr><th>層級</th><th>名稱</th><th>語言規則</th><th>部件（${report.layers.components.length}）</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </details>
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

// ─── Numerology 3x3 Grid (九宮格) ──────────────────────────────────────────

function buildNumerologyGrid(radar) {
  // Standard Pythagorean Life Numerology Layout:
  // 3  6  9
  // 2  5  8
  // 1  4  7
  const layout = ['3', '6', '9', '2', '5', '8', '1', '4', '7'];

  const cellsHtml = layout.map(digit => {
    const axis = radar.axes.find(a => a.label === digit);
    const count = axis ? axis.value : 0;
    const isActive = count > 0;

    // Draw dots equal to count
    let dotsHtml = '';
    if (isActive) {
      dotsHtml = `
        <div class="numerology-nine-grid__dots">
          ${Array(Math.min(count, 8)).fill('<span class="numerology-nine-grid__dot"></span>').join('')}
        </div>
      `;
    } else {
      dotsHtml = '<div class="numerology-nine-grid__dots"></div>';
    }

    const badgeHtml = isActive
      ? `<span class="numerology-nine-grid__badge">${count}次</span>`
      : `<span class="numerology-nine-grid__badge-empty">—</span>`;

    return `
      <div class="numerology-nine-grid__cell ${isActive ? 'numerology-nine-grid__cell--active' : ''}">
        <span class="numerology-nine-grid__digit">${digit}</span>
        ${dotsHtml}
        ${badgeHtml}
      </div>
    `;
  }).join('');

  return `
    <div class="numerology-nine-grid">
      ${cellsHtml}
    </div>
  `;
}

function buildTextFallback(radar) {
  const maxValue = radar.kind === 'bar'
    ? Math.max(1, ...radar.axes.map(axis => axis.value))
    : 100;
  return radar.axes.map(axis => {
    if (axis.unit === '次') {
      const barStr = renderTextBar(axis.label, axis.value, maxValue, {
        labelWidth: 8,
        barWidth: 24,
        showPercentage: false,
        showValue: false
      });
      return `${barStr} ${axis.value}次`;
    }
    return renderTextBar(axis.label, axis.value, maxValue, { labelWidth: 8, barWidth: 24 });
  }).join('\n');
}

/** Build the report's chart cards from already-computed Report data. */
export function buildRadarSection(report) {
  if (!report.radars?.length) {
    return '<div class="empty-state"><p class="empty-state__text">目前沒有可呈現的量化資料。</p></div>';
  }
  const ruleMap = rulesById(report.scoringRules);

  return `<div class="radar-grid">${report.radars.map((radar, index) => {
    const isNumerologyGrid = radar.id === 'numerology_digit_frequency';
    return `
    <article class="radar-card animate-slideUp stagger-${Math.min(index + 1, 6)}">
      <header class="radar-card__header">
        <div>
          <span class="tag tag--${esc(radar.system)}">${esc(SYSTEM_NAMES[radar.system] || radar.system)}</span>
          <h4 class="radar-card__title">${esc(radar.title)}</h4>
        </div>
      </header>
      ${isNumerologyGrid ? `
        <div class="numerology-grid-wrapper">
          ${buildNumerologyGrid(radar)}
        </div>
      ` : `
        <div class="radar-card__chart chart-container chart-container--${radar.kind === 'bar' ? 'bar' : 'radar'}">
          <canvas data-radar-id="${esc(radar.id)}" role="img" aria-label="${esc(radar.title)}"></canvas>
        </div>
      `}
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
  `;
  }).join('')}</div>`;
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
      <div class="report-warning-box border-double">
        <span class="report-warning-box__icon">⚠</span>
        <p class="report-warning-box__text">${warnings.map(esc).join('<br />')}</p>
      </div>` : ''}

    <div class="overview-grid">${buildOverviewCards(report)}</div>

    <h3 class="section-title"><span class="title-accent" aria-hidden="true">◈</span> 系統動靜屬性表</h3>
    <p class="section-subtitle">將命理特質依時間尺度分類（如恆定特質、階段運勢、情境面向），所有結果均為待驗證假說。</p>
    ${buildLayerTable(report)}

    <h3 class="section-title"><span class="title-accent" aria-hidden="true">◈</span> 量化呈現</h3>
    <p class="section-subtitle">圖形只呈現報告中的既有數值；展開卡片可逐軸覆核公式與文字長條。</p>
    ${buildRadarSection(report)}

    <h3 class="section-title"><span class="title-accent" aria-hidden="true">⇄</span> 狀態切換表</h3>
    <p class="section-subtitle">每項情境假說都標示實際來源部件；資料不足時不補寫推論。</p>
    ${buildStateTablePanel(report.stateTable)}

    <h3 class="section-title"><span class="title-accent" aria-hidden="true">∿</span> 時期演化</h3>
    <p class="section-subtitle">依系統分列十年尺度的演化輪廓；展開各期可查看量化文字圖。</p>
    ${buildEvolutionPanel(report.evolution)}
  `;

  container.querySelector('#report-back').addEventListener('click', onBack);

  for (const radar of report.radars ?? []) {
    const canvas = [...container.querySelectorAll('canvas[data-radar-id]')]
      .find(node => node.dataset.radarId === radar.id);
    if (!canvas) continue;
    if (radar.kind === 'bar') renderBarChart(canvas, radar);
    else renderRadarChart(canvas, radar);
  }
}
