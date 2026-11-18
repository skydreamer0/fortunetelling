import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { afterAll, afterEach, describe, expect, test } from 'vitest';
import { appendOnlyErrors, canonicalJson, check, contentSha256, LOCKED_DIR, parseNameStatus, resolveBase, schemaErrors, validateDirectory, validateForecastFile } from './locked-forecasts';

// Synthetic data only: this is not a real forecast and makes no claim about any person or event.
const payload = () => ({
  schemaVersion: 1, forecastId: 'synthetic-0001', issuedAt: '2026-01-02T00:00:00Z', dataCutoff: '2026-01-01T00:00:00Z',
  targetEvent: { domain: 'synthetic', proposition: 'synthetic proposition' }, direction: 'positive',
  window: { start: '2027-01-01', end: '2027-12-31' },
  outcomeDefinitions: { hit: 'synthetic hit', miss: 'synthetic miss', undecidable: 'synthetic undecidable' },
  calculation: { specHash: 'synthetic-spec', snapshotId: 'synthetic-snapshot' },
  versions: { core: '0.0.0-test', rules: 'rules-test', catalog: 'cat-test', aggregation: 'agg-test' },
});
// Hand-written literals, checked independently with sha256sum; never derived from the code under test.
const CANONICAL = '{"calculation":{"snapshotId":"synthetic-snapshot","specHash":"synthetic-spec"},"dataCutoff":"2026-01-01T00:00:00Z","direction":"positive","forecastId":"synthetic-0001","issuedAt":"2026-01-02T00:00:00Z","outcomeDefinitions":{"hit":"synthetic hit","miss":"synthetic miss","undecidable":"synthetic undecidable"},"schemaVersion":1,"targetEvent":{"domain":"synthetic","proposition":"synthetic proposition"},"versions":{"aggregation":"agg-test","catalog":"cat-test","core":"0.0.0-test","rules":"rules-test"},"window":{"end":"2027-12-31","start":"2027-01-01"}}';
const SHA = '72337dcefe80fe56038ed207eee32e3909c315c837f26049dff2c8324628d825';
const forecast = (overrides: Record<string, unknown> = {}) => ({ ...payload(), contentSha256: SHA, ...overrides });

describe('canonical content hash', () => {
  test('sorted-key serialisation and SHA-256 match pinned literals', () => {
    expect(canonicalJson(payload())).toBe(CANONICAL);
    expect(contentSha256(forecast())).toBe(SHA);
    expect(contentSha256({ ...forecast(), contentSha256: 'anything' })).toBe(SHA);
  });
  test('key order and whitespace do not matter; content does', () => {
    const reordered = JSON.stringify(Object.fromEntries(Object.entries(forecast()).reverse()), null, 4);
    expect(validateForecastFile('synthetic-0001.json', reordered)).toEqual([]);
    expect(validateForecastFile('synthetic-0001.json', JSON.stringify(forecast({ direction: 'negative' })))[0]).toMatch(/contentSha256 mismatch/);
  });
  test('rejects non-JSON values', () => {
    expect(() => canonicalJson({ a: Number.NaN })).toThrow();
    expect(() => canonicalJson({ a: undefined })).toThrow();
  });
});

describe('schema', () => {
  test('valid synthetic forecast, with and without supersedes', () => {
    expect(schemaErrors(forecast())).toEqual([]);
    const correction = { ...payload(), forecastId: 'synthetic-0002', supersedes: 'synthetic-0001' };
    expect(validateForecastFile('synthetic-0002.json', JSON.stringify({ ...correction, contentSha256: contentSha256(correction) }))).toEqual([]);
  });
  test.each([
    ['missing field', (f: any) => { delete f.window; }],
    ['unknown field', (f: any) => { f.confidence = 0.9; }],
    ['nested unknown field', (f: any) => { f.versions.extra = 'x'; }],
    ['schemaVersion', (f: any) => { f.schemaVersion = 2; }],
    ['forecastId', (f: any) => { f.forecastId = 'Bad ID'; }],
    ['issuedAt format', (f: any) => { f.issuedAt = '2026-01-02'; }],
    ['impossible instant', (f: any) => { f.issuedAt = '2026-02-30T00:00:00Z'; }],
    ['cutoff after issue', (f: any) => { f.dataCutoff = '2026-01-03T00:00:00Z'; }],
    ['direction', (f: any) => { f.direction = 'up'; }],
    ['window order', (f: any) => { f.window = { start: '2028-01-01', end: '2027-01-01' }; }],
    ['empty outcome definition', (f: any) => { f.outcomeDefinitions.undecidable = ' '; }],
    ['missing snapshotId', (f: any) => { delete f.calculation.snapshotId; }],
    ['self supersedes', (f: any) => { f.supersedes = f.forecastId; }],
    ['hash format', (f: any) => { f.contentSha256 = SHA.toUpperCase(); }],
  ])('schema violation: %s', (_, mutate) => {
    const value = structuredClone(forecast()); mutate(value);
    expect(schemaErrors(value).length).toBeGreaterThan(0);
    expect(validateForecastFile(`${typeof value.forecastId === 'string' ? value.forecastId : 'x'}.json`, JSON.stringify(value)).join('\n')).toMatch(/schema:/);
  });
  test('file-level rules', () => {
    expect(validateForecastFile('synthetic-0001.json', '{')[0]).toMatch(/invalid JSON/);
    expect(validateForecastFile('other.json', JSON.stringify(forecast()))[0]).toMatch(/file name must be synthetic-0001.json/);
    expect(validateForecastFile('notes.txt', 'x')[0]).toMatch(/only <forecastId>.json/);
    expect(schemaErrors([])).toEqual(['top level must be a JSON object']);
  });
});

