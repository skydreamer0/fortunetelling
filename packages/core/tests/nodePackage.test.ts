import { expect, test } from 'vitest';
import { spawnSync } from 'node:child_process';
import { analyze, createTimeContext, initEphemeris, runEphemerisCalculators } from '../src/index';

// Synthetic input only. This proves the distributed package executes in stock
// Node without tsx, Vitest transforms, source aliases, Bun globals or network.
const input = { year: 1995, month: 7, day: 16, hour: 22, minute: 0,
  gender: 'male' as const, cityId: 'tainan', name: 'SYNTHETIC' };
const profile = { date: '1995-07-16', time: '22:00', timeAccuracy: 'exact' as const,
  gender: 'male' as const, name: 'SYNTHETIC',
  birthplace: { label: 'Synthetic Tainan', lat: 22.9922, lng: 120.1848, timezone: 'Asia/Taipei' } };
const options = { asOf: '2026-09-25' };
const clean = (value: unknown) => JSON.parse(JSON.stringify(value, (key, item) =>
  ['computedAt', 'durationMs', 'generatedAt', 'classifiedAt', 'exportedAt'].includes(key) ? undefined : item));

test('built SDK initializes real WASM and matches source sync/async results in stock offline Node', async () => {
  const script = `
    import assert from 'node:assert/strict';
    assert.equal(typeof globalThis.Bun, 'undefined');
    let networkAttempts = 0;
    globalThis.fetch = async () => { networkAttempts++; throw new Error('Network forbidden in built SDK test'); };
    assert.equal(import.meta.resolve('@fortune/core').endsWith('/dist/index.js'), true);
    const { analyze, createTimeContext, initEphemeris, isEphemerisReady, runEphemerisCalculators } = await import('@fortune/core');
    assert.equal(isEphemerisReady(), false);
    const sync = analyze(${JSON.stringify(input)}, ${JSON.stringify(options)});
    const first = initEphemeris(), second = initEphemeris();
    assert.equal(first, second);
    await Promise.all([first, second]);
    assert.equal(isEphemerisReady(), true);
    const asyncResults = await runEphemerisCalculators(createTimeContext(${JSON.stringify(profile)}), ${JSON.stringify(options)});
    assert.equal(networkAttempts, 0);
    console.log(JSON.stringify({ sync, asyncResults, runtime: process.versions.node }));
  `;
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    env: { ...process.env, ANTHROPIC_API_KEY: '' }, timeout: 60_000, maxBuffer: 32 * 1024 * 1024,
  });
  expect(child.error).toBeUndefined();
  expect(child.status, child.stderr.toString()).toBe(0);
  expect(child.signal).toBeNull();
  const result = JSON.parse(child.stdout.toString());
  expect(result.runtime).toBe(process.versions.node);
  expect(clean(result.sync)).toEqual(clean(analyze(input, options)));
  await initEphemeris();
  const expected = await runEphemerisCalculators(createTimeContext(profile), options);
  expect(result.asyncResults.map((item: { system: string }) => item.system)).toEqual(['humanDesign', 'jyotish']);
  expect(clean(result.asyncResults)).toEqual(clean(expected));
}, 90_000);
