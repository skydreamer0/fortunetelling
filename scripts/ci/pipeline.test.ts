import { parse as parseYaml } from 'yaml';
import { describe, expect, test, vi } from 'vitest';
import { aggregate, assertUnion, classify, inventory, isTest, parseChanges, partition, runTests, verifySummary } from './pipeline';


const report = (counts = [2, 1]) => ({ success: true, numTotalTests: counts.reduce((a, b) => a + b, 0),
  numPassedTests: counts.reduce((a, b) => a + b, 0), numFailedTests: 0, numPendingTests: 0, numTodoTests: 0,
  testResults: counts.map((count, index) => ({ name: `file${index}.test.ts`, status: 'passed', assertionResults: Array.from({ length: count }, () => ({ status: 'passed' })) })) });

describe('conservative changes', () => {
  test('only audited modified documentation can skip expensive suites on PRs', () => {
    expect(classify([{ status: 'M', path: 'README.md' }], 'pull_request')).toBe('docs');
    expect(classify([{ status: 'M', path: 'ROADMAPS.md' }], 'pull_request')).toBe('docs');
  });
  test('icons keep scoped PWA, docs, tooling, typecheck, doctor and build', () => {
    expect(classify([{ status: 'M', path: 'apps/web/public/icons/fortune-app-v1-192.png' }], 'pull_request')).toBe('assets');
  });
  test.each(['docs/MCP-SETUP.md', 'docs/validation/answer-check-19-46.md', 'docs/new.md', 'packages/core/src/index.ts', 'packages/core/tests/fixtures/reportGolden.json', 'package-lock.json', 'package.json', '.github/workflows/ci.yml', 'vitest.config.ts', 'apps/web/public/manifest.webmanifest', 'unknown'])('unknown or coupled %s runs full', path => {
    expect(classify([{ status: 'M', path }], 'pull_request')).toBe('full');
  });
  test.each(['A', 'D', 'R', 'T', 'U'])('status %s fails closed', status => {
    expect(classify([{ status, path: 'README.md' }], 'pull_request')).toBe('full');
  });
  test('master/manual/empty/mixed changes require full', () => {
    expect(classify([], 'pull_request')).toBe('full');
    for (const event of ['push', 'workflow_dispatch', 'unknown']) expect(classify([{ status: 'M', path: 'README.md' }], event)).toBe('full');
    expect(classify([{ status: 'M', path: 'README.md' }, { status: 'M', path: 'apps/web/public/favicon.svg' }], 'pull_request')).toBe('full');
  });
  test('NUL diff parsing handles spaces/newlines and rejects malformed input', () => {
    expect(parseChanges('M\0README.md\0D\0space\nname.md\0')).toEqual([{ status: 'M', path: 'README.md' }, { status: 'D', path: 'space\nname.md' }]);
    for (const raw of ['M\0README.md', 'R100\0old\0new\0', 'M\0../README.md\0']) expect(() => parseChanges(raw)).toThrow();
  });
});
describe('complete duration-weighted inventory', () => {
  test('discovery preserves audited naming, excluding hidden and dependency directories', () => {
    for (const p of ['a.test.ts', 'a_spec.mjs', 'x/z.spec.cts', 'test/a_test.tsx']) expect(isTest(p)).toBe(true);
    for (const p of ['.hidden/a.test.ts', 'node_modules/a.test.ts', 'a.test.json', 'a.ts']) expect(isTest(p)).toBe(false);
  });
  test('actual inventory includes critical suites exactly once and new tests automatically', () => {
    const files = inventory(), buckets = partition(files);
    assertUnion(files, buckets);
    for (const p of ['packages/core/tests/reportGolden.test.ts', 'packages/core/tests/export.test.ts', 'packages/core/tests/dateOnlyCalendar.test.ts', 'packages/core/tests/calendarHostTimezone.test.ts', 'packages/core/tests/ziweiAsOfTimezone.test.ts', 'apps/web/tests/reportReplay.test.ts', 'scripts/ci/pipeline.test.ts']) expect(buckets.flat().filter(f => f === p)).toHaveLength(1);
    const extra = [...files, 'new/new.test.ts']; expect(partition(extra).flat()).toContain('new/new.test.ts');
  });
  test('balanced deterministic partition does not mutate input', () => {
    const files = ['a', 'b', 'c', 'd'];
    expect(partition(files, 2, { a: 9, b: 8, c: 2, d: 1 })).toEqual([['a', 'd'], ['b', 'c']]);
    expect(files).toEqual(['a', 'b', 'c', 'd']);
    expect(() => assertUnion(files, [['a', 'b'], ['a', 'd']])).toThrow();
    expect(() => assertUnion(files, [['a', 'b'], ['c']])).toThrow();
  });
});
describe('aggregate never fabricates success', () => {
  const full = { plan: 'success', checks: 'success', regression: 'success', lightweight: 'skipped', native_calendar: 'success', native_compare: 'success' };
  test('only expected full/scoped results pass', () => {
    expect(() => aggregate('full', full)).not.toThrow();
    for (const mode of ['docs', 'assets']) expect(() => aggregate(mode, { ...full, regression: 'skipped', lightweight: 'success', native_calendar: 'skipped', native_compare: 'skipped' })).not.toThrow();
    expect(() => aggregate('', full)).toThrow();
  });
  test.each(['failure', 'cancelled', 'skipped', undefined])('required result %s cannot pass', result => {
    for (const job of ['plan', 'checks', 'regression', 'native_calendar', 'native_compare']) expect(() => aggregate('full', { ...full, [job]: result })).toThrow();
    for (const mode of ['docs', 'assets']) expect(() => aggregate(mode, { ...full, regression: 'skipped', lightweight: result, native_calendar: 'skipped', native_compare: 'skipped' })).toThrow();
  });
  test('only the existing two opt-in live API tests may be skipped without a key', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    try {
      const names = ['parseQuestion classifies a catalog question', 'interpret returns validated, cited sections'];
      const live = { ...report([2]), numPassedTests: 0, numPendingTests: 2,
        testResults: [{ name: 'packages/ai/tests/live.test.ts', status: 'passed',
          assertionResults: names.map(title => ({ title, status: 'skipped' })) }] };
      expect(() => verifySummary(JSON.stringify(live), 1)).not.toThrow();
      for (const value of [
        { ...live, testResults: [{ ...live.testResults[0], name: 'another.test.ts' }] },
        { ...live, testResults: [{ ...live.testResults[0], status: 'failed' }] },
        { ...live, testResults: [{ ...live.testResults[0], assertionResults: [{ title: 'unexpected', status: 'skipped' }, live.testResults[0].assertionResults[1]] }] },
      ]) expect(() => verifySummary(JSON.stringify(value), 1)).toThrow();
      vi.stubEnv('ANTHROPIC_API_KEY', 'synthetic-test-key');
      expect(() => verifySummary(JSON.stringify(live), 1)).toThrow();
    } finally { vi.unstubAllEnvs(); }
  });
  test('unexpected active/skipped lane fails', () => {
    expect(() => aggregate('full', { ...full, lightweight: 'success' })).toThrow();
    expect(() => aggregate('docs', full)).toThrow();
  });
  test('execution needs exact file count and a single zero-failure completion', () => {
    expect(() => verifySummary(JSON.stringify(report()), 2)).not.toThrow();
    for (const value of [null, {}, { ...report(), success: false }, { ...report(), numFailedTests: 1 },
      { ...report(), numPendingTests: 1 }, { ...report(), numTodoTests: 1 }, report([3]), report([1, 1, 1]),
      { ...report(), numPassedTests: 2 }, { ...report(), testResults: [report().testResults[0], report().testResults[0]] }]) {
      expect(() => verifySummary(JSON.stringify(value), 2)).toThrow();
    }
    expect(() => verifySummary(JSON.stringify(report()), 2, ['unexpected.test.ts', 'file1.test.ts'])).toThrow();
    expect(() => verifySummary('not JSON', 2)).toThrow();
  });
});

