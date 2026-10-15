import { afterAll, beforeAll, describe, expect, test, vi  } from 'vitest';
const spyOn = vi.spyOn;
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { baziCalculator, createTimeContext } from '@fortune/core';
import { callTool } from '../src/tools/index';
import { makeFixture, SAMPLE_PROFILE } from './helpers';

// Fictional fixtures, never real customer inputs or school-pack evidence.
const late = { useTrueSolarTime: false, ziHourConvention: 'late' as const };
const early = { useTrueSolarTime: false, ziHourConvention: 'early' as const };
const boundary = { ...SAMPLE_PROFILE, time: '23:10' };
const solarBoundary = { ...SAMPLE_PROFILE, time: '08:30',
  birthplace: { label: 'Fictional test location', lat: 25, lng: 90, timezone: 'Asia/Taipei' } };
const asOf = '2026-10-15';
const args = { profileId: 'boundary', asOf, left: late, right: early };
let fx: Awaited<ReturnType<typeof makeFixture>>;
beforeAll(async () => { fx = await makeFixture({ boundary, solar: solarBoundary,
  overlap: { ...SAMPLE_PROFILE, date: '2020-11-01', time: '01:30', timeAccuracy: 'approx15m',
    birthplace: { label: 'Fictional New York test', lat: 40.7, lng: -74, timezone: 'America/New_York' } },
  unknown: { ...SAMPLE_PROFILE, time: null, timeAccuracy: 'unknown' } }); });
afterAll(async () => { await fx.cleanup(); });

