/** @fileoverview Accessible 4×4 Zi Wei twelve-palace natal chart. */

const BRANCH_POSITIONS = Object.freeze({
  巳: [1, 1], 午: [1, 2], 未: [1, 3], 申: [1, 4],
  辰: [2, 1], 酉: [2, 4],
  卯: [3, 1], 戌: [3, 4],
  寅: [4, 1], 丑: [4, 2], 子: [4, 3], 亥: [4, 4],
});

const FALLBACK_POSITIONS = Object.freeze([
  [4, 3], [4, 2], [4, 1], [3, 1], [2, 1], [1, 1],
  [1, 2], [1, 3], [1, 4], [2, 4], [3, 4], [4, 4],
]);

const MUTAGEN_CLASS = Object.freeze({ 祿: 'lu', 權: 'quan', 科: 'ke', 忌: 'ji' });

function esc(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function engineById(report, id) {
  return report.engines?.find(engine => engine.engineId === id) ?? null;
}

function componentsByCategory(engine, category) {
  return engine?.components?.filter(component => component.category === category) ?? [];
}

function brightnessClass(score) {
  if (typeof score !== 'number') return 'neutral';
  if (score >= 0.75) return 'bright';
  if (score >= 0.45) return 'balanced';
  return 'challenged';
}

function strengthFor(palace, strengthRadar) {
  const axis = strengthRadar?.axes?.find(item => item.label === palace.name);
  return Math.max(0, Math.min(100, Number(axis?.value) || 0));
}

function starMarkup(star, compact = false) {
  const mutagen = star.mutagen
    ? `<span class="ziwei-mutagen ziwei-mutagen--${MUTAGEN_CLASS[star.mutagen] ?? 'other'}">${esc(star.mutagen)}</span>`
    : '';
  const brightness = !compact && star.brightness ? `<small>${esc(star.brightness)}</small>` : '';
  return `<span class="ziwei-star ziwei-star--${brightnessClass(star.brightnessScore)}">${esc(star.name)}${brightness}${mutagen}</span>`;
}

function palaceButton(component, strengthRadar, fallbackIndex, selectedIndex) {
  const palace = component.value ?? {};
  const [row, column] = BRANCH_POSITIONS[palace.earthlyBranch]
    ?? FALLBACK_POSITIONS[fallbackIndex % FALLBACK_POSITIONS.length];
  const score = strengthFor(palace, strengthRadar);
  const majorStars = palace.majorStars ?? [];
  const minorStars = palace.minorStars ?? [];
  const selected = palace.index === selectedIndex;
  const flags = [
    palace.name === '命宮' ? '<span class="ziwei-palace__flag">命</span>' : '',
    palace.isBodyPalace ? '<span class="ziwei-palace__flag">身</span>' : '',
  ].join('');

  return `
    <button type="button" class="ziwei-palace${selected ? ' ziwei-palace--selected' : ''}"
      style="grid-row:${row};grid-column:${column};--palace-strength:${score}%"
      data-palace-index="${esc(palace.index)}" aria-pressed="${selected}"
      title="${esc(palace.name)}力量 ${score} 分">
      <span class="ziwei-palace__strength" aria-hidden="true"></span>
      <span class="ziwei-palace__heading">
        <strong>${esc(palace.name)}</strong>
        <span>${esc(palace.heavenlyStem)}${esc(palace.earthlyBranch)}</span>
      </span>
      <span class="ziwei-palace__flags">${flags}</span>
      <span class="ziwei-palace__major">
        ${majorStars.length > 0 ? majorStars.map(star => starMarkup(star)).join('') : '<span class="ziwei-palace__empty">借對宮</span>'}
      </span>
      <span class="ziwei-palace__minor">
        ${minorStars.slice(0, 4).map(star => starMarkup(star, true)).join('')}
        ${minorStars.length > 4 ? `<span>＋${minorStars.length - 4}</span>` : ''}
      </span>
      <span class="ziwei-palace__score"><b>${score}</b> 分</span>
    </button>
  `;
}

function detailPanel(component, strengthRadar, selectedIndex) {
  const palace = component.value ?? {};
  const score = strengthFor(palace, strengthRadar);
  const stars = [...(palace.majorStars ?? []), ...(palace.minorStars ?? [])];
  const transformations = stars.filter(star => star.mutagen);
  const hidden = palace.index === selectedIndex ? '' : ' hidden';
  return `
    <div class="ziwei-chart__detail" data-palace-detail="${esc(palace.index)}"${hidden}>
      <p class="ziwei-chart__detail-kicker">選取宮位</p>
      <h5>${esc(palace.name)} <span>${esc(palace.heavenlyStem)}${esc(palace.earthlyBranch)}</span></h5>
      <p class="ziwei-chart__detail-score">力量 <strong>${score}</strong>／100</p>
      <p class="ziwei-chart__detail-stars">
        ${(palace.majorStars ?? []).length > 0
          ? (palace.majorStars ?? []).map(star => starMarkup(star)).join('')
          : '本宮無主星，解讀時參考對宮。'}
      </p>
      ${transformations.length > 0
        ? `<p class="ziwei-chart__detail-transform">四化：${transformations.map(star => `${esc(star.name)}化${esc(star.mutagen)}`).join('、')}</p>`
        : '<p class="ziwei-chart__detail-transform">本宮未見生年四化</p>'}
    </div>
  `;
}

/** Build the complete natal chart from existing report components. */
export function buildZiweiChart(report) {
  const ziwei = engineById(report, 'ziwei');
  const palaceComponents = componentsByCategory(ziwei, 'palaces');
  if (palaceComponents.length !== 12) {
    return '<div class="empty-state"><p class="empty-state__text">出生時辰不足或命盤資料不完整，暫不顯示十二宮盤。</p></div>';
  }

  const strengthRadar = report.radars?.find(radar => radar.id === 'ziwei_palace_strength');
  const soul = palaceComponents.find(component => component.value?.name === '命宮') ?? palaceComponents[0];
  const selectedIndex = soul.value?.index;
  const natal = componentsByCategory(ziwei, 'natal')[0]?.value ?? {};
  const body = palaceComponents.find(component => component.value?.isBodyPalace);

  return `
    <div class="ziwei-chart" aria-label="紫微斗數十二宮命盤">
      ${palaceComponents.map((component, index) => palaceButton(component, strengthRadar, index, selectedIndex)).join('')}
      <section class="ziwei-chart__center" aria-live="polite">
        <div class="ziwei-chart__identity">
          <p>紫微斗數 · 本命盤</p>
          <strong>${esc(report.input?.name || '命主')}</strong>
          <span>${esc(ziwei.meta?.fiveElementsClass ?? natal.fiveElementsClass ?? '')}</span>
          <span>命主 ${esc(natal.soul ?? '—')} · 身主 ${esc(natal.body ?? '—')}</span>
          <span>身宮 ${esc(body?.value?.name ?? '—')}</span>
        </div>
        ${palaceComponents.map(component => detailPanel(component, strengthRadar, selectedIndex)).join('')}
      </section>
    </div>
    <p class="ziwei-chart__legend">
      <span><i class="ziwei-legend-dot ziwei-legend-dot--bright"></i>高亮度主星</span>
      <span><i class="ziwei-legend-dot ziwei-legend-dot--balanced"></i>中段亮度</span>
      <span><i class="ziwei-legend-dot ziwei-legend-dot--challenged"></i>低段亮度</span>
      <span>宮位上緣顯示力量分數</span>
    </p>
  `;
}

/** Enable palace selection without recalculating the chart. */
export function initZiweiChart(container) {
  const chart = container.querySelector('.ziwei-chart');
  if (!chart) return;
  const buttons = [...chart.querySelectorAll('.ziwei-palace')];
  const panels = [...chart.querySelectorAll('[data-palace-detail]')];
  buttons.forEach(button => {
    button.addEventListener('click', () => {
      const selectedIndex = button.dataset.palaceIndex;
      buttons.forEach(item => {
        const selected = item === button;
        item.classList.toggle('ziwei-palace--selected', selected);
        item.setAttribute('aria-pressed', String(selected));
      });
      panels.forEach(panel => {
        panel.hidden = panel.dataset.palaceDetail !== selectedIndex;
      });
    });
  });
}