import { readFileSync } from 'node:fs';
test('workflow wires stable acceptance to all required lanes and trusted master publication', () => {
  const workflow = parseYaml(readFileSync('.github/workflows/ci.yml', 'utf8')) as any;
  expect(workflow.name).toBe('CI');
  expect(workflow.permissions).toEqual({ contents: 'read' });
  expect(workflow.on.push.branches).toEqual(['master']);
  const jobs = workflow.jobs;
  expect(jobs.test.name).toBe('Test & Build');
  expect(jobs.test.if).toBe('always()');
  expect(jobs.test.needs).toEqual(['plan', 'regression', 'lightweight', 'checks', 'native_calendar', 'native_compare']);
  expect(jobs.regression.strategy['fail-fast']).toBe(false);
  expect(jobs.regression.strategy.matrix.shard).toEqual([0, 1, 2, 3]);
  expect(jobs.publish.needs).toBe('test');
  for (const condition of ["github.repository == 'skydreamer0/fortunetelling'", "github.event_name == 'push'", "github.ref == 'refs/heads/master'", "needs.test.result == 'success'"]) expect(jobs.publish.if).toContain(condition);
  expect(jobs.publish.uses).toBe('./.github/workflows/deploy.yml');
  expect(jobs.publish.with.accepted_sha).toBe('${{ needs.test.outputs.accepted_sha }}');
  expect(jobs.publish.permissions).toEqual({ contents: 'read', pages: 'write', 'id-token': 'write' });
  for (const id of ['plan', 'regression', 'lightweight', 'checks', 'native_calendar', 'native_compare', 'test']) {
    const setup = jobs[id].steps.find((step: any) => step.uses === 'actions/setup-node@v4');
    expect(setup.with['node-version']).toBe('24.19.0');
    if (id === 'native_compare') expect(jobs[id].permissions).toEqual({ contents: 'read', actions: 'read' });
    else expect(jobs[id].permissions).toBeUndefined();
  }
  const checks = jobs.checks.steps.map((step: any) => step.run).filter(Boolean);
  for (const command of ['npm run typecheck --workspace @fortune/core', 'npm run typecheck --workspace @fortune/web', 'npm run typecheck --workspace @fortune/ai', 'npm run typecheck --workspace @fortune/mcp', 'node --import tsx packages/mcp/src/cli/doctor.ts --ci', 'npm run build', 'node scripts/ci/assets.ts']) expect(checks).toContain(command);
});

 test('installed Vitest CLI launches through package exports and validates exact JSON inventory', () => {
  const result = JSON.parse(runTests(['apps/web/tests/nodeHttp.test.ts'], { ...process.env, ANTHROPIC_API_KEY: '' }));
  expect(result.success).toBe(true);
  expect(result.numPassedTests).toBe(4);
  expect(result.numFailedTests).toBe(0);
}, 30_000);
