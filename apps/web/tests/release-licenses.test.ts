import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import { assertSwissWasm, bundledLicenses, bundledPackageDirectory } from '../release-licenses';

test('bundled package paths work for scoped, nested and Windows modules; virtual and first-party utilities are excluded here', () => {
  assert.deepEqual(bundledPackageDirectory('C:\\app\\node_modules\\@scope\\item\\index.js?commonjs-proxy'),
    { name: '@scope/item', directory: 'C:/app/node_modules/@scope/item' });
  assert.equal(bundledPackageDirectory('/a/node_modules/pkg/node_modules/other/index.js')?.name, 'other');
  assert.equal(bundledPackageDirectory('\0vite/runtime'), null);
  assert.equal(bundledPackageDirectory('/a/node_modules/@fortune/core/index.js'), null);
});
test('installed license and notice text are preserved and a missing license is an error', () => {
  const prefix = mkdtempSync(join(tmpdir(), 'fortune-license-notice-'));
  const directory = join(prefix, 'node_modules', 'fixture');
  try {
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.2.3', license: 'MIT' }));
    const id = join(directory, 'index.js');
    assert.throws(() => bundledLicenses([id]), /no standalone license/);
    writeFileSync(join(directory, 'LICENSE.md'), 'full text with final whitespace  \n');
    writeFileSync(join(directory, 'notice.txt'), 'copyright appears here\n');
    const result = bundledLicenses([id, id + '?commonjs-proxy']);
    assert.equal(result.split('fixture@1.2.3 [MIT]').length, 2);
    assert.match(result, /full text with final whitespace  \n/);
    assert.match(result, /copyright appears here/);
  } finally {
    rmSync(prefix, { recursive: true, force: true });
  }
});
test('the pinned installed Swiss WASM passes; changed, duplicate and missing bytes do not', () => {
  const wasm = readFileSync(new URL('../../../node_modules/@swisseph/browser/dist/swisseph.wasm', import.meta.url));
  assert.doesNotThrow(() => assertSwissWasm([wasm]));
  assert.throws(() => assertSwissWasm([wasm, wasm]), /differs from the pinned npm artifact/);
  assert.throws(() => assertSwissWasm([]), /differs from the pinned npm artifact/);
  wasm[wasm.length - 1] ^= 1;
  assert.throws(() => assertSwissWasm([wasm]), /differs from the pinned npm artifact/);
});
