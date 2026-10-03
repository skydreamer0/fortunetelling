import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProfileFile, serializeProfileFile } from '@fortune/core';
import { makeFixture, SAMPLE_PROFILE } from './helpers';

let fx: Awaited<ReturnType<typeof makeFixture>>;
let outside: string;

const fileText = (id: string, patch: Record<string, unknown> = {}) =>
  serializeProfileFile(createProfileFile(id, { ...SAMPLE_PROFILE, name: '李小華', ...patch }));

beforeAll(async () => {
  fx = await makeFixture();
  outside = await mkdtemp(join(tmpdir(), 'fortune-import-'));
});
afterAll(async () => {
  await fx.cleanup();
  await rm(outside, { recursive: true, force: true });
});

describe('import_profile', () => {
  test('content 匯入新 profile：寫入目錄、可被 list_profiles 看到、回應不含姓名', async () => {
    const { isError, json, text } = await fx.call('import_profile', { content: fileText('amy', { date: '1988-02-03' }) });
    expect(isError).toBe(false);
    expect(json.asOf).toBeNull();
    expect(json.versionsHash).toMatch(/^[0-9a-f]{12}$/);
    expect(json.data).toMatchObject({ profileId: 'amy', overwritten: false, chartChanged: false, warnings: [] });
    expect(json.data.chartFingerprint).toMatch(/^cf1-/);
    expect(text).not.toContain('李小華');
    const list = await fx.call('list_profiles');
    expect(list.json.data.profiles.map((p: any) => p.profileId)).toContain('amy');
    expect(await readFile(join(fx.dir, 'amy.fortune.json'), 'utf8')).toContain('"profileId":"amy"');
  });

  test('path 匯入', async () => {
    const path = join(outside, 'bob (1).fortune.json');
    await writeFile(path, fileText('bob'));
    const { isError, json } = await fx.call('import_profile', { path });
    expect(isError).toBe(false);
    expect(json.data.profileId).toBe('bob');
    expect((await fx.call('get_profile', { profileId: 'bob' })).isError).toBe(false);
  });

  test('已存在時不覆蓋；overwrite: true 才取代並回報指紋是否改變', async () => {
    const before = await readFile(join(fx.dir, 'amy.fortune.json'), 'utf8');
    const refused = await fx.call('import_profile', { content: fileText('amy', { date: '1999-09-09' }) });
    expect(refused.isError).toBe(true);
    expect(refused.json.error.code).toBe('profile_exists');
    expect(await readFile(join(fx.dir, 'amy.fortune.json'), 'utf8')).toBe(before);

    const replaced = await fx.call('import_profile', { content: fileText('amy', { date: '1999-09-09' }), overwrite: true });
    expect(replaced.isError).toBe(false);
    expect(replaced.json.data).toMatchObject({ overwritten: true, chartChanged: true });
    expect(await readFile(join(fx.dir, 'amy.fortune.json'), 'utf8')).not.toBe(before);

    const same = await fx.call('import_profile', { content: fileText('amy', { date: '1999-09-09' }), overwrite: true });
    expect(same.json.data).toMatchObject({ overwritten: true, chartChanged: false });
  });

  test('指紋過期：重算並以 warnings 與 caveats 警告', async () => {
    const stale = JSON.parse(fileText('carl'));
    stale.chartFingerprint = 'cf1-0000000000000000';
    const { isError, json } = await fx.call('import_profile', { content: JSON.stringify(stale) });
    expect(isError).toBe(false);
    expect(json.data.warnings).toHaveLength(1);
    expect(json.data.chartFingerprint).not.toBe('cf1-0000000000000000');
    expect(json.caveats.some((c: any) => c.code === 'import:fingerprint_recomputed')).toBe(true);
    expect((await fx.store.get('carl')).file.chartFingerprint).toBe(json.data.chartFingerprint);
  });

  test('錯誤：兩者都給、都不給、壞 JSON、錯副檔名、找不到檔案、壞 profile', async () => {
    const c = fileText('dan');
    expect((await fx.call('import_profile', { content: c, path: 'x.fortune.json' })).json.error.code).toBe('invalid_args');
    expect((await fx.call('import_profile', {})).json.error.code).toBe('invalid_args');
    expect((await fx.call('import_profile', { content: '{oops' })).json.error.code).toBe('profile_invalid');
    expect((await fx.call('import_profile', { path: join(outside, 'a.json') })).json.error.code).toBe('invalid_args');
    expect((await fx.call('import_profile', { path: join(outside, 'missing.fortune.json') })).json.error.code).toBe('invalid_args');
    const bad = JSON.parse(c);
    bad.profileId = '../evil';
    expect((await fx.call('import_profile', { content: JSON.stringify(bad) })).json.error.code).toBe('profile_invalid');
    expect((await fx.store.list()).profiles.map(p => p.profileId)).not.toContain('dan');
  });
});
