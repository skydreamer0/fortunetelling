import { beforeAll, describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { initEphemeris } from '../src/calculators/astro/ephemeris';
import { runEphemerisCalculators } from '../src/calculators/ephemerisRegistry';
import { humanDesignCalculator } from '../src/calculators/humanDesign/calculator';
import { buildJyotishChart, jyotishCalculator, type JyotishConfig } from '../src/calculators/jyotish/calculator';
import { createAsyncEphemerisCalculationSpec, type AsyncEphemerisCalculationOptions } from '../src/core/asyncEphemerisCalculationSpec';
import { resolveHumanDesignChartSettings, resolveJyotishChartSettings } from '../src/core/ephemerisSettings';
import { createTimeContext } from '../src/time/index';

const profile = {
  date: '1990-02-22', time: '12:00', timeAccuracy: 'exact' as const, gender: 'female' as const,
  birthplace: { label: 'Synthetic Taipei', lat: 25.033, lng: 121.5654, timezone: 'Asia/Taipei' },
};
const ctx = createTimeContext(profile);
const asOf = '2026-07-11';
// Literal compatibility expectations, independent of the resolver under test.
const jyotishDefaults = { ayanamsa: 'lahiri', node: 'mean', dashaYearDays: 365.25 } as const;
const ephemerisDefaults = {
  jyotish: { ayanamsa: 'lahiri', node: 'mean' },
  humanDesign: { node: 'true', sampleDays: { year: 15, month: 3 } },
} as const;

function freshProcess(source: string): unknown {
  const child = Bun.spawnSync([process.execPath, '-e', source], {
    cwd: resolve(import.meta.dir, '../..'), stdout: 'pipe', stderr: 'pipe',
  });
  expect(child.exitCode, new TextDecoder().decode(child.stderr)).toBe(0);
  return JSON.parse(new TextDecoder().decode(child.stdout).trim().split('\n').at(-1)!);
}

describe('legacy standalone effective settings', () => {
  beforeAll(async () => { await initEphemeris(); });

  test('omitted and explicit defaults match complete chart and ChartResult bytes', () => {
    expect(JSON.stringify(buildJyotishChart(ctx, { asOf }))).toBe(
      JSON.stringify(buildJyotishChart(ctx, { asOf, ...jyotishDefaults })),
    );
    expect(JSON.stringify(jyotishCalculator.calculate(ctx, { asOf }))).toBe(
      JSON.stringify(jyotishCalculator.calculate(ctx, { asOf, ...jyotishDefaults })),
    );
    expect(JSON.stringify(humanDesignCalculator.calculate(ctx, { asOf }))).toBe(
      JSON.stringify(humanDesignCalculator.calculate(ctx, { asOf, node: 'true' })),
    );
  });

  test('nondefault ayanamsa and nodes change actual activations and repeat exactly', () => {
    const baseline = buildJyotishChart(ctx, { asOf });
    for (const settings of [
      { ayanamsa: 'raman', node: 'mean' },
      { ayanamsa: 'krishnamurti', node: 'mean' },
      { ayanamsa: 'lahiri', node: 'true' },
    ] as const) {
      const actual = buildJyotishChart(ctx, { asOf, ...settings });
      expect(actual.settings).toEqual({ ...jyotishDefaults, ...settings, houseSystem: 'whole_sign' });
      expect(actual.planets).not.toEqual(baseline.planets);
      expect(JSON.stringify(actual)).toBe(JSON.stringify(buildJyotishChart(ctx, { asOf, ...settings })));
    }
    const hd = humanDesignCalculator.calculate(ctx, { asOf, node: 'mean' });
    expect(hd.chart.node).toBe('mean');
    expect(hd.chart.personality).not.toEqual(humanDesignCalculator.calculate(ctx, { asOf }).chart.personality);
    expect(JSON.stringify(hd)).toBe(JSON.stringify(humanDesignCalculator.calculate(ctx, { asOf, node: 'mean' })));
  });

  test('standalone custom dasha years reach periods without changing timeline identity', () => {
    const spec = createAsyncEphemerisCalculationSpec();
    const baseline = buildJyotishChart(ctx, { asOf });
    for (const dashaYearDays of [360, 365.2422]) {
      const options = { asOf, ayanamsa: 'raman' as const, node: 'true' as const, dashaYearDays };
      const direct = buildJyotishChart(ctx, options);
      const wrapped = jyotishCalculator.calculate(ctx, options);
      expect(direct.settings.dashaYearDays).toBe(dashaYearDays);
      expect(direct.dasha!.yearDays).toBe(dashaYearDays);
      expect(direct.dasha!.mahadashas[0].endJd - direct.dasha!.mahadashas[0].startJd).toBeCloseTo(
        direct.dasha!.mahadashas[0].years * dashaYearDays, 7,
      );
      expect(direct.dasha).not.toEqual(baseline.dasha);
      expect(JSON.stringify(wrapped.chart)).toBe(JSON.stringify(direct));
      expect(Object.isFrozen(options)).toBe(false);
    }
    expect(createAsyncEphemerisCalculationSpec()).toEqual(spec);
    expect(spec.identity.scope).toBe('timeline-ephemeris-settings');
    expect(spec.identity.conventions.jyotish.dashaYearDays).toBe(365.25);
    expect(() => createAsyncEphemerisCalculationSpec({ jyotish: { dashaYearDays: 360 } } as never)).toThrow();
  });

  test('legacy nullish fallback and mutable output remain unchanged', () => {
    const legacy = { asOf, ayanamsa: null, node: undefined, dashaYearDays: null } as unknown as JyotishConfig;
    expect(JSON.stringify(jyotishCalculator.calculate(ctx, legacy))).toBe(
      JSON.stringify(jyotishCalculator.calculate(ctx, { asOf, ...jyotishDefaults })),
    );
    expect(resolveHumanDesignChartSettings({ node: null } as never)).toEqual({ node: 'true' });
    const settings = resolveJyotishChartSettings(legacy);
    expect(settings).toEqual({ ...jyotishDefaults, houseSystem: 'whole_sign' });
    expect(Object.isFrozen(settings)).toBe(false);
    settings.dashaYearDays = 360;
    expect(resolveJyotishChartSettings().dashaYearDays).toBe(365.25);
  });

  test('unknown-time bytes agree and preserve nondefault metadata without inventing a chart', () => {
    const unknown = createTimeContext({ ...profile, time: null, timeAccuracy: 'unknown' });
    expect(JSON.stringify(jyotishCalculator.calculate(unknown, { asOf }))).toBe(
      JSON.stringify(jyotishCalculator.calculate(unknown, { asOf, ...jyotishDefaults })),
    );
    expect(JSON.stringify(humanDesignCalculator.calculate(unknown, {}))).toBe(
      JSON.stringify(humanDesignCalculator.calculate(unknown, { node: 'true' })),
    );
    const jyotish = jyotishCalculator.calculate(unknown, { asOf, ayanamsa: 'raman', node: 'true', dashaYearDays: 360 });
    expect(jyotish.chart).toMatchObject({ timeKnown: false, planets: [], dasha: null, lagna: null,
      settings: { ayanamsa: 'raman', node: 'true', dashaYearDays: 360, houseSystem: 'whole_sign' } });
    expect(jyotish.components).toEqual([]);
    expect(jyotish.warnings).toEqual(['time_unknown']);
    const hd = humanDesignCalculator.calculate(unknown, { node: 'mean' });
    expect(hd.chart).toMatchObject({ birthJdUt: null, type: null, node: 'mean', personality: [], design: [] });
    expect(hd.components).toEqual([]);
    expect(hd.warnings).toEqual(['time_unknown']);
  });

  test('uninitialized known/unknown-time behavior is preserved in a fresh process', () => {
    expect(freshProcess(`
      const { humanDesignCalculator } = await import('./core/src/calculators/humanDesign/calculator.ts');
      const { jyotishCalculator } = await import('./core/src/calculators/jyotish/calculator.ts');
      const { isEphemerisReady } = await import('./core/src/calculators/astro/ephemeris.ts');
      const { createTimeContext } = await import('./core/src/time/index.ts');
      const profile = ${JSON.stringify(profile)};
      const known = createTimeContext(profile);
      const unknown = createTimeContext({ ...profile, time: null, timeAccuracy: 'unknown' });
      const hd = humanDesignCalculator.calculate(known, { node: 'mean' });
      let jyotishError = '';
      try { jyotishCalculator.calculate(known, { asOf: '${asOf}' }); }
      catch (error) { jyotishError = error.message; }
      const jUnknown = jyotishCalculator.calculate(unknown, { asOf: '${asOf}', dashaYearDays: 360 });
      const hUnknown = humanDesignCalculator.calculate(unknown, { node: 'mean' });
      console.log(JSON.stringify({ ready: isEphemerisReady(), hdNode: hd.chart.node,
        hdType: hd.chart.type, hdWarnings: hd.warnings, hdComponents: hd.components,
        jyotishError, unknownWarnings: [jUnknown.warnings, hUnknown.warnings],
        unknownDasha: jUnknown.chart.dasha, customYearDays: jUnknown.chart.settings.dashaYearDays }));
    `)).toEqual({ ready: false, hdNode: 'mean', hdType: null, hdWarnings: ['ephemeris:not_initialised'], hdComponents: [],
      jyotishError: 'Jyotish: ephemeris not initialised — await initEphemeris() from calculators/astro first',
      unknownWarnings: [['time_unknown'], ['time_unknown']], unknownDasha: null, customYearDays: 360 });
  });
});

describe('registry settings captured before await', () => {
  test('omitted and explicit defaults match full results and direct calculator bytes', async () => {
    const actual = await runEphemerisCalculators(ctx, { asOf });
    expect(JSON.stringify(actual)).toBe(JSON.stringify(await runEphemerisCalculators(ctx, { asOf, ephemeris: ephemerisDefaults })));
    expect(JSON.stringify(actual)).toBe(JSON.stringify([
      humanDesignCalculator.calculate(ctx, { asOf, node: 'true' }),
      jyotishCalculator.calculate(ctx, { asOf, ...jyotishDefaults }),
    ]));
    expect(actual.map(result => result.system)).toEqual(['humanDesign', 'jyotish']);
    for (const result of actual) expect(result).not.toHaveProperty('specHash');
  });

  test('nondefaults survive caller mutation across await, including a mutable asOf Date', async () => {
    const ephemeris: AsyncEphemerisCalculationOptions = {
      jyotish: { ayanamsa: 'raman', node: 'true' }, humanDesign: { node: 'mean' },
    };
    const date = new Date(`${asOf}T00:00:00Z`);
    const options = { asOf: date, name: 'Selected name', ephemeris };
    const expected = [
      humanDesignCalculator.calculate(ctx, { asOf, node: 'mean', name: options.name }),
      jyotishCalculator.calculate(ctx, { asOf, ayanamsa: 'raman', node: 'true', dashaYearDays: 365.25, name: options.name }),
    ];
    const pending = runEphemerisCalculators(ctx, options);
    ephemeris.jyotish!.ayanamsa = 'lahiri';
    ephemeris.jyotish!.node = 'mean';
    ephemeris.humanDesign!.node = 'true';
    options.name = 'Changed name';
    date.setUTCFullYear(2030);
    expect(Object.isFrozen(ephemeris.jyotish)).toBe(false);
    expect(JSON.stringify(await pending)).toBe(JSON.stringify(expected));
  });

  test('first initialization snapshots choices and rejects malformed settings before WASM', () => {
    expect(freshProcess(`
      const { runEphemerisCalculators } = await import('./core/src/calculators/ephemerisRegistry.ts');
      const { isEphemerisReady } = await import('./core/src/calculators/astro/ephemeris.ts');
      const { humanDesignCalculator } = await import('./core/src/calculators/humanDesign/calculator.ts');
      const { jyotishCalculator } = await import('./core/src/calculators/jyotish/calculator.ts');
      const { createTimeContext } = await import('./core/src/time/index.ts');
      const ctx = createTimeContext(${JSON.stringify(profile)});
      let rejected = false;
      try { await runEphemerisCalculators(ctx, { asOf: '${asOf}', ephemeris: { jyotish: { node: null } } }); }
      catch { rejected = true; }
      const readyAfterRejection = isEphemerisReady();
      const ephemeris = { jyotish: { ayanamsa: 'krishnamurti', node: 'true' }, humanDesign: { node: 'mean' } };
      const pending = runEphemerisCalculators(ctx, { asOf: '${asOf}', ephemeris });
      ephemeris.jyotish.ayanamsa = 'lahiri';
      ephemeris.humanDesign.node = 'true';
      const result = await pending;
      const expected = [humanDesignCalculator.calculate(ctx, { asOf: '${asOf}', node: 'mean' }),
        jyotishCalculator.calculate(ctx, { asOf: '${asOf}', ayanamsa: 'krishnamurti', node: 'true', dashaYearDays: 365.25 })];
      console.log(JSON.stringify({ rejected, readyAfterRejection, matches: JSON.stringify(result) === JSON.stringify(expected),
        readyAfterRun: isEphemerisReady() }));
    `)).toEqual({ rejected: true, readyAfterRejection: false, matches: true, readyAfterRun: true });
  }, 60_000);
});
