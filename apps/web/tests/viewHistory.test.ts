import { describe, expect, test } from 'bun:test';
import { createViewHistory } from '../src/lib/viewHistory';

/** Browser model: fragment navigation pushes null state before popstate. */
function browserModel() {
  const entries = [{ state: null as any, href: 'https://example.test/fortunetelling/?theme=light' }];
  let index = 0;
  const listeners = new Set<() => void>();
  const location = { get href() { return entries[index].href; } };
  const history = {
    get state() { return entries[index].state; },
    get length() { return entries.length; },
    replaceState(state: any, _title: string, url?: string | URL | null) {
      entries[index] = { state: structuredClone(state), href: url ? new URL(url, location.href).href : location.href };
    },
    pushState(state: any, _title: string, url?: string | URL | null) {
      entries.splice(index + 1);
      entries.push({ state: structuredClone(state), href: url ? new URL(url, location.href).href : location.href });
      index++;
    },
    go(delta: number) { if (index + delta < 0 || index + delta >= entries.length) return; index += delta; listeners.forEach(fn => fn()); },
  };
  const browser = { history, location, addEventListener(_type: string, fn: any) { listeners.add(fn); }, removeEventListener(_type: string, fn: any) { listeners.delete(fn); } };
  return {
    browser: browser as unknown as Window, history,
    fragment(hash: string) {
      const url = new URL(location.href); url.hash = hash;
      if (url.href === location.href) return;
      history.pushState(null, '', url);
      listeners.forEach(fn => fn());
    },
    get listenerCount() { return listeners.size; },
  };
}

const input = { kind: 'input' } as const;
const report = { kind: 'report', report: { input: { name: 'Synthetic navigation fixture' } } } as const;
const compat = { kind: 'compat', result: { label: 'Synthetic pair' } } as const;
type View = typeof input | typeof report | typeof compat;
function harness() {
  const b = browserModel();
  let view: View = input;
  const nav = createViewHistory<View>(b.browser, input, next => { view = next; });
  return { ...b, nav, get view() { return view; } };
}

describe('report chapter history', () => {
  test('legacy unconditional popstate handler reproduces the reported regression', () => {
    const b = browserModel(); let view: string = 'report';
    b.browser.addEventListener('popstate', () => { view = 'input'; });
    b.history.pushState({ view: 'report' }, ''); b.fragment('ch-year');
    expect(view).toBe('input');
  });

  test('all 11 native chapter links retain the exact report and add no duplicate entries', () => {
    const h = harness(); h.nav.show(report);
    const chapters = ['overview', 'year', 'timeline', 'events', 'ask', 'domains', 'charts', 'periods', 'scenarios', 'guidance', 'method'];
    for (const [i, chapter] of chapters.entries()) {
      h.fragment(`ch-${chapter}`);
      expect(h.view).toBe(report);
      expect(h.history.length).toBe(i + 3);
      expect(JSON.stringify(h.history.state)).not.toContain('Synthetic');
    }
    h.fragment('ch-method'); expect(h.history.length).toBe(13);
    h.history.go(-1); expect(h.view).toBe(report);
    h.history.go(1); expect(h.view).toBe(report);
  });

  test('app re-input/home skips chapter entries; browser Forward restores the cached report', () => {
    const h = harness(); h.nav.show(report); h.fragment('ch-year'); h.fragment('ch-method');
    h.nav.back(); expect(h.view).toBe(input);
    h.history.go(1); expect(h.view).toBe(report);
    h.history.go(1); expect(h.view).toBe(report);
    h.history.go(-2); expect(h.view).toBe(input);
    h.history.go(3); expect(h.view).toBe(report);
    expect(h.history.length).toBe(4);
  });

  test('new report truncates stale forward entries and preserves form query / clears its fragment', () => {
    const h = harness(); h.fragment('main'); h.nav.show(report); h.fragment('ch-year'); h.nav.back();
    expect(h.view).toBe(input);
    h.nav.show(compat);
    expect(h.view).toBe(compat);
    expect(h.browser.location.href).toBe('https://example.test/fortunetelling/?theme=light');
    h.nav.back(); expect(h.view).toBe(input);
    h.history.go(1); expect(h.view).toBe(compat);
    h.history.go(1); expect(h.view).toBe(compat);
  });

  test('report without chapter jumps and compatibility retain ordinary Back/Forward semantics', () => {
    const h = harness(); h.nav.show(report); h.history.go(-1); expect(h.view).toBe(input);
    h.history.go(1); expect(h.view).toBe(report); h.nav.back(); h.nav.show(compat);
    h.fragment('main'); expect(h.view).toBe(compat);
    h.nav.back(); expect(h.view).toBe(input); h.history.go(1); expect(h.view).toBe(compat);
  });

  test('reload starts safely at input instead of restoring missing report data', () => {
    const h = harness(); h.nav.show(report); h.fragment('ch-year'); h.nav.dispose();
    let view: View = input;
    const nav = createViewHistory<View>(h.browser, input, next => { view = next; });
    h.history.go(-1); expect(view).toBe(input);
    nav.dispose();
  });
});