describe('append-only name-status rule (injected input)', () => {
  const file = `${LOCKED_DIR}/synthetic-0001.json`;
  test('added and unchanged pass', () => {
    expect(appendOnlyErrors(parseNameStatus(`A\0${file}\0`))).toEqual([]);
    expect(appendOnlyErrors(parseNameStatus(''))).toEqual([]);
    expect(appendOnlyErrors(parseNameStatus('M\0packages/core/src/index.ts\0D\0other/x.json\0'))).toEqual([]);
  });
  test.each([
    ['M', `M\0${file}\0`, /modified/], ['D', `D\0${file}\0`, /deleted/], ['T', `T\0${file}\0`, /type-changed/],
    ['README edit', `M\0${LOCKED_DIR}/README.md\0`, /modified/],
    ['R within', `R100\0${file}\0${LOCKED_DIR}/renamed.json\0`, /renamed/],
    ['R out of', `R095\0${file}\0elsewhere/x.json\0`, /renamed/],
    ['R into', `R100\0elsewhere/x.json\0${file}\0`, /renamed/],
    ['C', `C100\0elsewhere/x.json\0${file}\0`, /copied/],
  ])('%s fails with a clear message', (_, raw, message) => {
    const errors = appendOnlyErrors(parseNameStatus(raw));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(message);
    expect(errors[0]).toMatch(/append-only/);
  });
  test('malformed name-status input throws', () => {
    for (const raw of [`A\0${file}`, `R100\0${file}\0`, 'Q\0x\0', `A\0../x\0`, `A\0/abs\0`]) expect(() => parseNameStatus(raw)).toThrow();
  });
});

describe('event base resolution fails closed', () => {
  const sha = 'a'.repeat(40);
  test('pull_request, push and manual dispatch', () => {
    expect(resolveBase('pull_request', { pull_request: { base: { sha } } })).toBe(sha);
    expect(resolveBase('push', { before: sha })).toBe(sha);
    expect(resolveBase('workflow_dispatch', {})).toBeNull();
  });
  test.each([
    ['pull_request', {}], ['pull_request', { pull_request: { base: { sha: 'abc' } } }],
    ['push', {}], ['push', { before: '0'.repeat(40) }], ['schedule', {}], [undefined, {}],
  ])('%s %j throws', (eventName, event) => {
    expect(() => resolveBase(eventName, event)).toThrow();
  });
});

