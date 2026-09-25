import { test, expect, describe } from 'bun:test';
import {
  MING_GUA_YEAR_BOUNDARY,
  fixedOffsetCivilToUtcMs,
  liChunUtcMs,
  mingGuaFromInstant,
  mingGuaNumber,
  mingGuaSolarYear,
  reduceToSingleDigit,
} from '../src/calculators/mingGua/mingGua.js';
import { MingGuaEngine } from '../src/engines/MingGuaEngine.js';
import { BirthData } from '../src/core/models/BirthData.js';

const HOUR_MS = 3_600_000;
const CST = 8 * 60;

type Gender = 'male' | 'female';

function engineRun(y: number, m: number, d: number, h: number, min: number, gender: Gender, timeKnown = true) {
  const birth = new BirthData({ year: y, month: m, day: d, hour: h, minute: min, gender, timeKnown });
  return new MingGuaEngine().run(birth);
}
const comp = (result: any, id: string) => result.components.find((c: any) => c.id === id);

/** CST (UTC+8) civil fields of an instant, truncated to the minute. */
function cstCivil(utcMs: number): [number, number, number, number, number] {
  const d = new Date(utcMs + CST * 60_000);
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()];
}

// Expected values computed with the pre-V1-08 engine formula (Feb-4 boundary),
// hardcoded: [year, month, day, yearForGua, maleKua, femaleKua]. None of these
// dates is within Feb 3–5, so the exact 立春 boundary must agree.
const PARITY: Array<[number, number, number, number, number, number]> = [
  [1920, 6, 15, 1920, 8, 7],
  [1924, 1, 20, 1923, 2, 1],
  [1931, 11, 2, 1931, 6, 9],
  [1937, 3, 8, 1937, 9, 6],
  [1945, 8, 15, 1945, 1, 8],
  [1949, 10, 1, 1949, 6, 9],
  [1953, 12, 31, 1953, 2, 4],
  [1960, 1, 1, 1959, 2, 1],
  [1966, 7, 4, 1966, 7, 8],
  [1972, 2, 20, 1972, 1, 8],
  [1978, 5, 5, 1978, 4, 2],
  [1984, 9, 9, 1984, 7, 8],
  [1990, 1, 15, 1989, 2, 4],
  [1991, 10, 5, 1991, 9, 6],
  [1995, 7, 16, 1995, 2, 1],
  [1999, 12, 31, 1999, 1, 8],
  [2000, 1, 1, 1999, 1, 8],
  [2000, 2, 28, 2000, 9, 6],
  [2003, 4, 1, 2003, 6, 9],
  [2008, 8, 8, 2008, 1, 8],
  [2012, 12, 21, 2012, 6, 9],
  [2016, 2, 10, 2016, 2, 4],
  [2019, 1, 31, 2018, 9, 6],
  [2024, 2, 29, 2024, 3, 3],
  [2026, 9, 25, 2026, 1, 8],
  [2030, 12, 31, 2030, 6, 9],
];

describe('parity with the legacy Feb-4 engine on non-boundary dates', () => {
  for (const [y, m, d, yf, male, female] of PARITY) {
    test(`${y}-${m}-${d}`, () => {
      for (const [gender, kua] of [['male', male], ['female', female]] as const) {
        for (const [h, min, known] of [[0, 0, true], [12, 0, true], [23, 59, true], [12, 0, false]] as const) {
          const r = engineRun(y, m, d, h, min, gender, known);
          expect(r.errors).toEqual([]);
          const v = comp(r, 'ming_gua').value;
          expect(v.yearForGua).toBe(yf);
          expect(v.guaNumber).toBe(kua);
        }
        const utc = fixedOffsetCivilToUtcMs(y, m, d, 12, 0, CST);
        expect(mingGuaFromInstant(utc, gender)).toMatchObject({ solarYear: yf, guaNumber: kua });
        expect(mingGuaNumber(yf, gender) as number).toBe(kua);
      }
    });
  }
});

