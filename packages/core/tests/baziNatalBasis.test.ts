import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { analyze, REPORT_SCHEMA_VERSION } from '../src/core/analyze';
import { resolveCalculationSpec } from '../src/core/calculationSpec';
import { TimeContextBaZiEngine } from '../src/core/timeContextEngines';
import { BaZiEngine } from '../src/engines/BaZiEngine';
import { createTimeContext } from '../src/time/createTimeContext';
import { baziCalculator } from '../src/calculators/bazi/calculator';
import * as baziModule from '../src/calculators/bazi/calculator';
import * as pillars from '../src/calculators/bazi/pillars';
import * as timelineModule from '../src/timeline/buildTimeline';
import * as publicCore from '../src/index';
import type { AnalyzeInput } from '../src/core/analyze';

const birth: AnalyzeInput = {
  year: 1990, month: 5, day: 17, hour: 23, minute: 10, gender: 'female', name: 'ALICE',
  birthplace: { label: 'Synthetic birthplace', lat: 22.9999, lng: 119.2269, timezone: 'Asia/Taipei' },
};
const ASOF = '2026-07-11';
const VOLATILE = new Set(['generatedAt', 'computedAt', 'durationMs', 'classifiedAt', 'exportedAt']);
const clean = (value: unknown) => JSON.parse(JSON.stringify(value, (key, item) => VOLATILE.has(key) ? undefined : item));
const restorers: Array<{ mockRestore(): void }> = [];
afterEach(() => { for (const spy of restorers.splice(0)) spy.mockRestore(); });

function observed(object: any, key: string): any {
  const spy = spyOn(object, key);
  restorers.push(spy);
  return spy;
}

function resolved(input: AnalyzeInput = birth) {
  const value = resolveCalculationSpec(input);
  return { ...value, ctx: createTimeContext(value.profile, { dstOverlap: value.spec.identity.settings.time.dstOverlap }) };
}

// Dynamic loading lets the tests-only commit exercise existing entry points:
// missing internal contracts fail inside tests, not while loading the suite.
async function factory() {
  const path = '../src/calculators/bazi/natalBasis';
  return (await import(path)).createBaziNatalBasisProvider as (ctx: any, options: any) => (ctx: any, options: any) => any;
}
const calculateShared = (ctx: any, config: any, provider: any) =>
  (baziModule as any).calculateBaziWithNatalBasis(ctx, config, provider);
const timelineShared = (ctx: any, options: any, provider: any) =>
  (timelineModule as any).buildTimelineWithBaziNatalBasis(ctx, options, provider);

function assertFrozen(value: unknown) {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) assertFrozen(child);
}

