import { describe, expect, test } from 'bun:test';
import { analyze } from '../src/core/analyze.js';
import {
  CALCULATORS,
  baziCalculator,
  mingGuaCalculator,
  numerologyCalculator,
  runCalculators,
  timeContextToBirthData,
  tzolkinCalculator,
  ziweiCalculator,
  type BaziChart,
  type NumerologyChart,
  type TzolkinChart,
  type ZiweiChart,
} from '../src/calculators/index';
import type { BirthProfile } from '../src/profile/index';
import { createTimeContext } from '../src/time/index';

const ASOF = '2026-07-11';
const TAIPEI = { label: 'Taipei, Taiwan', lat: 25.0375, lng: 121.5637, timezone: 'Asia/Taipei' };
const TAINAN = { label: 'Tainan, Taiwan', lat: 22.9922, lng: 120.1848, timezone: 'Asia/Taipei' };

type Case = { label: string; profile: BirthProfile };

const CASES: Case[] = [
  {
    label: '1991-10-05 14:00 female Taipei',
    profile: { date: '1991-10-05', time: '14:00', timeAccuracy: 'exact', gender: 'female', name: 'Mei Lin', birthplace: TAIPEI },
  },
  {
    label: '1995-07-16 22:00 male Tainan',
    profile: { date: '1995-07-16', time: '22:00', timeAccuracy: 'exact', gender: 'male', birthplace: TAINAN },
  },
  {
    label: '1986-05-29 08:00 male Taipei',
    profile: { date: '1986-05-29', time: '08:00', timeAccuracy: 'exact', gender: 'male', name: 'Chen', birthplace: TAIPEI },
  },
];

/** The raw analyze() input equivalent to a profile. */
function rawInput(p: BirthProfile) {
  const [year, month, day] = p.date.split('-').map(Number);
  const [hour, minute] = p.time === null ? [12, 0] : p.time.split(':').map(Number);
  return {
    year,
    month,
    day,
    hour,
    minute,
    ...(p.time === null ? { timeKnown: false } : {}),
    gender: p.gender,
    name: p.name ?? '',
    longitude: p.birthplace.lng,
    latitude: p.birthplace.lat,
  };
}

const ENGINE_ID = { bazi: 'bazi', ziwei: 'ziwei', numerology: 'numerology', tzolkin: 'dreamspell', mingGua: 'minggua' } as const;

describe('calculator adapters: parity with analyze()', () => {
  for (const { label, profile } of [
    ...CASES,
    { label: 'time unknown', profile: { ...CASES[0].profile, time: null, timeAccuracy: 'unknown' } as BirthProfile },
  ]) {
    test(label, () => {
      // Report v4 (D-032): analyze() runs 紫微 exactly like ziweiCalculator (true solar
      // time by default), while baziCalculator.components are still the legacy
      // civil-clock engine output — which analyze() reproduces with useTrueSolarTime:false.
      const report = analyze(rawInput(profile), { asOf: ASOF });
      const civil = analyze({ ...rawInput(profile), useTrueSolarTime: false }, { asOf: ASOF });
      const results = runCalculators(createTimeContext(profile), { asOf: ASOF });
      expect(results.map((r) => r.system)).toEqual(['bazi', 'ziwei', 'numerology', 'tzolkin', 'mingGua']);
      for (const r of results) {
        const source = r.system === 'bazi' ? civil : report;
        const engine = source.engines.find((e: { engineId: string }) => e.engineId === ENGINE_ID[r.system as keyof typeof ENGINE_ID]);
        expect(engine).toBeDefined();
        expect(r.components).toEqual(engine.components);
        expect(r.components.length).toBe(engine.components.length);
      }
    }, 30_000);
  }

  test('timeContextToBirthData mirrors the raw input', () => {
    for (const { profile } of CASES) {
      const bd = timeContextToBirthData(createTimeContext(profile));
      expect(bd.toJSON()).toEqual({ ...rawInput(profile), timeKnown: true });
    }
  });
});

