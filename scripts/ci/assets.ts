import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function pngDimensions(bytes: Uint8Array): [number, number] {
  assert(bytes.length >= 33 && Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'Invalid PNG signature');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert(view.getUint32(8) === 13 && Buffer.from(bytes.subarray(12, 16)).toString() === 'IHDR', 'Missing PNG IHDR');
  const dimensions: [number, number] = [view.getUint32(16), view.getUint32(20)];
  assert(dimensions.every(v => v > 0), 'Invalid PNG dimensions');
  return dimensions;
}
export function precachePaths(sw: string): string[] {
  const match = /^const PRECACHE_URLS = (\[[\s\S]*?\]);$/m.exec(sw);
  assert(match && !sw.includes('__PWA_'), 'Missing compiled precache');
  const paths: unknown = JSON.parse(match[1]!);
  assert(Array.isArray(paths) && paths.every(p => typeof p === 'string') && new Set(paths).size === paths.length, 'Invalid precache list');
  assert(/^const VERSION = "[a-f0-9]{12}";$/m.test(sw), 'Missing content version');
  return paths;
}
export function validateBuiltAssets(publicDir = 'apps/web/public', distDir = 'apps/web/dist'): void {
  const paths = precachePaths(readFileSync(join(distDir, 'sw.js'), 'utf8'));
  const list = (dir: string, prefix = ''): string[] => readdirSync(dir).flatMap(name => {
    const path = prefix + name;
    return statSync(join(dir, name)).isDirectory() ? list(join(dir, name), `${path}/`) : [path];
  });
  for (const path of list(publicDir)) {
    assert(paths.includes(path), `Public file not precached: ${path}`);
    assert(readFileSync(join(publicDir, path)).equals(readFileSync(join(distDir, path))), `Built public file differs: ${path}`);
  }
  const manifest = JSON.parse(readFileSync(join(distDir, 'manifest.webmanifest'), 'utf8'));
  assert(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'Missing manifest icons');
  for (const icon of manifest.icons) {
    assert(typeof icon.src === 'string' && /^icons\/[\w-]+\.(png|svg)$/.test(icon.src), 'Unexpected icon path');
    const bytes = readFileSync(join(distDir, icon.src));
    assert(paths.includes(icon.src), 'Manifest icon absent from precache');
    if (icon.type === 'image/png') assert.equal(pngDimensions(bytes).join('x'), icon.sizes, 'Manifest PNG dimensions differ');
    else assert(icon.type === 'image/svg+xml' && /<svg\b/.test(bytes.toString()), 'Invalid SVG icon');
  }
  assert.deepEqual(pngDimensions(readFileSync(join(distDir, 'icons/fortune-apple-touch-v1-180.png'))), [180, 180]);
  assert(/<svg\b/.test(readFileSync(join(distDir, 'favicon.svg'), 'utf8')), 'Invalid favicon');
  for (const path of ['index.html', 'manifest.webmanifest']) assert(paths.includes(path), `Missing app shell: ${path}`);
  console.log('Built public bytes, icon dimensions, manifest references and PWA precache passed (not visual/mobile acceptance).');
}
if (import.meta.main) validateBuiltAssets();
