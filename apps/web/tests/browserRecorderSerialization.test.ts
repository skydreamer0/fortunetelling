import { spawnSync } from 'node:child_process';
import { expect, test } from 'vitest';

// Playwright serializes functions into a separate browser realm. Exercise that
// boundary under stock Node, without importing/running the browser harness.
const probe = String.raw`
  import assert from 'node:assert/strict';
  import { readFileSync } from 'node:fs';
  import { stripTypeScriptTypes } from 'node:module';
  import { runInNewContext } from 'node:vm';
  import { transformSync } from 'esbuild';
  assert.deepEqual(process.execArgv.slice(0, 2), ['--input-type=module', '--eval']);
  assert.equal(process.execArgv.length, 3);
  const source = readFileSync('apps/web/scripts/answer-check-browser-check.ts', 'utf8');
  const stripped = stripTypeScriptTypes(source);
  const declarations = stripped.match(/^function installRecorder\(\) \{/gm);
  assert.equal(declarations?.length, 1, 'Exactly one real recorder declaration required');
  const recorder = stripped.match(/^function installRecorder\(\) \{[\s\S]*?^\}/m);
  assert.ok(recorder, 'Real installRecorder declaration must exist');
  let code = recorder[0];
  const mutate = process.argv[1] === 'keep-names';
  if (mutate) code = transformSync(code, { loader: 'js', keepNames: true, format: 'esm' }).code;
  // Creating the function in one realm and then serializing it deliberately
  // excludes all module-scope helpers, just like addInitScript(function).
  const serialized = runInNewContext(code + '; installRecorder.toString()');
  const listeners = new Map();
  const cleanup = { mutation: 0, tasks: 0, animation: 0 };
  const realm = {
    window: {},
    document: {
      querySelector: () => null,
      addEventListener: (kind, fn) => listeners.set(kind, fn),
      removeEventListener: (kind, fn) => { assert.equal(listeners.get(kind), fn); listeners.delete(kind); },
    },
    performance: { now: () => 123 },
    MutationObserver: class { observe() {} disconnect() { cleanup.mutation++; } },
    PerformanceObserver: class {
      static supportedEntryTypes = ['longtask'];
      observe() {}
      takeRecords() { return [{ startTime: 10, duration: 60 }]; }
      disconnect() { cleanup.tasks++; }
    },
    requestAnimationFrame: () => 7,
    cancelAnimationFrame: frame => { assert.equal(frame, 7); cleanup.animation++; },
  };
  const install = () => runInNewContext('(' + serialized + ')()', realm);
  if (mutate) {
    assert.match(serialized, /__name/);
    assert.throws(install, /__name is not defined/);
    console.log(JSON.stringify({ mutationRejected: true }));
  } else {
    install();
    assert.equal(typeof realm.window.__answerQa.armViewport, 'function');
    realm.window.__answerQa.armViewport(42);
    assert.deepEqual([...listeners.keys()], ['input', 'click', 'pointerdown']);
    const trace = JSON.parse(JSON.stringify(realm.window.__answerQa.finish()));
    assert.equal(trace.finishedAt, 123);
    assert.equal(trace.overflow, false);
    assert.equal(trace.longTasksSupported, true);
    assert.deepEqual(trace.longTasks, [{ start: 10, duration: 60 }]);
    assert.equal(trace.events.length, 1);
    assert.equal(trace.events[0].kind, 'state');
    assert.equal(trace.events[0].mounted, false);
    assert.equal(listeners.size, 0);
    assert.deepEqual(cleanup, { mutation: 1, tasks: 1, animation: 1 });
    console.log(JSON.stringify({ installed: true, finished: true, cleaned: true }));
  }
`;

function run(mode: string) {
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', probe, mode], {
    encoding: 'utf8', timeout: 30_000, env: { ...process.env, NODE_OPTIONS: '' },
  });
  expect(child.error).toBeUndefined();
  expect(child.signal).toBeNull();
  expect(child.status, child.stderr).toBe(0);
  return JSON.parse(child.stdout);
}

test('stock Node stripping leaves the real serialized recorder self-contained and cleanly finishable', () => {
  expect(run('native')).toEqual({ installed: true, finished: true, cleaned: true });
});

test('keepNames mutation reproduces the missing helper across the browser serialization boundary', () => {
  expect(run('keep-names')).toEqual({ mutationRejected: true });
});
