/**
 * @fileoverview 報告呈現（App 層，非核心）。
 *
 * 只消費 `analyze()` 產出的 `Report`，不做任何計算。目前為文字降級版
 * （TextFallback 長條）；雷達圖（Chart.js）於里程碑 C 接上 `report.radars`。
 *
 * @module ui/ReportView
 */

import { renderTextBar, renderDigitFrequency } from '../visualization/TextFallback.js';
import { ScoringRules } from '../analysis/ScoringRules.js';

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

// ─── Text-fallback bars (區塊 G 降級呈現) ───────────────────────────────────

function buildTextCharts(report) {
  const blocks = [];

  const numerology = engineById(report, 'numerology');
  const freq = firstValue(numerology, 'digitFrequency');
  if (freq) {
    blocks.push({
      title: '靈數｜1–9 數字頻次（出生年月日各位數出現次數）',
      body: renderDigitFrequency(freq),
    });
  }

  const ziwei = engineById(report, 'ziwei');
  if (ziwei) {
    const stars = ziwei.components.filter(c => c.category === 'mainStars' && c.value.brightnessScore !== null);
    if (stars.length > 0) {
      const bars = stars.map(s =>
        renderTextBar(`${s.value.star}`, Math.round(s.value.brightnessScore * 100), 100, { labelWidth: 4 })
      ).join('\n');
      blocks.push({
        title: '紫微｜主星亮度（廟7…陷1 ÷ 7，計分規則見下方透明度報告）',
        body: bars,
      });
    }
  }

  return blocks.map(b => `
    <div class="chart-container chart-container--bar">
      <p class="chart-score__label">${b.title}</p>
      <pre style="overflow-x:auto">${esc(b.body)}</pre>
    </div>
  `).join('');
}

// ─── Pending shells (區塊 G 雷達 / H②③) ────────────────────────────────────

function buildPendingBlocks(report) {
  const items = [
    { icon: '◔', text: '雷達圖與資產/負債並列（區塊 G）— 里程碑 C' },
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
  const scoringText = new ScoringRules().generateTransparencyReport();

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

    <h3 class="section-title"><span class="title-accent" aria-hidden="true">◈</span> 量化呈現（文字降級版）</h3>
    ${buildTextCharts(report)}

    <div class="scoring-rules">
      <details>
        <summary class="scoring-rules__toggle">▸ 評分規則透明度報告（每一軸的計分方式，共 ${report.scoringRules.totalRules} 條）</summary>
        <pre class="scoring-formula" style="overflow-x:auto">${esc(scoringText)}</pre>
      </details>
    </div>

    <h3 class="section-title"><span class="title-accent" aria-hidden="true">◈</span> 待完成區塊</h3>
    ${buildPendingBlocks(report)}
  `;

  container.querySelector('#report-back').addEventListener('click', onBack);
}
