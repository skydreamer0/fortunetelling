import { beforeAll, describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { createAsyncEphemerisCalculationSpec as createSpec, type AsyncEphemerisCalculationOptions } from '../src/core/asyncEphemerisCalculationSpec';
import { createCalculationSpec } from '../src/core/calculationSpec';
import { initEphemeris } from '../src/calculators/astro/ephemeris';
import { buildJyotishChart } from '../src/calculators/jyotish/calculator';
import { evaluateJyotishRules } from '../src/calculators/jyotish/rules';
import { humanDesignCalculator } from '../src/calculators/humanDesign/calculator';
import { evaluateHumanDesignRules, humanDesignTransitRuleForSampling } from '../src/calculators/humanDesign/rules';
import { createTimeContext } from '../src/time/index';
import { buildTimeline, buildTimelineAsync, type TimelineCell, type TimelineOptions } from '../src/timeline/buildTimeline';
import type { Signal } from '../src/signals/types';

const profile = {
  date: '1990-02-22', time: '12:00', timeAccuracy: 'exact' as const, gender: 'female' as const,
  birthplace: { label: 'Synthetic Taipei', lat: 25.033, lng: 121.5654, timezone: 'Asia/Taipei' },
};
const ctx = createTimeContext(profile);
const options: TimelineOptions = {
  asOf: '2026-07-11', useTrueSolarTime: true, ziHourConvention: 'late',
  years: 1, systems: ['jyotish', 'humanDesign'], topSignalsPerDomain: Infinity,
};
const sortSignals = (signals: Signal[]) => [...signals].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const cellSignals = (cell: TimelineCell) => sortSignals(cell.domains.flatMap(domain => domain.topSignals));
function frozen(value: unknown) {
  if (value !== null && typeof value === 'object') {
    expect(Object.isFrozen(value)).toBe(true);
    Object.values(value).forEach(frozen);
  }
}

describe('ephemeris settings identity, not result identity', () => {
  test('default choices and implemented fixed methods are explicit', () => {
    const spec = createSpec();
    expect(spec.identity.scope).toBe('timeline-ephemeris-settings');
    expect(spec.identity.settings).toEqual({ jyotish: { ayanamsa: 'lahiri', node: 'mean' }, humanDesign: { node: 'true', sampleDays: { year: 15, month: 3 } } });
    expect(spec.identity.conventions.jyotish).toEqual({ houseSystem: 'whole_sign', dashaYearDays: 365.25, transitMethod: 'window-midpoint' });
    expect(spec.identity.conventions.humanDesign.convergence).toBe('unverified');
    expect(spec.specHash).toMatch(/^aes1-[0-9a-f]{16}$/);
    expect(createSpec(spec.identity.settings)).toEqual(spec);
    frozen(spec);
  });

  test('canonical order, omitted defaults and caller isolation', () => {
    const source: AsyncEphemerisCalculationOptions = { humanDesign: { sampleDays: { month: 3, year: 15 }, node: 'true' }, jyotish: { node: 'mean', ayanamsa: 'lahiri' } };
    const spec = createSpec(source);
    expect(spec).toEqual(createSpec());
    source.humanDesign!.sampleDays!.year = 7.5;
    expect(spec.identity.settings.humanDesign.sampleDays.year).toBe(15);
    expect(Object.isFrozen(source.humanDesign)).toBe(false);
  });

  test('every supported choice changes hash; repeat construction is identical', () => {
    const variants: AsyncEphemerisCalculationOptions[] = [
      { jyotish: { ayanamsa: 'raman' } }, { jyotish: { ayanamsa: 'krishnamurti' } },
      { jyotish: { node: 'true' } }, { humanDesign: { node: 'mean' } },
      { humanDesign: { sampleDays: { year: 7.5 } } }, { humanDesign: { sampleDays: { month: 1.5 } } },
    ];
    for (const variant of variants) {
      expect(createSpec(variant).specHash).not.toBe(createSpec().specHash);
      expect(createSpec(variant)).toEqual(createSpec(variant));
    }
  });

  test('nullish, nonfinite, unknown and unsafe settings fail instead of selecting defaults', () => {
    const invalid: unknown[] = [null, false, [], new Date(), { jyotish: null }, { jyotish: undefined },
      { humanDesign: null }, { humanDesign: { sampleDays: undefined } }, { houseSystem: 'placidus' },
      { jyotish: { houseSystem: 'whole_sign' } }, { jyotish: { ayanamsa: 'fagan_bradley' } },
      { jyotish: { ayanamsa: undefined } }, { jyotish: { node: null } }, { humanDesign: { node: 'invalid' } },
      ...[null, undefined, NaN, Infinity, -Infinity, 0, -1, Number.MIN_VALUE, 367, '3'].flatMap(value => [
        { humanDesign: { sampleDays: { year: value } } }, { humanDesign: { sampleDays: { month: value } } },
      ]),
    ];
    for (const value of invalid) expect(() => createSpec(value as AsyncEphemerisCalculationOptions)).toThrow();
    for (const value of [1 / 24, 366]) expect(createSpec({ humanDesign: { sampleDays: { year: value, month: value } } }).identity.settings.humanDesign.sampleDays.year).toBe(value);
  });

  test('invalid async settings reject before WASM initialization in a fresh process', () => {
    const child = Bun.spawnSync([process.execPath, '-e', `
      const { buildTimelineAsync } = await import('./core/src/timeline/buildTimeline.ts');
      const { isEphemerisReady } = await import('./core/src/calculators/astro/ephemeris.ts');
      const { createTimeContext } = await import('./core/src/time/index.ts');
      let rejected = false;
      try { await buildTimelineAsync(createTimeContext(${JSON.stringify(profile)}), { ...${JSON.stringify(options)}, ephemeris: { jyotish: { node: null } } }); }
      catch { rejected = true; }
      console.log(JSON.stringify({ rejected, ready: isEphemerisReady() }));
    `], { cwd: resolve(import.meta.dir, '../..'), stdout: 'pipe', stderr: 'pipe' });
    expect(child.exitCode, new TextDecoder().decode(child.stderr)).toBe(0);
    expect(JSON.parse(new TextDecoder().decode(child.stdout).trim().split('\n').at(-1)!)).toEqual({ rejected: true, ready: false });
  }, 60_000);

  test('sync cs1 remains scoped to sync natal intent', () => {
    const spec = createCalculationSpec({ year: 1990, month: 2, day: 22 });
    expect(spec.specHash).toMatch(/^cs1-/);
    expect(spec.identity.settings.ephemeris).toEqual({ mode: 'excluded', systems: ['jyotish', 'humanDesign'] });
  });
});

describe('actual timeline consumption with existing ephemeris, not an external truth oracle', () => {
  beforeAll(async () => { await initEphemeris(); });

  test('default output matches existing calculator/rule defaults in every year/month cell', () => {
    const actual = buildTimeline(ctx, options);
    const jyotish = buildJyotishChart(ctx, { asOf: options.asOf });
    const hd = humanDesignCalculator.calculate(ctx, { asOf: options.asOf }).chart;
    for (const cell of [...actual.years, ...actual.months]) {
      expect(cellSignals(cell)).toEqual(sortSignals([
        ...evaluateJyotishRules(jyotish, cell.window), ...evaluateHumanDesignRules(hd, cell.window),
      ]));
    }
    expect(JSON.stringify(actual)).toBe(JSON.stringify(buildTimeline(ctx, { ...options, ephemeris: createSpec().identity.settings })));
    expect(actual.schemaVersion).toBe(2);
    expect(actual).not.toHaveProperty('specHash');
  });

  test('each Jyotish ayanamsa/node choice reaches timeline rules and repeats exactly', async () => {
    const baseline = buildJyotishChart(ctx, { asOf: options.asOf });
    for (const jyotish of [
      { ayanamsa: 'raman', node: 'mean' }, { ayanamsa: 'krishnamurti', node: 'mean' }, { ayanamsa: 'lahiri', node: 'true' },
    ] as const) {
      const selected = { ...options, systems: ['jyotish'] as const, ephemeris: { jyotish } };
      const actual = await buildTimelineAsync(ctx, selected);
      const chart = buildJyotishChart(ctx, { asOf: options.asOf, ...jyotish, dashaYearDays: 365.25 });
      expect(chart.planets).not.toEqual(baseline.planets);
      for (const cell of [...actual.years, ...actual.months]) expect(cellSignals(cell)).toEqual(sortSignals(evaluateJyotishRules(chart, cell.window)));
      expect(JSON.stringify(await buildTimelineAsync(ctx, selected))).toBe(JSON.stringify(actual));
    }
  });

  test('HD node and both step overrides reach actual rules; known missed year signal is retained', async () => {
    for (const node of ['true', 'mean'] as const) {
      const humanDesign = { node, sampleDays: { year: 7.5, month: 1.5 } };
      const actual = await buildTimelineAsync(ctx, { ...options, systems: ['humanDesign'], ephemeris: { humanDesign } });
      const chart = humanDesignCalculator.calculate(ctx, { node }).chart;
      for (const cell of [...actual.years, ...actual.months]) {
        const grain = cell.window.grain as 'year' | 'month';
        const expected = evaluateHumanDesignRules(chart, cell.window, { rules: [humanDesignTransitRuleForSampling(grain, humanDesign.sampleDays[grain])] });
        expect(cellSignals(cell)).toEqual(sortSignals(expected));
      }
      const defaults = buildTimeline(ctx, { ...options, systems: ['humanDesign'], ephemeris: { humanDesign: { node } } });
      expect(cellSignals(actual.years[0])).not.toEqual(cellSignals(defaults.years[0]));
    }
  }, 60_000);

  test('async captures nested settings before yielding, without freezing caller options', async () => {
    const ephemeris: AsyncEphemerisCalculationOptions = { jyotish: { ayanamsa: 'raman', node: 'true' }, humanDesign: { node: 'mean', sampleDays: { year: 7.5, month: 1.5 } } };
    const expected = buildTimeline(ctx, { ...options, ephemeris });
    const pending = buildTimelineAsync(ctx, { ...options, ephemeris });
    ephemeris.jyotish!.ayanamsa = 'lahiri';
    ephemeris.humanDesign!.sampleDays!.year = 15;
    expect(JSON.stringify(await pending)).toBe(JSON.stringify(expected));
  }, 60_000);
});
