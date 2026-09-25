import { describe, expect, test } from 'bun:test';
import { Solar } from 'lunar-javascript';
import { BaZiEngine } from '../src/engines/BaZiEngine';
import {
  BAZI_CALCULATOR_VERSION,
  baziCalculator,
  extractBaziChart,
  toBaziRuleChart,
  type BaziChart,
} from '../src/calculators/bazi/calculator';
import { annualPillars, computePillars, luckCycles, monthlyPillars, yearMonthAt } from '../src/calculators/bazi/pillars';
import { timeContextToBirthData } from '../src/calculators/birthData';
import type { BirthProfile } from '../src/profile/index';
import { evaluateBaziRules } from '../src/rules/bazi/evaluate';
import { createTimeContext } from '../src/time/index';
import { solarTermsAround } from '../src/time/solarTerms';

const ASOF = '2026-07-11';
const TAIPEI = { label: 'Taipei, Taiwan', lat: 25.0375, lng: 121.5637, timezone: 'Asia/Taipei' };
const TAINAN = { label: 'Tainan, Taiwan', lat: 22.9922, lng: 120.1848, timezone: 'Asia/Taipei' };
const NEW_YORK = { label: 'New York, USA', lat: 40.7128, lng: -74.006, timezone: 'America/New_York' };

function ctxOf(date: string, time: string, birthplace = TAIPEI, gender: 'male' | 'female' = 'male') {
  const profile: BirthProfile = { date, time, timeAccuracy: 'exact', gender, birthplace };
  return createTimeContext(profile);
}

function legacyRun(ctx: ReturnType<typeof ctxOf>) {
  return new BaZiEngine({ asOf: ASOF }).run(timeContextToBirthData(ctx));
}

function legacyPillars(ctx: ReturnType<typeof ctxOf>) {
  return extractBaziChart(legacyRun(ctx).components as any).pillars;
}

describe('golden charts', () => {
  test('1986-05-29 08:00 Taipei: civil (legacy parity) and true solar agree — 丙寅/癸巳/癸酉/丙辰', () => {
    const ctx = ctxOf('1986-05-29', '08:00');
    const expected = { year: '丙寅', month: '癸巳', day: '癸酉', hour: '丙辰' };
    expect(computePillars(ctx, { useTrueSolarTime: false }).pillars).toEqual(expected);
    expect(legacyPillars(ctx)).toEqual(expected);
    // lng 121.56 → LMT +6 min, EoT late May ≈ +2.7 min → true solar 08:09, still 辰時.
    expect(ctx.solar!.trueSolarIso).toBe('1986-05-29T08:09:00');
    const ts = computePillars(ctx);
    expect(ts.pillars).toEqual(expected);
    expect(ts.clock).toEqual({ basis: 'trueSolar', iso: '1986-05-29T08:09:00' });
    expect(ts.alternatives).toEqual([]);

    const r = baziCalculator.calculate(ctx, { asOf: ASOF });
    expect(r.version).toBe('1.0.0');
    expect(BAZI_CALCULATOR_VERSION).toBe('1.0.0');
    expect(baziCalculator.requires).toEqual({ time: true, location: true, name: false });
    expect(r.chart.pillars).toEqual(expected);
    expect(r.warnings).toEqual([]);
  });

  test('Tainan 1995-07-16 22:00 → 乙亥/癸未/戊申/癸亥 (true solar 21:54 is still 亥時)', () => {
    const ctx = ctxOf('1995-07-16', '22:00', TAINAN);
    const expected = { year: '乙亥', month: '癸未', day: '戊申', hour: '癸亥' };
    expect(ctx.solar!.trueSolarIso).toBe('1995-07-16T21:54:44');
    expect(computePillars(ctx).pillars).toEqual(expected);
    expect(computePillars(ctx, { useTrueSolarTime: false }).pillars).toEqual(expected);
    expect(legacyPillars(ctx)).toEqual(expected);
  });

  test('true solar changes the hour pillar: Taipei 2026-02-15 13:03 civil → 12:55 true solar → 午 not 未', () => {
    const ctx = ctxOf('2026-02-15', '13:03');
    // EoT mid-February ≈ −14.1 min, LMT +6.25 min.
    expect(ctx.solar!.trueSolarIso).toBe('2026-02-15T12:55:07');
    const civil = computePillars(ctx, { useTrueSolarTime: false });
    expect(civil.pillars.hour).toBe('癸未');
    expect(civil.pillars).toEqual(legacyPillars(ctx)!);
    const ts = computePillars(ctx);
    expect(ts.pillars).toEqual({ year: '丙午', month: '庚寅', day: '庚申', hour: '壬午' });
    expect(ts.alternatives).toEqual([
      {
        reason: 'near_shichen_boundary',
        pillars: { year: '丙午', month: '庚寅', day: '庚申', hour: '癸未' },
        detail: 'trueSolar clock 2026-02-15T13:00:00 (boundary 13:00)',
      },
    ]);

    const r = baziCalculator.calculate(ctx, { asOf: ASOF });
    expect(r.chart.pillars!.hour).toBe('壬午');
    expect(r.chart.civilPillars!.hour).toBe('癸未');
    expect(r.warnings).toEqual(['near_shichen_boundary', 'pillars_differ_from_civil']);
    // components stay the legacy (civil) engine output.
    expect(r.components).toEqual(legacyRun(ctx).components as any);
    // chart stats follow the true-solar pillars (午 hides 丁己, 未 hides 己丁乙).
    expect(r.chart.fiveElements!.木).toBe(extractBaziChart(r.components).fiveElements!.木 - 1);
  });
});

