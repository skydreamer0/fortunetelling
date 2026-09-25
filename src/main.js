/**
 * @fileoverview App 進入點：把 UI 殼（index.html）接上核心 `analyze()`。
 * UI 只是核心函式庫的其中一個消費者——所有計算都在 `src/index.js` 公開 API 之後。
 */

import './styles/index.css';
import './styles/components.css';
import './styles/charts.css';

import { analyze, analyzeCompatibility } from './index.js';
import { renderInputForm } from './ui/InputForm.js';
import { renderReport } from './ui/ReportView.js';
import { renderCompatibilityForm } from './ui/CompatibilityForm.js';
import { renderCompatibilityReport } from './ui/CompatibilityView.js';
import { createReportStore } from './ui/ReportStore.js';
import { initThemeToggle } from './ui/ThemeController.js';

const inputSection = document.querySelector('#input-section');
const reportSection = document.querySelector('#report-section');
const reportContainer = document.querySelector('#report-container');
const formContainer = document.querySelector('#input-form-container');
const loadingOverlay = document.querySelector('#loading-overlay');
const toastContainer = document.querySelector('#toast-container');
const appMain = document.querySelector('#app-main');
const loadingText = loadingOverlay.querySelector('.loading-text');
const inputTitle = inputSection.querySelector('#input-title-text');
const inputSubtitle = inputSection.querySelector('.section-subtitle');
const reportStore = createReportStore();
let currentMode = 'single';
initThemeToggle(document.querySelector('#theme-toggle'));

function toast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast${type === 'error' ? ' toast--error' : type === 'success' ? ' toast--success' : ''}`;
  el.setAttribute('role', 'status');
  el.textContent = message;
  toastContainer.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

function settleScroll(section) {
  const scroll = () => section.scrollIntoView({ behavior: 'auto', block: 'start' });
  scroll();
  // Let focus removal and scroll anchoring settle after swapping the form/report.
  requestAnimationFrame(() => requestAnimationFrame(scroll));
}

function returnToInput() {
  reportSection.hidden = true;
  inputSection.hidden = false;
  mountInputForm({ mode: currentMode });
  inputSection.focus({ preventScroll: true });
  settleScroll(inputSection);
}

function revealReport() {
  inputSection.hidden = true;
  reportSection.hidden = false;
  reportSection.focus({ preventScroll: true });
  settleScroll(reportSection);
}

function showReport(report) {
  renderReport(reportContainer, report, {
    onBack: returnToInput,
    onPrint: () => window.print(),
  });
  revealReport();
}

function showCompatibilityReport(result) {
  renderCompatibilityReport(reportContainer, result, {
    onBack: returnToInput,
    onPrint: () => window.print(),
  });
  revealReport();
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function runAnalysis(params) {
  currentMode = 'single';
  const startedAt = performance.now();
  loadingText.textContent = '排盤中… 正在校對星曜與干支';
  loadingOverlay.hidden = false;
  appMain.setAttribute('aria-busy', 'true');

  // Let the overlay paint before the synchronous local calculation starts.
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  try {
    const report = analyze(params);
    const remaining = Math.max(0, 360 - (performance.now() - startedAt));
    await delay(remaining);
    reportStore.save(params, { asOf: report.asOf });
    showReport(report);
  } catch (error) {
    console.error(error);
    toast(`分析失敗：${error.message}`, 'error');
  } finally {
    loadingOverlay.hidden = true;
    appMain.removeAttribute('aria-busy');
  }
}

async function runCompatibility({ first, second }) {
  currentMode = 'compatibility';
  const startedAt = performance.now();
  loadingText.textContent = '合盤中… 正在比對共同節奏';
  loadingOverlay.hidden = false;
  appMain.setAttribute('aria-busy', 'true');
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  try {
    const result = analyzeCompatibility(first, second);
    await delay(Math.max(0, 420 - (performance.now() - startedAt)));
    reportStore.saveCompatibility(first, second);
    showCompatibilityReport(result);
  } catch (error) {
    console.error(error);
    toast(`合盤失敗：${error.message}`, 'error');
  } finally {
    loadingOverlay.hidden = true;
    appMain.removeAttribute('aria-busy');
  }
}

function mountInputForm({ mode = currentMode, initialValues = null } = {}) {
  currentMode = mode;
  inputTitle.textContent = mode === 'single' ? '輸入出生資料' : '輸入兩人的出生資料';
  inputSubtitle.textContent = mode === 'single'
    ? '透過紫微斗數、八字、生命靈數等多引擎，建立可追溯的個人報告。'
    : '比較五行共同分布、生命靈數與八宅空間偏好；結果只作關係觀察，不判定合或不合。';
  formContainer.innerHTML = `
    <div class="analysis-mode-switch" role="tablist" aria-label="分析模式">
      <button type="button" role="tab" aria-selected="${mode === 'single'}" class="analysis-mode-switch__option${mode === 'single' ? ' is-active' : ''}" data-analysis-mode="single">單人分析</button>
      <button type="button" role="tab" aria-selected="${mode === 'compatibility'}" class="analysis-mode-switch__option${mode === 'compatibility' ? ' is-active' : ''}" data-analysis-mode="compatibility">雙人合盤</button>
    </div>
    <div id="analysis-form-root"></div>`;
  const root = formContainer.querySelector('#analysis-form-root');
  if (mode === 'compatibility') {
    renderCompatibilityForm(root, {
      initialValues: initialValues ?? reportStore.getLastCompatibility() ?? {},
      onSubmit: runCompatibility,
    });
  } else {
    renderInputForm(root, {
      initialValues: initialValues ?? reportStore.getLastInput() ?? {},
      recentQueries: reportStore.getRecent(),
      onSubmit: runAnalysis,
      onClearRecent: () => {
        reportStore.clear();
        mountInputForm({ mode: 'single', initialValues: {} });
        toast('最近查詢已清除', 'success');
      },
    });
  }
  for (const button of formContainer.querySelectorAll('[data-analysis-mode]')) {
    button.addEventListener('click', () => mountInputForm({ mode: button.dataset.analysisMode }));
  }
}

mountInputForm();
