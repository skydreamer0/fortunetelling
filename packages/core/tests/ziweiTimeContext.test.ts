import { describe, expect, test } from 'bun:test';
import { BirthData } from '../src/core/models/BirthData.js';
import { ZiweiEngine } from '../src/engines/ZiweiEngine.js';
import {
  ZIWEI_CALCULATOR_VERSION,
  addDays,
  createAstrolabe,
  decadeSequence,
  extractZiweiChart,
  lunarNewYear,
  monthlySequence,
  natalChart,
  timeIndexFrom,
  toZiweiRuleChart,
  yearlySequence,
  ziweiCalculator,
} from '../src/calculators/ziwei/index';
import type { Component } from '../src/calculators/types';
import type { BirthProfile } from '../src/profile/index';
import { ZIWEI_RULES, evaluateZiweiRules } from '../src/rules/ziwei/index';
import { DOMAINS, TRAITS, signalId, type Signal, type SignalWindow } from '../src/signals/index';
import { createTimeContext } from '../src/time/index';

const ASOF = '2026-07-11';
const TAIPEI = { label: 'Taipei, Taiwan', lat: 25.0375, lng: 121.5637, timezone: 'Asia/Taipei' };
const TAINAN = { label: 'Tainan, Taiwan', lat: 22.9922, lng: 120.1848, timezone: 'Asia/Taipei' };
const KASHGAR = { label: 'Kashgar', lat: 39.47, lng: 75.99, timezone: 'Asia/Shanghai' };

const profile = (p: Partial<BirthProfile> & Pick<BirthProfile, 'date' | 'time'>): BirthProfile => ({
  timeAccuracy: 'exact',
  gender: 'female',
  birthplace: TAIPEI,
  ...p,
});

const MEI = profile({ date: '1991-10-05', time: '14:00', gender: 'female' });
const TAINAN_MALE = profile({ date: '1995-07-16', time: '22:00', gender: 'male', birthplace: TAINAN });

/** The legacy engine run analyze() performs for a profile (civil time, asOf). */
function legacyEngine(p: BirthProfile, asOf = ASOF) {
  const [year, month, day] = p.date.split('-').map(Number);
  const [hour, minute] = p.time!.split(':').map(Number);
  const birth = new BirthData({
    year, month, day, hour, minute, gender: p.gender, longitude: p.birthplace.lng, latitude: p.birthplace.lat, name: '',
  });
  return new ZiweiEngine({ asOf: new Date(asOf) }).run(birth) as { components: Component[] };
}

const contiguous = (periods: { start: string; end: string }[]) => {
  for (let i = 1; i < periods.length; i++) expect(periods[i].start).toBe(addDays(periods[i - 1].end, 1));
  for (const p of periods) expect(p.start <= p.end).toBe(true);
};

// ─── Legacy parity ────────────────────────────────────────────────────────

describe('legacy parity (useTrueSolarTime: false)', () => {
  for (const [label, p] of [['1991-10-05 14:00 female Taipei', MEI], ['1995-07-16 22:00 male Tainan', TAINAN_MALE]] as const) {
    test(label, () => {
      const engine = legacyEngine(p);
      const r = ziweiCalculator.calculate(createTimeContext(p), { asOf: ASOF, useTrueSolarTime: false });
      expect(r.components).toEqual(engine.components);
      const fromEngine = extractZiweiChart(engine.components);
      // Palace / star layout from the iztro astrolabe equals the engine components,
      // except that the engine passes iztro's empty-string mutagen ('') through
      // while the typed chart normalises it to null.
      const normalise = (json: unknown) => JSON.parse(JSON.stringify(json).replaceAll('"mutagen":""', '"mutagen":null'));
      expect(JSON.stringify(fromEngine.palaces)).toContain('"mutagen":""');
      expect(r.chart.palaces).toEqual(normalise(fromEngine.palaces));
      expect(r.chart.soulPalace).toEqual(fromEngine.soulPalace);
      expect(r.chart.bodyPalace).toEqual(fromEngine.bodyPalace);
      expect(r.chart.fiveElementBureau).toBe(fromEngine.fiveElementBureau);
      expect(r.chart.soulMaster).toBe(fromEngine.soulMaster);
      expect(r.chart.bodyMaster).toBe(fromEngine.bodyMaster);
      expect(r.chart.natalTransformations).toEqual(fromEngine.natalTransformations);
      expect(r.chart.time?.basis).toBe('civil');
      expect(r.warnings).not.toContain('palace_differs_from_civil');
      // Default true solar time keeps the same 時辰 for these births.
      const ts = ziweiCalculator.calculate(createTimeContext(p), { asOf: ASOF });
      expect(ts.components).toEqual(engine.components);
      expect(ts.chart.time?.basis).toBe('trueSolar');
    });
  }

  test('calculator metadata', () => {
    expect(ZIWEI_CALCULATOR_VERSION).toBe('1.0.0');
    expect(ziweiCalculator.version).toBe('1.0.0');
    expect(ziweiCalculator.requires).toEqual({ time: true, location: true, name: false });
  });
});

