/**
 * @fileoverview App 進入點：把 UI 殼（index.html）接上核心 `analyze()`。
 * UI 只是核心函式庫的其中一個消費者——所有計算都在 `src/index.js` 公開 API 之後。
 */

import './styles/index.css';
import './styles/components.css';
import './styles/charts.css';

import { analyze } from './index.js';
import { renderInputForm } from './ui/InputForm.js';
import { renderReport } from './ui/ReportView.js';

const inputSection = document.querySelector('#input-section');
const reportSection = document.querySelector('#report-section');
const reportContainer = document.querySelector('#report-container');
const formContainer = document.querySelector('#input-form-container');
const loadingOverlay = document.querySelector('#loading-overlay');
const toastContainer = document.querySelector('#toast-container');

function toast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast${type === 'error' ? ' toast--error' : type === 'success' ? ' toast--success' : ''}`;
  el.setAttribute('role', 'status');
  el.textContent = message;
  toastContainer.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

function showReport(report) {
  renderReport(reportContainer, report, {
    onBack: () => {
      reportSection.hidden = true;
      inputSection.hidden = false;
      inputSection.scrollIntoView({ behavior: 'smooth' });
    },
  });
  inputSection.hidden = true;
  reportSection.hidden = false;
  reportSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

renderInputForm(formContainer, {
  onSubmit: (params) => {
    loadingOverlay.hidden = false;
    // 讓 loading overlay 有機會先繪製，再執行同步計算
    requestAnimationFrame(() => setTimeout(() => {
      try {
        const report = analyze(params);
        showReport(report);
      } catch (err) {
        console.error(err);
        toast(`分析失敗：${err.message}`, 'error');
      } finally {
        loadingOverlay.hidden = true;
      }
    }, 50));
  },
});
