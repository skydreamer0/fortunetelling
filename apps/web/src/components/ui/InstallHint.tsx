/** iPhone/iPad only: explains how to add the app to the Home Screen (iOS has no install prompt). */

import { useState } from 'react';
import { INSTALL_HINT_KEY, shouldShowIosInstallHint } from '../../lib/pwa';
import { safeLocalStorage } from '../../lib/store';

function dismissedBefore() {
  try {
    return safeLocalStorage()?.getItem(INSTALL_HINT_KEY) === 'dismissed';
  } catch {
    return false;
  }
}

export function InstallHint() {
  const [visible, setVisible] = useState(() => shouldShowIosInstallHint() && !dismissedBefore());
  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    try {
      safeLocalStorage()?.setItem(INSTALL_HINT_KEY, 'dismissed');
    } catch {
      // Showing the hint again next visit is acceptable.
    }
  };

  return (
    <aside className="install-hint" aria-label="加入主畫面">
      <span className="seal-mark" aria-hidden="true">命</span>
      <p className="install-hint__text">
        <strong>加入主畫面</strong>
        點瀏覽器的「分享」<ShareGlyph />，再選「加入主畫面」，就能像 App 一樣全螢幕、離線開啟。
      </p>
      <button type="button" className="install-hint__close" onClick={dismiss} aria-label="不再顯示">×</button>
    </aside>
  );
}

function ShareGlyph() {
  return (
    <svg className="install-hint__glyph" viewBox="0 0 16 16" aria-label="分享圖示" role="img">
      <path d="M8 1.5v8.5M5 4.5 8 1.5l3 3M4.5 7H3v7.5h10V7h-1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