describe('子時 convention', () => {
  test('23:30 birth: early (sect=1) vs late (sect=2) day pillars differ; flag-driven alternative', () => {
    const ctx = ctxOf('1991-10-05', '23:30');
    expect(ctx.flags.find((f) => f.code === 'zi_hour_convention')).toBeDefined();
    const late = computePillars(ctx);
    const early = computePillars(ctx, { ziHourConvention: 'early' });
    expect(late.conventions.sect).toBe(2);
    expect(early.conventions.sect).toBe(1);
    expect(late.pillars).toEqual({ year: '辛未', month: '丁酉', day: '戊申', hour: '甲子' });
    expect(early.pillars).toEqual({ year: '辛未', month: '丁酉', day: '己酉', hour: '甲子' });
    expect(late.alternatives).toEqual([{ reason: 'zi_hour_convention', pillars: early.pillars, detail: "ziHourConvention 'early'" }]);
    expect(early.alternatives).toEqual([{ reason: 'zi_hour_convention', pillars: late.pillars, detail: "ziHourConvention 'late'" }]);
    // default 'late' equals the legacy engine (sect=2).
    expect(computePillars(ctx, { useTrueSolarTime: false }).pillars).toEqual(legacyPillars(ctx)!);
    expect(baziCalculator.calculate(ctx, { asOf: ASOF }).warnings).toContain('zi_hour_convention');
  });

  test('invalid convention throws', () => {
    expect(() => computePillars(ctxOf('1991-10-05', '23:30'), { ziHourConvention: 'noon' as any })).toThrow(RangeError);
  });
});

