import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { renderError, render, ok } from '../src/envelope';
import { ToolError } from '../src/errors';
import { makeFixture } from './helpers';

let fx: Awaited<ReturnType<typeof makeFixture>>;
beforeAll(async () => { fx = await makeFixture(); });
afterAll(() => fx.cleanup());

describe('profiles', () => {
  test('list_profiles returns ids and fingerprints only, asOf null', async () => {
    const { isError, json } = await fx.call('list_profiles');
    expect(isError).toBe(false);
    expect(json.asOf).toBeNull();
    expect(json.data.profiles.map((p: any) => p.profileId)).toEqual(['sky']);
    expect(json.data.profiles[0].chartFingerprint).toMatch(/^cf1-/);
    expect(JSON.stringify(json)).not.toContain('王小明');
  });
  test('list_profiles on a missing directory is empty, not an error', async () => {
    const { ProfileStore } = await import('../src/store');
    expect(await new ProfileStore(join(fx.dir, 'nope')).list()).toEqual({ profiles: [], invalid: [] });
  });
  test('get_profile withholds name and birth data by default', async () => {
    const { json } = await fx.call('get_profile', { profileId: 'sky' });
    expect(json.data.gender).toBe('female');
    expect(json.data.name).toBeUndefined();
    expect(json.data.birth).toBeUndefined();
    expect(JSON.stringify(json)).not.toContain('王小明');
    expect(JSON.stringify(json)).not.toContain('1990-05-17');
  });
  test('get_profile returns name / birth data only when asked', async () => {
    const { json } = await fx.call('get_profile', { profileId: 'sky', includeName: true, includeBirthData: true });
    expect(json.data.name).toBe('王小明');
    expect(json.data.birth.date).toBe('1990-05-17');
  });
  test('invalid files are reported, not thrown', async () => {
    await writeFile(join(fx.dir, 'bad.fortune.json'), '{nope');
    const { json } = await fx.call('list_profiles');
    expect(json.data.invalid[0].file).toBe('bad.fortune.json');
  });
});

describe('errors', () => {
  test.each(['../etc/passwd', 'a/b', 'Sky', ''])('rejects profileId %p without touching the filesystem', async id => {
    const { isError, json } = await fx.call('get_profile', { profileId: id });
    expect(isError).toBe(true);
    expect(json.error.code).toBe('invalid_args');
  });
  test('unknown profile → profile_not_found with a hint', async () => {
    const { json } = await fx.call('get_profile', { profileId: 'ghost' });
    expect(json.error.code).toBe('profile_not_found');
    expect(json.error.hint).toContain('list_profiles');
  });
  test('unknown tool and unknown argument are structured errors', async () => {
    expect((await fx.call('nope')).json.error.code).toBe('unsupported');
    expect((await fx.call('get_profile', { profileId: 'sky', extra: 1 })).json.error.code).toBe('invalid_args');
  });
});

describe('envelope', () => {
  test('render is canonical and capped', () => {
    const env = ok({ asOf: '2026-09-30', data: { b: 1, a: 2 } });
    expect(render(env)).toContain('"data":{"a":2,"b":1}');
    expect(() => render(env, 50)).toThrow(ToolError);
    expect(JSON.parse(renderError(new ToolError('response_too_large', 'x', 'narrow'))).error.hint).toBe('narrow');
  });
  test('unexpected errors become internal without a stack trace', () => {
    const text = renderError(new Error('boom'));
    expect(JSON.parse(text).error).toEqual({ code: 'internal', message: 'boom' });
  });
});
