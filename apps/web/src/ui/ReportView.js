/**
 * @fileoverview 報告呈現（App 層，非核心）。
 *
 * 只消費 `analyze()` 產出的 `Report`，不做任何命理計算。量化區塊以
 * Chart.js 呈現 `report.radars`，並保留可展開的文字降級內容。
 *
 * @module ui/ReportView
 */

import { TextFallback } from '@fortune/core';

const { renderTextBar } = TextFallback;
import { renderRadarChart } from '../visualization/RadarChart.js';
import { renderBarChart } from '../visualization/BarChart.js';
import { buildStateTablePanel } from './StateTablePanel.js';
import { buildEvolutionPanel, initEvolutionPanel } from './EvolutionPanel.js';
import { buildZiweiChart, initZiweiChart } from './ZiweiChart.js';
import { buildAnnualPanel, buildDomainPanel, buildGuidancePanel } from './InsightPanel.js';
import { initGlossary } from './Glossary.js';

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

const SUMMARY_INDEX = Object.freeze(['一', '二', '三', '四', '五']);
const SUMMARY_SYSTEM_CLASSES = new Set(['bazi', 'ziwei', 'numerology', 'minggua', 'dreamspell']);

/** Render the cross-system plain-language overview as an editorial opening note. */
export function buildSummarySection(summary) {
  const sentences = Array.isArray(summary?.sentences) ? summary.sentences : [];
  if (sentences.length === 0) {
    return `
      <section class="fate-summary fate-summary--empty" aria-labelledby="summary-title">
        <div class="fate-summary__heading">
          <p class="fate-summary__eyebrow">跨系統提要</p>
          <h3 id="summary-title">命格提要</h3>
        </div>
        <p class="fate-summary__empty-text">目前可用的結構資料不足，因此不補寫推論。</p>
      </section>
    `;
  }

  const sentenceHtml = sentences.map((sentence, index) => {
    const sources = Array.isArray(sentence?.sources) ? sentence.sources : [];
    const sourceHtml = sources.map(source => {
      const systemClass = SUMMARY_SYSTEM_CLASSES.has(source.engineId) ? source.engineId : 'other';
      const systemName = source.engineName || SYSTEM_NAMES[source.engineId] || source.engineId;
      return `
        <span class="fate-summary__source fate-summary__source--${systemClass}"
          title="來源部件：${esc(source.componentId)}">
          ${esc(systemName)} · ${esc(source.componentName)}
        </span>
      `;
    }).join('');

    return `
      <li class="fate-summary__item">
        <span class="fate-summary__index" aria-hidden="true">${SUMMARY_INDEX[index] ?? index + 1}</span>
        <div class="fate-summary__sentence-wrap">
          <p class="fate-summary__sentence">${esc(sentence.text)}</p>
          <div class="fate-summary__sources" aria-label="本句資料來源">${sourceHtml}</div>
        </div>
      </li>
    `;
  }).join('');

  const limitations = Array.isArray(summary?.limitations) ? summary.limitations.filter(Boolean) : [];
  const limitationText = limitations.length > 0
    ? limitations.join(' ')
    : '本段由既有命盤部件規則式整理。';

  return `
    <section class="fate-summary" aria-labelledby="summary-title">
      <span class="fate-summary__seal" aria-hidden="true">命</span>
      <div class="fate-summary__heading">
        <p class="fate-summary__eyebrow">跨系統提要 · 可追溯來源</p>
        <h3 id="summary-title">命格提要</h3>
        <p>先讀整體輪廓，再往下核對各系統的計算細節。</p>
      </div>
      <ol class="fate-summary__list">${sentenceHtml}</ol>
      <p class="fate-summary__limitation"><span aria-hidden="true">※</span> ${esc(limitationText)}</p>
    </section>
  `;
}

// ─── Overview cards ─────────────────────────────────────────────────────────

