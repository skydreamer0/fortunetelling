import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, test, expect } from 'vitest';
import { captureStandaloneJyotish as capture, replayStandaloneJyotish as replay } from '../src/core/standaloneEphemerisReplay';
import { createTimeContext } from '../src/time/createTimeContext';
import { jyotishCalculator } from '../src/calculators/jyotish/calculator';
import { createAsyncEphemerisCalculationSpec } from '../src/core/asyncEphemerisCalculationSpec';
const profile = { date: '1990-02-22', time: '12:00', timeAccuracy: 'exact' as const, gender: 'female' as const,
  birthplace: { label: 'Synthetic Taipei', lat: 25.033, lng: 121.5654, timezone: 'Asia/Taipei' } };
const ctx = () => createTimeContext(profile);
const asOf = '2026-07-11';
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));
describe('standalone opt-in A / synthetic matrix', () => {
  test('SR01 omitted defaults', async () => { const r = await capture(ctx(), { asOf }); expect(r.rawConfig.dashaYearDays).toEqual({ state: 'absent' }); expect(r.effective.dashaYearDays).toBe(365.25); });
  test('SR02 explicit default preserves distinct presence', async () => { const a = await capture(ctx(), { asOf }), b = await capture(ctx(), { asOf, dashaYearDays: 365.25 }); expect(a.result).toEqual(b.result); expect(a.rawConfig).not.toEqual(b.rawConfig); });
  test('SR03 null preserved with fallback', async () => { const r = await capture(ctx(), { asOf, dashaYearDays: null }); expect(r.rawConfig.dashaYearDays).toEqual({ state: 'null' }); expect(await replay(copy(r))).toEqual(r); });
  test('SR04 own undefined JSON-safe and distinct', async () => { const r = await capture(ctx(), { asOf, dashaYearDays: undefined }); expect(r.rawConfig.dashaYearDays).toEqual({ state: 'undefined' }); expect(await replay(copy(r))).toEqual(r); });
  test.each([['SR05', 360], ['SR06', 365.2422]] as const)('%s custom year reaches actual result', async (_, dashaYearDays) => { const r = await capture(ctx(), { asOf, dashaYearDays }); expect(r.result.chart.dasha!.yearDays).toBe(dashaYearDays); expect(await replay(copy(r))).toEqual(r); });
  test('SR07 changed year changes full record', async () => { expect(await capture(ctx(), { asOf, dashaYearDays: 360 })).not.toEqual(await capture(ctx(), { asOf, dashaYearDays: 365.2422 })); });
  test('SR08 unknown time remains empty', async () => { const c = createTimeContext({ ...profile, time: null, timeAccuracy: 'unknown' }); const r = await capture(c, { asOf, dashaYearDays: 360 }); expect(r.result.chart).toMatchObject({ timeKnown: false, lagna: null, dasha: null, planets: [] }); expect(r.result.components).toEqual([]); expect(r.result.warnings).toContain('time_unknown'); expect(r.context.jd).toBeNull(); expect(await replay(copy(r))).toEqual(r); });
  test('SR09 context binds identity', async () => { const a = await capture(ctx(), { asOf }), b = await capture(createTimeContext({ ...profile, date: '1991-02-22' }), { asOf }); expect(a.context).not.toEqual(b.context); expect(a.resultHash).not.toEqual(b.resultHash); });
  test('SR10 asOf binds identity', async () => { const a = await capture(ctx(), { asOf }), b = await capture(ctx(), { asOf: '2027-07-11' }); expect(a.asOf).not.toBe(b.asOf); expect(a.result).not.toEqual(b.result); });
  test('SR11 Date owned before await', async () => { const date = new Date(`${asOf}T00:00:00Z`); const p = capture(ctx(), { asOf: date }); date.setUTCFullYear(2030); const r = await p; expect(r.asOf).toBe(asOf); expect(Object.isFrozen(date)).toBe(false); expect(await replay(copy(r))).toEqual(r); });
  test('SR12 caller context/config not aliased or frozen', async () => { const c = ctx(), options = { asOf, dashaYearDays: 360 }; const p = capture(c, options); c.profile.birthplace.lat = 0; options.dashaYearDays = 365.25; const r = await p; expect(r.context.profile.birthplace.lat).toBe(25.033); expect(r.effective.dashaYearDays).toBe(360); expect(Object.isFrozen(c.profile)).toBe(false); expect(Object.isFrozen(options)).toBe(false); expect(Object.isFrozen(r.context.profile.birthplace)).toBe(true); });
  test('SR13 JSON roundtrip exact', async () => { const r = await capture(ctx(), { asOf, ayanamsa: 'raman', node: 'true' }); expect(await replay(copy(r))).toEqual(r); });
  test('SR14 invalid numbers rejected', async () => { for (const n of [NaN, Infinity, -Infinity, 0, -1]) await expect(capture(ctx(), { asOf, dashaYearDays: n })).rejects.toThrow(); });
  test('SR15 finite extremes fail safely or retain complete finite result', async () => { await expect(capture(ctx(), { asOf, dashaYearDays: Number.MAX_VALUE })).rejects.toThrow(); await expect(capture(ctx(), { asOf, dashaYearDays: Number.MIN_VALUE })).rejects.toThrow('Invalid time value'); });
  test('SR16 malformed settings/envelope rejected', async () => { for (const config of [{ asOf, dashaYearDays: '360' }, { asOf, ayanamsa: 'bad' }, { asOf, node: 'bad' }, { asOf, extra: true }, null]) await expect(capture(ctx(), config as never)).rejects.toThrow(); await expect(replay(null)).rejects.toThrow(); });
  test('SR17 absent/invalid asOf rejected', async () => { for (const config of [{}, { asOf: new Date(NaN) }, { asOf: '' }, { asOf: null }]) await expect(capture(ctx(), config as never)).rejects.toThrow(); });
  test('SR18 current version/integrity strict', async () => { const base = await capture(ctx(), { asOf }); for (const key of ['core', 'calculator', 'tzdb'] as const) { const r = copy(base); r.versions[key] = 'wrong'; await expect(replay(r)).rejects.toThrow(); } for (const key of ['schemaVersion', 'implementation'] as const) { const r = copy(base); (r as any)[key] = 'wrong'; await expect(replay(r)).rejects.toThrow(); } const r = copy(base); r.versions.ephemerisDependencies['@swisseph/browser'].integrity = 'wrong'; await expect(replay(r)).rejects.toThrow(); });
  test('SR19 full result and extra fields checked independently of hash', async () => { const base = await capture(ctx(), { asOf }); for (const mutate of [(r: any) => r.result.chart.birthJd++, (r: any) => r.result.components[0].name = 'wrong', (r: any) => r.result.warnings.push('wrong'), (r: any) => r.resultHash = 'wrong', (r: any) => r.extra = true]) { const r = copy(base); mutate(r); await expect(replay(r)).rejects.toThrow(); } });
  test('SR20 nonplain input rejected without accessors', async () => { let calls = 0; const getter = { asOf, get node() { calls++; return 'mean'; } }; await expect(capture(ctx(), getter as never)).rejects.toThrow(); expect(calls).toBe(0); const cyclic: any = ctx(); cyclic.self = cyclic; const hidden = ctx(); Object.defineProperty(hidden, 'secret', { value: 1 }); const symbol = ctx(); (symbol as any)[Symbol('x')] = 1; const sparse = ctx(); sparse.flags = Array(1); for (const c of [cyclic, hidden, symbol, sparse, Object.assign(Object.create({}), ctx())]) await expect(capture(c, { asOf })).rejects.toThrow(); });
  test('SR21 legacy direct result bytes unchanged by opt-in call', async () => { const c = ctx(); await capture(c, { asOf }); const before = JSON.stringify(jyotishCalculator.calculate(c, { asOf })); await capture(c, { asOf, dashaYearDays: 360 }); expect(JSON.stringify(jyotishCalculator.calculate(c, { asOf }))).toBe(before); expect(jyotishCalculator.calculate(c, { asOf })).not.toHaveProperty('rawConfig'); });
  test('SR22 self-consistency is not authenticity', async () => { const replacement = await capture(createTimeContext({ ...profile, date: '1992-02-22' }), { asOf }); expect(await replay(copy(replacement))).toEqual(replacement); });
  test('SR23 old aes1 boundary still rejects custom year', () => { expect(() => createAsyncEphemerisCalculationSpec({ jyotish: { dashaYearDays: 360 } } as never)).toThrow(); });
  test('SR24 capture returns owned data only; no persistence interface', async () => { const c = ctx(); const r = await capture(c, { asOf }); expect(Object.isFrozen(r)).toBe(true); expect(r.context).not.toBe(c); expect(Object.keys(r).sort()).toEqual(['asOf','context','effective','implementation','rawConfig','result','resultHash','schemaVersion','scope','versions']); });
});

