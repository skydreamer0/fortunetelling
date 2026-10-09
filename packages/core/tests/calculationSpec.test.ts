import { describe, expect, test } from 'bun:test';
import * as core from '../src/index';
import { resolveAnalyzeInput } from '../src/core/analyzeInput';
import { canonicalZoneName } from '../src/time/tzdb/index';

// Dynamic access keeps the pre-implementation checkpoint executable: the baseline
// fails on the missing contract rather than a missing import/export at load time.
const createSpec = (input: Parameters<typeof core.analyze>[0]): any =>
  (core as any).createCalculationSpec(input);
const birth = {
  year: 1990, month: 5, day: 17, hour: 23, minute: 10, gender: 'female' as const,
  name: 'ALICE',
  birthplace: { label: 'Synthetic birthplace', lat: 22.9999, lng: 119.2269, timezone: 'Asia/Taipei' },
};
const hash = (input: Parameters<typeof core.analyze>[0]) => createSpec(input).specHash;

function assertFrozen(value: unknown) {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) assertFrozen(child);
}

describe('CalculationSpec v1: analyze-sync natal intent only', () => {
  test('public factory is available without changing Report schema', () => {
    expect(typeof (core as any).createCalculationSpec).toBe('function');
    expect(core.REPORT_SCHEMA_VERSION).toBe(7);
  });
  test('materializes only supported effective choices with separate system conventions', () => {
    const spec = createSpec(birth);
    expect(spec.schemaVersion).toBe(1);
    expect(spec.identity.scope).toBe('analyze-sync-natal-intent');
    expect(spec.identity.input).toEqual({
      date: '1990-05-17', time: '23:10', timeAccuracy: 'exact', gender: 'female',
      name: 'ALICE', lat: 22.9999, lng: 119.2269, timezone: 'Asia/Taipei',
    });
    expect(spec.identity.settings.time).toEqual({ dstOverlap: 'earlier', dstGap: 'shift-forward-by-gap' });
    expect(spec.identity.settings.bazi).toEqual({
      clock: 'trueSolar', ziHourConvention: 'late', dayBoundarySect: 2, yearMonthBasis: 'jie-instant',
    });
    expect(spec.identity.settings.ziwei).toEqual({
      clock: 'trueSolar', ziHourConvention: 'splitMidnight', fixLeap: true, language: 'zh-TW',
    });
    expect(spec.identity.settings.ephemeris).toEqual({ mode: 'excluded', systems: ['jyotish', 'humanDesign'] });
    expect(spec.specHash).toMatch(/^cs1-[0-9a-f]{16}$/);
  });
  test('aliases and explicit defaults share identity but retain exact source spelling and omissions', () => {
    const omitted = createSpec(birth);
    const explicit = createSpec({ ...birth, useTrueSolarTime: true, ziHourConvention: 'late' });
    const alias = createSpec({ ...birth, useTrueSolarTime: true, ziHourConvention: 'splitMidnight' });
    expect(omitted.specHash).toBe(explicit.specHash);
    expect(alias.specHash).toBe(explicit.specHash);
    expect(omitted.source.input).not.toHaveProperty('ziHourConvention');
    expect(alias.source.input.ziHourConvention).toBe('splitMidnight');
    expect(hash({ ...birth, ziHourConvention: 'early' })).toBe(hash({ ...birth, ziHourConvention: 'nextDayAt23' }));
    expect(hash({ ...birth, ziHourConvention: 'early' })).not.toBe(omitted.specHash);
  });
  test('zone aliases and case use the bundled canonical name, preserving source', () => {
    expect(canonicalZoneName('asia/taipei')).toBe('Asia/Taipei');
    const lower = createSpec({ ...birth, birthplace: { ...birth.birthplace, timezone: 'asia/taipei' } });
    expect(lower.specHash).toBe(hash(birth));
    expect(lower.source.input.birthplace.timezone).toBe('asia/taipei');
    const canonical = { ...birth, birthplace: { ...birth.birthplace, timezone: 'America/New_York' } };
    const linked = { ...birth, birthplace: { ...birth.birthplace, timezone: 'US/Eastern' } };
    expect(hash(linked)).toBe(hash(canonical));
  });
  test('every effective input dimension changes identity, including exact sub-rounding coordinates and name', () => {
    const original = hash(birth);
    for (const variant of [
      { ...birth, day: 18 }, { ...birth, hour: 22 }, { ...birth, minute: 11 },
      { ...birth, gender: 'male' as const }, { ...birth, name: 'BOB' },
      { ...birth, timeAccuracy: 'approx15m' as const },
      { ...birth, birthplace: { ...birth.birthplace, lat: birth.birthplace.lat + 0.000001 } },
      { ...birth, birthplace: { ...birth.birthplace, lng: birth.birthplace.lng + 0.000001 } },
      { ...birth, birthplace: { ...birth.birthplace, timezone: 'Asia/Tokyo' } },
      { ...birth, useTrueSolarTime: false }, { ...birth, ziHourConvention: 'early' as const },
    ]) expect(hash(variant)).not.toBe(original);
  });
  test('label and source route are not calculation identity', () => {
    expect(hash({ ...birth, birthplace: { ...birth.birthplace, label: 'Another label' } })).toBe(hash(birth));
    const { birthplace, ...fields } = birth;
    expect(hash({ ...fields, longitude: birthplace.lng, latitude: birthplace.lat })).toBe(hash(birth));
    const a = createSpec({ year: 1990, month: 5, day: 17 });
    const b = createSpec({ year: 1990, month: 5, day: 17, birthplace: {
      ...resolveAnalyzeInput({ year: 1990, month: 5, day: 17 }).profile.birthplace,
    } });
    expect(a.specHash).toBe(b.specHash);
    expect(a.source.birthplaceSource).toBe('default');
    expect(b.source.birthplaceSource).toBe('birthplace');
  });
  test('unknown time is null, not the arbitrary retained hour/minute', () => {
    const a = createSpec({ ...birth, timeKnown: false, hour: 2, minute: 3 });
    const b = createSpec({ ...birth, timeKnown: false, hour: 19, minute: 59 });
    expect(a.identity.input.time).toBeNull();
    expect(a.identity.input.timeAccuracy).toBe('unknown');
    expect(a.specHash).toBe(b.specHash);
    expect(a.specHash).not.toBe(hash(birth));
    expect(a.source.input.hour).toBe(2);
    expect(b.source.input.hour).toBe(19);
  });
  test('source and effective trees are deeply copied/frozen without freezing caller data', () => {
    const input = structuredClone(birth);
    const before = structuredClone(input);
    const spec = createSpec(input);
    assertFrozen(spec);
    expect(input).toEqual(before);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(input.birthplace)).toBe(false);
    input.birthplace.lng = 100;
    input.name = 'Changed';
    expect(spec.identity.input.lng).toBe(before.birthplace.lng);
    expect(spec.source.input.birthplace.lng).toBe(before.birthplace.lng);
    expect(spec.identity.input.name).toBe('ALICE');
  });
  test('BirthData source declares that constructor defaults have already been applied', () => {
    const input = new core.BirthData({ year: 1990, month: 5, day: 17 });
    const spec = createSpec(input);
    expect(spec.source.kind).toBe('BirthData');
    expect(spec.source.input).toEqual(input.toJSON());
    expect(spec.identity.input.time).toBe('12:00');
    expect(Object.isFrozen(input)).toBe(false);
  });
  test('run metadata and period context never enter the natal intent identity', () => {
    const a = createSpec({ ...birth, asOf: '2026-01-01', generatedAt: '2026-01-01', unrelated: 'not retained' } as any);
    const b = createSpec({ ...birth, asOf: '2028-01-01', generatedAt: '2028-01-01' } as any);
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).not.toContain('generatedAt');
    expect(JSON.stringify(a)).not.toContain('asOf');
    expect(JSON.stringify(a)).not.toContain('unrelated');
  });
  test('input key order does not affect the full deterministic specification', () => {
    const { name, birthplace, ...rest } = birth;
    expect(createSpec({ name, birthplace, ...rest })).toEqual(createSpec(birth));
  });
  test('invalid enum/prototype option names fail at the shared entry before any calculation', () => {
    for (const ziHourConvention of ['toString', 'constructor', '__proto__', 'garbage', 1, {}]) {
      expect(() => resolveAnalyzeInput({ ...birth, ziHourConvention })).toThrow('Invalid ziHourConvention');
      expect(() => createSpec({ ...birth, ziHourConvention } as any)).toThrow();
    }
    for (const useTrueSolarTime of ['false', 0, {}]) expect(() => createSpec({ ...birth, useTrueSolarTime } as any)).toThrow();
  });
  test('versions identify code, calculators, dependency integrity, bundled time data and rule contents', () => {
    const versions = createSpec(birth).identity.versions;
    expect(versions.core).toBe(core.VERSION);
    expect(versions.contract).toBe(1);
    expect(Object.keys(versions.calculators).sort()).toEqual(['bazi', 'mingGua', 'numerology', 'tzolkin', 'ziwei']);
    expect(versions.data.tzdb).toMatch(/^\d{4}[a-z]$/);
    expect(Object.keys(versions.dependencies).sort()).toEqual([
      '@babel/runtime', 'dayjs', 'i18next', 'iztro', 'lunar-javascript', 'lunar-lite', 'lunar-typescript',
    ]);
    for (const entry of Object.values(versions.dependencies) as any[]) {
      expect(entry.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(entry.integrity).toStartWith('sha512-');
    }
    expect(Object.keys(versions.rules).sort()).toEqual(['bazi', 'baziTenGod', 'numerology', 'ziwei', 'ziweiModifiers', 'ziweiTraits']);
    for (const value of Object.values(versions.rules)) expect(value).toMatch(/^fnv1a64-[0-9a-f]{16}$/);
  });
  test('real analyze engines and timeline still consume the spec effective settings at a cross-hour fixture', () => {
    for (const useTrueSolarTime of [true, false]) for (const ziHourConvention of ['late', 'early'] as const) {
      const input = { ...birth, useTrueSolarTime, ziHourConvention };
      const spec = createSpec(input);
      const report = core.analyze(input, { asOf: '2026-07-11' });
      expect(report.timeContext.conventions.bazi.dayHourClock).toBe(spec.identity.settings.bazi.clock);
      expect(report.timeContext.conventions.bazi.ziHourConvention).toBe(spec.identity.settings.bazi.ziHourConvention);
      expect(report.timeContext.conventions.ziwei.ziHourConvention).toBe(spec.identity.settings.ziwei.ziHourConvention);
      expect(report.timeContext.conventions.timeline.clock).toBe(spec.identity.settings.bazi.clock);
    }
    const crossing = { year: 2026, month: 2, day: 15, hour: 13, minute: 3, gender: 'male' as const };
    const civil = core.analyze({ ...crossing, useTrueSolarTime: false }, { asOf: '2026-07-11' });
    const solar = core.analyze({ ...crossing, useTrueSolarTime: true }, { asOf: '2026-07-11' });
    const natal = (report: typeof civil) => report.engines.find(e => e.engineId === 'bazi')?.components.find(c => c.id === 'natal')?.value;
    expect(natal(civil)).not.toEqual(natal(solar));
  }, 60_000);
  test('22:59/23:00/23:59/00:00 preserve explicit clock and convention identities', () => {
    for (const [hour, minute] of [[22, 59], [23, 0], [23, 59], [0, 0]]) {
      const input = { ...birth, hour, minute };
      const values = [true, false].flatMap(useTrueSolarTime =>
        ['late', 'early'].map(ziHourConvention => hash({ ...input, useTrueSolarTime, ziHourConvention } as any)));
      expect(new Set(values).size).toBe(4);
    }
  });
});