describe('run-local immutable bazi natal basis', () => {
  test('real analyze main chart and timeline calculate accurate natal pillars and luck only once', () => {
    // These spies delegate to the real functions; they never replace chart data.
    const p = observed(pillars, 'computePillars');
    const l = observed(pillars, 'luckCycles');
    const report = analyze(birth, { asOf: ASOF });
    expect(report.engines.find(engine => engine.engineId === 'bazi')!.errors).toEqual([]);
    expect(report.timeline.systems).toContain('bazi');
    expect(p).toHaveBeenCalledTimes(1);
    expect(l).toHaveBeenCalledTimes(1);
    expect(REPORT_SCHEMA_VERSION).toBe(7);
    expect(report).not.toHaveProperty('snapshotId');
    expect(publicCore).not.toHaveProperty('createBaziNatalBasisProvider');
    expect(publicCore).not.toHaveProperty('calculateBaziWithNatalBasis');
    expect(publicCore).not.toHaveProperty('buildTimelineWithBaziNatalBasis');
  });

  test('creation is lazy; each successful pure result is immutable and reused without freezing callers', async () => {
    const create = await factory();
    const { ctx, options } = resolved();
    const before = structuredClone(ctx);
    const p = observed(pillars, 'computePillars');
    const l = observed(pillars, 'luckCycles');
    const provider = create(ctx, options);
    const basis = provider(ctx, options);
    expect(p).not.toHaveBeenCalled();
    expect(l).not.toHaveBeenCalled();
    expect(basis.pillars).toBe(basis.pillars);
    expect(p).toHaveBeenCalledTimes(1);
    expect(l).not.toHaveBeenCalled();
    expect(basis.luckCycles).toBe(basis.luckCycles);
    expect(l).toHaveBeenCalledTimes(1);
    expect(provider(structuredClone(ctx), { ...options })).toBe(basis);
    assertFrozen(basis);
    expect(ctx).toEqual(before);
    expect(Object.isFrozen(ctx)).toBe(false);
    expect(Object.isFrozen(ctx.profile.birthplace)).toBe(false);
    expect(JSON.stringify(basis)).not.toContain('isCurrent');
    expect(basis).not.toHaveProperty('asOf');
    expect(basis).not.toHaveProperty('annual');
    expect(basis).not.toHaveProperty('monthly');
  });

  test('a retained lazy basis reads its private source copy after the caller changes input', async () => {
    const create = await factory();
    const { ctx, options } = resolved();
    const expected = pillars.computePillars(ctx, options);
    const provider = create(ctx, options);
    const basis = provider(ctx, options);
    ctx.profile.birthplace.lng += 10;
    options.useTrueSolarTime = !options.useTrueSolarTime;
    expect(basis.pillars).toEqual(expected);
    expect(() => provider(ctx, options)).toThrow('Bazi natal basis input mismatch');
  });

  test('a changed context or effective setting cannot consume another run basis', async () => {
    const create = await factory();
    const { ctx, options } = resolved();
    const provider = create(ctx, options);
    for (const changed of [
      resolved({ ...birth, minute: 11 }).ctx,
      resolved({ ...birth, gender: 'male' }).ctx,
      resolved({ ...birth, birthplace: { ...birth.birthplace!, lng: birth.birthplace!.lng + 0.000001 } }).ctx,
      resolved({ ...birth, birthplace: { ...birth.birthplace!, label: 'Different source' } }).ctx,
    ]) expect(() => provider(changed, options)).toThrow('Bazi natal basis input mismatch');
    expect(() => provider(ctx, { ...options, useTrueSolarTime: !options.useTrueSolarTime })).toThrow('Bazi natal basis input mismatch');
    expect(() => provider(ctx, { ...options, ziHourConvention: 'early' })).toThrow('Bazi natal basis input mismatch');
    ctx.profile.birthplace.lng += 1;
    expect(() => provider(ctx, options)).toThrow('Bazi natal basis input mismatch');
  });

  test('civil/solar and early/late across four midnight edges retain the independent calculation results', async () => {
    const create = await factory();
    for (const [hour, minute] of [[22, 59], [23, 0], [23, 59], [0, 0]]) {
      for (const useTrueSolarTime of [false, true]) for (const ziHourConvention of ['late', 'early'] as const) {
        const { ctx, options, birth: data } = resolved({ ...birth, hour, minute, useTrueSolarTime, ziHourConvention });
        const provider = create(ctx, options);
        const cfg = { asOf: ASOF, ...options };
        const shared = new TimeContextBaZiEngine({ ctx, ...cfg, natalBasis: provider } as any).run(data);
        const independent = new TimeContextBaZiEngine({ ctx, ...cfg }).run(data);
        expect(clean(shared)).toEqual(clean(independent));
        expect(calculateShared(ctx, cfg, provider)).toEqual(baziCalculator.calculate(ctx, cfg));
        const tlOpts = { ...cfg, systems: ['bazi'] as const, years: 1 };
        expect(timelineShared(ctx, tlOpts, provider)).toEqual(timelineModule.buildTimeline(ctx, tlOpts));
      }
    }
  }, 60_000);

  test('asOf and year ranges project independently and preserve both existing isCurrent conventions', async () => {
    const create = await factory();
    const { ctx, options, birth: data } = resolved();
    const provider = create(ctx, options);
    const basis = provider(ctx, options);
    const original = JSON.stringify(basis);
    const dates = ['2026-01-01', '2026-02-17', '2027-02-07', basis.luckCycles.startDate];
    const projected: unknown[] = [];
    for (const asOf of dates) {
      const cfg = { asOf, ...options };
      const actual = calculateShared(ctx, cfg, provider);
      expect(actual).toEqual(baziCalculator.calculate(ctx, cfg));
      const engine = new TimeContextBaZiEngine({ ctx, ...cfg, natalBasis: provider } as any).run(data);
      expect(clean(engine)).toEqual(clean(new TimeContextBaZiEngine({ ctx, ...cfg }).run(data)));
      if (asOf === basis.luckCycles.startDate) {
        expect(basis.luckCycles.startIso.slice(11)).not.toBe('00:00:00');
        expect(engine.components.find(component => component.id === 'daYun_1')!.value.isCurrent).toBe(false);
        expect(actual.chart.luckCycles[0].isCurrent).toBe(true);
      }
      projected.push(actual.chart.annualSequence);
    }
    for (const annualRange of [{ from: 2000, count: 3 }, { from: 2030, count: 1 }]) {
      const cfg = { asOf: ASOF, ...options, annualRange };
      const chart = calculateShared(ctx, cfg, provider);
      expect(chart).toEqual(baziCalculator.calculate(ctx, cfg));
      expect(chart.chart.annualSequence).toHaveLength(annualRange.count);
      expect(chart.chart.annualSequence[0].year).toBe(annualRange.from);
    }
    expect(projected[0]).not.toEqual(projected[2]);
    expect(JSON.stringify(basis)).toBe(original);
  });

  test('mutable public projections do not alias or freeze the shared natal data', async () => {
    const create = await factory();
    const { ctx, options, birth: data } = resolved();
    const provider = create(ctx, options);
    const basis = provider(ctx, options);
    const before = JSON.stringify(basis);
    const cfg = { asOf: ASOF, ...options };
    const result = calculateShared(ctx, cfg, provider);
    result.chart.pillars.day = 'changed';
    result.chart.luckCycles[0].startAgeExact.years = -100;
    result.chart.alternatives.push({ reason: 'zi_hour_convention', pillars: {}, detail: 'changed' });
    const engine = new TimeContextBaZiEngine({ ctx, ...cfg, natalBasis: provider } as any).run(data);
    const convention = (engine.meta as any).timeConvention;
    convention.clock.iso = 'changed';
    convention.monthJie.name = 'changed';
    convention.luckStart.age.years = -100;
    expect(JSON.stringify(basis)).toBe(before);
    expect(calculateShared(ctx, cfg, provider)).toEqual(baziCalculator.calculate(ctx, cfg));
  });

  test('unknown birth time does not request either natal calculation', () => {
    const p = observed(pillars, 'computePillars');
    const l = observed(pillars, 'luckCycles');
    const report = analyze({ ...birth, timeKnown: false }, { asOf: ASOF });
    expect(p).not.toHaveBeenCalled();
    expect(l).not.toHaveBeenCalled();
    expect(report.timeline.skippedSystems).toContainEqual({ system: 'bazi', reason: 'time_unknown' });
    expect(report.engines.find(engine => engine.engineId === 'bazi')!.errors).toEqual([]);
  });

  test('a transient natal failure remains an engine error and timeline can retry it', () => {
    const actual = pillars.computePillars;
    let calls = 0;
    observed(pillars, 'computePillars').mockImplementation((...args: any[]) => {
      if (++calls === 1) throw new Error('synthetic first-attempt failure');
      return actual(args[0], args[1]);
    });
    const report = analyze(birth, { asOf: ASOF });
    expect(report.engines.find(engine => engine.engineId === 'bazi')!.errors.join(' ')).toContain('synthetic first-attempt failure');
    expect(report.timeline.systems).toContain('bazi');
    expect(calls).toBe(2);
  });

  test('legacy calculation still precedes luck lookup and failed legacy chart is not promoted to a timeline throw', async () => {
    const create = await factory();
    const { ctx, options, birth: data } = resolved();
    const provider = create(ctx, options);
    const l = observed(pillars, 'luckCycles');
    observed(BaZiEngine.prototype, '_compute').mockImplementation(() => { throw new Error('synthetic legacy failure'); });
    const cfg = { asOf: ASOF, ...options };
    const engine = new TimeContextBaZiEngine({ ctx, ...cfg, natalBasis: provider } as any).run(data);
    expect(engine.errors.join(' ')).toContain('synthetic legacy failure');
    const chart = calculateShared(ctx, cfg, provider);
    expect(chart.chart.pillars).toBeNull();
    expect(chart.warnings.join(' ')).toContain('synthetic legacy failure');
    expect(l).not.toHaveBeenCalled();
  });

  test('successful pillars survive a transient luck failure but failed luck is never cached', async () => {
    const create = await factory();
    const { ctx, options } = resolved();
    const actual = pillars.luckCycles;
    const p = observed(pillars, 'computePillars');
    let attempts = 0;
    observed(pillars, 'luckCycles').mockImplementation((...args: any[]) => {
      if (++attempts === 1) throw new Error('synthetic luck failure');
      return actual(args[0], args[1], args[2]);
    });
    const basis = create(ctx, options)(ctx, options);
    const first = basis.pillars;
    expect(() => basis.luckCycles).toThrow('synthetic luck failure');
    expect(basis.pillars).toBe(first);
    expect(basis.luckCycles.steps).toHaveLength(10);
    expect(attempts).toBe(2);
    expect(p).toHaveBeenCalledTimes(1);
  });

  test('interleaved A/B/A executions and identical separate runs never share mutable state', async () => {
    const create = await factory();
    const a = resolved();
    const b = resolved({ ...birth, useTrueSolarTime: false, ziHourConvention: 'early' });
    const pa = create(a.ctx, a.options);
    const pb = create(b.ctx, b.options);
    const pa2 = create(a.ctx, a.options);
    const aa = pa(a.ctx, a.options);
    const bb = pb(b.ctx, b.options);
    expect(aa.pillars).not.toEqual(bb.pillars);
    expect(pa(a.ctx, a.options)).toBe(aa);
    expect(pa2(a.ctx, a.options)).not.toBe(aa);
    expect(pa2(a.ctx, a.options).pillars).toEqual(aa.pillars);
    const reports = await Promise.all([birth, { ...birth, ...b.options }, birth].map(async input => clean(analyze(input, { asOf: ASOF }))));
    delete reports[0].generatedAt; delete reports[2].generatedAt;
    expect(reports[0]).toEqual(reports[2]);
  });

  test('DST gap and overlap retain resolved context and independent calculation parity', async () => {
    const create = await factory();
    for (const [month, day, hour, flag] of [[3, 8, 2, 'dst_gap'], [11, 1, 1, 'dst_overlap']] as const) {
      const { ctx, options } = resolved({ ...birth, year: 2026, month, day, hour, minute: 30,
        birthplace: { label: 'Synthetic NY', lat: 40.7, lng: -74, timezone: 'America/New_York' } });
      expect(ctx.flags.some(item => item.code === flag)).toBe(true);
      const provider = create(ctx, options);
      expect(calculateShared(ctx, { asOf: ASOF, ...options }, provider)).toEqual(baziCalculator.calculate(ctx, { asOf: ASOF, ...options }));
    }
  });

  test('serialized pure natal basis is identical across host timezones', async () => {
    await factory();
    const base = new URL('../src/', import.meta.url).pathname;
    const script = `import { resolveCalculationSpec } from ${JSON.stringify(base + 'core/calculationSpec.ts')};
      import { createTimeContext } from ${JSON.stringify(base + 'time/createTimeContext.ts')};
      import { createBaziNatalBasisProvider } from ${JSON.stringify(base + 'calculators/bazi/natalBasis.ts')};
      const r = resolveCalculationSpec(${JSON.stringify(birth)});
      const ctx = createTimeContext(r.profile, { dstOverlap: r.spec.identity.settings.time.dstOverlap });
      console.log(JSON.stringify(createBaziNatalBasisProvider(ctx, r.options)(ctx, r.options)));`;
    const outputs = ['UTC', 'Asia/Taipei', 'America/New_York', 'Pacific/Apia'].map(TZ => {
      const result = Bun.spawnSync([process.execPath, '--eval', script], { env: { ...process.env, TZ } });
      expect(result.exitCode).toBe(0);
      return result.stdout.toString().trim();
    });
    expect(new Set(outputs).size).toBe(1);
  });
});
