import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const publicFile = (path: string) => readFileSync(new URL(`../public/${path}`, import.meta.url));
const manifest = JSON.parse(publicFile('manifest.webmanifest').toString());
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// Approved taiji/octagon artwork, copied byte-for-byte from the v1 delivery.
const approvedHashes: Record<string, string> = {
  'favicon.svg': 'cd46faf24b19e1e052ba5c01c5eb150eafdc1a471990308af3d75dd563772f00',
  'favicon.ico': '78384b3e9b1f2be5a6b1e9fc2d910856d376fcc54c0ff9cc6614599ea9738add',
  'icons/fortune-app-v1-192.png': '9aa25921903d23d67086458979cfe7bc3d15786c626302e07f11c6c07e2854ea',
  'icons/fortune-app-v1-512.png': '7109b82f5fb40cbbea5b6f6752435da5d24e634d10948ca560f8935f5dcb6d0c',
  'icons/fortune-maskable-v1-512.png': '0dc4204261b1df18ac4e97f717445e203900f0f0ab551debfec96e927fe0db64',
  'icons/fortune-apple-touch-v1-180.png': '68d41d3b086dc807f222d26e3b59f12959421c1b4abffc2c30700b01ac8a7c4a',
  'icons/fortune-app-v1.svg': 'cd46faf24b19e1e052ba5c01c5eb150eafdc1a471990308af3d75dd563772f00',
};

function pngSize(path: string) {
  const bytes = publicFile(path);
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

describe('approved website and PWA brand icons', () => {
  test('keeps every delivered asset byte-identical to the approved artwork', () => {
    for (const [path, sha256] of Object.entries(approvedHashes)) {
      expect(createHash('sha256').update(publicFile(path)).digest('hex')).toBe(sha256);
    }
  });

  test('preserves installed app identity and relative scope', () => {
    expect(manifest.id).toBe('./');
    expect(manifest.start_url).toBe('./');
    expect(manifest.scope).toBe('./');
    expect(manifest.name).toBe('命理綜合分析平台');
    expect(manifest.short_name).toBe('命理分析');
  });

  test('uses correctly sized, existing app icons and a separate safe-area maskable asset', () => {
    expect(manifest.icons).toHaveLength(4);
    for (const icon of manifest.icons) {
      expect(icon.src.startsWith('icons/')).toBe(true);
      expect(approvedHashes[icon.src]).toBeDefined();
      if (icon.type === 'image/png') expect(pngSize(icon.src)).toBe(icon.sizes);
    }
    expect(manifest.icons.filter((icon: { purpose: string }) => icon.purpose === 'maskable')).toEqual([
      { src: 'icons/fortune-maskable-v1-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ]);
    expect(manifest.icons.filter((icon: { purpose: string }) => icon.purpose === 'any').map((icon: { sizes: string }) => icon.sizes)).toEqual(['192x192', '512x512', 'any']);
  });

  test('links an opaque 180px Apple icon and versioned SVG/ICO favicons', () => {
    expect(html).toContain('rel="apple-touch-icon" sizes="180x180" href="/icons/fortune-apple-touch-v1-180.png"');
    expect(pngSize('icons/fortune-apple-touch-v1-180.png')).toBe('180x180');
    expect(html).toContain('href="/favicon.svg?v=taiji-v1"');
    expect(html).toContain('href="/favicon.ico?v=taiji-v1"');
    const ico = publicFile('favicon.ico');
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(3);
    expect(Array.from({ length: 3 }, (_, i) => [ico[6 + 16 * i], ico[7 + 16 * i]])).toEqual([[16, 16], [32, 32], [48, 48]]);
  });
});