describe('CalculationSpec version and host independence guards', () => {
  test('locked dependency manifest is the exact complete sync calculation closure', async () => {
    const lockText = await Bun.file(new URL('../../../bun.lock', import.meta.url)).text();
    // bun.lock is JSONC with trailing commas; this lock contains no comments.
    const lock = JSON.parse(lockText.replace(/,\s*([}\]])/g, '$1'));
    const pkg = await Bun.file(new URL('../package.json', import.meta.url)).json();
    expect(pkg.version).toBe(core.VERSION);
    expect(lock.workspaces['packages/core'].version).toBe(core.VERSION);
    const versions = createSpec(birth).identity.versions;
    const seen = new Set<string>();
    function visit(name: string) {
      if (seen.has(name)) return;
      seen.add(name);
      const entry = lock.packages[name];
      expect(entry).toBeDefined();
      expect(versions.dependencies[name]).toEqual({
        version: entry[0].slice(name.length + 1), integrity: entry.at(-1),
      });
      for (const dependency of Object.keys(entry[2].dependencies ?? {})) visit(dependency);
    }
    visit('iztro');
    visit('lunar-javascript');
    expect([...seen].sort()).toEqual(Object.keys(versions.dependencies).sort());
  });
  test('every version dimension contributes to specHash with no caller override API', async () => {
    const { hashCalculationIdentity } = await import('../src/core/calculationSpec');
    const spec = createSpec(birth);
    expect(hashCalculationIdentity(spec.identity)).toBe(spec.specHash);
    const paths = [
      ['contract'], ['core'],
      ...Object.keys(spec.identity.versions.calculators).map(key => ['calculators', key]),
      ...Object.keys(spec.identity.versions.dependencies).flatMap(key =>
        [['dependencies', key, 'version'], ['dependencies', key, 'integrity']]),
      ['data', 'tzdb'],
      ...Object.keys(spec.identity.versions.rules).map(key => ['rules', key]),
    ];
    for (const path of paths) {
      const identity = structuredClone(spec.identity);
      let target = identity.versions;
      for (const key of path.slice(0, -1)) target = target[key];
      const key = path.at(-1)!;
      target[key] = typeof target[key] === 'number' ? target[key] + 1 : target[key] + '-changed';
      expect(hashCalculationIdentity(identity)).not.toBe(spec.specHash);
    }
  });
  test('same identity across process host zones, including a date skipped only on one host', () => {
    const input = { ...birth, year: 2011, month: 12, day: 30 };
    const modulePath = new URL('../src/index.ts', import.meta.url).href;
    const script = `import { createCalculationSpec } from ${JSON.stringify(modulePath)}; console.log(JSON.stringify(createCalculationSpec(${JSON.stringify(input)})));`;
    const results = ['UTC', 'Asia/Taipei', 'America/New_York', 'Pacific/Apia'].map(TZ => {
      const result = Bun.spawnSync([process.execPath, '--eval', script], { env: { ...process.env, TZ } });
      expect(result.exitCode).toBe(0);
      return result.stdout.toString().trim();
    });
    expect(new Set(results).size).toBe(1);
    expect(JSON.parse(results[0])).toEqual(createSpec(input));
  });
  test('DST gap/overlap raw wall time remains explicit and is never silently reinterpreted by the spec', () => {
    const birthplace = { label: 'Synthetic NY', lat: 40.7, lng: -74, timezone: 'America/New_York' };
    for (const input of [
      { year: 2026, month: 3, day: 8, hour: 2, minute: 30 },
      { year: 2026, month: 11, day: 1, hour: 1, minute: 30 },
    ]) {
      const spec = createSpec({ ...input, birthplace });
      expect(spec.identity.input.time).toBe(input.hour === 2 ? '02:30' : '01:30');
      expect(spec.source.input.hour).toBe(input.hour);
      expect(spec.identity.settings.time).toEqual({ dstOverlap: 'earlier', dstGap: 'shift-forward-by-gap' });
    }
  });
});