function buildOverviewCards(report) {
  const cards = [];

  const ziwei = engineById(report, 'ziwei');
  if (ziwei?.components?.length) {
    const svb = firstValue(ziwei, 'soulVsBody');
    const directStars = svb?.soul.majorStars.map(s => s.name).join('、');
    const soulSanfang = ziwei.components.find(item => item.category === 'sanFangSiZheng' && item.value?.anchor === '命宮');
    const borrowedStars = soulSanfang?.value?.opposite?.majorStars?.map(star => star.name).join('、');
    const soulStars = directStars || (borrowedStars
      ? `借${soulSanfang.value.opposite.name}：${borrowedStars}`
      : '命宮星曜資料不足');
    cards.push({
      icon: '✦', label: '紫微斗數', value: soulStars,
      sub: `五行局：${esc(ziwei.meta.fiveElementsClass ?? '')}｜身宮：${esc(svb?.body.name ?? '')}`,
    });
  }

  const bazi = engineById(report, 'bazi');
  if (bazi?.components?.length) {
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
    const directions = firstValue(minggua, 'directions');
    const restDirection = directions?.auspicious?.伏位?.zh;
    const directionZh = ['東', '西', '南', '北'].includes(restDirection) ? `正${restDirection}` : restDirection;
    cards.push({
      icon: '☰', label: '八宅命卦', value: gua ? `${gua.name}卦（${gua.elementZh}）` : '—',
      sub: gua ? `${gua.groupName}｜伏位 ${directionZh ?? gua.bestDirection}` : '',
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

function buildLayerCards(report) {
  const cardsHtml = report.layers.layerDefinitions.map(def => {
    const lc = def.code.toLowerCase();
    const comps = report.layers.byLayer[def.code] ?? [];
    const count = comps.length;

    let desc = '';
    if (def.code === 'L0') desc = '包含先天五行基因、紫微斗數先天命盤結構、生命靈數特質，是終生不變的本質基底。';
    else if (def.code === 'L1') desc = '對應大運與大限，約 10-20 年發生移轉，呈現中長期的運勢偏向與成長主題。';
    else if (def.code === 'L2') desc = '對應流年流月，每年或每月推移，指引當下的流年趨勢與變動軌跡。';
    else if (def.code === 'L3') desc = '根據當下情境（初識、親密、衝突、低谷、工作）切換，呈現不同環境下的動態適應傾向。';

    return `
      <div class="layer-overview-card layer-overview-card--${lc}">
        <div class="layer-overview-card__header">
          <span class="layer-badge layer-badge--${lc}">${def.code}</span>
          <h4 class="layer-overview-card__title">${esc(def.name)}</h4>
        </div>
        <div class="layer-overview-card__meta">
          <span class="layer-overview-card__time">◷ ${esc(def.timeScale)}</span>
          <span class="layer-overview-card__rule">⟡ ${esc(def.languageRule)}</span>
        </div>
        <p class="layer-overview-card__desc">${desc}</p>
        <span class="layer-overview-card__count">收錄 ${count} 個分析部件</span>
      </div>
    `;
  }).join('');

  return `<div class="layer-overview-grid">${cardsHtml}</div>`;
}

function buildComponentGroups(comps) {
  if (comps.length === 0) return '<span class="no-components">（無）</span>';

  // Group by system
  const grouped = {};
  comps.forEach(c => {
    const sys = c.sourceSystem;
    if (!grouped[sys]) grouped[sys] = [];
    grouped[sys].push(c);
  });

  // Render each system group
  return Object.entries(grouped).map(([sysKey, sysComps]) => {
    const sysName = SYSTEM_NAMES[sysKey] || sysKey;
    
    // Sort components by name for neatness
    sysComps.sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));

    const tagsHtml = sysComps.map(c => {
      const warnClass = c.unclassified ? 'system-tag--unclassified' : '';
      const warnTitle = c.unclassified ? ' title="未配置規則部件，保守歸入此層"' : '';
      return `<span class="system-tag system-tag--${sysKey} ${warnClass}"${warnTitle}>${esc(c.name)}${c.unclassified ? ' ⚠' : ''}</span>`;
    }).join('');

    return `
      <div class="layer-system-group">
        <span class="system-group-label system-group-label--${sysKey}">${esc(sysName)}</span>
        <div class="system-tag-list">${tagsHtml}</div>
      </div>
    `;
  }).join('');
}

function buildLayerTable(report) {
  const rows = report.layers.layerDefinitions.map(def => {
    const comps = report.layers.byLayer[def.code] ?? [];
    const lc = def.code.toLowerCase();
    return `
      <tr class="layer-row layer-row--${lc}">
        <td><span class="layer-badge layer-badge--${lc}">${def.code}</span></td>
        <td>${esc(def.name)}<br /><small>${esc(def.timeScale)}</small></td>
        <td>${esc(def.languageRule)}</td>
        <td class="layer-components">${buildComponentGroups(comps)}</td>
      </tr>
    `;
  }).join('');

  return `
    ${buildLayerCards(report)}
    <details class="layer-table-details">
      <summary class="layer-table-summary">查看詳細部件分層技術覆核 (共 ${report.layers.components.length} 個分析部件)</summary>
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

function formatRuleFormula(ruleId, inputs, value, unit) {
  if (!inputs) return '';

  switch (ruleId) {
    case 'bazi_wood_strength':
      return `計算過程：${inputs.woodCount ?? 0} (木行個數) ÷ ${inputs.totalElements ?? 0} (五行總數) × 100% = ${value}%`;
    case 'bazi_fire_strength':
      return `計算過程：${inputs.fireCount ?? 0} (火行個數) ÷ ${inputs.totalElements ?? 0} (五行總數) × 100% = ${value}%`;
    case 'bazi_earth_strength':
      return `計算過程：${inputs.earthCount ?? 0} (土行個數) ÷ ${inputs.totalElements ?? 0} (五行總數) × 100% = ${value}%`;
    case 'bazi_metal_strength':
      return `計算過程：${inputs.metalCount ?? 0} (金行個數) ÷ ${inputs.totalElements ?? 0} (五行總數) × 100% = ${value}%`;
    case 'bazi_water_strength':
      return `計算過程：${inputs.waterCount ?? 0} (水行個數) ÷ ${inputs.totalElements ?? 0} (五行總數) × 100% = ${value}%`;
    case 'ziwei_palace_strength': {
      const main = inputs.mainStarBrightness ?? 0;
      const aux = inputs.auxiliaryStarCount ?? 0;
      const transform = inputs.fourTransformBonus ?? 0;
      const auxScore = Math.min(aux * 10, 100);
      return `計算過程：${main} (主星亮度) × 60% + ${auxScore} (輔星加成: ${aux} 顆 × 10) × 20% + ${transform} (四化加成) × 20% = ${value}分`;
    }
    case 'numerology_digit_frequency': {
      const occurrences = inputs.digitOccurrences ?? 0;
      return `計算過程：出生日期中出現 ${occurrences}次`;
    }
    default:
      return '';
  }
}

function buildAxisRules(radar, ruleMap) {
  const descriptions = new Set();
  radar.axes.forEach(axis => {
    const rule = ruleMap.get(axis.ruleId);
    if (rule?.description) {
      descriptions.add(rule.description);
    }
  });

  let headerDescHtml = '';
  if (descriptions.size === 1) {
    headerDescHtml = `<p class="radar-rules__global-desc">${esc([...descriptions][0])}</p>`;
  }

  const itemsHtml = radar.axes.map(axis => {
    const rule = ruleMap.get(axis.ruleId);
    const friendlyFormula = formatRuleFormula(axis.ruleId, axis.inputs, axis.value, axis.unit);

    let formulaHtml = '';
    if (friendlyFormula) {
      formulaHtml = `<div class="radar-rule__formula-friendly">${esc(friendlyFormula)}</div>`;
    } else if (rule?.formula) {
      formulaHtml = `<code class="radar-rule__formula-raw">${esc(rule.formula)}</code>`;
    } else {
      formulaHtml = `<code class="radar-rule__formula-raw">${esc(axis.ruleId)}</code>`;
    }

    const showDescInline = descriptions.size !== 1 && rule?.description;

    return `
      <li class="radar-rule">
        <div><strong>${esc(axis.label)}</strong> ${esc(axis.value)}${esc(axis.unit)}</div>
        ${formulaHtml}
        ${showDescInline ? `<p class="radar-rule__desc">${esc(rule.description)}</p>` : ''}
      </li>
    `;
  }).join('');

  return `
    ${headerDescHtml}
    <ul>${itemsHtml}</ul>
  `;
}

function buildHighAxisNotes(radar) {
  const highAxes = radar.axes.filter(axis => axis.value >= 60);
  if (highAxes.length === 0) return '';
  const cardsHtml = highAxes.map(axis => `
    <div class="axis-note-card">
      <h5 class="axis-note-title">${esc(axis.label)} ${esc(axis.value)}${esc(axis.unit)}</h5>
      <div class="axis-note-columns">
        <div class="axis-note-column axis-note-column--assets">
          <span class="axis-note-badge badge-assets">✦ 天賦面</span>
          <p class="axis-note-content">${(axis.assets ?? []).map(esc).join('、') || '—'}</p>
        </div>
        <div class="axis-note-column axis-note-column--liabilities">
          <span class="axis-note-badge badge-liabilities">⇌ 課題面</span>
          <p class="axis-note-content">${(axis.liabilities ?? []).map(esc).join('、') || '—'}</p>
        </div>
      </div>
    </div>
  `).join('');

  return `<div class="radar-axis-notes-container">${cardsHtml}</div>`;
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
        <p class="numerology-grid-desc">生命靈數九宮格：統計出生日期中數字 1–9 出現的次數（0 不計入）。出現頻次越高，代表該能量特質在性格中越為顯著。</p>
      ` : `
        <div class="radar-card__chart chart-container chart-container--${radar.kind === 'bar' ? 'bar' : 'radar'}">
          <canvas data-radar-id="${esc(radar.id)}" role="img" aria-label="${esc(radar.title)}"></canvas>
        </div>
      `}
      ${buildHighAxisNotes(radar)}
      ${isNumerologyGrid ? '' : `
      <details class="radar-rules">
        <summary>各軸計分規則</summary>
        ${buildAxisRules(radar, ruleMap)}
      </details>
      `}
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
 * @param {import('../../../../packages/core/src/core/analyze.js').Report} report
 * @param {Object} options
 * @param {() => void} options.onBack
 * @param {() => void} options.onPrint
 */
export function renderReport(container, report, { onBack, onPrint = () => window.print() }) {
  if (container.__compatThemeHandler) document.removeEventListener('fortune-theme-change', container.__compatThemeHandler);
  container.__compatChart?.destroy();
  if (container.__themeChartHandler) document.removeEventListener('fortune-theme-change', container.__themeChartHandler);
  for (const chart of container.__chartInstances ?? []) chart.destroy();
  const informationalPatterns = [/姓名無拉丁字母/, /無姓名/, /略過表達數/];
  const warnings = report.engines.flatMap(e => e.errors
    .filter(message => !informationalPatterns.some(pattern => pattern.test(message)))
    .map(msg => `[${e.engineName}] ${msg}`));
  const unavailable = report.engines.filter(engine => engine.meta?.unavailableReason === 'unknown-time');
  const birthTime = report.input.timeKnown === false
    ? '時辰不確定'
    : `${String(report.input.hour).padStart(2, '0')}:${String(report.input.minute).padStart(2, '0')}`;

  container.innerHTML = `
    <div class="report-header">
      <div class="report-actions">
        <button type="button" class="report-back-btn" id="report-back">← 重新輸入</button>
        <button type="button" class="report-print-btn" id="report-print">列印／儲存 PDF</button>
      </div>
      <h2 class="report-title">命理綜合分析報告${report.input.name ? `：${esc(report.input.name)}` : ''}</h2>
      <div class="report-meta">
        <span class="report-meta-item">評估基準日 ${report.asOf}</span>
        <span class="report-meta-item">生日 ${report.input.year}-${String(report.input.month).padStart(2, '0')}-${String(report.input.day).padStart(2, '0')} · ${birthTime}</span>
        <span class="report-meta-item">v${report.version}｜schema ${report.schemaVersion}</span>
      </div>
    </div>

    <nav class="report-toc" aria-label="報告目錄">
      <a href="#sec-overview" class="report-toc__link report-toc__link--active">總覽</a>
      <a href="#sec-now" class="report-toc__link">本年</a>
      <a href="#sec-domains" class="report-toc__link">領域</a>
      <a href="#sec-guidance" class="report-toc__link">建議</a>
      <a href="#sec-chart" class="report-toc__link">紫微命盤</a>
      <a href="#sec-layers" class="report-toc__link">動靜屬性</a>
      <a href="#sec-charts" class="report-toc__link">量化呈現</a>
      <a href="#sec-states" class="report-toc__link">狀態切換</a>
      <a href="#sec-evolution" class="report-toc__link">時期演化</a>
    </nav>

    ${warnings.length > 0 ? `
      <div class="report-warning-box border-double">
        <span class="report-warning-box__icon">⚠</span>
        <p class="report-warning-box__text">${warnings.map(esc).join('<br />')}</p>
      </div>` : ''}

    ${unavailable.length > 0 ? `
      <div class="report-scope-note" role="note">
        <strong>本次報告的計算範圍</strong>
        <p>${unavailable.map(engine => esc(engine.meta.unavailableMessage)).join(' ')}</p>
      </div>` : ''}

    <div id="sec-overview" class="report-anchor"></div>
    ${buildSummarySection(report.summary)}
    <div class="overview-grid">${buildOverviewCards(report)}</div>

    <div id="sec-now" class="report-anchor"></div>
    ${buildAnnualPanel(report.insights?.annual)}

    <div id="sec-domains" class="report-anchor"></div>
    <h3 class="section-title"><span class="title-accent" aria-hidden="true">◇</span> 人生領域綜合</h3>
    <p class="section-subtitle">把官祿、夫妻、財帛與疾厄宮，和八字結構、目前大限放在同一張卡上閱讀。</p>
    ${buildDomainPanel(report.insights?.domains)}

    <div id="sec-guidance" class="report-anchor"></div>
    <h3 class="section-title"><span class="title-accent" aria-hidden="true">◌</span> 平衡與行動建議</h3>
    <p class="section-subtitle">以低風險的色彩、空間與生活習慣作為提醒；不把開運元素當成結果保證。</p>
    ${buildGuidancePanel(report.insights?.guidance)}

    <div id="sec-chart" class="report-anchor"></div>
    <h3 class="section-title"><span class="title-accent" aria-hidden="true">◇</span> 紫微十二宮命盤</h3>
    <p class="section-subtitle">點選宮位查看主星、四化與力量分數；色階同時搭配亮度文字，不只依靠顏色判讀。</p>
    ${buildZiweiChart(report)}

    <div id="sec-layers" class="report-anchor"></div>
    <h3 class="section-title"><span class="title-accent" aria-hidden="true">◈</span> 系統動靜屬性表</h3>
    <p class="section-subtitle">將命理特質依時間尺度分類（如恆定特質、階段運勢、情境面向），所有結果均為待驗證假說。</p>
    ${buildLayerTable(report)}

    <div id="sec-charts" class="report-anchor"></div>
    <h3 class="section-title"><span class="title-accent" aria-hidden="true">◈</span> 量化呈現</h3>
    <p class="section-subtitle">圖形只呈現報告中的既有數值；展開卡片可逐軸覆核公式與文字長條。</p>
    ${buildRadarSection(report)}

    <div id="sec-states" class="report-anchor"></div>
    <h3 class="section-title"><span class="title-accent" aria-hidden="true">⇄</span> 狀態切換表</h3>
    <p class="section-subtitle">每項情境假說都標示實際來源部件；資料不足時不補寫推論。</p>
    ${buildStateTablePanel(report.stateTable)}

    <div id="sec-evolution" class="report-anchor"></div>
    <h3 class="section-title"><span class="title-accent" aria-hidden="true">∿</span> 時期演化</h3>
    <p class="section-subtitle">依系統分列十年尺度的演化輪廓；展開各期可查看量化文字圖。</p>
    ${buildEvolutionPanel(report.evolution)}
  `;

  container.querySelector('#report-back').addEventListener('click', onBack);
  container.querySelector('#report-print').addEventListener('click', onPrint);
  initGlossary(container);
  initEvolutionPanel(container);
  initZiweiChart(container);

  const tocLinks = container.querySelectorAll('.report-toc__link');
  const anchors = container.querySelectorAll('.report-anchor');
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        for (const link of tocLinks) {
          link.classList.toggle('report-toc__link--active', link.getAttribute('href') === `#${entry.target.id}`);
        }
      }
    }
  }, { rootMargin: '-80px 0px -60% 0px', threshold: 0 });
  for (const anchor of anchors) observer.observe(anchor);

  const renderCharts = () => {
    for (const chart of container.__chartInstances ?? []) chart.destroy();
    container.__chartInstances = [];
    for (const radar of report.radars ?? []) {
      const canvas = [...container.querySelectorAll('canvas[data-radar-id]')]
        .find(node => node.dataset.radarId === radar.id);
      if (!canvas) continue;
      const chart = radar.kind === 'bar' ? renderBarChart(canvas, radar) : renderRadarChart(canvas, radar);
      container.__chartInstances.push(chart);
    }
  };
  container.__themeChartHandler = renderCharts;
  document.addEventListener('fortune-theme-change', renderCharts);
  renderCharts();
}
