import { parse as parseYaml } from 'yaml';
import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { natalCases } from '../../packages/core/tests/fixtures/natalCalendarCases';
import { compareBytes, lockIdentity, runners, strictSummary, validateInventory, validateManifest, zones, type Manifest } from './native-calendar';


const report = (counts = [2, 1]) => ({ success: true, numTotalTests: counts.reduce((a, b) => a + b, 0),
  numPassedTests: counts.reduce((a, b) => a + b, 0), numFailedTests: 0, numPendingTests: 0, numTodoTests: 0,
  testResults: counts.map((count, index) => ({ name: `file${index}.test.ts`, status: 'passed', assertionResults: Array.from({ length: count }, () => ({ status: 'passed' })) })) });

const expected = { repository: 'owner/repo', workflow: '.github/workflows/ci.yml', headSha: 'a'.repeat(40), baseSha: 'b'.repeat(40), sha: 'a'.repeat(40), tree: 'b'.repeat(40), runId: '123', attempt: '1' };
const manifest = (): Manifest => ({ schema: 2, status: 'PASS', runner: 'ubuntu-24.04', platform: 'linux', arch: 'x64',
  ...expected, node: '24.19.0', v8: 'revision', lock: 'c'.repeat(64),
  evidence: Object.fromEntries(['natal.json', 'snapshots.json'].map(name => [name, { bytes: 100, sha256: 'd'.repeat(64) }])) });
function inventory() {
  const natal: any[] = [], produced: any[] = [], reloaded: any[] = [];
  const serialized = (id: string, setting: string) => JSON.stringify({ scope: 'analyze-sync-natal', identity: { id, setting }, specHash: `sp-${id}-${setting}`, snapshotId: `sn-${id}-${setting}`, natal: { ziwei: {}, bazi: {}, numerology: {}, mingGua: {}, tzolkin: {} } });
  for (const [index, zone] of zones.entries()) {
    const host = { zone, offsetMinutes: [0, -480, 240, -780][index] };
    for (const mode of ['A', 'B', 'interleaved']) {
      const rows = natalCases.map(row => (mode === 'interleaved' ? ['A', 'B', 'A'] : [mode]).map(setting => ({ id: row.id, setting, serialized: serialized(row.id, setting) })));
      natal.push([`${zone}/${mode}`, { host: zone, hostOffsetMinutes: host.offsetMinutes, rows }]);
      produced.push([`${zone}/${mode}`, { host, rows }]);
    }
    const rows = zones.flatMap(origin => natalCases.flatMap(row => ['A', 'B'].map(setting => ({ origin, id: row.id, setting, serialized: serialized(row.id, setting),
      owned: true, frozen: true, unchangedIds: true, identityError: 'ChartSnapshot identity mismatch', contentError: 'ChartSnapshot content mismatch' }))));
    reloaded.push([zone, { host, rows }]);
  }
  return { natal, snapshots: { produced, reloaded } };
}

