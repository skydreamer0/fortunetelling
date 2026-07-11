/**
 * @fileoverview 出生資料輸入表單（App 層，非核心）。
 *
 * 只負責收集輸入並回呼 `onSubmit(params)`；所有計算都在核心的 `analyze()`。
 * Markup 對應 `src/styles/components.css` 既有的 design-system class。
 *
 * @module ui/InputForm
 */

/**
 * @param {HTMLElement} container
 * @param {Object} options
 * @param {(params: Object) => void} options.onSubmit - 收到合法輸入時回呼
 */
export function renderInputForm(container, { onSubmit }) {
  container.innerHTML = `
    <div class="input-form-card">
      <form id="birth-form" novalidate>
        <p class="form-section-label">基本資料</p>
        <div class="form-grid">
          <div class="form-group form-group--full">
            <label class="form-group__label" for="f-name">
              <span class="form-group__label-icon">✎</span>姓名（選填，拉丁字母才計靈數）
            </label>
            <input class="form-group__input" id="f-name" name="name" type="text"
                   placeholder="e.g. Wang Xiaoming" autocomplete="name" />
          </div>

          <div class="form-group">
            <label class="form-group__label" for="f-gender">
              <span class="form-group__label-icon">☯</span>性別
            </label>
            <div class="gender-toggle" id="f-gender" role="radiogroup" aria-label="性別">
              <button type="button" class="gender-toggle__option gender-toggle__option--active"
                      data-gender="male" aria-pressed="true">男</button>
              <button type="button" class="gender-toggle__option"
                      data-gender="female" aria-pressed="false">女</button>
            </div>
          </div>
        </div>

        <p class="form-section-label">出生日期（國曆）</p>
        <div class="form-datetime-row">
          <div class="form-group">
            <label class="form-group__label" for="f-year">年</label>
            <input class="form-group__input" id="f-year" name="year" type="number"
                   min="1900" max="2100" placeholder="1991" required />
          </div>
          <div class="form-group">
            <label class="form-group__label" for="f-month">月</label>
            <input class="form-group__input" id="f-month" name="month" type="number"
                   min="1" max="12" placeholder="10" required />
          </div>
          <div class="form-group">
            <label class="form-group__label" for="f-day">日</label>
            <input class="form-group__input" id="f-day" name="day" type="number"
                   min="1" max="31" placeholder="5" required />
          </div>
        </div>

        <p class="form-section-label">出生時間</p>
        <div class="form-time-row">
          <div class="form-group">
            <label class="form-group__label" for="f-hour">時（0–23）</label>
            <input class="form-group__input" id="f-hour" name="hour" type="number"
                   min="0" max="23" placeholder="14" required />
          </div>
          <div class="form-group">
            <label class="form-group__label" for="f-minute">分</label>
            <input class="form-group__input" id="f-minute" name="minute" type="number"
                   min="0" max="59" placeholder="0" value="0" />
          </div>
        </div>

        <p class="form-group__error" id="form-error" role="alert"></p>

        <button type="submit" class="form-submit">
          <span class="form-submit__text">✦ 開始綜合分析</span>
        </button>
      </form>
    </div>
  `;

  const form = container.querySelector('#birth-form');
  const errorEl = container.querySelector('#form-error');
  let gender = 'male';

  // 性別切換
  for (const btn of container.querySelectorAll('.gender-toggle__option')) {
    btn.addEventListener('click', () => {
      gender = btn.dataset.gender;
      for (const b of container.querySelectorAll('.gender-toggle__option')) {
        const active = b === btn;
        b.classList.toggle('gender-toggle__option--active', active);
        b.setAttribute('aria-pressed', String(active));
      }
    });
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    errorEl.classList.remove('form-group__error--visible');

    const num = (id) => Number.parseInt(container.querySelector(id).value, 10);
    const params = {
      name: container.querySelector('#f-name').value.trim(),
      year: num('#f-year'),
      month: num('#f-month'),
      day: num('#f-day'),
      hour: num('#f-hour'),
      minute: Number.parseInt(container.querySelector('#f-minute').value, 10) || 0,
      gender,
    };

    const problems = [];
    if (!Number.isInteger(params.year) || params.year < 1900 || params.year > 2100) problems.push('年份需在 1900–2100');
    if (!Number.isInteger(params.month) || params.month < 1 || params.month > 12) problems.push('月份需在 1–12');
    if (!Number.isInteger(params.day) || params.day < 1 || params.day > 31) problems.push('日期需在 1–31');
    if (!Number.isInteger(params.hour) || params.hour < 0 || params.hour > 23) problems.push('小時需在 0–23');

    if (problems.length > 0) {
      errorEl.textContent = problems.join('；');
      errorEl.classList.add('form-group__error--visible');
      return;
    }

    onSubmit(params);
  });
}
