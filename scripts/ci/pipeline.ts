import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { appendFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, basename, resolve, join } from 'node:path';
import measured from './test-durations.json';

export type Mode = 'full' | 'docs' | 'assets';
export const SHARDS = 4;
const docs = new Set(['README.md', 'ROADMAPS.md']);
const assets = new Set(['apps/web/public/favicon.svg', 'apps/web/public/favicon.ico', 'apps/web/public/icons/fortune-app-v1.svg',
  'apps/web/public/icons/fortune-app-v1-192.png', 'apps/web/public/icons/fortune-app-v1-512.png',
  'apps/web/public/icons/fortune-maskable-v1-512.png', 'apps/web/public/icons/fortune-apple-touch-v1-180.png']);
// Deliberately tiny audited allowlist. In particular docs/MCP-SETUP.md is consumed
// by docsSync tests and docs/validation may be browser acceptance input.
export function classify(changes: { status: string; path: string }[], event: string): Mode {
  if (event !== 'pull_request' || changes.length === 0 || changes.some(c => c.status !== 'M')) return 'full';
  if (changes.every(c => docs.has(c.path))) return 'docs';
  if (changes.every(c => assets.has(c.path))) return 'assets';
  return 'full';
}
export function parseChanges(raw: string): { status: string; path: string }[] {
  if (!raw) return [];
  const parts = raw.split('\0');
  if (parts.pop() !== '' || parts.length % 2) throw new Error('Incomplete NUL-delimited diff');
  return Array.from({ length: parts.length / 2 }, (_, i) => {
    const status = parts[i * 2]!, path = parts[i * 2 + 1]!;
    if (!/^[AMDTRUXB]$/.test(status) || !path || path.startsWith('/') || path.split('/').includes('..')) throw new Error('Invalid diff entry');
    return { status, path };
  });
}
export function isTest(path: string): boolean {
  return !path.split('/').some(p => p.startsWith('.') || p === 'node_modules') && /[._](test|spec)\.(js|jsx|ts|tsx|mjs|cjs|mts|cts)$/.test(basename(path));
}
function git(...args: string[]): string {
  const child = spawnSync('git', args, { stdio: ['pipe', 'pipe', 'pipe'] });
  if (child.status !== 0) throw new Error(`git ${args[0]} failed: ${child.stderr.toString()}`);
  return child.stdout.toString();
}
export function inventory(): string[] {
  const files = git('ls-files', '-z').split('\0').filter(Boolean);
  if (files.some(p => /(^|\/)(vitest\.workspace|vitest\.projects)\./.test(p))) throw new Error('Review test discovery when adding project-specific configuration');
  const tests = files.filter(isTest).sort();
  if (!tests.length || new Set(tests).size !== tests.length) throw new Error('Empty or duplicate inventory');
  return tests;
}
export function partition(files: string[], count = SHARDS, weights: Record<string, number> = measured.seconds): string[][] {
  if (!Number.isInteger(count) || count < 1 || files.length < count || new Set(files).size !== files.length) throw new Error('Invalid partition inputs');
  const buckets: string[][] = Array.from({ length: count }, () => []), totals = Array(count).fill(0);
  const weight = (p: string) => Number.isFinite(weights[p]) && weights[p]! > 0 ? weights[p]! : 5;
  for (const file of [...files].sort((a, b) => weight(b) - weight(a) || a.localeCompare(b))) {
    const index = totals.indexOf(Math.min(...totals));
    buckets[index]!.push(file); totals[index] += weight(file);
  }
  assertUnion(files, buckets);
  return buckets.map(b => b.sort());
}
export function assertUnion(files: string[], buckets: string[][]): void {
  const flat = buckets.flat();
  if (buckets.some(b => !b.length) || flat.length !== files.length || new Set(flat).size !== flat.length || [...flat].sort().some((p, i) => p !== [...files].sort()[i])) throw new Error('Partition must cover the exact test inventory once');
}
export function aggregate(mode: string, results: Record<string, string | undefined>): void {
  if (!['full', 'docs', 'assets'].includes(mode)) throw new Error('Missing or invalid classification');
  if (results.plan !== 'success' || results.checks !== 'success') throw new Error('Plan and typecheck/doctor/build must succeed');
  const native = mode === 'full' ? 'success' : 'skipped';
  if (results.native_calendar !== native || results.native_compare !== native) throw new Error('Native calendar regression incomplete');
  if (mode === 'full') {
    if (results.regression !== 'success' || results.lightweight !== 'skipped') throw new Error('Full regression incomplete');
  } else if (results.regression !== 'skipped' || results.lightweight !== 'success') throw new Error('Scoped regression incomplete');
}
export interface TestReport {
  success: boolean; numTotalTests: number; numPassedTests: number; numFailedTests: number;
  numPendingTests: number; numTodoTests: number;
  testResults: { name: string; status: string; assertionResults: { status: string; fullName?: string; title?: string }[] }[];
}
export function verifySummary(output: string, expectedFiles: number, expectedPaths?: string[]): TestReport {
  const report = JSON.parse(output) as TestReport;
  if (!report || !Array.isArray(report.testResults) || report.testResults.length !== expectedFiles ||
      new Set(report.testResults.map(file => file.name)).size !== expectedFiles ||
      !Number.isInteger(report.numTotalTests) || report.numTotalTests < expectedFiles) {
    throw new Error('Test execution did not cover the planned file count');
  }
  const allowedSkipped = report.testResults.filter(file => resolve(file.name) === resolve('packages/ai/tests/live.test.ts') && !process.env.ANTHROPIC_API_KEY);
  const skipped = allowedSkipped.flatMap(file => file.assertionResults).filter(test => test.status === 'skipped');
  if (skipped.length && (skipped.length !== 2 || skipped.map(test => test.title).sort().join('|') !== ['interpret returns validated, cited sections', 'parseQuestion classifies a catalog question'].sort().join('|'))) throw new Error('Unexpected live-test skip inventory');
  if (report.success !== true || report.numFailedTests !== 0 || report.numPendingTests !== skipped.length ||
      report.numTodoTests !== 0 || report.numPassedTests + skipped.length !== report.numTotalTests ||
      report.testResults.some(file => (file.status !== 'passed' && !(allowedSkipped.includes(file) && ['pending', 'skipped'].includes(file.status))) || !Array.isArray(file.assertionResults) ||
        !file.assertionResults.length || file.assertionResults.some(test => test.status !== 'passed' && !(allowedSkipped.includes(file) && test.status === 'skipped'))) ||
      report.testResults.reduce((total, file) => total + file.assertionResults.length, 0) !== report.numTotalTests) {
    throw new Error('Missing clean test summary (failed, skipped, todo or incomplete execution)');
  }
  if (expectedPaths) {
    const actual = report.testResults.map(file => resolve(file.name)).sort();
    const expected = expectedPaths.map(file => resolve(file)).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Executed files differ from the exact planned inventory');
  }
  return report;
}
export function runTests(files: string[], env = process.env, outputDirectory?: string): string {
  const temporary = outputDirectory ?? mkdtempSync(join(tmpdir(), 'fortune-vitest-'));
  const resultPath = join(temporary, 'tests.json');
  const cli = join(dirname(createRequire(import.meta.url).resolve('vitest/package.json')), 'vitest.mjs');
  try {
    rmSync(resultPath, { force: true });
    // Vitest CLI arguments are substring filters. Never trust them alone: exact
    // executed file identities are checked against the audited inventory below.
    const child = spawnSync(process.execPath, [cli, 'run', ...files.map(file => `./${file}`),
      '--reporter=default', '--reporter=json', `--outputFile.json=${resultPath}`], {
      env: { ...env, NO_COLOR: '1' }, encoding: 'utf8', timeout: 8 * 60_000, maxBuffer: 64 * 1024 * 1024,
    });
    console.log(child.stdout); console.error(child.stderr);
    if (child.error || child.status !== 0 || child.signal) throw new Error(`Tests did not exit normally: ${child.error ?? child.signal ?? child.status}`);
    const json = readFileSync(resultPath, 'utf8');
    verifySummary(json, files.length, files);
    return json;
  } finally { if (!outputDirectory) rmSync(temporary, { recursive: true, force: true }); }
}
export function output(name: string, value: string): void {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}
export async function main(command: string, index?: string) {
  if (command === 'plan') {
    let mode: Mode = 'full';
    if (process.env.GITHUB_EVENT_NAME === 'pull_request') {
      try {
        const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH!, 'utf8'));
        const base = event.pull_request?.base?.sha;
        if (!/^[a-f0-9]{40}$/.test(base ?? '')) throw new Error('Missing base SHA');
        mode = classify(parseChanges(git('diff', '--name-status', '--no-renames', '-z', base, 'HEAD')), 'pull_request');
      } catch (error) { console.log(`Uncertain diff: running full suite. ${error}`); }
    }
    const files = inventory(), shards = partition(files);
    console.log(JSON.stringify({ mode, checkout: git('rev-parse', 'HEAD').trim(), node: process.versions.node, totalFiles: files.length,
      measuredSource: measured.source, shards: shards.map((files, index) => ({ index, files })) }, null, 2));
    output('mode', mode);
  } else if (command === 'aggregate') {
    aggregate(process.env.MODE ?? '', JSON.parse(process.env.RESULTS ?? '{}'));
    const sha = process.env.GITHUB_SHA;
    if (!/^[a-f0-9]{40}$/.test(sha ?? '') || git('rev-parse', 'HEAD').trim() !== sha) throw new Error('Aggregate checkout mismatch');
    output('accepted_sha', sha!);
    console.log(`Accepted ${sha}: ${process.env.MODE}`);
  } else if (command === 'run') {
    const all = inventory(), shards = partition(all);
    let files: string[];
    if (index === 'lightweight') files = all.filter(p => p.startsWith('scripts/ci/') || p === 'packages/mcp/tests/docsSync.test.ts' || p === 'apps/web/tests/pwa.test.ts');
    else {
      if (!/^[0-3]$/.test(index ?? '')) throw new Error('Invalid shard index');
      files = shards[Number(index)]!;
    }
    if (!files.length) throw new Error('Empty selected suite');
    console.log(JSON.stringify({ shard: index, node: process.versions.node, v8: process.versions.v8, files }, null, 2));
    const started = performance.now();
    runTests(files);
    console.log(JSON.stringify({ shard: index, files: files.length, durationMs: Math.round(performance.now() - started), status: 'PASS' }));
  } else throw new Error('Unknown CI command');
}
if (import.meta.main) await main(process.argv[2] ?? '', process.argv[3]);
