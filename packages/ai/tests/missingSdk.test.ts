import { expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';

test('missing optional SDK: actionable first-completion failure and injected-client escape hatch (isolated process)', () => {
  // mock.restore() does not evict Bun's module-mock cache. A child process isolates
  // this deliberately broken SDK from client.test.ts and any installed real SDK.
  const child = Bun.spawnSync([process.execPath, fileURLToPath(new URL('./fixtures/missingSdk.scenario.ts', import.meta.url))], {
    stdout: 'pipe', stderr: 'pipe', timeout: 10_000,
  });
  expect({ exitCode: child.exitCode, stderr: child.stderr.toString() }).toEqual({ exitCode: 0, stderr: '' });
  expect(child.stdout.toString()).toContain('missing-sdk scenario passed');
});
