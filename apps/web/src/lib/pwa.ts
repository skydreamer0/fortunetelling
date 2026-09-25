/** Service worker registration and iPhone "Add to Home Screen" detection. */

export const INSTALL_HINT_KEY = 'fortunetelling:install-hint:v1';

/** Register the build-generated service worker (production only; dev serves no sw.js). */
export function registerServiceWorker(base: string = import.meta.env.BASE_URL) {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(error => {
      // The app still works online without it.
      console.warn('Service worker registration failed', error);
    });
  });
}

interface InstallEnv {
  userAgent: string;
  maxTouchPoints: number;
  standalone: boolean;
}

function currentEnv(): InstallEnv {
  const nav = globalThis.navigator as (Navigator & { standalone?: boolean }) | undefined;
  return {
    userAgent: nav?.userAgent ?? '',
    maxTouchPoints: nav?.maxTouchPoints ?? 0,
    standalone: nav?.standalone === true || (globalThis.matchMedia?.('(display-mode: standalone)').matches ?? false),
  };
}

/**
 * iOS has no install prompt, so we show a hint on iPhone/iPad.
 * iPadOS reports a desktop Mac user agent; touch support tells them apart.
 * Safari and, since iOS 16.4, other iOS browsers can add to Home Screen from the share menu;
 * in-app browsers (LINE, Facebook, Instagram) cannot, so no hint there.
 */
export function shouldShowIosInstallHint(env: InstallEnv = currentEnv()): boolean {
  if (env.standalone) return false;
  const ua = env.userAgent;
  const isIos = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && env.maxTouchPoints > 1);
  if (!isIos) return false;
  return !/Line\/|FBAN|FBAV|Instagram|MicroMessenger/.test(ua);
}
