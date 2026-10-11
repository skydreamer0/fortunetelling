import { appendFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { release } from 'node:os';
import { join, resolve } from 'node:path';
import { natalCases } from '../../packages/core/tests/fixtures/natalCalendarCases';
import { verifySummary } from './pipeline';

export const runners = { 'ubuntu-24.04': 'linux', 'windows-2022': 'win32', 'macos-15-intel': 'darwin' } as const;
export const zones = ['UTC', 'Asia/Taipei', 'America/New_York', 'Pacific/Apia'];
const offsets = [0, -480, 240, -780];
const modes = ['A', 'B', 'interleaved'];
const files = ['packages/core/tests/natalCalendarMatrix.test.ts', 'packages/core/tests/chartSnapshotHostTimezone.test.ts'];
const evidenceFiles = ['natal.json', 'snapshots.json'];
const limit = 64 * 1024 * 1024;
const hash = (value: string | Uint8Array) => new Bun.CryptoHasher('sha256').update(value).digest('hex');
function requireEqual(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label}: missing, unexpected or different evidence`);
}
function git(...args: string[]): string {
  const child = Bun.spawnSync(['git', ...args]);
  if (child.exitCode !== 0) throw new Error(`git ${args[0]} failed`);
  return child.stdout.toString();
}
export function lockIdentity(source: string, checkout: string): string {
  // Git may expand line endings on Windows. Permit only that checkout change;
  // hashes identify the exact committed blob, never platform-specific EOLs.
  if (checkout !== source && checkout !== source.replace(/\r?\n/g, '\r\n')) throw new Error('Checked-out lockfile differs from source blob');
  return hash(source);
}
export function strictSummary(output: string): void {
  verifySummary(output, 2);
  const passed = [...output.matchAll(/^\s*(\d+) pass\s*$/gm)];
  if (passed.length !== 1 || Number(passed[0]![1]) !== 12 ||
      !/Ran 12 tests across 2 files\./.test(output) || /^\s*\d+ (skip|todo)\s*$/m.test(output)) {
    throw new Error('Native calendar requires exactly 12 passing tests and no skipped/todo tests');
  }
}
export interface Manifest {
  schema: number; status: string; runner: string; platform: string; arch: string;
  sha: string; tree: string; runId: string; attempt: string;
  bun: string; revision: string; lock: string;
  evidence: Record<string, { bytes: number; sha256: string }>;
}
export function validateManifest(value: Manifest, runner: string, expected: { sha: string; tree: string; runId: string; attempt: string }): void {
  requireEqual([value.schema, value.status, value.runner, value.platform, value.arch],
    [1, 'PASS', runner, runners[runner as keyof typeof runners], 'x64'], `${runner} status/native OS`);
  for (const key of ['sha', 'tree', 'runId', 'attempt'] as const) requireEqual(value[key], expected[key], `${runner} ${key}`);
  if (!/^[a-f0-9]{40}$/.test(value.sha) || !/^[a-f0-9]{40}$/.test(value.tree) || !/^[1-9]\d*$/.test(value.runId) || !/^[1-9]\d*$/.test(value.attempt)) throw new Error('Invalid source/run provenance');
  if (value.bun !== '1.4.3' || !value.revision || !/^[a-f0-9]{64}$/.test(value.lock)) throw new Error('Missing pinned runtime/lock provenance');
  requireEqual(Object.keys(value.evidence).sort(), [...evidenceFiles].sort(), 'Evidence files');
  for (const entry of Object.values(value.evidence)) if (!Number.isInteger(entry.bytes) || entry.bytes <= 0 || entry.bytes > limit || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('Invalid evidence size/hash');
}
export function validateInventory(natal: any, snapshots: any): void {
  const keys = zones.flatMap(zone => modes.map(mode => `${zone}/${mode}`));
  requireEqual(natal.map((entry: any) => entry[0]), keys, 'Natal process inventory');
  requireEqual(snapshots.produced.map((entry: any) => entry[0]), keys, 'Snapshot process inventory');
  requireEqual(snapshots.reloaded.map((entry: any) => entry[0]), zones, 'Reload process inventory');
  for (const [index, zone] of zones.entries()) for (const mode of modes) {
    const key = `${zone}/${mode}`;
    const result = natal.find((entry: any) => entry[0] === key)[1];
    const snapshot = snapshots.produced.find((entry: any) => entry[0] === key)[1];
    requireEqual([result.host, result.hostOffsetMinutes], [zone, offsets[index]], `${key} native clock`);
    requireEqual(snapshot.host, { zone, offsetMinutes: offsets[index] }, `${key} snapshot native clock`);
    for (const rows of [result.rows, snapshot.rows]) {
      requireEqual(rows.map((group: any) => group[0]?.id), natalCases.map(row => row.id), `${key} fixture inventory`);
      for (const group of rows) requireEqual(group.map((row: any) => row.setting), mode === 'interleaved' ? ['A', 'B', 'A'] : [mode], `${key} setting inventory`);
    }
    for (const group of snapshot.rows) for (const row of group) {
      const full = JSON.parse(row.serialized);
      if (full.scope !== 'analyze-sync-natal' || !full.identity || !full.specHash || !full.snapshotId || Object.keys(full.natal).length !== 5) throw new Error(`${key}/${row.id}: incomplete snapshot bytes`);
    }
  }
  const transfers = zones.flatMap(origin => natalCases.flatMap(row => ['A', 'B'].map(setting => `${origin}/${row.id}/${setting}`))).sort();
  for (const [index, [zone, result]] of snapshots.reloaded.entries()) {
    requireEqual(result.host, { zone, offsetMinutes: offsets[index] }, `${zone} reload native clock`);
    requireEqual(result.rows.map((row: any) => `${row.origin}/${row.id}/${row.setting}`).sort(), transfers, `${zone} 64 reloads`);
    for (const row of result.rows) {
      const original = snapshots.produced.find((entry: any) => entry[0] === `${row.origin}/${row.setting}`)[1].rows.find((group: any) => group[0].id === row.id)[0];
      requireEqual(row.serialized, original.serialized, `${zone}/${row.id} reloaded bytes`);
      requireEqual([row.owned, row.frozen, row.unchangedIds, row.identityError, row.contentError],
        [true, true, true, 'ChartSnapshot identity mismatch', 'ChartSnapshot content mismatch'], `${zone}/${row.id} reload controls`);
    }
  }
}
function readEvidence(directory: string, name: string): string {
  const file = join(directory, name);
  if (statSync(file).size > limit) throw new Error(`${name} exceeds bounded evidence limit`);
  return readFileSync(file, 'utf8');
}
export function compareBytes(reference: string, candidate: string, label: string): void {
  if (reference === candidate) return;
  const a = Buffer.from(reference), b = Buffer.from(candidate);
  let at = 0;
  while (at < Math.min(a.length, b.length) && a[at] === b[at]) at++;
  throw new Error(`${label}: full bytes differ at byte ${at}; reference=${hash(a)} candidate=${hash(b)}`);
}
export async function main(command: string, directory: string, runner?: string): Promise<void> {
  directory = resolve(directory);
  const expected = { sha: git('rev-parse', 'HEAD').trim(), tree: git('rev-parse', 'HEAD^{tree}').trim(), runId: process.env.GITHUB_RUN_ID ?? '', attempt: process.env.GITHUB_RUN_ATTEMPT ?? '' };
  if (expected.sha !== process.env.GITHUB_SHA) throw new Error('Checkout must match the exact workflow SHA');
  if (command === 'run') {
    if (!runner || !(runner in runners)) throw new Error('Unknown native runner');
    mkdirSync(directory, { recursive: true });
    const manifest: Manifest & Record<string, unknown> = { schema: 1, status: 'NOT RUN', runner, platform: process.platform, arch: process.arch,
      ...expected, bun: Bun.version, revision: Bun.revision, lock: lockIdentity(git('show', 'HEAD:bun.lock'), readFileSync('bun.lock', 'utf8')), evidence: {},
      osRelease: release(), imageOS: process.env.ImageOS, imageVersion: process.env.ImageVersion,
      versions: process.versions, files, testCount: 12, fixtures: natalCases, zones,
      calendarDependencies: Object.fromEntries(['iztro', 'lunar-javascript'].map(name => [name, JSON.parse(readFileSync(Bun.resolveSync(`${name}/package.json`, resolve('packages/core')), 'utf8')).version])),
    };
    const save = () => writeFileSync(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2));
    save();
    try {
      const child = Bun.spawn([process.execPath, 'test', ...files.map(file => `./${file}`)], {
        env: { ...process.env, TZ: 'UTC', NO_COLOR: '1', NATIVE_CALENDAR_OUTPUT: directory }, stdout: 'pipe', stderr: 'pipe',
      });
      const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
      const log = `${stdout}\n${stderr}`.replace(/\x1b\[[0-9;]*m/g, '');
      writeFileSync(join(directory, 'tests.log'), log); console.log(log);
      if (code !== 0) throw new Error(`Native tests exited ${code}`);
      strictSummary(log);
      const [natal, snapshots] = evidenceFiles.map(name => readEvidence(directory, name));
      validateInventory(JSON.parse(natal!), JSON.parse(snapshots!));
      for (const name of evidenceFiles) { const bytes = readFileSync(join(directory, name)); manifest.evidence[name] = { bytes: bytes.length, sha256: hash(bytes) }; }
      manifest.status = 'PASS'; validateManifest(manifest, runner, expected); save();
      console.log(`${runner}: PASS, 12 tests, 4 host TZ, 8 fixtures, A/B/ABA, 256 reloads and 512 negative controls`);
    } catch (error) { manifest.status = 'FAIL'; manifest.error = String(error); save(); throw error; }
  } else if (command === 'compare') {
    const names = Object.keys(runners);
    requireEqual(readdirSync(directory).sort(), names.map(name => `native-calendar-${name}-${expected.attempt}`).sort(), 'Native artifact inventory');
    let reference: { manifest: Manifest; bytes: string[] } | undefined;
    const report: string[] = [];
    for (const name of names) {
      const path = join(directory, `native-calendar-${name}-${expected.attempt}`);
      const manifest = JSON.parse(readEvidence(path, 'manifest.json')) as Manifest;
      validateManifest(manifest, name, expected);
      const bytes = evidenceFiles.map(file => {
        const value = readEvidence(path, file);
        requireEqual({ bytes: Buffer.byteLength(value), sha256: hash(value) }, manifest.evidence[file], `${name}/${file} integrity`);
        return value;
      });
      validateInventory(JSON.parse(bytes[0]!), JSON.parse(bytes[1]!));
      if (reference) {
        requireEqual([manifest.bun, manifest.revision, manifest.lock], [reference.manifest.bun, reference.manifest.revision, reference.manifest.lock], `${name} dependency/runtime identity`);
        bytes.forEach((value, index) => compareBytes(reference!.bytes[index]!, value, `${name}/${evidenceFiles[index]}`));
      } else reference = { manifest, bytes };
      report.push(`${name}: PASS; source ${manifest.sha}; tree ${manifest.tree}; Bun ${manifest.bun}; ${JSON.stringify(manifest.evidence)}`);
      for (const zone of zones) for (const row of natalCases) report.push(`  ${zone}/${row.id}: A PASS, B PASS, A→B→A PASS; full snapshot bytes and natal probe output equal`);
    }
    console.log(report.join('\n'));
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report.join('\n') + '\n');
  } else throw new Error('Unknown native calendar command');
}
if (import.meta.main) await main(process.argv[2] ?? '', process.argv[3] ?? '', process.argv[4]);