// ─── True solar time ──────────────────────────────────────────────────────

describe('true solar time', () => {
  // Taipei, February: LMT +6.3 min, equation of time ≈ −14 min → 13:03 civil ≈ 12:55 true solar.
  const FEB = profile({ date: '1990-02-12', time: '13:03' });

  test('13:03 civil in February Taipei → 午 (6), not 未 (7)', () => {
    const ctx = createTimeContext(FEB);
    expect(ctx.solar!.trueSolarIso.slice(11, 16)).toBe('12:54');
    const t = timeIndexFrom(ctx)!;
    expect(t).toMatchObject({ date: '1990-02-12', timeIndex: 6, basis: 'trueSolar' });
    expect(timeIndexFrom(ctx, { useTrueSolarTime: false })).toMatchObject({ timeIndex: 7, basis: 'civil' });
    const civilAlt = t.alternatives.find((a) => a.reasons.includes('civil_time'))!;
    expect(civilAlt).toMatchObject({ date: '1990-02-12', timeIndex: 7, basis: 'civil' });
  });

  test('chart uses 午, lists the 未 chart as an alternative and warns', () => {
    const r = ziweiCalculator.calculate(createTimeContext(FEB), { asOf: ASOF });
    expect(r.chart.time?.timeIndex).toBe(6);
    expect(r.warnings).toContain('palace_differs_from_civil');
    expect(r.chart.palaces).toEqual(natalChart(createAstrolabe('1990-02-12', 6, 'female')).palaces);
    // components are the engine's serialisation of the same (date, timeIndex): == legacy 12:30 birth.
    expect(r.components).toEqual(legacyEngine(profile({ date: '1990-02-12', time: '12:30' })).components);
    const alt = r.chart.alternatives.find((a) => a.resolution.reasons.includes('civil_time'))!;
    expect(alt.resolution.timeIndex).toBe(7);
    expect(alt.palaces).toEqual(natalChart(createAstrolabe('1990-02-12', 7, 'female')).palaces);
    expect(alt.soulPalace!.index).not.toBe(r.chart.soulPalace!.index);
  });

  test('near_shichen_boundary on the true-solar clock yields the neighbouring 時辰', () => {
    // 13:00 civil ≈ 12:52 true solar: 8 min before 13:00 → within approx15m tolerance.
    const ctx = createTimeContext(profile({ date: '1990-02-12', time: '13:00', timeAccuracy: 'approx15m' }));
    const t = timeIndexFrom(ctx)!;
    expect(t.timeIndex).toBe(6);
    const alt = t.alternatives.find((a) => a.reasons.includes('near_shichen_boundary'))!;
    expect(alt).toMatchObject({ date: '1990-02-12', timeIndex: 7, basis: 'trueSolar' });
    // The civil clock (13:00 → 未) coincides with it: one alternative, both reasons.
    expect(alt.reasons).toEqual(['near_shichen_boundary', 'civil_time']);
    expect(t.alternatives).toHaveLength(1);
  });

  test('true solar time crossing midnight moves the date (backwards and forwards)', () => {
    // Kashgar on China Standard Time: 00:30 civil ≈ 21:3x true solar of the previous day.
    const back = timeIndexFrom(createTimeContext(profile({ date: '2000-06-15', time: '00:30', birthplace: KASHGAR })))!;
    expect(back.wallTime.slice(0, 10)).toBe('2000-06-14');
    expect(back).toMatchObject({ date: '2000-06-14', timeIndex: 11 });
    // Taipei, November (EoT ≈ +16 min): 23:50 civil ≈ 00:12 true solar next day → 早子 of 11-04.
    const fwd = timeIndexFrom(createTimeContext(profile({ date: '1991-11-03', time: '23:50' })))!;
    expect(fwd.wallTime.slice(0, 13)).toBe('1991-11-04T00');
    expect(fwd).toMatchObject({ date: '1991-11-04', timeIndex: 0 });
    const r = ziweiCalculator.calculate(createTimeContext(profile({ date: '1991-11-03', time: '23:50' })), { asOf: ASOF });
    expect(r.chart.palaces).toEqual(natalChart(createAstrolabe('1991-11-04', 0, 'female')).palaces);
    expect(r.components).toEqual(legacyEngine(profile({ date: '1991-11-04', time: '00:30' })).components);
  });
});