describe('節 boundary (exact instants)', () => {
  // 立春 2026 = 2026-02-03T20:02:08Z = 2026-02-04 04:02:08 Taipei.
  test('30 min before / after 立春 2026 → different year AND month pillar', () => {
    const before = computePillars(ctxOf('2026-02-04', '03:32'));
    const after = computePillars(ctxOf('2026-02-04', '04:32'));
    expect([before.pillars.year, before.pillars.month]).toEqual(['乙巳', '己丑']);
    expect([after.pillars.year, after.pillars.month]).toEqual(['丙午', '庚寅']);
    expect(after.monthJie.utcIso).toBe('2026-02-03T20:02:08Z');
    expect(after.solarYear).toBe(2026);
    expect(before.solarYear).toBe(2025);
  });

  test('within tolerance → near_jie_boundary alternative on the other side', () => {
    const ctx = ctxOf('2026-02-04', '03:52'); // 10 min before 立春
    const r = computePillars(ctx);
    expect([r.pillars.year, r.pillars.month]).toEqual(['乙巳', '己丑']);
    expect(r.alternatives).toHaveLength(1);
    expect(r.alternatives[0].reason).toBe('near_jie_boundary');
    expect(r.alternatives[0].pillars).toEqual({ ...r.pillars, year: '丙午', month: '庚寅' });
  });

  test('New York birth near 驚蟄 2026: decided by the UTC instant, not a foreign wall clock', () => {
    const jingzhe = solarTermsAround(Date.UTC(2026, 2, 5)).find((t) => t.name === '惊蛰' && t.utcMs > Date.UTC(2026, 0, 1))!;
    expect(new Date(jingzhe.utcMs).toISOString()).toBe('2026-03-05T13:59:00.000Z'); // = 08:59 EST
    const before = ctxOf('2026-03-05', '08:29', NEW_YORK);
    const after = ctxOf('2026-03-05', '09:29', NEW_YORK);
    expect(after.utc!.iso).toBe('2026-03-05T14:29:00Z');
    expect(computePillars(before).pillars.month).toBe('庚寅');
    expect(computePillars(after).pillars.month).toBe('辛卯');
    expect(computePillars(after).pillars.year).toBe('丙午');
    // The naive method — NY wall clock fed into lunar-javascript (節 on UTC+8) —
    // sees 09:29 < 21:59 CST and gets the month wrong.
    const naive = Solar.fromYmdHms(2026, 3, 5, 9, 29, 0).getLunar().getEightChar();
    expect(naive.getMonth()).toBe('庚寅');
    // The legacy engine (which reads the wall clock as Taipei) has exactly that bug.
    expect(legacyPillars(after)!.month).toBe('庚寅');
  });

  test('year/month by instant equal lunar-javascript for UTC+8 wall clocks', () => {
    for (let i = 0; i < 40; i++) {
      const ms = Date.UTC(1980, 0, 1) + i * 1_234_567_891 * 3; // deterministic spread 1980–2030
      const cst = new Date(ms + 8 * 3_600_000);
      const ec = Solar.fromYmdHms(cst.getUTCFullYear(), cst.getUTCMonth() + 1, cst.getUTCDate(), cst.getUTCHours(), cst.getUTCMinutes(), cst.getUTCSeconds())
        .getLunar()
        .getEightChar();
      const ym = yearMonthAt(Math.floor(ms / 1000) * 1000);
      expect([ym.year, ym.month]).toEqual([ec.getYear(), ec.getMonth()]);
    }
  });
});

describe('Taiwan DST', () => {
  test('1974-07-01 12:00 (DST, UTC+9) → standard 11:00 → true solar 11:02:38 → 午時, with a 巳時 alternative', () => {
    const ctx = ctxOf('1974-07-01', '12:00');
    expect(ctx.local!.dst).toBe(true);
    expect(ctx.utc!.iso).toBe('1974-07-01T03:00:00Z'); // 11:00 Taiwan standard time
    expect(ctx.solar!.trueSolarIso).toBe('1974-07-01T11:02:38');
    const ts = computePillars(ctx);
    // The DST-naive wall clock (12:00) sits mid-午時; the corrected clock is only
    // 2.6 min past the 巳/午 boundary, so the chart is 午 but flagged with 巳 as alternative.
    expect(ts.pillars).toEqual({ year: '甲寅', month: '庚午', day: '癸卯', hour: '戊午' });
    expect(ts.alternatives).toEqual([
      {
        reason: 'near_shichen_boundary',
        pillars: { year: '甲寅', month: '庚午', day: '癸卯', hour: '丁巳' },
        detail: 'trueSolar clock 1974-07-01T10:59:00 (boundary 11:00)',
      },
    ]);
    // civil clock (legacy) = the DST wall time 12:00, no boundary on that clock.
    const civil = computePillars(ctx, { useTrueSolarTime: false });
    expect(civil.pillars).toEqual(legacyPillars(ctx)!);
    expect(civil.alternatives).toEqual([]);
    expect(baziCalculator.calculate(ctx, { asOf: ASOF }).warnings).toEqual(['near_shichen_boundary']);
  });
});

