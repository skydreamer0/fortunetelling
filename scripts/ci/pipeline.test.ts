import { describe, expect, test } from 'bun:test';
import { aggregate, assertUnion, classify, inventory, isTest, parseChanges, partition, verifySummary } from './pipeline';

describe('conservative changes', () => {
  test('only audited modified documentation can skip expensive suites on PRs', () => {
    expect(classify([{ status: 'M', path: 'README.md' }], 'pull_request')).toBe('docs');
    expect(classify([{ status: 'M', path: 'ROADMAPS.md' }], 'pull_request')).toBe('docs');
  });
  test('icons keep scoped PWA, docs, tooling, typecheck, doctor and build', () => {
    expect(classify([{ status: 'M', path: 'apps/web/public/icons/fortune-app-v1-192.png' }], 'pull_request')).toBe('assets');
  });
  test.each(['docs/MCP-SETUP.md', 'docs/validation/answer-check-19-46.md', 'docs/new.md', 'packages/core/src/index.ts', 'packages/core/tests/fixtures/reportGolden.json', 'bun.lock', 'package.json', '.github/workflows/ci.yml', 'bunfig.toml', 'apps/web/public/manifest.webmanifest', 'unknown'])('unknown or coupled %s runs full', path => {
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
  test('discovery matches Bun naming, excluding hidden and dependency directories', () => {
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
  const full = { plan: 'success', checks: 'success', regression: 'success', lightweight: 'skipped' };
  test('only expected full/scoped results pass', () => {
    expect(() => aggregate('full', full)).not.toThrow();
    for (const mode of ['docs', 'assets']) expect(() => aggregate(mode, { ...full, regression: 'skipped', lightweight: 'success' })).not.toThrow();
    expect(() => aggregate('', full)).toThrow();
  });
  test.each(['failure', 'cancelled', 'skipped', undefined])('required result %s cannot pass', result => {
    for (const job of ['plan', 'checks', 'regression']) expect(() => aggregate('full', { ...full, [job]: result })).toThrow();
    for (const mode of ['docs', 'assets']) expect(() => aggregate(mode, { ...full, regression: 'skipped', lightweight: result })).toThrow();
  });
  test('unexpected active/skipped lane fails', () => {
    expect(() => aggregate('full', { ...full, lightweight: 'success' })).toThrow();
    expect(() => aggregate('docs', full)).toThrow();
  });
  test('execution needs exact file count and a single zero-failure completion', () => {
    expect(() => verifySummary(' 3 pass\n 0 fail\nRan 3 tests across 2 files. [1s]', 2)).not.toThrow();
    for (const text of ['', '0 fail\nRan 3 tests across 1 file.', '1 fail\nRan 3 tests across 2 files.', '0 fail\nRan 3 tests across 2 files.\nRan 3 tests across 2 files.']) expect(() => verifySummary(text, 2)).toThrow();
  });
});

import { readFileSync } from 'node:fs';
test('workflow wires stable acceptance to all required lanes and trusted master publication', () => {
  const workflow = Bun.YAML.parse(readFileSync('.github/workflows/ci.yml', 'utf8')) as any;
  expect(workflow.name).toBe('CI');
  expect(workflow.permissions).toEqual({ contents: 'read' });
  expect(workflow.on.push.branches).toEqual(['master']);
  const jobs = workflow.jobs;
  expect(jobs.test.name).toBe('Test & Build');
  expect(jobs.test.if).toBe('always()');
  expect(jobs.test.needs).toEqual(['plan', 'regression', 'lightweight', 'checks']);
  expect(jobs.regression.strategy['fail-fast']).toBe(false);
  expect(jobs.regression.strategy.matrix.shard).toEqual([0, 1, 2, 3]);
  expect(jobs.publish.needs).toBe('test');
  for (const condition of ["github.repository == 'skydreamer0/fortunetelling'", "github.event_name == 'push'", "github.ref == 'refs/heads/master'", "needs.test.result == 'success'"]) expect(jobs.publish.if).toContain(condition);
  expect(jobs.publish.uses).toBe('./.github/workflows/deploy.yml');
  expect(jobs.publish.with.accepted_sha).toBe('${{ needs.test.outputs.accepted_sha }}');
  expect(jobs.publish.permissions).toEqual({ contents: 'read', pages: 'write', 'id-token': 'write' });
  for (const id of ['plan', 'regression', 'lightweight', 'checks', 'test']) {
    const setup = jobs[id].steps.find((step: any) => step.uses === 'oven-sh/setup-bun@v2');
    expect(setup.with['bun-version']).toBe('1.4.3');
    expect(jobs[id].permissions).toBeUndefined();
  }
  const checks = jobs.checks.steps.map((step: any) => step.run).filter(Boolean);
  for (const command of ['bun run --filter @fortune/core typecheck', 'bun run --filter @fortune/web typecheck', 'bun run --filter @fortune/ai typecheck', 'bun run --filter @fortune/mcp typecheck', 'bun run packages/mcp/src/cli/doctor.ts --ci', 'bun run build', 'bun scripts/ci/assets.ts']) expect(checks).toContain(command);
});
