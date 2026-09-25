export const THEME_STORE_KEY = 'fortunetelling:theme:v1';

export function preferredTheme(storage = globalThis.localStorage, media = globalThis.matchMedia?.('(prefers-color-scheme: dark)')) {
  try {
    const saved = storage?.getItem(THEME_STORE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Storage can be unavailable in privacy modes; system preference still works.
  }
  return media?.matches ? 'dark' : 'light';
}

export function initThemeToggle(button, {
  root = document.documentElement,
  storage = globalThis.localStorage,
  themeMeta = document.querySelector('meta[name="theme-color"]'),
} = {}) {
  function apply(theme, persist = true) {
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    const isDark = theme === 'dark';
    if (button) {
      button.setAttribute('aria-pressed', String(isDark));
      button.setAttribute('aria-label', isDark ? '切換為明亮模式' : '切換為深色模式');
      button.querySelector('[data-theme-icon]').textContent = isDark ? '日' : '月';
      button.querySelector('[data-theme-label]').textContent = isDark ? '明亮' : '深色';
    }
    themeMeta?.setAttribute('content', isDark ? '#181714' : '#f7f4ef');
    if (persist) {
      try { storage?.setItem(THEME_STORE_KEY, theme); } catch { /* no-op */ }
    }
    document.dispatchEvent(new CustomEvent('fortune-theme-change', { detail: { theme } }));
  }

  apply(preferredTheme(storage), false);
  button?.addEventListener('click', () => apply(root.dataset.theme === 'dark' ? 'light' : 'dark'));
  return { apply, get theme() { return root.dataset.theme; } };
}
