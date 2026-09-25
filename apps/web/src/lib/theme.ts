import { safeLocalStorage } from './store';

export const THEME_STORE_KEY = 'fortunetelling:theme:v1';
export type Theme = 'light' | 'dark';

type ThemeStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function preferredTheme(
  storage: ThemeStorage | undefined = safeLocalStorage(),
  prefersDark: boolean = globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
): Theme {
  try {
    const saved = storage?.getItem(THEME_STORE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Storage can be unavailable in privacy modes; system preference still works.
  }
  return prefersDark ? 'dark' : 'light';
}

export function applyTheme(theme: Theme, persist = true, storage: ThemeStorage | undefined = safeLocalStorage()) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#16140F' : '#F3EDE1');
  if (!persist) return;
  try {
    storage?.setItem(THEME_STORE_KEY, theme);
  } catch {
    // A theme that does not persist is acceptable.
  }
}