describe('compare_bazi_conventions', () => {
  test('real core results: civil 23:10 early/late changes the day pillar', async () => {
    const { isError, json } = await fx.call('compare_bazi_conventions', args);
    expect(isError).toBe(false);
    expect(json.data.available).toBe(true);
    expect(json.data.left.natal.pillars.day).not.toBe(json.data.right.natal.pillars.day);
    expect(json.data.changedOptions).toEqual(['ziHourConvention']);
    expect(json.data.differences.map((d: any) => d.field)).toContain('pillars');
    for (const difference of json.data.differences) {
      expect(difference.chartPath).toBe(`chart.${difference.field}`);
      expect(difference.left).toEqual(json.data.left.natal[difference.field]);
      expect(difference.right).toEqual(json.data.right.natal[difference.field]);
    }
    for (const side of ['left', 'right'] as const) {
      const core = baziCalculator.calculate(createTimeContext(boundary), { ...args[side], asOf });
      for (const field of ['pillars', 'dayMaster', 'fiveElements', 'tenGods'] as const)
        expect(json.data[side].natal[field]).toEqual(core.chart[field]);
      expect(json.data[side].calculatorVersion).toBe(core.version);
    }
    expect(json.versions.calculators.bazi).toBe(json.data.left.calculatorVersion);
    expect(json.versions.ephemeris).toBe('not_initialized');
    expect(json.versionsHash).toMatch(/^[0-9a-f]{12}$/);
  });

  test('true solar convention can change hour pillar; reads effective options', async () => {
    const { json } = await fx.call('compare_bazi_conventions', {
      ...args, profileId: 'solar', right: { ...late, useTrueSolarTime: true },
    });
    expect(json.data.left.natal.pillars.hour).not.toBe(json.data.right.natal.pillars.hour);
    expect(json.data.left.effectiveOptions.dayHourClock).toBe('civil');
    expect(json.data.right.effectiveOptions.dayHourClock).toBe('trueSolar');
    expect(json.data.changedOptions).toEqual(['useTrueSolarTime']);
  });

  test('same options, deterministic output and no false disagreement away from boundary', async () => {
    const same = { ...args, right: late };
    const first = await fx.call('compare_bazi_conventions', same);
    expect(first.text).toBe((await fx.call('compare_bazi_conventions', same)).text);
    expect(first.json.data.differences).toEqual([]);
    expect(first.json.data.unchangedFields).toHaveLength(4);
    const stable = await fx.call('compare_bazi_conventions', { ...args, profileId: 'sky' });
    expect(stable.json.data.changedOptions).toEqual(['ziHourConvention']);
    expect(stable.json.data.differences).toEqual([]);
    expect(stable.json.data.explanation).toContain('不代表所有出生時間皆相同');
  });

  test('abstains when time is unknown; does not produce an equality claim', async () => {
    const { json } = await fx.call('compare_bazi_conventions', { ...args, profileId: 'unknown' });
    expect(json.data.available).toBe(false);
    expect(json.data.reason).toBe('time_unknown');
    expect(json.data.differences).toBeUndefined();
    expect(json.data.left).toBeUndefined();
  });

  test('non-Taipei DST ambiguity and approximate-time caveats survive matching sides', async () => {
    const { json, text } = await fx.call('compare_bazi_conventions', {
      ...args, profileId: 'overlap', right: late,
    });
    expect(json.data.available).toBe(true);
    expect(json.data.differences).toEqual([]);
    expect(json.caveats.map((c: any) => c.code)).toContain('time:dst_overlap');
    expect(json.caveats.map((c: any) => c.code)).toContain('birth_time_not_exact');
    expect(json.data.left.warnings).toContain('dst_overlap');
    expect(text).not.toContain('2020-11-01');
    expect(text).not.toContain('Fictional New York test');
  });

  test.each([
    { asOf: '2026-02-30' }, { asOf: 'today' }, { asOf: '2026-13-01' },
    { left: { ...late, schoolPack: 'fake' } }, { left: { ziHourConvention: 'late' } },
    { right: { ...late, ziHourConvention: 'unsupported' } }, { historicalVersion: 'old' },
  ])('rejects unsupported input %j', async patch => {
    const result = await fx.call('compare_bazi_conventions', { ...args, ...patch });
    expect(result.isError).toBe(true);
    expect(result.json.error.code).toBe('invalid_args');
  });

  test('missing profile remains structured; never invokes the multi-system analyzer', async () => {
    expect((await fx.call('compare_bazi_conventions', { ...args, profileId: 'absent' })).json.error.code)
      .toBe('profile_not_found');
    const result = await callTool('compare_bazi_conventions', args, {
      ...fx.ctx, analyzer: { get() { throw new Error('must not call analyzer'); } } as any,
    });
    expect(result.isError).toBe(false);
  });

  test('privacy, source resolvability, scope, warning preservation and read-only storage', async () => {
    const names = await readdir(fx.dir);
    const before = await Promise.all(names.map(name => readFile(join(fx.dir, name), 'utf8')));
    const { text, json } = await fx.call('compare_bazi_conventions', args);
    for (const secret of [boundary.name!, boundary.date, '23:10', boundary.birthplace.label!, '120.2269', 'clock', 'snapshotId'])
      expect(text).not.toContain(secret);
    expect(json.caveats.some((c: any) => c.code === 'time:zi_hour_convention')).toBe(true);
    expect(json.data.limits.join('')).toContain('不能據此宣稱歷史重播');
    for (const source of json.data.sources)
      expect((await readFile(join(import.meta.dirname, '../../..', source), 'utf8')).length).toBeGreaterThan(0);
    expect(await readdir(fx.dir)).toEqual(names);
    expect(await Promise.all(names.map(name => readFile(join(fx.dir, name), 'utf8')))).toEqual(before);
  });

  test('batch can use this read-only tool', async () => {
    const { json } = await fx.call('batch', { calls: [{ tool: 'compare_bazi_conventions', args }] });
    expect(json.data.results[0].ok).toBe(true);
    expect(json.data.results[0].data.available).toBe(true);
  });

  test('raw load errors do not expose filesystem paths', async () => {
    const result = await callTool('compare_bazi_conventions', args, {
      ...fx.ctx, store: { get: async () => { throw new Error('EACCES /private/person/profile.json'); } } as any,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.text).error.code).toBe('internal');
    expect(result.text).not.toContain('/private');
  });

  test('null chart is unavailable, not agreement; arbitrary warning/error text is suppressed', async () => {
    const original = baziCalculator.calculate(createTimeContext(boundary), { ...late, asOf });
    const spy = spyOn(baziCalculator, 'calculate');
    try {
      spy.mockReturnValue({ ...original, chart: { ...original.chart, pillars: null } });
      const missing = await fx.call('compare_bazi_conventions', args);
      expect(missing.json.data.available).toBe(false);
      expect(missing.json.data.reason).toBe('calculation_unavailable');
      expect(missing.json.data.differences).toBeUndefined();
      spy.mockReturnValue({ ...original, warnings: ['arbitrary-private-detail', 'zi_hour_convention'] });
      const warned = await fx.call('compare_bazi_conventions', args);
      expect(warned.text).not.toContain('arbitrary-private-detail');
      expect(warned.json.data.left.warnings).toEqual(['unclassified_core_warning', 'zi_hour_convention']);
      spy.mockImplementation(() => { throw new Error('private birth input'); });
      const failed = await fx.call('compare_bazi_conventions', args);
      expect(failed.isError).toBe(true);
      expect(failed.text).not.toContain('private birth input');
    } finally { spy.mockRestore(); }
  });
});