// ─── 早子 / 晚子 ─────────────────────────────────────────────────────────

describe('早子 / 晚子', () => {
  const late = createTimeContext(profile({ date: '1991-10-05', time: '23:30' }));
  const early = createTimeContext(profile({ date: '1991-10-06', time: '00:30' }));

  test('23:30 → 晚子 (12) on the same date; alternative: next-day 早子', () => {
    for (const useTrueSolarTime of [false, true]) {
      const t = timeIndexFrom(late, { useTrueSolarTime })!;
      expect(t).toMatchObject({ date: '1991-10-05', timeIndex: 12, ziHourConvention: 'splitMidnight' });
      const alt = t.alternatives.find((a) => a.reasons.includes('zi_hour_convention'))!;
      expect(alt).toMatchObject({ date: '1991-10-06', timeIndex: 0, ziHourConvention: 'nextDayAt23' });
    }
    expect(timeIndexFrom(late, { ziHourConvention: 'nextDayAt23' })).toMatchObject({ date: '1991-10-06', timeIndex: 0 });
  });

  test('00:30 → 早子 (0) on its own date under both conventions', () => {
    for (const ziHourConvention of ['splitMidnight', 'nextDayAt23'] as const) {
      for (const useTrueSolarTime of [false, true]) {
        const t = timeIndexFrom(early, { useTrueSolarTime, ziHourConvention })!;
        expect(t).toMatchObject({ date: '1991-10-06', timeIndex: 0 });
        expect(t.alternatives.some((a) => a.reasons.includes('zi_hour_convention'))).toBe(false);
      }
    }
  });

  test('晚子 and next-day 早子 are distinct iztro charts; calculator charts both', () => {
    const r = ziweiCalculator.calculate(late, { asOf: ASOF });
    expect(r.chart.time).toMatchObject({ date: '1991-10-05', timeIndex: 12 });
    expect(r.warnings).toContain('zi_hour_convention');
    expect(r.chart.palaces).toEqual(natalChart(createAstrolabe('1991-10-05', 12, 'female')).palaces);
    const alt = r.chart.alternatives.find((a) => a.resolution.reasons.includes('zi_hour_convention'))!;
    expect(alt.palaces).toEqual(natalChart(createAstrolabe('1991-10-06', 0, 'female')).palaces);
    const e = ziweiCalculator.calculate(early, { asOf: ASOF });
    expect(e.chart.time).toMatchObject({ date: '1991-10-06', timeIndex: 0 });
    expect(e.chart.palaces).toEqual(alt.palaces);
  });
});

