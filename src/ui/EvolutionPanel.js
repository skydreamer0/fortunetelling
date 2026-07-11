/** @fileoverview Read-only timeline rendering for Report.evolution (Block H③). */

import { renderTextBar } from '../visualization/TextFallback.js';

function esc(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function radarFallback(radar) {
  return (radar?.axes ?? []).map(axis =>
    renderTextBar(axis.label, axis.value, 100, { labelWidth: 8, barWidth: 18 })
  ).join('\n');
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

function periodCard(period) {
  const [start, end] = period.range;
  const sysName = SYSTEM_NAMES[period.system] || period.system;
  const currentClass = period.isCurrent ? ' decade-radar-card--current' : '';
  return `
    <article class="timeline-node decade-radar-card${currentClass}">
      <div class="timeline-node__marker" aria-hidden="true"></div>
      <div class="timeline-node__content">
        <header class="decade-card__header">
          <span class="tag tag--${esc(period.system)}">${esc(sysName)}</span>
          ${period.isCurrent ? '<span class="tag tag--current">當前時期</span>' : ''}
          <h5>${esc(period.label)}</h5>
          <span class="decade-card__range">${esc(start)}–${esc(end)}</span>
        </header>
        <ul class="evolution-summary">
          ${(period.summary ?? []).map(line => `<li>${esc(line)}</li>`).join('')}
        </ul>
        <details class="evolution-radar-fallback">
          <summary>查看此時期量化輪廓</summary>
          <pre>${esc(radarFallback(period.radar))}</pre>
        </details>
      </div>
    </article>
  `;
}

/** Render bazi and ziwei periods as two auditable timelines. */
export function buildEvolutionPanel(evolution) {
  if (evolution?.pending) {
    return '<div class="empty-state"><p class="empty-state__text">時期演化資料尚未完成。</p></div>';
  }

  const periods = evolution?.periods ?? [];
  if (periods.length === 0) {
    return '<div class="empty-state"><p class="empty-state__text">目前沒有可呈現的時期演化資料。</p></div>';
  }

  const groups = [
    { id: 'bazi', title: '八字大運', periods: periods.filter(period => period.system === 'bazi') },
    { id: 'ziwei', title: '紫微大限', periods: periods.filter(period => period.system === 'ziwei') },
  ].filter(group => group.periods.length > 0);

  return `
    ${evolution.narrative ? `<p class="evolution-narrative">${esc(evolution.narrative)}</p>` : ''}
    <div class="evolution-grid">
      ${groups.map(group => `
        <section class="evolution-system" data-system="${group.id}">
          <h4 class="evolution-system__title">${group.title}<span>${group.periods.length} 個時期</span></h4>
          <div class="timeline">${group.periods.map(periodCard).join('')}</div>
        </section>
      `).join('')}
    </div>
  `;
}
