import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ColdReplayArchive } from './fixtures/schoolPackColdReplayWorker';

// These child processes execute the real source in new module instances. A new
// registry in the same test process would not prove that owned objects were lost.
const worker = fileURLToPath(new URL('./fixtures/schoolPackColdReplayWorker.ts', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'fortune66-cold-replay-'));
const archivePath = join(temporary, 'archive.json');
let archive: ColdReplayArchive;
const run = (mode: 'capture' | 'reconstruct', path: string) => spawnSync(process.execPath, ['--import', 'tsx', worker, mode, path], { env: { ...process.env, ANTHROPIC_API_KEY: '' },
  stdio: ['pipe', 'pipe', 'pipe'], timeout: 30_000,
});
beforeAll(async () => {
  const producer = run('capture', archivePath);
  expect(producer.status, producer.stderr.toString()).toBe(0);
  archive = JSON.parse(readFileSync(archivePath, 'utf8'));
  expect(JSON.parse(producer.stdout.toString()).producerPid).toBe(archive.producerPid);
});
afterAll(() => rmSync(temporary, { recursive: true, force: true }));

test('persisted exact versions reconstruct in fresh processes with complete current-build byte equality', () => {
  const first = run('reconstruct', archivePath);
  expect(first.status, first.stderr.toString()).toBe(0);
  const second = run('reconstruct', archivePath);
  expect(second.status, second.stderr.toString()).toBe(0);
  const a = JSON.parse(first.stdout.toString()), b = JSON.parse(second.stdout.toString());
  expect(a.status).toBe('PASS_CURRENT_BUILD_RECONSTRUCTION_ONLY');
  expect(a.producerPid).toBe(archive.producerPid);
  expect(a.verifierPid).not.toBe(archive.producerPid);
  expect(b.verifierPid).not.toBe(archive.producerPid);
  expect(a.verifierPid).not.toBe(b.verifierPid);
  expect(a.results).toEqual(b.results);
  const [v1, v2, unknown, production, unknownProduction] = a.results;
  expect(v1.stances).toEqual(['support']);
  expect(v2.stances).toEqual(['oppose']);
  expect(v1.analysisId).not.toBe(v2.analysisId);
  expect(v1.specHash).toBe(v2.specHash);
  expect(v1.snapshotId).toBe(v2.snapshotId);
  expect(unknown.stances).toEqual([]);
  expect(unknown.unavailable).toEqual(['bazi']);
  expect(production.stances).toEqual([]);
  expect(production.abstained).toHaveLength(5);
  expect(unknownProduction.abstained).toHaveLength(3);
  expect(unknownProduction.unavailable).toEqual(['bazi', 'ziwei']);
}, 30_000);

type Mutation = { name: string; change: (value: ColdReplayArchive) => void; error: RegExp };
const mutations: Mutation[] = [
  { name: 'metadata-only historical version has no retained executable',
    change: value => { (value.cases[0]!.interpretation.packs[0] as { packVersion: string }).packVersion = '0'; },
    error: /Missing exact retained SchoolPack implementation/ },
  { name: 'latest is not an exact version',
    change: value => { (value.cases[0]!.interpretation.packs[0] as { packVersion: string }).packVersion = 'latest'; },
    error: /Unknown exact SchoolPack version/ },
  { name: 'retained v2 must not silently replace saved v1 result',
    change: value => { (value.cases[0]!.interpretation.packs[0] as { packVersion: string }).packVersion = '2'; },
    error: /Fact-backed analysis full content mismatch/ },
  { name: 'unsupported catalog identity cannot be ignored by rebuilding only selected tuples',
    change: value => { (value.cases[0]!.interpretation.implementationCatalog as { id: string }).id = 'unsupported-older-catalog'; },
    error: /InterpretationSpec content mismatch/ },
  { name: 'unsupported comparison version is rejected',
    change: value => { (value.cases[0]!.interpretation as unknown as { comparisonVersion: number }).comparisonVersion = 2; },
    error: /InterpretationSpec content mismatch/ },
  { name: 'production scope must not admit synthetic pack choices',
    change: value => { (value.cases[3]!.interpretation as unknown as { packs: unknown }).packs = value.cases[0]!.interpretation.packs; },
    error: /Unknown exact SchoolPack version/ },
  { name: 'same snapshot ID with corrupt natal bytes is rejected',
    change: value => { (value.cases[0]!.snapshot.natal.numerology as unknown as { chart: unknown }).chart = {}; },
    error: /content mismatch/ },
  { name: 'same snapshot ID with changed effective birth identity is rejected',
    change: value => { (value.cases[0]!.snapshot.identity.input as { name: string }).name = 'OTHER SYNTHETIC FIXTURE'; },
    error: /ChartSnapshot identity mismatch/ },
  { name: 'historical core version is not silently replaced by the current core',
    change: value => { (value.cases[0]!.calculationSpec.identity.versions as { core: string }).core = '0.0.0-unsupported'; },
    error: /AssertionError/ },
  { name: 'historical calculator version is not silently replaced by current code',
    change: value => { (value.cases[0]!.snapshot.identity.versions.calculators as { bazi: string }).bazi = 'unsupported-previous-version'; },
    error: /ChartSnapshot identity mismatch/ },
  { name: 'same analysis ID with changed result context is rejected',
    change: value => { (value.cases[0]!.result.identity.context as unknown as { availableConditions: string[] }).availableConditions.push('changed'); },
    error: /Fact-backed analysis full content mismatch/ },
  { name: 'same fact ID with replaced payload is rejected',
    change: value => { (value.cases[0]!.factStore.facts[0] as unknown as { payload: unknown }).payload = {}; },
    error: /AssertionError/ },
  { name: 'same fact ID with altered source path is rejected',
    change: value => { (value.cases[0]!.factStore.facts[0]!.sourceRefs[0] as { path: string }).path += '/forged'; },
    error: /AssertionError/ },
  { name: 'same analysis ID with forged conclusion is rejected',
    change: value => { (value.cases[0]!.result.assessments[0]!.conclusions[0] as unknown as { stance: string }).stance = 'oppose'; },
    error: /Fact-backed analysis full content mismatch/ },
  { name: 'unknown birth time never accepts a saved available analysis',
    change: value => { value.cases[2]!.result = value.cases[0]!.result; },
    error: /Fact-backed analysis full content mismatch/ },
  { name: 'runtime mismatch does not claim historical compatibility',
    change: value => { value.runtime.revision = 'unsupported-runtime'; },
    error: /does not support historical runtimes/ },
];
for (const [index, mutation] of mutations.entries()) {
  test(`cold replay rejects: ${mutation.name}`, () => {
    const altered = structuredClone(archive);
    mutation.change(altered);
    const path = join(temporary, `negative-${index}.json`);
    writeFileSync(path, JSON.stringify(altered));
    const result = run('reconstruct', path);
    expect(result.status).not.toBe(0);
    expect(result.stderr.toString()).toMatch(mutation.error);
    expect(result.stdout.toString()).not.toContain('PASS_CURRENT_BUILD_RECONSTRUCTION_ONLY');
  }, 30_000);
}