describe('typed charts', () => {
  const ctx = createTimeContext(CASES[2].profile);

  test('bazi pillars 1986-05-29 08:00 = 丙寅/癸巳/癸酉/丙辰', () => {
    const r = baziCalculator.calculate(ctx, { asOf: ASOF });
    const chart = r.chart as BaziChart;
    expect(chart.pillars).toEqual({ year: '丙寅', month: '癸巳', day: '癸酉', hour: '丙辰' });
    expect(chart.dayMaster).toEqual({ stem: '癸', element: '水', yinYang: '陰' });
    expect(chart.luckCycles).toHaveLength(10);
    expect(chart.luckCycles.filter((c) => c.isCurrent)).toHaveLength(1);
    expect(chart.annual).toEqual({ year: 2026, ganZhi: '丙午' });
    expect(r.system).toBe('bazi');
    expect(r.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test('ziwei: 12 palaces, soul/body palace, bureau, decades', () => {
    const chart = ziweiCalculator.calculate(ctx, { asOf: ASOF }).chart as ZiweiChart;
    expect(chart.palaces).toHaveLength(12);
    expect(chart.soulPalace?.name).toBe('命宮');
    expect(chart.bodyPalace).not.toBeNull();
    expect(chart.fiveElementBureau).toMatch(/局$/);
    expect(chart.soulMaster).toBeTruthy();
    expect(chart.natalTransformations.map((t): string => t.mutagen).sort()).toEqual(['忌', '權', '祿', '科'].sort());
    const flat = chart.palaces.flatMap((p) => p.transformations.map((t) => t.star)).sort();
    expect(flat).toEqual(chart.natalTransformations.map((t) => t.star).sort());
    expect(chart.decades).toHaveLength(12);
    expect(chart.decades.filter((d) => d.isCurrent)).toHaveLength(1);
    expect(chart.palaces.every((p) => p.decadeRange !== null)).toBe(true);
  });

  test('numerology & tzolkin & mingGua charts', () => {
    const num = numerologyCalculator.calculate(ctx, { asOf: ASOF }).chart as NumerologyChart;
    // 1986→24→6, 5, 29→11 (master kept): 6+5+11 = 22 (master)
    expect(num.lifePath).toEqual({ number: 22, isMaster: true, display: '22/4' });
    expect(num.pinnacles).toHaveLength(4);
    expect(num.personalYear?.year).toBe(2026);
    expect(Object.keys(num.personalYears)).toHaveLength(9);

    const tz = tzolkinCalculator.calculate(ctx).chart as TzolkinChart;
    expect(tz.kin).toBeGreaterThanOrEqual(1);
    expect(tz.tone?.number).toBe(((tz.kin! - 1) % 13) + 1);
    expect(tz.oracle?.destiny.kin).toBe(tz.kin);
    expect(tz.castle).not.toBeNull();

    const mg = mingGuaCalculator.calculate(ctx);
    expect(mg.chart.gua?.yearForGua).toBe(1986);
    expect(Object.keys(mg.chart.directions!.auspicious)).toHaveLength(4);
    expect(mg.warnings).toEqual([]);
  });
});

describe('determinism & time unknown', () => {
  test('two runs are deep-equal', () => {
    for (const { profile } of CASES) {
      const a = runCalculators(createTimeContext(profile), { asOf: ASOF });
      const b = runCalculators(createTimeContext(profile), { asOf: ASOF });
      expect(a).toEqual(b);
    }
  });

  test('time null → time-requiring systems warn with empty charts; others compute', () => {
    const profile: BirthProfile = { ...CASES[0].profile, time: null, timeAccuracy: 'unknown' };
    const results = runCalculators(createTimeContext(profile), { asOf: ASOF });
    for (const r of results) {
      const calc = CALCULATORS.find((c) => c.id === r.system)!;
      if (calc.requires.time) {
        expect(r.warnings).toContain('time_unknown');
        expect(r.components).toEqual([]);
      } else {
        expect(r.warnings).not.toContain('time_unknown');
        expect(r.components.length).toBeGreaterThan(0);
      }
    }
    const bazi = results[0].chart as BaziChart;
    expect(bazi).toEqual({ pillars: null, dayMaster: null, fiveElements: null, tenGods: null, luckCycles: [], annual: null });
    const ziwei = results[1].chart as ZiweiChart;
    expect(ziwei.palaces).toEqual([]);
    expect(ziwei.soulPalace).toBeNull();
    expect((results[2].chart as NumerologyChart).lifePath).not.toBeNull();
    expect((results[3].chart as TzolkinChart).kin).not.toBeNull();
  });

  test('asOf is required for time-dependent calculators (no clock)', () => {
    const ctx = createTimeContext(CASES[0].profile);
    expect(() => baziCalculator.calculate(ctx)).toThrow(/asOf/);
    expect(() => ziweiCalculator.calculate(ctx)).toThrow(/asOf/);
    expect(() => numerologyCalculator.calculate(ctx)).toThrow(/asOf/);
    expect(() => tzolkinCalculator.calculate(ctx)).not.toThrow();
  });

  test('boundary flags on the civil clock become warnings', () => {
    const ctx = createTimeContext({ ...CASES[0].profile, time: '23:30' });
    expect(baziCalculator.calculate(ctx, { asOf: ASOF }).warnings).toContain('zi_hour_convention');
    expect(ziweiCalculator.calculate(ctx, { asOf: ASOF }).warnings).toContain('zi_hour_convention');
  });
});

describe('mingGua exact 立春 (V1-08) through the adapter', () => {
  test('立春 day with unknown time warns near_jie_boundary; other days do not', () => {
    const base: BirthProfile = { date: '2026-02-04', time: null, timeAccuracy: 'unknown', gender: 'female', birthplace: TAIPEI };
    const onLichun = mingGuaCalculator.calculate(createTimeContext(base));
    expect(onLichun.warnings).toContain('near_jie_boundary');
    const known = mingGuaCalculator.calculate(createTimeContext({ ...base, time: '12:00', timeAccuracy: 'exact' }));
    expect(known.warnings).not.toContain('near_jie_boundary');
    const otherDay = mingGuaCalculator.calculate(createTimeContext({ ...base, date: '2026-02-06' }));
    expect(otherDay.warnings).toEqual([]);
  });
});
