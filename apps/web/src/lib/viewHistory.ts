/** Session-local view navigation. Reports stay in memory, never in history.state/URLs. */
interface Entry { session: string; index: number; view: number; input: number }
const KEY = '__fortuneView';

type Browser = Pick<Window, 'history' | 'location' | 'addEventListener' | 'removeEventListener'>;

export function createViewHistory<T>(browser: Browser, initial: T, render: (view: T) => void) {
  let session = crypto.randomUUID();
  const views = new Map<number, T>([[0, initial]]);
  let entry: Entry = { session, index: 0, view: 0, input: 0 };
  let nextView = 1;
  let href = browser.location.href;
  let returning = false;

  const stamp = () => browser.history.replaceState({ ...browser.history.state, [KEY]: entry }, '');
  stamp();

  const onPop = () => {
    const candidate = browser.history.state?.[KEY] as Entry | undefined;
    if (candidate?.session === session && views.has(candidate.view)) {
      entry = candidate;
    } else if (browser.history.state === null && browser.location.href !== href
      && browser.location.href.split('#')[0] === href.split('#')[0]) {
      // Native fragment navigation creates a new entry with null state. Annotate
      // that existing entry instead of treating it as Back or pushing a duplicate.
      entry = { ...entry, index: entry.index + 1 };
      stamp();
    } else {
      // A foreign/reloaded entry is a new safe input boundary. Rebase both the
      // rendered view and controller; otherwise its next #main link could revive
      // the report that was active before this popstate.
      session = crypto.randomUUID();
      views.clear();
      views.set(0, initial);
      entry = { session, index: 0, view: 0, input: 0 };
      stamp();
    }
    href = browser.location.href;
    returning = false;
    render(views.get(entry.view)!);
  };
  browser.addEventListener('popstate', onPop);

  return {
    show(view: T) {
      if (returning) return;
      const id = nextView++;
      views.set(id, view);
      entry = { session, index: entry.index + 1, view: id, input: entry.index };
      // A new result must not inherit the previous form's fragment.
      const url = new URL(browser.location.href);
      url.hash = '';
      browser.history.pushState({ [KEY]: entry }, '', url);
      href = browser.location.href;
      render(view);
    },
    back() {
      if (returning) return;
      const delta = entry.input - entry.index;
      if (delta < 0) {
        returning = true;
        browser.history.go(delta);
      } else render(initial);
    },
    dispose() { browser.removeEventListener('popstate', onPop); views.clear(); },
  };
}