describe('real git history in a temporary repository', () => {
  let root = '';
  // An empty file rather than os.devNull, which Git for Windows cannot open as a config path.
  const isolatedConfig = join(mkdtempSync(join(tmpdir(), 'fortune-locked-config-')), 'gitconfig');
  writeFileSync(isolatedConfig, '');
  const env = { ...process.env, GIT_CONFIG_GLOBAL: isolatedConfig, GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'ci', GIT_AUTHOR_EMAIL: 'ci@example.invalid',
    GIT_COMMITTER_NAME: 'ci', GIT_COMMITTER_EMAIL: 'ci@example.invalid' };
  const git = (...args: string[]) => {
    const child = spawnSync('git', args, { cwd: root, env, encoding: 'utf8' });
    if (child.status !== 0) throw new Error(child.stderr);
    return child.stdout.trim();
  };
  const dir = () => join(root, ...LOCKED_DIR.split('/'));
  const write = (name: string, value: string) => writeFileSync(join(dir(), name), value);
  const commit = (message: string) => { git('add', '-A'); git('commit', '-q', '--no-verify', '--allow-empty', '-m', message); return git('rev-parse', 'HEAD'); };
  const setup = () => {
    root = mkdtempSync(join(tmpdir(), 'fortune-locked-'));
    git('init', '-q', '-b', 'main');
    git('config', 'core.autocrlf', 'false');
    mkdirSync(dir(), { recursive: true });
    write('README.md', '# synthetic\n');
    return commit('base');
  };
  afterAll(() => rmSync(join(isolatedConfig, '..'), { recursive: true, force: true }));
  afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }); root = ''; });

  test('unchanged directory passes', () => {
    const base = setup();
    expect(check(root, base)).toEqual([]);
  });
  test('adding a valid forecast passes; later commits on the same branch before merge are still an addition', () => {
    const base = setup();
    write('synthetic-0001.json', JSON.stringify(forecast()));
    commit('add');
    write('synthetic-0001.json', `${JSON.stringify(forecast(), null, 2)}\n`);
    commit('reformat before merge');
    expect(check(root, base)).toEqual([]);
  });
  test('merge base, not the base tip, is the comparison point', () => {
    const base = setup();
    git('checkout', '-q', '-b', 'feature');
    write('synthetic-0001.json', JSON.stringify(forecast()));
    commit('add on feature');
    git('checkout', '-q', 'main');
    writeFileSync(join(root, 'unrelated.txt'), 'x');
    const tip = commit('advance main');
    git('checkout', '-q', 'feature');
    expect(base).not.toBe(tip);
    expect(check(root, tip)).toEqual([]);
  });
  describe('after a forecast is locked', () => {
    const locked = () => { setup(); write('synthetic-0001.json', JSON.stringify(forecast())); return commit('lock'); };
    test('editing content fails (hash and history)', () => {
      const base = locked();
      write('synthetic-0001.json', JSON.stringify(forecast({ direction: 'negative' })));
      commit('edit');
      const errors = check(root, base).join('\n');
      expect(errors).toMatch(/contentSha256 mismatch/);
      expect(errors).toMatch(/synthetic-0001.json: modified/);
    });
    test('editing content and hash together still fails on history', () => {
      const base = locked();
      const edited = { ...payload(), direction: 'negative' };
      write('synthetic-0001.json', JSON.stringify({ ...edited, contentSha256: contentSha256(edited) }));
      commit('edit with new hash');
      expect(check(root, base)).toEqual([expect.stringMatching(/modified.*append-only/)]);
    });
    test('deleting fails', () => {
      const base = locked();
      unlinkSync(join(dir(), 'synthetic-0001.json'));
      commit('delete');
      expect(check(root, base)).toEqual([expect.stringMatching(/synthetic-0001.json: deleted/)]);
    });
    test('renaming fails', () => {
      const base = locked();
      renameSync(join(dir(), 'synthetic-0001.json'), join(root, 'moved.json'));
      commit('rename out');
      expect(check(root, base)).toEqual([expect.stringMatching(/synthetic-0001.json -> moved.json: renamed/)]);
    });
    test('editing the README fails too', () => {
      const base = locked();
      write('README.md', '# changed\n');
      commit('readme');
      expect(check(root, base)).toEqual([expect.stringMatching(/README.md: modified/)]);
    });
    test('adding a superseding correction passes and keeps the original', () => {
      const base = locked();
      const correction = { ...payload(), forecastId: 'synthetic-0002', supersedes: 'synthetic-0001' };
      write('synthetic-0002.json', JSON.stringify({ ...correction, contentSha256: contentSha256(correction) }));
      commit('correction');
      expect(check(root, base)).toEqual([]);
      expect(readdirSync(dir()).sort()).toEqual(['README.md', 'synthetic-0001.json', 'synthetic-0002.json']);
    });
  });
  test('schema violation and hash mismatch in an added file fail on content', () => {
    const base = setup();
    write('synthetic-0001.json', JSON.stringify(forecast({ contentSha256: 'f'.repeat(64) })));
    write('synthetic-0003.json', JSON.stringify({ ...forecast(), forecastId: 'synthetic-0003', direction: 'sideways' }));
    commit('bad adds');
    const errors = check(root, base).join('\n');
    expect(errors).toMatch(/synthetic-0001.json: contentSha256 mismatch/);
    expect(errors).toMatch(/synthetic-0003.json: schema: direction/);
  });
  test('subdirectories and missing directory fail', () => {
    setup();
    mkdirSync(join(dir(), 'nested'));
    expect(validateDirectory(root)).toEqual([expect.stringMatching(/nested: only regular files/)]);
    expect(validateDirectory(join(root, 'nope'))).toEqual([`${LOCKED_DIR}/ is missing`]);
  });
});

test('repository directory ships without forecast payloads and passes content validation', () => {
  expect(readdirSync(LOCKED_DIR)).toEqual(['README.md']);
  expect(validateDirectory('.')).toEqual([]);
});

test('workflow runs the guard in the full-history plan job before classification', () => {
  const plan = (parseYaml(readFileSync('.github/workflows/ci.yml', 'utf8')) as any).jobs.plan;
  const checkout = plan.steps.find((step: any) => step.uses === 'actions/checkout@v4');
  expect(checkout.with['fetch-depth']).toBe(0);
  const runs = plan.steps.map((step: any) => step.run);
  const guard = runs.indexOf('node --import tsx scripts/ci/locked-forecasts.ts');
  expect(guard).toBeGreaterThan(-1);
  expect(guard).toBeLessThan(runs.indexOf('node --import tsx scripts/ci/pipeline.ts plan'));
  expect(plan.steps[guard]['continue-on-error']).toBeUndefined();
});
