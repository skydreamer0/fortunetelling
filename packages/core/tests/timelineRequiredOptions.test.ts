import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { resolveCalculationSpec } from '../src/core/calculationSpec';
import { createTimeContext } from '../src/time/createTimeContext';
import { buildTimeline, type TimelineOptions } from '../src/timeline/buildTimeline';
import { buildBacktestTimeline, type BacktestTimelineOptions } from '../src/backtest/timeline';

// Synthetic cross-shichen fixture: Taipei civil 13:03 differs from true solar time.
const input = { year: 2026, month: 2, day: 15, hour: 13, minute: 3, gender: 'male' as const };
const { profile, options } = resolveCalculationSpec(input);
const ctx = createTimeContext(profile);
const asOf = '2026-07-11';

describe('Issue #51: timeline settings are explicit at every entry', () => {
  for (const [label, incomplete, missing] of [
    ['both omitted', {}, 'useTrueSolarTime'],
    ['clock omitted', { ziHourConvention: 'late' }, 'useTrueSolarTime'],
    ['clock undefined', { useTrueSolarTime: undefined, ziHourConvention: 'late' }, 'useTrueSolarTime'],
    ['zi convention omitted', { useTrueSolarTime: true }, 'ziHourConvention'],
    ['zi convention undefined', { useTrueSolarTime: false, ziHourConvention: undefined }, 'ziHourConvention'],
  ] as const) {
    test(`sync rejects ${label}, including an empty systems request`, () => {
      expect(() => buildTimeline(ctx, { asOf, systems: [], ...incomplete } as TimelineOptions)).toThrow(missing);
    });
    test(`backtest rejects ${label} instead of forwarding a hidden default`, () => {
      expect(() => buildBacktestTimeline(ctx, {
        asOf, fromYear: 2026, toYear: 2026, systems: [], ...incomplete,
      } as BacktestTimelineOptions)).toThrow(missing);
    });
  }

  test('async rejects missing settings before initializing ephemeris', () => {
    const root = resolve(import.meta.dir, '../..');
    const child = Bun.spawnSync([process.execPath, '-e', `
      const { buildTimelineAsync } = await import('./core/src/timeline/buildTimeline.ts');
      const { isEphemerisReady } = await import('./core/src/calculators/astro/ephemeris.ts');
      const { createTimeContext } = await import('./core/src/time/createTimeContext.ts');
      const ctx = createTimeContext(${JSON.stringify(profile)});
      const results = [];
      for (const options of [{}, { useTrueSolarTime: true }]) {
        try { await buildTimelineAsync(ctx, { asOf: '${asOf}', systems: [], ...options }); results.push('accepted'); }
        catch (error) { results.push(error.message); }
      }
      console.log(JSON.stringify({ results, ephemerisReady: isEphemerisReady() }));
    `], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
    expect(child.exitCode, new TextDecoder().decode(child.stderr)).toBe(0);
    const result = JSON.parse(new TextDecoder().decode(child.stdout).trim().split('\n').at(-1)!);
    expect(result.results[0]).toContain('useTrueSolarTime');
    expect(result.results[1]).toContain('ziHourConvention');
    expect(result.ephemerisReady).toBe(false);
  }, 60_000);

  test('an explicitly resolved default remains a valid deterministic timeline', () => {
    const selected = { asOf, systems: ['bazi', 'ziwei', 'numerology'] as const, ...options };
    const first = buildTimeline(ctx, selected);
    expect(buildTimeline(ctx, selected)).toEqual(first);
    expect(first.systems).toEqual(['bazi', 'ziwei', 'numerology']);
    expect(buildTimeline(ctx, { ...selected, useTrueSolarTime: false }).years).not.toEqual(first.years);
  }, 60_000);
});
