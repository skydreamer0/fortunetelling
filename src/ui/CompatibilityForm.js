/** Accessible two-person entry form for compatibility comparison. */

import { parseIsoDate, toIsoDate } from '../core/calendar.js';

const PERIODS = Object.freeze([
  [0, '子時 23–01'], [2, '丑時 01–03'], [4, '寅時 03–05'], [6, '卯時 05–07'],
  [8, '辰時 07–09'], [10, '巳時 09–11'], [12, '午時 11–13'], [14, '未時 13–15'],
  [16, '申時 15–17'], [18, '酉時 17–19'], [20, '戌時 19–21'], [22, '亥時 21–23'],
]);

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function representativeHour(hour = 12) {
  if (hour >= 23 || hour < 1) return 0;
  return Math.floor((hour + 1) / 2) * 2;
}

function personFields(key, label, initial = {}, defaultDate) {
  const date = Number.isInteger(Number(initial.year)) ? toIsoDate(initial) : defaultDate;
  const timeKnown = initial.timeKnown !== false;
  const hour = representativeHour(Number(initial.hour ?? 12));
  return `
    <fieldset class="compat-person" data-person="${key}">
      <legend><span>${label}</span>${key === 'first' ? '第一位' : '第二位'}</legend>
      <div class="compat-person__grid">
        <div class="form-group form-group--full"><label class="form-group__label" for="c-${key}-name">姓名／暱稱</label>
          <input class="form-group__input" id="c-${key}-name" value="${esc(initial.name)}" placeholder="${label === 'A' ? '例如：自己' : '例如：對方'}" /></div>
        <div class="form-group"><label class="form-group__label" for="c-${key}-gender">性別</label>
          <select class="form-group__input" id="c-${key}-gender"><option value="male"${initial.gender === 'male' ? ' selected' : ''}>男</option><option value="female"${initial.gender === 'female' ? ' selected' : ''}>女</option></select></div>
        <div class="form-group"><label class="form-group__label" for="c-${key}-date">國曆生日</label>
          <input class="form-group__input" id="c-${key}-date" type="date" min="1900-01-01" max="2100-12-31" value="${esc(date)}" required /></div>
        <div class="form-group form-group--full"><label class="form-group__label" for="c-${key}-hour">出生時辰</label>
          <select class="form-group__input" id="c-${key}-hour"${timeKnown ? '' : ' disabled'}>${PERIODS.map(([value, text]) => `<option value="${value}"${value === hour ? ' selected' : ''}>${text}</option>`).join('')}</select></div>
        <label class="form-check form-group--full"><input id="c-${key}-unknown" type="checkbox"${timeKnown ? '' : ' checked'} /> 不確定出生時辰</label>
      </div>
    </fieldset>`;
}

function readPerson(container, key) {
  const date = parseIsoDate(container.querySelector(`#c-${key}-date`).value);
  const unknown = container.querySelector(`#c-${key}-unknown`).checked;
  return {
    name: container.querySelector(`#c-${key}-name`).value.trim(),
    ...date,
    gender: container.querySelector(`#c-${key}-gender`).value,
    hour: unknown ? 12 : Number.parseInt(container.querySelector(`#c-${key}-hour`).value, 10),
    minute: 0,
    timeKnown: !unknown,
  };
}

export function renderCompatibilityForm(container, { onSubmit, initialValues = {} } = {}) {
  container.innerHTML = `
    <div class="compat-form-card">
      <div class="form-privacy-note"><span aria-hidden="true">◇</span><span><strong>兩人的資料都只留在這個瀏覽器。</strong>合盤不會上傳，也不預測關係成敗。</span></div>
      <form id="compat-form" novalidate>
        <div class="compat-people">
          ${personFields('first', 'A', initialValues.first, '1991-10-05')}
          <div class="compat-between" aria-hidden="true"><span>合</span></div>
          ${personFields('second', 'B', initialValues.second, '1986-05-29')}
        </div>
        <p class="form-field-hint compat-calendar-hint">若只記得農曆生日，可先在「單人分析」切換農曆並確認轉換後的國曆日期。</p>
        <p class="form-group__error" id="compat-error" role="alert"></p>
        <div class="form-actions"><button type="submit" class="form-submit"><span class="form-submit__text">比較互補與摩擦軸</span></button></div>
      </form>
    </div>`;

  for (const key of ['first', 'second']) {
    const unknown = container.querySelector(`#c-${key}-unknown`);
    const hour = container.querySelector(`#c-${key}-hour`);
    unknown.addEventListener('change', () => { hour.disabled = unknown.checked; });
  }

  container.querySelector('#compat-form').addEventListener('submit', event => {
    event.preventDefault();
    const error = container.querySelector('#compat-error');
    error.classList.remove('form-group__error--visible');
    try {
      onSubmit({ first: readPerson(container, 'first'), second: readPerson(container, 'second') });
    } catch (caught) {
      error.textContent = caught.message;
      error.classList.add('form-group__error--visible');
    }
  });
}
