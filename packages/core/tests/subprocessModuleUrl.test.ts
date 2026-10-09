import { expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

test('subprocess imports preserve spaces, Unicode and URL delimiters in checkout paths', () => {
  const root = mkdtempSync(join(tmpdir(), 'fortune-module-url-'));
  try {
    const directory = join(root, 'checkout 空間 # %');
    mkdirSync(directory);
    const modulePath = join(directory, 'fixture.ts');
    writeFileSync(modulePath, 'export const marker = "portable-import";\n');
    const moduleRoot = new URL('./', pathToFileURL(modulePath)).href;
    const script = `import { marker } from ${JSON.stringify(moduleRoot + 'fixture.ts')}; console.log(marker);`;
    const child = Bun.spawnSync([process.execPath, '--eval', script]);
    expect(child.exitCode, child.stderr.toString()).toBe(0);
    expect(child.stdout.toString().trim()).toBe('portable-import');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Windows drive file URLs remain module specifiers rather than slash-prefixed paths', () => {
  const moduleRoot = new URL('../src/', 'file:///C:/checkout%20%E7%A9%BA%E9%96%93%20%23%20%25/tests/example.test.ts').href;
  expect(moduleRoot + 'index.ts').toBe('file:///C:/checkout%20%E7%A9%BA%E9%96%93%20%23%20%25/src/index.ts');
});
