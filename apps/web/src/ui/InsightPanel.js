/** Read-only rendering for Report.insights. */

const SYSTEM_NAMES = Object.freeze({
  bazi: '八字', ziwei: '紫微斗數', numerology: '生命靈數', minggua: '八宅命卦', dreamspell: '馬雅曆 Kin',
});

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function sourceChips(sources) {
  if (!sources?.length) return '';
  return `<div class="insight-sources" aria-label="資料來源">${sources.map(item => `
    <span class="insight-source tag tag--${esc(item.system)}" title="${esc(item.system)}/${esc(item.componentId)}">
      ${esc(SYSTEM_NAMES[item.system] ?? item.system)} · ${esc(item.name)}
    </span>`).join('')}</div>`;
}

export function buildAnnualPanel(annual) {
  if (!annual?.themes?.length) {
    return '<div class="empty-state"><p class="empty-state__text">本年資料不足，不產生年度推論。</p></div>';
  }
  return `
    <section class="annual-card border-double" aria-labelledby="annual-title">
      <div class="annual-card__heading">
        <span class="annual-card__year" aria-hidden="true">${esc(annual.year)}</span>
        <div><p class="annual-card__eyebrow">NOW · 年度觀察</p><h3 id="annual-title">${esc(annual.title)}</h3><p>${esc(annual.headline)}</p></div>
      </div>
      <div class="annual-themes">
        ${annual.themes.map((theme, index) => `
          <article class="annual-theme">
            <span class="annual-theme__index">0${index + 1}</span>
            <h4>${esc(theme.title)}</h4>
            <p>${esc(theme.text)}</p>
            ${sourceChips(theme.sources)}
          </article>`).join('')}
      </div>
      <p class="insight-limitation">${esc(annual.limitations?.[0])}</p>
    </section>`;
}

export function buildDomainPanel(domains) {
  if (!domains?.length) return '<div class="empty-state"><p class="empty-state__text">人生領域資料不足。</p></div>';
  return `<div class="domain-grid">${domains.map(domain => `
    <article class="domain-card domain-card--${esc(domain.id)}">
      <header class="domain-card__header">
        <div><p class="domain-card__focus">${esc(domain.focus)}</p><h4>${esc(domain.title)}</h4></div>
        ${domain.score == null ? '<span class="domain-card__score domain-card__score--empty">—</span>' : `<span class="domain-card__score"><strong>${esc(domain.score)}</strong><small>分</small></span>`}
      </header>
      ${domain.score == null ? '' : `<div class="domain-meter" role="img" aria-label="${esc(domain.palace)}宮力量 ${esc(domain.score)} 分"><span style="--domain-score:${esc(domain.score)}%"></span></div>`}
      <p class="domain-card__insight">${esc(domain.insight)}</p>
      ${domain.stage ? `<p class="domain-card__stage">${esc(domain.stage)}</p>` : ''}
      ${domain.metrics?.length ? `<dl class="domain-metrics">${domain.metrics.map(metric => `<div><dt>${esc(metric.label)}</dt><dd>${esc(metric.value)} <small>${esc(metric.unit)}</small></dd></div>`).join('')}</dl>` : ''}
      ${sourceChips(domain.sources)}
      ${(domain.limitations ?? []).map(text => `<p class="insight-limitation">${esc(text)}</p>`).join('')}
    </article>`).join('')}</div>`;
}

export function buildGuidancePanel(guidance) {
  if (!guidance) return '<div class="empty-state"><p class="empty-state__text">平衡建議資料不足。</p></div>';
  const balance = guidance.balance;
  return `
    <div class="guidance-grid">
      <article class="guidance-card guidance-card--balance">
        <p class="guidance-card__eyebrow">五行平衡</p>
        <h4>${balance ? `從「${esc(balance.element)}」開始小幅調整` : '時辰資料不足，未判定五行補益'}</h4>
        ${balance ? `
          <p>${esc(balance.text)}</p>
          <dl class="guidance-list">
            <div><dt>色彩</dt><dd>${esc(balance.color)}</dd></div>
            <div><dt>方位</dt><dd>${esc(balance.direction)}</dd></div>
            <div><dt>習慣</dt><dd>${esc(balance.habit)}</dd></div>
          </dl>
          <p class="insight-limitation">${esc(balance.limitation)}</p>` : '<p>仍可參考八宅吉方與生命靈數的提醒符號。</p>'}
      </article>
      <article class="guidance-card">
        <p class="guidance-card__eyebrow">八宅四吉方</p>
        <h4>把方位當成空間整理的提示</h4>
        ${guidance.directions?.length ? `<div class="direction-grid">${guidance.directions.map(item => `
          <div class="direction-item"><span>${esc(item.name)}</span><strong>${esc(item.direction)}</strong><small>${esc(item.code)}</small></div>`).join('')}</div>` : '<p>沒有可用的八宅方位資料。</p>'}
      </article>
      <article class="guidance-card guidance-card--numbers">
        <p class="guidance-card__eyebrow">生命靈數</p>
        <h4>${esc(guidance.numberLabel)}</h4>
        ${guidance.numbers?.length ? `<div class="guidance-numbers">${guidance.numbers.map(number => `<span>${esc(number)}</span>`).join('')}</div>` : '<p>沒有可用的數字資料。</p>'}
        <p>可用於日誌標記或習慣提醒，不把數字當成事件保證。</p>
      </article>
    </div>
    ${sourceChips(guidance.sources)}
    <div class="guidance-disclaimer">${(guidance.limitations ?? []).map(text => `<p>${esc(text)}</p>`).join('')}</div>`;
}
