/** @fileoverview Accessible solar/lunar birth-data input form. */

import {
  lunarToSolarDate,
  parseIsoDate,
  solarToLunarDate,
  toIsoDate,
} from '../core/calendar.js';

const TIME_PERIODS = Object.freeze([
  [0, '子時｜23:00–01:00'], [2, '丑時｜01:00–03:00'], [4, '寅時｜03:00–05:00'],
  [6, '卯時｜05:00–07:00'], [8, '辰時｜07:00–09:00'], [10, '巳時｜09:00–11:00'],
  [12, '午時｜11:00–13:00'], [14, '未時｜13:00–15:00'], [16, '申時｜15:00–17:00'],
  [18, '酉時｜17:00–19:00'], [20, '戌時｜19:00–21:00'], [22, '亥時｜21:00–23:00'],
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

function recentMarkup(recentQueries) {
  if (!recentQueries.length) return '';
  return `
    <aside class="recent-queries" aria-labelledby="recent-title">
      <div class="recent-queries__header">
        <div><p class="recent-queries__eyebrow">僅儲存在這台裝置</p><h3 id="recent-title">最近查詢</h3></div>
        <button type="button" class="recent-queries__clear" id="clear-recent">清除</button>
      </div>
      <div class="recent-queries__list">
        ${recentQueries.map((item, index) => {
          const input = item.input;
          const identity = input.name || `${input.gender === 'female' ? '女' : '男'}命`;
          const time = input.timeKnown === false ? '時辰不確定' : TIME_PERIODS.find(([hour]) => hour === representativeHour(input.hour))?.[1].split('｜')[0];
          return `<button type="button" class="recent-query" data-recent-index="${index}">
            <span class="recent-query__name">${esc(identity)}</span>
            <span class="recent-query__meta">${input.year}.${String(input.month).padStart(2, '0')}.${String(input.day).padStart(2, '0')} · ${esc(time)}</span>
          </button>`;
        }).join('')}
      </div>
    </aside>`;
}

/** Render the input form and wire its local-only interactions. */
export function renderInputForm(container, {
  onSubmit,
  initialValues = {},
  recentQueries = [],
  onClearRecent = () => {},
} = {}) {
  const initialDate = Number.isInteger(Number(initialValues.year))
    ? toIsoDate(initialValues)
    : '1991-10-05';
  const initialCalendar = initialValues.calendarType === 'lunar' ? 'lunar' : 'solar';
  const fallbackLunar = solarToLunarDate(parseIsoDate(initialDate));
  const initialLunar = initialValues.lunarInput ?? fallbackLunar;
  const initialGender = initialValues.gender === 'female' ? 'female' : 'male';
  const initialTimeKnown = initialValues.timeKnown !== false;
  const selectedHour = representativeHour(Number(initialValues.hour ?? 14));

  container.innerHTML = `
    <div class="input-layout">
      <div class="input-form-card">
        <form id="birth-form" novalidate>
          <div class="form-privacy-note">
            <span aria-hidden="true">◇</span>
            <span><strong>資料只存在你的瀏覽器。</strong>不需登入，也不會上傳出生資料。</span>
          </div>

          <p class="form-section-label">基本資料</p>
          <div class="form-grid">
            <div class="form-group form-group--full">
              <label class="form-group__label" for="f-name">姓名（選填）</label>
              <input class="form-group__input" id="f-name" name="name" type="text"
                     value="${esc(initialValues.name)}" placeholder="輸入英文拼音可加算表達數" autocomplete="name" />
              <p class="form-field-hint">中文姓名仍可作為報告標題；英文拼音會額外計算姓名靈數。</p>
            </div>
            <fieldset class="form-group form-fieldset">
              <legend class="form-group__label">性別</legend>
              <div class="gender-toggle" role="radiogroup" aria-label="性別">
                <button type="button" class="gender-toggle__option${initialGender === 'male' ? ' gender-toggle__option--active' : ''}"
                        data-gender="male" role="radio" aria-checked="${initialGender === 'male'}" tabindex="${initialGender === 'male' ? 0 : -1}">男</button>
                <button type="button" class="gender-toggle__option${initialGender === 'female' ? ' gender-toggle__option--active' : ''}"
                        data-gender="female" role="radio" aria-checked="${initialGender === 'female'}" tabindex="${initialGender === 'female' ? 0 : -1}">女</button>
              </div>
            </fieldset>
          </div>

          <div class="form-section-heading">
            <p class="form-section-label">出生日期</p>
            <div class="calendar-toggle" role="radiogroup" aria-label="曆法">
              <button type="button" data-calendar="solar" role="radio" aria-checked="${initialCalendar === 'solar'}" class="calendar-toggle__option${initialCalendar === 'solar' ? ' is-active' : ''}">國曆</button>
              <button type="button" data-calendar="lunar" role="radio" aria-checked="${initialCalendar === 'lunar'}" class="calendar-toggle__option${initialCalendar === 'lunar' ? ' is-active' : ''}">農曆</button>
            </div>
          </div>

          <div id="solar-fields"${initialCalendar === 'lunar' ? ' hidden' : ''}>
            <div class="form-group">
              <label class="form-group__label" for="f-date">國曆生日</label>
              <input class="form-group__input" id="f-date" name="date" type="date"
                     min="1900-01-01" max="2100-12-31" value="${esc(initialDate)}" required />
            </div>
          </div>

          <div id="lunar-fields"${initialCalendar === 'solar' ? ' hidden' : ''}>
            <div class="form-lunar-row">
              <div class="form-group"><label class="form-group__label" for="f-lunar-year">農曆年</label>
                <input class="form-group__input" id="f-lunar-year" type="number" min="1900" max="2100" value="${esc(initialLunar.year)}" /></div>
              <div class="form-group"><label class="form-group__label" for="f-lunar-month">月</label>
                <select class="form-group__input" id="f-lunar-month">${Array.from({ length: 12 }, (_, index) => `<option value="${index + 1}"${Number(initialLunar.month) === index + 1 ? ' selected' : ''}>${index + 1} 月</option>`).join('')}</select></div>
              <div class="form-group"><label class="form-group__label" for="f-lunar-day">日</label>
                <select class="form-group__input" id="f-lunar-day">${Array.from({ length: 30 }, (_, index) => `<option value="${index + 1}"${Number(initialLunar.day) === index + 1 ? ' selected' : ''}>${index + 1} 日</option>`).join('')}</select></div>
            </div>
            <label class="form-check"><input id="f-lunar-leap" type="checkbox"${initialLunar.isLeap ? ' checked' : ''} /> 此月為閏月</label>
          </div>

          <p class="form-section-label">出生時辰</p>
          <div class="form-time-row">
            <div class="form-group">
              <label class="form-group__label" for="f-hour">十二時辰</label>
              <select class="form-group__input" id="f-hour"${initialTimeKnown ? '' : ' disabled'}>
                ${TIME_PERIODS.map(([hour, label]) => `<option value="${hour}"${selectedHour === hour ? ' selected' : ''}>${label}</option>`).join('')}
              </select>
            </div>
            <label class="form-check form-check--time"><input id="f-time-unknown" type="checkbox"${initialTimeKnown ? '' : ' checked'} /> 我不確定出生時辰</label>
          </div>
          <p class="form-field-hint" id="time-scope-note"${initialTimeKnown ? ' hidden' : ''}>仍可查看生命靈數、八宅命卦與不依賴時辰的內容；八字、紫微會標示為未計算。</p>

          <p class="form-group__error" id="form-error" role="alert"></p>
          <div class="form-actions">
            <button type="submit" class="form-submit"><span class="form-submit__text">開始綜合分析</span></button>
            <button type="button" class="form-example-btn" id="fill-example">使用範例資料</button>
          </div>
        </form>
      </div>
      ${recentMarkup(recentQueries)}
    </div>`;

  const form = container.querySelector('#birth-form');
  const errorEl = container.querySelector('#form-error');
  const dateInput = container.querySelector('#f-date');
  const solarFields = container.querySelector('#solar-fields');
  const lunarFields = container.querySelector('#lunar-fields');
  const hourSelect = container.querySelector('#f-hour');
  const unknownTime = container.querySelector('#f-time-unknown');
  const timeScopeNote = container.querySelector('#time-scope-note');
  let gender = initialGender;
  let calendarType = initialCalendar;

  function showError(message) {
    errorEl.textContent = message;
    errorEl.classList.toggle('form-group__error--visible', Boolean(message));
  }

  const genderButtons = [...container.querySelectorAll('[data-gender]')];
  function selectGender(button, focus = true) {
    gender = button.dataset.gender;
    for (const item of genderButtons) {
      const active = item === button;
      item.classList.toggle('gender-toggle__option--active', active);
      item.setAttribute('aria-checked', String(active));
      item.tabIndex = active ? 0 : -1;
    }
    if (focus) button.focus();
  }
  for (const button of genderButtons) {
    button.addEventListener('click', () => selectGender(button));
    button.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const offset = event.key === 'ArrowRight' ? 1 : genderButtons.length - 1;
      selectGender(genderButtons[(genderButtons.indexOf(button) + offset) % genderButtons.length]);
    });
  }

  function readLunar() {
    return {
      year: Number.parseInt(container.querySelector('#f-lunar-year').value, 10),
      month: Number.parseInt(container.querySelector('#f-lunar-month').value, 10),
      day: Number.parseInt(container.querySelector('#f-lunar-day').value, 10),
      isLeap: container.querySelector('#f-lunar-leap').checked,
    };
  }

  const calendarButtons = [...container.querySelectorAll('[data-calendar]')];
  function setCalendar(type) {
    try {
      if (type === 'lunar' && calendarType === 'solar') {
        const lunar = solarToLunarDate(parseIsoDate(dateInput.value));
        container.querySelector('#f-lunar-year').value = lunar.year;
        container.querySelector('#f-lunar-month').value = lunar.month;
        container.querySelector('#f-lunar-day').value = lunar.day;
        container.querySelector('#f-lunar-leap').checked = lunar.isLeap;
      } else if (type === 'solar' && calendarType === 'lunar') {
        dateInput.value = lunarToSolarDate(readLunar()).iso;
      }
      calendarType = type;
      solarFields.hidden = type !== 'solar';
      lunarFields.hidden = type !== 'lunar';
      for (const button of calendarButtons) {
        const active = button.dataset.calendar === type;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-checked', String(active));
      }
      showError('');
    } catch (error) {
      showError(error.message);
    }
  }
  for (const button of calendarButtons) button.addEventListener('click', () => setCalendar(button.dataset.calendar));

  unknownTime.addEventListener('change', () => {
    hourSelect.disabled = unknownTime.checked;
    timeScopeNote.hidden = !unknownTime.checked;
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    showError('');
    try {
      const lunarInput = calendarType === 'lunar' ? readLunar() : null;
      const date = calendarType === 'solar'
        ? parseIsoDate(dateInput.value)
        : lunarToSolarDate(lunarInput);
      onSubmit({
        name: container.querySelector('#f-name').value.trim(),
        ...date,
        hour: unknownTime.checked ? 12 : Number.parseInt(hourSelect.value, 10),
        minute: 0,
        timeKnown: !unknownTime.checked,
        gender,
        calendarType,
        ...(lunarInput ? { lunarInput } : {}),
      });
    } catch (error) {
      showError(error.message);
    }
  });

  container.querySelector('#fill-example').addEventListener('click', () => {
    container.querySelector('#f-name').value = 'Wang Xiaoming';
    dateInput.value = '1991-10-05';
    hourSelect.value = '14';
    unknownTime.checked = false;
    hourSelect.disabled = false;
    timeScopeNote.hidden = true;
    selectGender(genderButtons.find(button => button.dataset.gender === 'female'), false);
    setCalendar('solar');
  });

  for (const button of container.querySelectorAll('[data-recent-index]')) {
    button.addEventListener('click', () => {
      const selected = recentQueries[Number(button.dataset.recentIndex)]?.input;
      if (selected) renderInputForm(container, { onSubmit, initialValues: selected, recentQueries, onClearRecent });
    });
  }
  container.querySelector('#clear-recent')?.addEventListener('click', () => onClearRecent());
}
