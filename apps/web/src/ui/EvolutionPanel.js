/** @fileoverview Compact, interactive timeline rendering for Report.evolution. */

import { TextFallback } from '@fortune/core';

const { renderTextBar } = TextFallback;

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

const SYSTEM_NAMES = Object.freeze({ bazi: '八字', ziwei: '紫微斗數' });

function shortPeriodLabel(period) {
  const match = period.label.match(/\s(.+?)(?:大運|大限)/);
  return match?.[1] ?? period.label;
}

function periodCard(period, groupId, index, activeIndex) {
  const [start, end] = period.range;
  const sysName = SYSTEM_NAMES[period.system] || period.system;
  const distance = Math.abs(index - activeIndex);
  const currentClass = period.isCurrent ? ' decade-radar-card--current' : '';
  const activeClass = distance === 0 ? ' evolution-period-card--active' : ' evolution-period-card--adjacent';
  const hidden = distance > 1 ? ' hidden' : '';

  return `
    <article class="evolution-period-card decade-radar-card${currentClass} ${activeClass}"
      id="${groupId}-period-${index}" data-period-index="${index}" data-distance="${distance}"${hidden}>
      <header class="decade-card__header">
        <span class="tag tag--${esc(period.system)}">${esc(sysName)}</span>
        ${period.isCurrent ? '<span class="tag tag--current">當前時期</span>' : ''}
        <h5>${esc(period.label)}</h5>
        <span class="decade-card__range">${esc(start)}–${esc(end)}</span>
      </header>
      <p class="evolution-period-card__preview">${esc(period.summary?.[0] ?? '')}</p>
      <div class="evolution-period-card__full">
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

function timelineButton(period, groupId, index, activeIndex) {
  const selected = index === activeIndex;
  return `
    <button type="button" class="evolution-track__node${selected ? ' evolution-track__node--active' : ''}${period.isCurrent ? ' evolution-track__node--current' : ''}"
      role="tab" aria-selected="${selected}" aria-controls="${groupId}-period-${index}"
      data-period-index="${index}">
      <span class="evolution-track__dot" aria-hidden="true"></span>
      <span class="evolution-track__year">${esc(period.range[0])}</span>
      <span class="evolution-track__label">${esc(shortPeriodLabel(period))}</span>
    </button>
  `;
}

/** Render bazi and ziwei periods as two compact, auditable timelines. */
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
      ${groups.map(group => {
        const activeIndex = Math.max(0, group.periods.findIndex(period => period.isCurrent));
        const groupId = `evolution-${group.id}`;
        return `
          <section class="evolution-system" data-evolution-group="${group.id}" data-active-index="${activeIndex}">
            <header class="evolution-system__header">
              <h4 class="evolution-system__title">${group.title}<span>${group.periods.length} 個時期</span></h4>
              <p>時間軸只展開目前焦點與前後一期；選取任一節點即可切換。</p>
            </header>
            <div class="evolution-track-wrap">
              <div class="evolution-track" role="tablist" aria-label="${group.title}時間軸">
                ${group.periods.map((period, index) => timelineButton(period, groupId, index, activeIndex)).join('')}
              </div>
            </div>
            <div class="evolution-period-stage" aria-live="polite">
              ${group.periods.map((period, index) => periodCard(period, groupId, index, activeIndex)).join('')}
            </div>
          </section>
        `;
      }).join('')}
    </div>
  `;
}

/** Wire timeline selection after ReportView has inserted the panel HTML. */
export function initEvolutionPanel(container) {
  for (const group of container.querySelectorAll('[data-evolution-group]')) {
    const buttons = [...group.querySelectorAll('.evolution-track__node')];
    const cards = [...group.querySelectorAll('.evolution-period-card')];

    const select = (index, { focus = false } = {}) => {
      group.dataset.activeIndex = String(index);
      buttons.forEach((button, buttonIndex) => {
        const active = buttonIndex === index;
        button.classList.toggle('evolution-track__node--active', active);
        button.setAttribute('aria-selected', String(active));
        button.tabIndex = active ? 0 : -1;
      });
      cards.forEach((card, cardIndex) => {
        const distance = Math.abs(cardIndex - index);
        card.hidden = distance > 1;
        card.dataset.distance = String(distance);
        card.classList.toggle('evolution-period-card--active', distance === 0);
        card.classList.toggle('evolution-period-card--adjacent', distance === 1);
      });
      if (focus) {
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        buttons[index]?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest', inline: 'center' });
      }
    };

    buttons.forEach((button, index) => {
      button.addEventListener('click', () => select(index, { focus: true }));
      button.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const nextIndex = event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? buttons.length - 1
            : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
        select(nextIndex, { focus: true });
        buttons[nextIndex].focus();
      });
    });

    select(Number(group.dataset.activeIndex) || 0);
  }
}