test('SR11/SR12 cold initialization owns inputs and rejects invalid config before WASM', () => {
  const source = `
    const { captureStandaloneJyotish } = await import('./packages/core/src/core/standaloneEphemerisReplay.ts');
    const { createTimeContext } = await import('./packages/core/src/time/createTimeContext.ts');
    const { isEphemerisReady } = await import('./packages/core/src/calculators/astro/ephemeris.ts');
    const profile = ${JSON.stringify(profile)};
    const ctx = createTimeContext(profile);
    let rejected = false;
    try { await captureStandaloneJyotish(ctx, { asOf: '${asOf}', dashaYearDays: 0 }); } catch { rejected = true; }
    const readyAfterRejected = isEphemerisReady();
    const date = new Date('${asOf}T00:00:00Z'), config = { asOf: date, dashaYearDays: 360 };
    const pending = captureStandaloneJyotish(ctx, config);
    ctx.profile.birthplace.lat = 0; config.dashaYearDays = 365.25; date.setUTCFullYear(2030);
    const result = await pending;
    console.log(JSON.stringify({ rejected, readyAfterRejected, readyAfterCapture: isEphemerisReady(),
      lat: result.context.profile.birthplace.lat, year: result.effective.dashaYearDays, asOf: result.asOf,
      callerFrozen: Object.isFrozen(ctx.profile.birthplace) || Object.isFrozen(config) || Object.isFrozen(date) }));
  `;
  const child = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source], {
    cwd: resolve(import.meta.dirname, '../../..'), encoding: 'utf8', timeout: 60000,
  });
  expect(child.status, child.stderr).toBe(0);
  expect(JSON.parse(child.stdout.trim().split('\n').at(-1)!)).toEqual({ rejected: true,
    readyAfterRejected: false, readyAfterCapture: true, lat: 25.033, year: 360, asOf, callerFrozen: false });
}, 60000);


