import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { SAMPLE_PROFILE, makeFixture } from './helpers';

const SYSTEMS = ['bazi', 'ziwei', 'numerology', 'tzolkin', 'mingGua', 'jyotish', 'humanDesign'] as const;
const SYSTEM_LIST = [...SYSTEMS];
const ASOF = '2026-09-30';
let fx: Awaited<ReturnType<typeof makeFixture>>;
beforeAll(async () => {
  fx = await makeFixture({ notime: { ...SAMPLE_PROFILE, time: null, timeAccuracy: 'unknown' } });
}, 30000);
afterAll(() => fx.cleanup());

describe('get_chart', () => {
  test.each(SYSTEM_LIST)('%s: full and summary, summary smaller, no name', async system => {
    const full = await fx.call('get_chart', { profileId: 'sky', system, asOf: ASOF, detail: 'full' });
    const summary = await fx.call('get_chart', { profileId: 'sky', system, asOf: ASOF });
    expect(full.isError).toBe(false);
    expect(summary.isError).toBe(false);
    expect(full.json.data.available).toBe(true);
    expect(summary.json.data.detail).toBe('summary');
    expect(summary.text.length).toBeLessThan(full.text.length);
    expect(full.text).not.toContain('王小明');
    expect(summary.text).not.toContain('王小明');
    expect(full.json.asOf).toBe(ASOF);
    // jyotish stays experimental; humanDesign passed cross-validation (M5-03) and carries no such caveat.
    for (const reply of [full, summary]) {
      const codes = reply.json.caveats.map((c: any) => c.code);
      if (system === 'jyotish') expect(codes).toContain('experimental:jyotish');
      expect(codes).not.toContain('experimental:humanDesign');
    }
  }, 30000);

  test('deterministic', async () => {
    const a = await fx.call('get_chart', { profileId: 'sky', system: 'jyotish', asOf: ASOF, detail: 'full' });
    const b = await fx.call('get_chart', { profileId: 'sky', system: 'jyotish', asOf: ASOF, detail: 'full' });
    expect(a.text).toBe(b.text);
  }, 30000);

  test.each(['bazi', 'ziwei', 'jyotish', 'humanDesign'])('%s with unknown time is unavailable', async system => {
    const { isError, json } = await fx.call('get_chart', { profileId: 'notime', system, asOf: ASOF });
    expect(isError).toBe(false);
    expect(json.data.available).toBe(false);
    expect(json.data.reason).toContain('time_unknown');
    expect(json.data.chart).toBeUndefined();
  }, 30000);

  test('time-free systems still work with unknown time', async () => {
    const { json } = await fx.call('get_chart', { profileId: 'notime', system: 'tzolkin', asOf: ASOF });
    expect(json.data.available).toBe(true);
  });

  test('errors are structured', async () => {
    expect((await fx.call('get_chart', { profileId: 'ghost', system: 'bazi', asOf: ASOF })).json.error.code).toBe('profile_not_found');
    expect((await fx.call('get_chart', { profileId: 'sky', system: 'bazi', asOf: '2026-13-99' })).json.error.code).toBe('invalid_args');
    expect((await fx.call('get_chart', { profileId: 'sky', system: 'bazi', asOf: 'today' })).json.error.code).toBe('invalid_args');
    expect((await fx.call('get_chart', { profileId: 'sky', system: 'nope', asOf: ASOF })).json.error.code).toBe('invalid_args');
  });
});

describe('get_time_context', () => {
  test('compact, no profile, deterministic', async () => {
    const a = await fx.call('get_time_context', { profileId: 'sky', asOf: ASOF });
    const b = await fx.call('get_time_context', { profileId: 'sky', asOf: ASOF });
    expect(a.text).toBe(b.text);
    expect(Object.keys(a.json.data).sort()).toEqual(['flags', 'jd', 'local', 'lunar', 'solar', 'solarTerms', 'utc']);
    expect(a.json.data.profile).toBeUndefined();
    expect(a.text).not.toContain('王小明');
    expect(a.text).not.toContain('Tainan');
    expect(a.text).not.toContain('"date":"1990-05-17"');
  });
  test('zodiac is Traditional (core hands back simplified 马)', async () => {
    const { json } = await fx.call('get_time_context', { profileId: 'sky', asOf: ASOF });
    expect(json.data.lunar.zodiac).toBe('馬');
  });
  test('invalid asOf and unknown profile', async () => {
    expect((await fx.call('get_time_context', { profileId: 'sky', asOf: 'x' })).json.error.code).toBe('invalid_args');
    expect((await fx.call('get_time_context', { profileId: 'ghost', asOf: ASOF })).json.error.code).toBe('profile_not_found');
  });
});
