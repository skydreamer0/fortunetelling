import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { release, version } from 'node:os';
import { dirname, basename, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const statePath = join(process.env.RUNNER_TEMP!, 'fortune-windows-calendar.json');
const suites = [
  ['baziNatalBasis', 14, 'e4dcb1a7ef3ace2a7e68038cd0f5732bf3a28d2e'],
  ['calculationSpec', 19, 'dd86ed6ffe62e65f8788e00c8c3dd7f185add241'],
  ['calendarHostTimezone', 7, '0b32fe7783d65b8468de77a1d2dfa085a14c5a09'],
  ['dateOnlyCalendar', 8, '4f6548f1597bc8469adc4c57e81a135d57f65aec'],
  ['ziweiAsOfTimezone', 5, 'd72bad7e3ba6ce51ef1113462ccf44a538f3b44f'],
  ['subprocessModuleUrl', 2, 'd2bb9929052880068288617cd9a2d981640bd159'],
] as const;
const zones = [['UTC', 0], ['Asia/Taipei', -480], ['America/New_York', 300], ['Pacific/Apia', -780]] as const;
const state: { evidence: Record<string, unknown>; stages: Record<string, any> } = {
  evidence: {
    imageOS: process.env.ImageOS, imageVersion: process.env.ImageVersion,
    runnerOS: process.env.RUNNER_OS, osRelease: release(), osVersion: version(),
    platform: process.platform, arch: process.arch, nodeVersion: process.versions.node,
    v8Version: process.versions.v8, executable: process.execPath, cwd: process.cwd(),
    expectedHead: process.env.EXPECTED_HEAD, eventSHA: process.env.EVENT_SHA,
  },
  stages: {},
};
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
const require = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
function command(cmd: string[], env = process.env, timeout = 120000) {
  const started = performance.now();
  const child = spawnSync(cmd[0]!, cmd.slice(1), { cwd: process.cwd(), env, stdio: ['ignore', 'pipe', 'pipe'], timeout, maxBuffer: 8 * 1024 * 1024 });
  const result = {
    cmd, exitCode: child.status, signal: child.signal,
    timedOut: child.error && 'code' in child.error && child.error.code === 'ETIMEDOUT',
    maxBufferExceeded: child.error && 'code' in child.error && child.error.code === 'ENOBUFS',
    spawnError: child.error?.message,
    durationMs: Math.round(performance.now() - started),
    stdout: child.stdout?.toString() ?? '', stderr: child.stderr?.toString() ?? '',
  };
  console.log(JSON.stringify(result));
  return result;
}
function normalExit(result: ReturnType<typeof command>, expected = 0) {
  require(result.exitCode === expected && !result.signal && !result.timedOut && !result.maxBufferExceeded && !result.spawnError,
    `Expected normal exit ${expected}, got ${JSON.stringify(result)}`);
}
function git(...args: string[]) {
  const result = command(['git', ...args]); normalExit(result); return result.stdout.trim();
}
function stage(name: string, work: (record: Record<string, any>) => void, blocked = false) {
  const started = performance.now();
  const record: Record<string, any> = { status: 'RUNNING' };
  state.stages[name] = record; save();
  try { work(record); record.status = 'PASS'; }
  catch (error) {
    record.status = blocked ? 'BLOCKED' : 'FAIL';
    record.error = error instanceof Error ? error.message : String(error);
  }
  record.durationMs = Math.round(performance.now() - started);
  save(); console.log(name, JSON.stringify(record));
  return record.status === 'PASS';
}
save();
console.log('Runtime evidence', JSON.stringify(state.evidence));
const native = stage('native-runtime', () => {
  require(process.platform === 'win32' && process.arch === 'x64', 'Native win32/x64 required');
  require(process.versions.node === '24.19.0', 'Node 24.19.0 required');
  require(/^[A-Za-z]:\\/.test(process.cwd()), 'Actual Windows drive-letter working directory required');
  require(basename(process.cwd()) === 'checkout 空間 # %', 'Encoded checkout path required');
}, true);
let lockBefore = '';
const provenance = native && stage('source-provenance', record => {
  record.head = git('rev-parse', 'HEAD');
  record.tree = git('rev-parse', 'HEAD^{tree}');
  require(/^[0-9a-f]{40}$/.test(process.env.EXPECTED_HEAD ?? '') && record.head === process.env.EXPECTED_HEAD,
    'Checkout must match the exact PR head, not the merge/event SHA');
  lockBefore = sha256('package-lock.json'); record.lockSHA256 = lockBefore;
  record.testBlobs = suites.map(([name, , expectedBlob]) => {
    const path = `packages/core/tests/${name}.test.ts`;
    const blob = git('rev-parse', `HEAD:${path}`);
    const workingBlob = git('hash-object', '--path', path, path);
    require(blob === expectedBlob && workingBlob === expectedBlob, `Unchanged test blob required: ${path}`);
    return { path, blob, workingBlob };
  });
  require(git('status', '--porcelain', '--untracked-files=no') === '', 'Tracked source must be clean');
}, true);
const installed = provenance && stage('frozen-install', record => {
  require(process.env.NPM_CI_OUTCOME === 'success', 'Prior npm ci --ignore-scripts must have succeeded');
  record.command = 'npm ci --ignore-scripts';
  require(sha256('package-lock.json') === lockBefore, 'Frozen install changed the lockfile');
  record.lockSHA256 = lockBefore;
});
if (native) {
  for (const [TZ, offset] of zones) stage(`tz:${TZ}`, record => {
    const probe = `console.log(JSON.stringify({ zone: process.env.TZ, offset: new Date('2026-01-15T00:00:00Z').getTimezoneOffset() }));`;
    record.expectedOffset = offset;
    record.result = command([process.execPath, '--eval', probe], { ...process.env, TZ }, 15000);
    normalExit(record.result);
    const observed = JSON.parse(record.result.stdout.trim()); record.observed = observed;
    require(observed.zone === TZ && observed.offset === offset,
      `TZ not operative: ${TZ} expected offset ${offset}; calendar equality is not acceptance evidence`);
  }, true);
  stage('path-controls', record => {
    const root = mkdtempSync(join(process.env.RUNNER_TEMP!, 'fortune-path-'));
    try {
      const directory = join(root, 'checkout 空間 # %'); mkdirSync(directory);
      const modulePath = join(directory, 'fixture.ts');
      const marker = 'fortune-windows-portable-import';
      writeFileSync(modulePath, `export const marker = ${JSON.stringify(marker)};\n`);
      const url = pathToFileURL(modulePath);
      record.modulePath = modulePath; record.href = url.href; record.pathname = url.pathname;
      require(fileURLToPath(url) === modulePath, 'file URL must round-trip to the actual Windows path');
      record.controls = [];
      for (const [kind, specifier] of [['href', url.href], ['fileURLToPath round-trip', pathToFileURL(fileURLToPath(url)).href], ['pathname', url.pathname]]) {
        const script = `import { marker } from ${JSON.stringify(specifier)}; console.log(marker);`;
        const result = command([process.execPath, '--import', 'tsx', '--input-type=module', '--eval', script], process.env, 15000);
        record.controls.push({ kind, specifier, ...result });
      }
      for (const positive of record.controls.slice(0, 2)) {
        normalExit(positive); require(positive.stdout.trim() === marker, `${positive.kind} marker mismatch`);
      }
      const negative = record.controls[2];
      require(Number.isInteger(negative.exitCode) && negative.exitCode > 0 && !negative.signal && !negative.timedOut && !negative.maxBufferExceeded,
        'pathname control must fail normally, not time out or fail to spawn');
      require(negative.stderr.includes('Cannot find module') && negative.stderr.includes(url.pathname),
        'pathname control must report Cannot find module naming the malformed pathname');
      require(!negative.stdout.includes(marker), 'Malformed pathname unexpectedly imported the module');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}
if (installed) {
  for (const [name, expectedPass] of suites) stage(`suite:${name}`, record => {
    record.expectedPass = expectedPass;
    const reportPath = join(process.env.RUNNER_TEMP!, `fortune-windows-${name}.json`);
    const cli = join(dirname(createRequire(import.meta.url).resolve('vitest/package.json')), 'vitest.mjs');
    record.result = command([process.execPath, cli, 'run', `packages/core/tests/${name}.test.ts`, '--reporter=json', `--outputFile=${reportPath}`]);
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    require(report.success === true && report.testResults.length === 1, 'Exactly one successful suite required');
    const suite = report.testResults[0];
    require(suite.name.replaceAll('\\', '/').endsWith(`/packages/core/tests/${name}.test.ts`) && suite.status === 'passed', 'Exact suite identity required');
    require(suite.assertionResults.length === expectedPass && suite.assertionResults.every((test: any) => test.status === 'passed'), 'Complete assertion inventory required');
    record.counts = { pass: report.numPassedTests, fail: report.numFailedTests, skip: report.numPendingTests, todo: report.numTodoTests };
    require(report.numTotalTests === expectedPass, 'Exact total test count required');
    normalExit(record.result);
    require(record.counts.pass === expectedPass && record.counts.fail === 0 && record.counts.skip === 0 && record.counts.todo === 0,
      `Expected ${expectedPass} pass, zero fail/skip/todo; got ${JSON.stringify(record.counts)}`);
  });
  stage('source-unchanged', record => {
    record.lockSHA256 = sha256('package-lock.json');
    require(record.lockSHA256 === lockBefore, 'Lockfile changed during acceptance');
    require(git('status', '--porcelain', '--untracked-files=no') === '', 'Tracked source changed during acceptance');
  });
}
const requiredStages = ['native-runtime', 'source-provenance', 'frozen-install', ...zones.map(([zone]) => `tz:${zone}`),
  'path-controls', ...suites.map(([name]) => `suite:${name}`), 'source-unchanged'];
const accepted = stage('aggregate', record => {
  record.missing = requiredStages.filter(name => !state.stages[name]);
  record.notPassed = requiredStages.filter(name => state.stages[name]?.status !== 'PASS');
  record.pass = suites.reduce((total, [name]) => total + (state.stages[`suite:${name}`]?.counts?.pass ?? 0), 0);
  require(record.missing.length === 0 && record.notPassed.length === 0 && record.pass === 55,
    `Windows focused acceptance incomplete: ${JSON.stringify(record)}`);
});
console.log(accepted ? 'Windows focused regression: 55 pass, zero fail/skip/todo. #54 remains open.'
  : 'Windows focused regression NOT accepted. See FAIL/BLOCKED/NOT RUN stages; #54 remains open.');
process.exitCode = accepted ? 0 : 1;