test('lock identity permits only exact Git source or CRLF checkout expansion', () => {
  const source = '{\n  "version": "fixed"\n}\n';
  expect(lockIdentity(source, source)).toBe(lockIdentity(source, source.replace(/\n/g, '\r\n')));
  for (const changed of [source.replace('fixed', 'changed'), source.trimEnd(), source + '\n', source.replace('  ', ' '), source.replace('\n', '\r\r\n')]) expect(() => lockIdentity(source, changed)).toThrow('differs from source blob');
});
test('native test completion rejects missing, skipped, todo, failed and partial execution', () => {
  const clean = report([6, 6]);
  expect(() => strictSummary(JSON.stringify(clean))).not.toThrow();
  for (const value of [null, report([6, 5]), report([6, 7]), report([12]), { ...clean, numFailedTests: 1 },
    { ...clean, numPendingTests: 1 }, { ...clean, numTodoTests: 1 }, { ...clean, success: false }]) {
    expect(() => strictSummary(JSON.stringify(value))).toThrow();
  }
  expect(() => strictSummary(JSON.stringify(clean) + JSON.stringify(clean))).toThrow();
});
test('manifest requires exact source, run, native OS, pinned runtime, complete bounded artifacts', () => {
  for (const [runner, platform] of Object.entries(runners)) expect(() => validateManifest({ ...manifest(), runner, platform }, runner, expected)).not.toThrow();
  for (const patch of [{ repository: 'other/repo' }, { workflow: 'wrong.yml' }, { headSha: 'f'.repeat(40) }, { baseSha: 'f'.repeat(40) }, { status: 'NOT RUN' }, { status: 'FAIL' }, { sha: 'e'.repeat(40) }, { tree: 'e'.repeat(40) }, { runId: '124' }, { attempt: '2' }, { platform: 'win32' }, { arch: 'arm64' }, { node: '24.18.0' }, { v8: '' }, { lock: '' }, { evidence: {} }]) expect(() => validateManifest({ ...manifest(), ...patch }, 'ubuntu-24.04', expected)).toThrow();
  const oversized = manifest(); oversized.evidence['natal.json']!.bytes = 64 * 1024 * 1024 + 1;
  expect(() => validateManifest(oversized, 'ubuntu-24.04', expected)).toThrow();
});
test('all native clock, fixture, A/B/ABA and 256 reload entries are mandatory', () => {
  const good = inventory(); expect(() => validateInventory(good.natal, good.snapshots)).not.toThrow();
  for (const mutate of [
    (value: ReturnType<typeof inventory>) => value.natal.pop(),
    (value: ReturnType<typeof inventory>) => value.natal[0][1].rows.pop(),
    (value: ReturnType<typeof inventory>) => value.natal[0][1].hostOffsetMinutes = 480,
    (value: ReturnType<typeof inventory>) => value.snapshots.produced[2][1].rows[0].pop(),
    (value: ReturnType<typeof inventory>) => value.snapshots.produced[0][1].rows[0][0].serialized = '{}',
    (value: ReturnType<typeof inventory>) => value.snapshots.reloaded.pop(),
    (value: ReturnType<typeof inventory>) => value.snapshots.reloaded[0][1].rows.pop(),
    (value: ReturnType<typeof inventory>) => value.snapshots.reloaded[0][1].rows[0].serialized += ' ',
    (value: ReturnType<typeof inventory>) => value.snapshots.reloaded[0][1].rows[0].contentError = null,
  ]) { const value = inventory(); mutate(value); expect(() => validateInventory(value.natal, value.snapshots)).toThrow(); }
});
test('byte comparison rejects changed content with unchanged IDs and even equivalent reformatting', () => {
  const original = '{"snapshotId":"same","specHash":"same","palace":"命宮"}';
  expect(() => compareBytes(original, original, 'same')).not.toThrow();
  for (const value of [original.replace('命宮', '財帛'), `${original}\n`, '']) expect(() => compareBytes(original, value, 'mutation')).toThrow('full bytes differ at byte');
});
test('native lanes preserve full/scoped selection, exact matrix, bounded evidence and fail-closed aggregation', () => {
  const workflow = parseYaml(readFileSync('.github/workflows/ci.yml', 'utf8')) as any;
  const jobs = workflow.jobs, native = jobs.native_calendar, compare = jobs.native_compare;
  expect(native.if).toBe("needs.plan.outputs.mode == 'full'");
  expect(native.strategy.matrix.os).toEqual(Object.keys(runners));
  expect(native.strategy['fail-fast']).toBe(false);
  expect(native['runs-on']).toBe('${{ matrix.os }}');
  expect(native['timeout-minutes']).toBe(8);
  const upload = native.steps.find((step: any) => step.uses === 'actions/upload-artifact@v4');
  expect(upload.if).toBe('always()');
  expect(upload.with['retention-days']).toBe(1);
  expect(upload.with['if-no-files-found']).toBe('error');
  expect(upload.with.name).toBe('native-calendar-${{ matrix.os }}-${{ github.run_attempt }}');
  expect(compare.needs).toEqual(['plan', 'native_calendar']);
  expect(compare.if).toBe("${{ always() && needs.plan.outputs.mode == 'full' }}");
  expect(compare.permissions).toEqual({ contents: 'read', actions: 'read' });
  const download = compare.steps.find((step: any) => step.uses === 'actions/download-artifact@v4');
  expect(download.with['artifact-ids']).toBe('${{ steps.native_artifacts.outputs.artifact_ids }}');
  expect(download.with.pattern).toBeUndefined();
  expect(download.with['github-token']).toBe('${{ github.token }}');
  expect(download.with.repository).toBe('${{ github.repository }}');
  expect(download.with['run-id']).toBe('${{ github.run_id }}');
  expect(compare.steps.find((step: any) => step.id === 'native_artifacts').env.GH_TOKEN).toBe('${{ github.token }}');
  const aggregate = jobs.test.steps.find((step: any) => step.id === 'aggregate');
  for (const name of ['native_calendar', 'native_compare']) expect(aggregate.env.RESULTS).toContain(`"${name}":"\${{ needs.${name}.result }}"`);
});
