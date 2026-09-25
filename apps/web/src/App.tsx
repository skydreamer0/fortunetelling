/** App shell: masthead, view switching (intake ↔ report), loading and toasts. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CompatReport } from './components/compat/CompatReport';
import { InputView, type Mode } from './components/input/InputView';
import { ReportView } from './components/report/ReportView';
import { analyze, analyzeCompatibility } from './lib/core';
import { createReportStore } from './lib/store';
import { applyTheme, preferredTheme, type Theme } from './lib/theme';
import type { BirthInput, CompatibilityResult, Report } from './model/types';

type View =
  | { kind: 'input' }
  | { kind: 'report'; report: Report }
  | { kind: 'compat'; result: CompatibilityResult };

interface Toast { id: number; text: string; tone: 'info' | 'error' }

/**
 * Yield two frames so the loading state paints before the synchronous calculation.
 * rAF never fires in a background tab, so a timeout guarantees progress.
 */
const nextPaint = () => new Promise(resolve => {
  requestAnimationFrame(() => requestAnimationFrame(resolve));
  setTimeout(resolve, 60);
});
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function App() {
  const store = useMemo(() => createReportStore(), []);
  const [theme, setTheme] = useState<Theme>(() => preferredTheme());
  const [mode, setMode] = useState<Mode>('single');
  const [view, setView] = useState<View>({ kind: 'input' });
  const [loading, setLoading] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [recent, setRecent] = useState(() => store.getRecent());

  // Sync the resolved theme (saved or system preference) to <html> once on mount.
  useEffect(() => { applyTheme(preferredTheme(), false); }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  };

  const toast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(items => [...items, { id, text, tone }]);
    setTimeout(() => setToasts(items => items.filter(item => item.id !== id)), 5000);
  }, []);

  // Print every collapsed section, then restore what the reader had open.
  useEffect(() => {
    let opened: HTMLDetailsElement[] = [];
    const before = () => {
      opened = [...document.querySelectorAll<HTMLDetailsElement>('details:not([open])')];
      opened.forEach(node => { node.open = true; });
    };
    const after = () => opened.forEach(node => { node.open = false; });
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);

  // Browser back from a report returns to the form instead of leaving the app.
  useEffect(() => {
    const onPop = () => setView({ kind: 'input' });
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function show(next: View) {
    setView(next);
    if (next.kind !== 'input') window.history.pushState({ view: next.kind }, '');
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function back() {
    if (window.history.state?.view) window.history.back();
    else setView({ kind: 'input' });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  async function run<T>(message: string, minimumMs: number, task: () => T): Promise<T | null> {
    const started = performance.now();
    setLoading(message);
    await nextPaint();
    try {
      const result = task();
      await wait(Math.max(0, minimumMs - (performance.now() - started)));
      return result;
    } catch (error) {
      console.error(error);
      toast(`計算失敗：${(error as Error).message}`, 'error');
      return null;
    } finally {
      setLoading(null);
    }
  }

  async function onAnalyze(input: BirthInput) {
    const report = await run('排盤中', 420, () => analyze(input));
    if (!report) return;
    store.save(input, { asOf: report.asOf });
    setRecent(store.getRecent());
    show({ kind: 'report', report });
  }

  async function onCompare(first: BirthInput, second: BirthInput) {
    const result = await run('合盤中', 420, () => analyzeCompatibility(first, second));
    if (!result) return;
    store.saveCompatibility(first, second);
    show({ kind: 'compat', result });
  }

  function onClearRecent() {
    store.clear();
    setRecent([]);
    toast('已清除這台裝置上的查詢紀錄');
  }

  return (
    <>
      <a className="skip" href="#main">跳到主要內容</a>
      <header className="masthead">
        <button type="button" className="masthead__brand" onClick={() => view.kind !== 'input' && back()} aria-label="回到首頁">
          <span className="masthead__seal" aria-hidden="true">命</span>
          <span className="masthead__name">命理綜合分析</span>
        </button>
        <button type="button" className="masthead__theme" onClick={toggleTheme}
          aria-label={theme === 'dark' ? '切換為淺色' : '切換為深色'} aria-pressed={theme === 'dark'}>
          <span aria-hidden="true">{theme === 'dark' ? '晝' : '夜'}</span>
        </button>
      </header>

      <main id="main" className="page" aria-busy={loading ? 'true' : undefined}>
        {view.kind === 'input' && (
          <InputView
            mode={mode}
            onModeChange={setMode}
            lastInput={store.getLastInput()}
            lastPair={store.getLastCompatibility()}
            recent={recent}
            onAnalyze={onAnalyze}
            onCompare={onCompare}
            onClearRecent={onClearRecent}
          />
        )}
        {view.kind === 'report' && <ReportView report={view.report} onBack={back} />}
        {view.kind === 'compat' && <CompatReport result={view.result} onBack={back} />}
      </main>

      <footer className="colophon">
        <p>計算於本機完成・結果為觀察假說，非決定論</p>
      </footer>

      {loading && (
        <div className="loading" role="status" aria-live="polite">
          <span className="loading__seal" aria-hidden="true">命</span>
          <span className="loading__text">{loading}…</span>
        </div>
      )}
      <div className="toasts" aria-live="polite">
        {toasts.map(item => <p key={item.id} className={`toast toast--${item.tone}`} role="status">{item.text}</p>)}
      </div>
    </>
  );
}