describe('流年 / 流月', () => {
  test('annualPillars(2026, 3) = 丙午/丁未/戊申 with contiguous exact 立春 spans', () => {
    const a = annualPillars(2026, 3);
    expect(a.map((x) => x.ganZhi)).toEqual(['丙午', '丁未', '戊申']);
    expect(a[0].start).toBe('2026-02-03T20:02:08Z');
    expect(a[0].end).toBe(a[1].start);
    expect(a[1].end).toBe(a[2].start);
    // any year, no asOf dependence
    expect(annualPillars(1900, 1)[0].ganZhi).toBe('庚子');
    expect(annualPillars(2100, 1)[0].ganZhi).toBe('庚申');
    expect(annualPillars(2026, 0)).toEqual([]);
  });

  test('monthlyPillars(2026): 12 months from 庚寅 at the 立春 instant, contiguous', () => {
    const m = monthlyPillars(2026);
    expect(m).toHaveLength(12);
    expect(m[0]).toMatchObject({ ganZhi: '庚寅', jie: '立春', start: '2026-02-03T20:02:08Z' });
    expect(m.map((x) => x.ganZhi)).toEqual(['庚寅', '辛卯', '壬辰', '癸巳', '甲午', '乙未', '丙申', '丁酉', '戊戌', '己亥', '庚子', '辛丑']);
    for (let i = 0; i < 11; i++) expect(m[i].end).toBe(m[i + 1].start);
    expect(m[11].jie).toBe('小寒');
    expect(m[11].end).toBe(annualPillars(2027, 1)[0].start);
  });

  test('calculator: annualSequence asOf −1…+9, monthly of the asOf solar year', () => {
    const r = baziCalculator.calculate(ctxOf('1986-05-29', '08:00'), { asOf: ASOF });
    expect(r.chart.annualSequence!.map((a) => a.year)).toEqual([2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035]);
    expect(r.chart.monthly![0].solarYear).toBe(2026);
    // before 立春 the asOf solar year is the previous one
    const jan = baziCalculator.calculate(ctxOf('1986-05-29', '08:00'), { asOf: '2026-01-20', annualRange: { from: 2000, count: 2 } });
    expect(jan.chart.monthly![0]).toMatchObject({ solarYear: 2025, ganZhi: '戊寅' });
    expect(jan.chart.annualSequence!.map((a) => a.ganZhi)).toEqual(['庚辰', '辛巳']);
  });
});

describe('大運 (luck cycles)', () => {
  test('1991-10-05 14:00 female: step 1 start matches legacy start year; contiguous 10-year steps', () => {
    const ctx = ctxOf('1991-10-05', '14:00', TAIPEI, 'female');
    const luck = luckCycles(ctx, 'female');
    expect(luck.direction).toBe('順'); // 辛未 陰年女
    expect(luck.jie).toMatchObject({ nameHant: '寒露', utcIso: '1991-10-08T19:01:07Z' });
    expect(luck.startAge).toEqual({ years: 1, months: 2, days: 5, hours: 2 });
    expect(luck.startDate).toBe('1992-12-10');
    expect(luck.steps).toHaveLength(10);

    const legacy = extractBaziChart(legacyRun(ctx).components as any).luckCycles;
    expect(Number(luck.steps[0].start.slice(0, 4))).toBe(legacy[0].startYear);
    expect(luck.steps.map((s) => s.ganZhi)).toEqual(legacy.map((c) => c.ganZhi));
    for (let i = 0; i < 10; i++) {
      const s = luck.steps[i];
      expect(Number(s.start.slice(0, 4))).toBe(legacy[i].startYear);
      expect(s.start.slice(4)).toBe('-12-10');
      if (i < 9) {
        const nextStart = Date.parse(luck.steps[i + 1].start);
        expect(Date.parse(s.end) + 86_400_000).toBe(nextStart);
      }
    }

    const r = baziCalculator.calculate(ctx, { asOf: ASOF });
    const chart = r.chart as BaziChart;
    expect(chart.luckStart).toEqual({
      direction: '順',
      age: { years: 1, months: 2, days: 5, hours: 2 },
      date: '1992-12-10',
      jie: { name: '寒露', nameHant: '寒露', utcIso: '1991-10-08T19:01:07Z' },
    });
    expect(chart.luckCycles.map(({ index, ganZhi, startYear, endYear, startAge, ageConvention }) => ({ index, ganZhi, startYear, endYear, startAge, ageConvention }))).toEqual(
      legacy.map(({ index, ganZhi, startYear, endYear, startAge, ageConvention }) => ({ index, ganZhi, startYear, endYear, startAge, ageConvention })),
    );
    expect(chart.luckCycles.filter((c) => c.isCurrent).map((c) => c.index)).toEqual([4]);
  });

  test('male 陰年 runs backward (逆) from the previous 節', () => {
    const luck = luckCycles(ctxOf('1991-10-05', '14:00', TAIPEI, 'male'), 'male');
    expect(luck.direction).toBe('逆');
    expect(luck.jie.nameHant).toBe('白露');
    expect(luck.steps[0].ganZhi).toBe('丙申'); // month 丁酉 − 1
  });
});