test('unknown or missing top-level replay fields reject before cold initialization and context preparation', async () => {
  const baseline = await capture(ctx(), { asOf });
  const source = `
    const { replayStandaloneJyotish } = await import('./packages/core/src/core/standaloneEphemerisReplay.ts');
    const { isEphemerisReady } = await import('./packages/core/src/calculators/astro/ephemeris.ts');
    const record = ${JSON.stringify(baseline)};
    const errors = [];
    for (const mode of ['unknown', 'missing']) {
      const candidate = structuredClone(record);
      if (mode === 'unknown') candidate.unrecognized = true;
      else delete candidate.resultHash;
      // Invalid context proves exact envelope validation also precedes prepare().
      candidate.context = null;
      try { await replayStandaloneJyotish(candidate); errors.push('accepted'); }
      catch (error) { errors.push(error.message); }
    }
    console.log(JSON.stringify({ errors, ready: isEphemerisReady() }));
  `;
  const child = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source], {
    cwd: resolve(import.meta.dirname, '../../..'), encoding: 'utf8', timeout: 60000,
  });
  expect(child.status, child.stderr).toBe(0);
  expect(JSON.parse(child.stdout.trim().split('\n').at(-1)!)).toEqual({
    errors: ['Invalid standalone replay envelope fields', 'Invalid standalone replay envelope fields'], ready: false,
  });
}, 60000);