describe('mingGuaNumber formula', () => {
  test('digit reduction', () => {
    expect(reduceToSingleDigit(0)).toBe(0);
    expect(reduceToSingleDigit(91)).toBe(1);
    expect(reduceToSingleDigit(99)).toBe(9);
    expect(reduceToSingleDigit(19)).toBe(1);
  });
  test('millennium correction and central-5 remap', () => {
    expect(mingGuaNumber(1999, 'male')).toBe(1);
    expect(mingGuaNumber(1999, 'female')).toBe(8); // 9+5=14→5→艮8
    expect(mingGuaNumber(2000, 'male')).toBe(9); // d=0: 9−0
    expect(mingGuaNumber(2000, 'female')).toBe(6);
    expect(mingGuaNumber(1995, 'male')).toBe(2); // 10−5=5→坤2
    expect(mingGuaNumber(2004, 'male')).toBe(2); // 9−4=5→坤2
    for (let y = 1900; y <= 2100; y++) {
      for (const g of ['male', 'female'] as const) expect(mingGuaNumber(y, g)).not.toBe(5);
    }
  });
  test('rejects bad input', () => {
    expect(() => mingGuaNumber(1990.5, 'male')).toThrow(TypeError);
    expect(() => mingGuaNumber(1990, 'x' as any)).toThrow(TypeError);
    expect(() => mingGuaSolarYear(NaN)).toThrow(TypeError);
  });
});

describe('exact 立春 year boundary', () => {
  test('立春 instants match solarTerms (CST wall times)', () => {
    expect(new Date(liChunUtcMs(2026)).toISOString()).toBe('2026-02-03T20:02:08.000Z');
    expect(cstCivil(liChunUtcMs(2021)).slice(1)).toEqual([2, 3, 22, 58]);
    expect(cstCivil(liChunUtcMs(1985)).slice(1)).toEqual([2, 4, 5, 11]);
    expect(cstCivil(liChunUtcMs(1920)).slice(1)).toEqual([2, 5, 10, 26]);
  });

  test('the exact instant already belongs to the new year', () => {
    const t = liChunUtcMs(2026);
    expect(mingGuaSolarYear(t)).toBe(2026);
    expect(mingGuaSolarYear(t - 1000)).toBe(2025);
  });

  test('New Year (Jan 1) does not change the solar year', () => {
    expect(mingGuaSolarYear(fixedOffsetCivilToUtcMs(2026, 1, 1, 0, 30, CST))).toBe(2025);
    expect(mingGuaSolarYear(fixedOffsetCivilToUtcMs(2025, 12, 31, 23, 30, CST))).toBe(2025);
  });

  // [year, prevKua male/female, kua male/female, old approximation wrong on which side]
  const CASES: Array<{ year: number; before: [number, number]; after: [number, number]; oldWrong: 'before' | 'after' }> = [
    // 立春 2026-02-04 04:02 CST: Feb 4 03:02 was 2026 under Feb-4 rule.
    { year: 2026, before: [2, 4], after: [1, 8], oldWrong: 'before' },
    // 立春 2021-02-03 22:58 CST: Feb 3 23:58 was 2020 under Feb-4 rule.
    { year: 2021, before: [7, 8], after: [6, 9], oldWrong: 'after' },
    // 立春 2025-02-03 22:10 CST.
    { year: 2025, before: [3, 3], after: [2, 4], oldWrong: 'after' },
    // 立春 1985-02-04 05:11 CST.
    { year: 1985, before: [7, 8], after: [6, 9], oldWrong: 'before' },
    // 立春 1920-02-05 10:26 CST.
    { year: 1920, before: [9, 6], after: [8, 7], oldWrong: 'before' },
    // 立春 2000-02-04 20:40 CST: crosses the millennium correction.
    { year: 2000, before: [1, 8], after: [9, 6], oldWrong: 'before' },
  ];

  for (const { year, before, after, oldWrong } of CASES) {
    test(`${year}: ±1 h around 立春 land in different solar years`, () => {
      const l = liChunUtcMs(year);
      const sides = [
        { utc: l - HOUR_MS, solarYear: year - 1, kua: before, side: 'before' },
        { utc: l + HOUR_MS, solarYear: year, kua: after, side: 'after' },
      ] as const;
      for (const s of sides) {
        const [y, m, d, h, min] = cstCivil(s.utc);
        expect(mingGuaSolarYear(s.utc)).toBe(s.solarYear);
        ['male', 'female'].forEach((g, i) => {
          const gender = g as Gender;
          expect(mingGuaFromInstant(s.utc, gender).guaNumber as number).toBe(s.kua[i]);
          const r = engineRun(y, m, d, h, min, gender);
          expect(r.errors).toEqual([]);
          const v = comp(r, 'ming_gua').value;
          expect(v.yearForGua).toBe(s.solarYear);
          expect(v.guaNumber).toBe(s.kua[i]);
          expect(v.yearBoundary).toBe('liChun-exact');
        });
        // The legacy Feb-4 rule, for the record.
        const oldYear = m < 2 || (m === 2 && d < 4) ? y - 1 : y;
        if (s.side === oldWrong) expect(oldYear).not.toBe(s.solarYear);
        else expect(oldYear).toBe(s.solarYear);
      }
      expect(before).not.toEqual(after);
    });
  }
});