describe('legacy parity (useTrueSolarTime=false)', () => {
  test('pillars, day master and counts equal the legacy engine across 1980–2030 Taipei births', () => {
    for (let i = 0; i < 40; i++) {
      const ms = Date.UTC(1980, 0, 1) + i * 40_000_000_000 + i * 7_777_777;
      const d = new Date(ms + 8 * 3_600_000);
      const pad = (n: number) => String(n).padStart(2, '0');
      const ctx = ctxOf(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`, TAIPEI, i % 2 ? 'male' : 'female');
      const r = baziCalculator.calculate(ctx, { asOf: ASOF, useTrueSolarTime: false });
      const legacy = extractBaziChart(r.components);
      expect(r.chart.pillars).toEqual(legacy.pillars);
      expect(r.chart.dayMaster).toEqual(legacy.dayMaster);
      expect(r.chart.fiveElements).toEqual(legacy.fiveElements);
      expect(r.chart.tenGods).toEqual(legacy.tenGods);
      expect(r.chart.luckCycles.map((c) => [c.ganZhi, c.startYear, c.endYear, c.startAge])).toEqual(
        legacy.luckCycles.map((c) => [c.ganZhi, c.startYear, c.endYear, c.startAge]),
      );
      expect(r.warnings).not.toContain('pillars_differ_from_civil');
    }
  });

  test('time unknown → legacy empty chart, no guessing', () => {
    const ctx = createTimeContext({ date: '1991-10-05', time: null, timeAccuracy: 'unknown', gender: 'female', birthplace: TAIPEI });
    const r = baziCalculator.calculate(ctx, { asOf: ASOF });
    expect(r.chart).toEqual({ pillars: null, dayMaster: null, fiveElements: null, tenGods: null, luckCycles: [], annual: null });
    expect(r.warnings).toContain('time_unknown');
    expect(() => computePillars(ctx)).toThrow(TypeError);
    const rule = toBaziRuleChart(r);
    expect(rule.pillars).toEqual({ year: null, month: null, day: null, hour: null });
    expect(rule.luckCycles).toEqual([]);
  });
});

describe('toBaziRuleChart', () => {
  test('builds a rule chart with ISO luck cycles, annual and monthly for any solar year', () => {
    const r = baziCalculator.calculate(ctxOf('1991-10-05', '14:00', TAIPEI, 'female'), { asOf: ASOF });
    const rc = toBaziRuleChart(r);
    expect(rc.pillars).toEqual(r.chart.pillars!);
    expect(rc.luckCycles[0]).toEqual({ index: 1, ganZhi: '戊戌', start: '1992-12-10', end: '2002-12-09', componentId: 'daYun_1' });
    expect(rc.annual).toEqual({ year: 2026, ganZhi: '丙午', start: '2026-02-03T20:02:08Z', end: '2027-02-04T01:46:18Z', componentId: 'liuNian' });
    expect(rc.monthly).toHaveLength(12);
    expect(rc.annuals).toHaveLength(11);

    const later = toBaziRuleChart(r, { year: 2040 });
    expect(later.annual!.ganZhi).toBe('庚申');
    expect(later.monthly![0].ganZhi).toBe('戊寅');

    // evaluable by the rule engine at every grain
    for (const w of [
      { grain: 'natal', start: '1991-10-05', end: '1991-10-05' },
      { grain: 'decade', start: '2022-12-10', end: '2032-12-09' },
      { grain: 'year', start: '2026-02-04', end: '2027-02-03' },
      { grain: 'month', start: '2026-06-06', end: '2026-07-06' },
    ] as const) {
      expect(() => evaluateBaziRules(rc, w)).not.toThrow();
    }
    const yearSigs = evaluateBaziRules(rc, { grain: 'year', start: '2026-02-04', end: '2027-02-03' });
    expect(yearSigs.length).toBeGreaterThan(0);
  });
});

describe('determinism', () => {
  test('same input → deep-equal results', () => {
    for (const [date, time] of [
      ['1986-05-29', '08:00'],
      ['2026-02-15', '13:03'],
      ['1991-10-05', '23:30'],
      ['1974-07-01', '12:00'],
    ]) {
      const a = baziCalculator.calculate(ctxOf(date, time), { asOf: ASOF });
      const b = baziCalculator.calculate(ctxOf(date, time), { asOf: ASOF });
      expect(a).toEqual(b);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });
});
