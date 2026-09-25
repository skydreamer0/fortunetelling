import { describe, expect, test } from 'bun:test';
import { shouldShowIosInstallHint } from '../src/lib/pwa';

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';
const IPHONE_LINE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/15.8.0';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

describe('iOS install hint', () => {
  test('shows in iPhone Safari until the app runs from the Home Screen', () => {
    expect(shouldShowIosInstallHint({ userAgent: IPHONE_SAFARI, maxTouchPoints: 5, standalone: false })).toBe(true);
    expect(shouldShowIosInstallHint({ userAgent: IPHONE_SAFARI, maxTouchPoints: 5, standalone: true })).toBe(false);
  });

  test('recognises iPadOS by touch support despite its Mac user agent', () => {
    expect(shouldShowIosInstallHint({ userAgent: IPAD_DESKTOP_UA, maxTouchPoints: 5, standalone: false })).toBe(true);
    expect(shouldShowIosInstallHint({ userAgent: IPAD_DESKTOP_UA, maxTouchPoints: 0, standalone: false })).toBe(false);
  });

  test('stays hidden in in-app browsers and on Android', () => {
    expect(shouldShowIosInstallHint({ userAgent: IPHONE_LINE, maxTouchPoints: 5, standalone: false })).toBe(false);
    expect(shouldShowIosInstallHint({ userAgent: ANDROID_CHROME, maxTouchPoints: 5, standalone: false })).toBe(false);
  });
});