describe('MingGuaEngine output shape', () => {
  test('component ids/categories unchanged; convention recorded', () => {
    const r = engineRun(1991, 10, 5, 12, 0, 'female');
    expect(r.components.map((c: any) => [c.id, c.category])).toEqual([
      ['ming_gua', 'mingGua'],
      ['directions', 'directions'],
    ]);
    const v = comp(r, 'ming_gua').value;
    expect(v.yearBoundary).toBe(MING_GUA_YEAR_BOUNDARY);
    expect(v.liChunUtc).toMatch(/^1991-02-04T\d\d:\d\d:\d\dZ$/);
    expect(Date.parse(v.liChunUtc)).toBe(Math.round(liChunUtcMs(1991) / 1000) * 1000);
    expect(r.meta).toMatchObject({ yearBoundary: 'liChun-exact', boundaryAmbiguous: false, yearForGua: 1991 });
    expect(r.meta.timeConvention).toContain('UTC+8');
  });

  test('unknown time on the 立春 day: noon is used and the result is flagged', () => {
    // 2026: 立春 04:02 CST → noon is after it → 2026, but flagged.
    const r = engineRun(2026, 2, 4, 12, 0, 'male', false);
    expect(comp(r, 'ming_gua').value.yearForGua).toBe(2026);
    expect(r.meta.boundaryAmbiguous).toBe(true);
    expect(r.errors.length).toBe(1);
    expect(r.errors[0]).toContain('立春');
    // 2021: 立春 22:58 CST on Feb 3 → noon is before it → 2020, flagged.
    const r2 = engineRun(2021, 2, 3, 12, 0, 'female', false);
    expect(comp(r2, 'ming_gua').value.yearForGua).toBe(2020);
    expect(r2.meta.boundaryAmbiguous).toBe(true);
    // Known time on the 立春 day is not ambiguous.
    const r3 = engineRun(2026, 2, 4, 3, 0, 'male', true);
    expect(r3.meta.boundaryAmbiguous).toBe(false);
    expect(r3.errors).toEqual([]);
    expect(comp(r3, 'ming_gua').value.yearForGua).toBe(2025);
    // Unknown time on the day after 立春 is not ambiguous.
    const r4 = engineRun(2026, 2, 5, 12, 0, 'male', false);
    expect(r4.meta.boundaryAmbiguous).toBe(false);
    expect(r4.errors).toEqual([]);
  });
});