// ─── Sequences ────────────────────────────────────────────────────────────

describe('flow sequences', () => {
  const astrolabe = createAstrolabe('1991-10-05', 7, 'female');

  test('yearlySequence(…, 2026, 3): contiguous lunar years from 春節 2026-02-17', () => {
    const ys = yearlySequence(astrolabe, 2026, 3);
    expect(ys.map((y) => y.lunarYear)).toEqual([2026, 2027, 2028]);
    expect(ys[0].start).toBe('2026-02-17');
    expect(ys[0].end).toBe('2027-02-05');
    contiguous(ys);
    expect(ys[2].end).toBe(addDays(lunarNewYear(2029), -1));
    for (const y of ys) expect(y.mutagen).toHaveLength(4);
    expect(ys[0]).toMatchObject({ id: 'liuNian_2026', stem: '丙', branch: '午', nominalAge: 36 });
    expect(ys[0].mutagen).toEqual(['天同', '天機', '文昌', '廉貞']);
    expect(ys.map((y) => y.stem + y.branch)).toEqual(['丙午', '丁未', '戊申']);
    // 流年命宮 follows the year branch (index 0 = 寅): 午 = 4.
    expect(ys.map((y) => y.palaceIndex)).toEqual([4, 5, 6]);
    // Day before 春節 still belongs to the previous lunar year.
    expect(astrolabe.horoscope('2026-2-16').yearly.heavenlyStem).toBe('乙');
  });

  test('monthlySequence: 12 contiguous lunar months covering the lunar year', () => {
    const ms = monthlySequence(astrolabe, 2026);
    expect(ms).toHaveLength(12);
    expect(ms.map((m) => m.lunarMonth)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(ms[0].start).toBe('2026-02-17');
    expect(ms[11].end).toBe(addDays(lunarNewYear(2027), -1));
    contiguous(ms);
    for (const m of ms) {
      expect(m.mutagen).toHaveLength(4);
      // 流月命宮 is constant over the whole span (probe at the last day too).
      const [y, mo, d] = m.end.split('-').map(Number);
      expect(astrolabe.horoscope(`${y}-${mo}-${d}`).monthly.index).toBe(m.palaceIndex);
    }
    // One palace per month, advancing by one.
    for (let i = 1; i < 12; i++) expect(ms[i].palaceIndex).toBe((ms[i - 1].palaceIndex + 1) % 12);
  });

  test('leap month (2025 閏六月) is split at 十六 as iztro does', () => {
    const ms = monthlySequence(astrolabe, 2025);
    expect(ms).toHaveLength(12);
    contiguous(ms);
    expect(ms[5]).toMatchObject({ lunarMonth: 6, start: '2025-06-25', end: '2025-08-08' });
    expect(ms[6]).toMatchObject({ lunarMonth: 7, start: '2025-08-09', end: '2025-09-21' });
    for (const m of ms) {
      const [y, mo, d] = m.end.split('-').map(Number);
      const h = astrolabe.horoscope(`${y}-${mo}-${d}`).monthly;
      expect(h.index).toBe(m.palaceIndex);
      expect(h.heavenlyStem as string).toBe(m.stem);
    }
  });

  test('decadeSequence: contiguous lunar-year spans matching 虛歲', () => {
    const ds = decadeSequence(astrolabe);
    expect(ds).toHaveLength(12);
    contiguous(ds);
    for (const d of ds) {
      expect(d.mutagen).toHaveLength(4);
      const [y, mo, day] = d.start.split('-').map(Number);
      const h = astrolabe.horoscope(`${y}-${mo}-${day}`);
      expect(h.age.nominalAge).toBe(d.ageRange[0]);
      expect(h.decadal.index).toBe(d.palaceIndex);
    }
    expect(ds[0].start).toBe(lunarNewYear(1991 + ds[0].ageRange[0] - 1));
  });

  test('calculator: yearly asOf−1…+9, monthly asOf lunar year, 三方四正 index', () => {
    const r = ziweiCalculator.calculate(createTimeContext(MEI), { asOf: ASOF });
    expect(r.chart.birthLunarYear).toBe(1991);
    expect(r.chart.yearlySequence.map((y) => y.lunarYear)).toEqual([2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035]);
    contiguous(r.chart.yearlySequence);
    expect(r.chart.monthlySequence.map((m) => m.lunarYear)).toEqual(Array(12).fill(2026));
    expect(r.chart.decadeSequence.map((d) => d.id)).toEqual(r.chart.decades.map((d) => `daXian_${d.index}`));
    expect(r.chart.decadeSequence.map((d) => d.palaceIndex)).toEqual(r.chart.decades.map((d) => d.palaceIndex));
    expect(r.chart.decadeSequence.map((d) => d.mutagen)).toEqual(r.chart.decades.map((d) => d.mutagen));
    // asOf in January → previous lunar year is the "asOf year".
    const jan = ziweiCalculator.calculate(createTimeContext(MEI), { asOf: '2026-01-20' });
    expect(jan.chart.monthlySequence[0].lunarYear).toBe(2025);
    // 三方四正 = iztro surroundedPalaces [target, opposite, career(+4), wealth(+8)].
    const a = createAstrolabe(r.chart.time!.date, r.chart.time!.timeIndex, 'female');
    expect(r.chart.sanFangSiZheng).toHaveLength(12);
    for (let i = 0; i < 12; i++) {
      const s = a.surroundedPalaces(i);
      expect(r.chart.sanFangSiZheng[i]).toEqual([s.target.index, s.opposite.index, s.career.index, s.wealth.index]);
    }
  });

  test('time unknown → empty chart, no sequences', () => {
    const r = ziweiCalculator.calculate(createTimeContext({ ...MEI, time: null, timeAccuracy: 'unknown' }), { asOf: ASOF });
    expect(r.warnings).toContain('time_unknown');
    expect(r.components).toEqual([]);
    expect(r.chart).toMatchObject({ palaces: [], time: null, alternatives: [], yearlySequence: [], monthlySequence: [], decadeSequence: [] });
  });
});

// ─── Rules ────────────────────────────────────────────────────────────────

describe('ziwei rules on the V1-05 chart', () => {
  const result = ziweiCalculator.calculate(createTimeContext(MEI), { asOf: ASOF });
  const chart = toZiweiRuleChart(result);
  const realIds = new Set<string>([
    ...result.components.map((c) => c.id),
    ...result.chart.yearlySequence.map((y) => y.id),
    ...result.chart.monthlySequence.map((m) => m.id),
  ]);
  const YEAR_2027: SignalWindow = { grain: 'year', start: '2027-01-01', end: '2027-12-31' };
  const MONTH: SignalWindow = { grain: 'month', start: '2026-08-01', end: '2026-08-31' };

  const valid = (signals: Signal[]) => {
    const ids = new Set<string>();
    for (const s of signals) {
      expect(DOMAINS as readonly string[]).toContain(s.domain);
      expect(TRAITS as readonly string[]).toContain(s.trait);
      expect(s.intensity).toBeGreaterThanOrEqual(0);
      expect(s.intensity).toBeLessThanOrEqual(1);
      expect(Math.abs(s.valence)).toBeLessThanOrEqual(1);
      expect(s.id).toBe(signalId({ system: s.system, ruleId: s.ruleId, ruleVersion: s.ruleVersion, window: s.window, target: s.target, domain: s.domain, trait: s.trait }));
      expect(s.evidence.text.length).toBeGreaterThan(0);
      expect(s.evidence.componentIds.length).toBeGreaterThan(0);
      for (const id of s.evidence.componentIds) {
        expect(realIds.has(id)).toBe(true);
        expect(chart.componentIds).toContain(id);
      }
      expect(ids.has(s.id)).toBe(false);
      ids.add(s.id);
    }
  };

  test('precise lunar-year spans replace the Jan-1 approximation', () => {
    expect(chart.decades.map((d) => [d.componentId, d.start, d.end])).toEqual(
      result.chart.decadeSequence.map((d) => [d.id, d.start, d.end]),
    );
    expect(chart.yearly).toMatchObject({ start: '2026-02-17', end: '2027-02-05', lunarYear: 2026 });
    expect(chart.yearlySequence).toHaveLength(11);
    expect(chart.monthlySequence).toHaveLength(12);
  });

  test('2027 year window: year.sequence fires for 流年 2027 only; signals valid', () => {
    const signals = evaluateZiweiRules(chart, YEAR_2027);
    valid(signals);
    const seq = signals.filter((s) => s.ruleId === 'ziwei.year.sequence');
    expect(seq.length).toBeGreaterThan(0);
    const years = new Set(seq.flatMap((s) => s.evidence.componentIds.filter((c) => c.startsWith('liuNian_'))));
    expect([...years]).toEqual(['liuNian_2027']);
    // 丁 year: 太陰化祿, 巨門化忌.
    expect(seq.some((s) => s.target === 'liuNian_2027:祿:太陰')).toBe(true);
    expect(seq.some((s) => s.target === 'liuNian_2027:忌:巨門' && s.trait === 'pressure')).toBe(true);
    expect(seq.some((s) => s.target.startsWith('liuNian_2027:focus:'))).toBe(true);
    // 流年 2026 (to 2027-02-05) overlaps the window via the asOf rules, not duplicated by the sequence rule.
    expect(signals.some((s) => s.ruleId === 'ziwei.year.mutagen')).toBe(true);
    for (const s of signals) expect(s.window).toEqual(YEAR_2027);
  });

  test('month window: month rules fire for the overlapping 流月', () => {
    const signals = evaluateZiweiRules(chart, MONTH);
    valid(signals);
    expect(new Set(signals.map((s) => s.ruleId))).toEqual(new Set(['ziwei.month.mutagen', 'ziwei.month.palace_overlay']));
    const months = new Set(signals.flatMap((s) => s.evidence.componentIds.filter((c) => c.startsWith('liuYue_'))));
    expect([...months].sort()).toEqual(['liuYue_2026_06', 'liuYue_2026_07']);
    const overlay = signals.find((s) => s.ruleId === 'ziwei.month.palace_overlay' && s.target.includes(':overlay'))!;
    expect(overlay.evidence.modifiers.some((m) => m.id === 'overlay.month')).toBe(true);
  });

  test('every active rule fires on some window', () => {
    const all = [
      ...evaluateZiweiRules(chart, { grain: 'natal', start: '1991-10-05', end: '1991-10-05' }),
      ...evaluateZiweiRules(chart, { grain: 'decade', start: '2026-01-01', end: '2035-12-31' }),
      ...evaluateZiweiRules(chart, YEAR_2027),
      ...evaluateZiweiRules(chart, MONTH),
    ];
    valid(all.filter((s, i, arr) => arr.findIndex((x) => x.id === s.id) === i));
    const fired = new Set(all.map((s) => s.ruleId));
    for (const r of ZIWEI_RULES) expect(fired.has(r.id)).toBe(true);
  });
});

// ─── Determinism ──────────────────────────────────────────────────────────

describe('determinism', () => {
  test('calculate and rule evaluation are deep-equal across runs', () => {
    for (const p of [MEI, TAINAN_MALE, profile({ date: '1991-10-05', time: '23:30' })]) {
      const a = ziweiCalculator.calculate(createTimeContext(p), { asOf: ASOF });
      const b = ziweiCalculator.calculate(createTimeContext(p), { asOf: ASOF });
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      const w: SignalWindow = { grain: 'month', start: '2026-03-01', end: '2026-03-31' };
      expect(JSON.stringify(evaluateZiweiRules(toZiweiRuleChart(a), w))).toBe(JSON.stringify(evaluateZiweiRules(toZiweiRuleChart(b), w)));
    }
  });
});
