import { expect, test } from 'bun:test';
import { pngDimensions, precachePaths } from './assets';

test('PNG signature, IHDR and positive dimensions are required', () => {
  const bytes = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  bytes.writeUInt32BE(13, 8); bytes.write('IHDR', 12); bytes.writeUInt32BE(192, 16); bytes.writeUInt32BE(192, 20);
  expect(pngDimensions(bytes)).toEqual([192, 192]);
  expect(() => pngDimensions(bytes.subarray(0, 20))).toThrow();
  const corrupt = Buffer.from(bytes); corrupt[0] = 0; expect(() => pngDimensions(corrupt)).toThrow();
  bytes.writeUInt32BE(0, 16); expect(() => pngDimensions(bytes)).toThrow();
});
test('compiled PWA list requires unique strings and content version', () => {
  const version = 'const VERSION = "0123456789ab";\n';
  expect(precachePaths(version + 'const PRECACHE_URLS = ["./","index.html"];')).toEqual(['./', 'index.html']);
  for (const sw of ['const PRECACHE_URLS = __PWA_PRECACHE__;', version + 'const PRECACHE_URLS = [1];', version + 'const PRECACHE_URLS = ["./","./"];']) expect(() => precachePaths(sw)).toThrow();
});

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateBuiltAssets } from './assets';

test('built asset contract rejects missing/corrupt references, dimensions, bytes and precache', () => {
  const root = mkdtempSync(join(tmpdir(), 'fortune-ci-assets-'));
  const source = join(root, 'public'), dist = join(root, 'dist');
  const png = (size: number) => {
    const bytes = Buffer.alloc(33); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
    bytes.writeUInt32BE(13, 8); bytes.write('IHDR', 12); bytes.writeUInt32BE(size, 16); bytes.writeUInt32BE(size, 20); return bytes;
  };
  const manifest = { icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }] };
  const files = ['icons/icon-192.png', 'icons/apple-touch-icon.png', 'favicon.svg', 'manifest.webmanifest'];
  const sw = (paths: string[]) => 'const VERSION = "0123456789ab";\nconst PRECACHE_URLS = ' + JSON.stringify(paths) + ';';
  const reset = () => {
    for (const dir of [source, dist]) {
      mkdirSync(join(dir, 'icons'), { recursive: true });
      writeFileSync(join(dir, 'icons/icon-192.png'), png(192));
      writeFileSync(join(dir, 'icons/apple-touch-icon.png'), png(180));
      writeFileSync(join(dir, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
      writeFileSync(join(dir, 'manifest.webmanifest'), JSON.stringify(manifest));
    }
    writeFileSync(join(dist, 'sw.js'), sw(['./', 'index.html', ...files]));
  };
  try {
    reset(); expect(() => validateBuiltAssets(source, dist)).not.toThrow();
    writeFileSync(join(dist, 'icons/icon-192.png'), png(512)); expect(() => validateBuiltAssets(source, dist)).toThrow();
    reset(); for (const dir of [source, dist]) writeFileSync(join(dir, 'icons/icon-192.png'), png(512));
    expect(() => validateBuiltAssets(source, dist)).toThrow();
    reset(); writeFileSync(join(dist, 'sw.js'), sw(['./', 'index.html'])); expect(() => validateBuiltAssets(source, dist)).toThrow();
    reset(); rmSync(join(dist, 'icons/icon-192.png')); expect(() => validateBuiltAssets(source, dist)).toThrow();
    reset(); for (const dir of [source, dist]) writeFileSync(join(dir, 'manifest.webmanifest'), JSON.stringify({ icons: [{ src: '../outside.png' }] }));
    expect(() => validateBuiltAssets(source, dist)).toThrow();
  } finally { rmSync(root, { recursive: true, force: true }); }
});
