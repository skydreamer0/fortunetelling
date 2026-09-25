/**
 * 黃金測試：生命靈數純函式（calculators/numerology）與 NumerologyEngine 新增部件。
 * 所有向量皆手算於註解中；凡涉及年份者皆顯式傳入（D-014）。
 */
import { test, expect } from 'bun:test';
import { analyze } from '../src/core/analyze.js';
import {
  calculateLifePath,
  calculateBirthdayNumber,
  calculateAttitude,
  calculatePersonalYear,
  calculatePersonalYears,
  calculatePinnacles,
  calculateChallenges,
  reduce,
} from '../src/calculators/numerology/numerology';
import { BirthData, NumerologyEngine, analyze } from '../src/index.js';
import { reduceNumber } from '../src/engines/NumerologyEngine.js';

const D1995 = { year: 1995, month: 7, day: 16 };

test('1995-07-16 生命靈數 / 生日數 / 態度數', () => {
  // year 1995 → 1+9+9+5 = 24 → 6; month 7 → 7; day 16 → 1+6 = 7
  // compound = 6 + 7 + 7 = 20; 20 → 2
  expect(calculateLifePath(D1995)).toEqual({ value: 2, compound: 20, display: '2' });
  // birthday: 16 → 7
  expect(calculateBirthdayNumber(D1995)).toBe(7);
  // attitude: 7 + 7 = 14 → 5
  expect(calculateAttitude(D1995)).toBe(5);
});

test('主數：1995-02-03 → 11/2；1991-11-09 → 22/4', () => {
  // 1995 → 6; 2; 3 → 6+2+3 = 11 (master, kept)
  expect(calculateLifePath({ year: 1995, month: 2, day: 3 })).toEqual({ value: 11, compound: 11, display: '11/2' });
  // 1991 → 20 → 2; month 11 stays 11 (master); 9 → 2+11+9 = 22 (master, kept)
  expect(calculateLifePath({ year: 1991, month: 11, day: 9 })).toEqual({ value: 22, compound: 22, display: '22/4' });
});

test('主數生日：1990-11-29', () => {
  const d = { year: 1990, month: 11, day: 29 };
  // birthday: 29 → 11 (master kept)
  expect(calculateBirthdayNumber(d)).toBe(11);
  // attitude: 11 + 11 = 22 (master kept)
  expect(calculateAttitude(d)).toBe(22);
  // life path: 1990 → 19 → 10 → 1; 11; 29 → 11; 1+11+11 = 23 → 5
  expect(calculateLifePath(d)).toEqual({ value: 5, compound: 23, display: '5' });
});

test('生命靈數與既有引擎一致（1991-10-05 → 8）', () => {
  // (1991 → 2) + (10 → 1) + 5 = 8
  expect(calculateLifePath({ year: 1991, month: 10, day: 5 }).value).toBe(8);
  for (const n of [0, 9, 10, 11, 19, 22, 29, 33, 38, 1991, 2027]) {
    expect(reduce(n)).toBe(reduceNumber(n));
  }
});

test('1995-07-16 巔峰數與年齡', () => {
  // M=7, D=16→7, Y=1995→6; life path 2 → first pinnacle ends at 36−2 = 34
  // P1 = 7+7 = 14 → 5; P2 = 7+6 = 13 → 4; P3 = 5+4 = 9; P4 = 7+6 = 13 → 4
  expect(calculatePinnacles(D1995)).toEqual([
    { index: 1, number: 5, startAge: 0, endAge: 34 },
    { index: 2, number: 4, startAge: 34, endAge: 43 },
    { index: 3, number: 9, startAge: 43, endAge: 52 },
    { index: 4, number: 4, startAge: 52, endAge: null },
  ]);
});

test('1991-11-09 巔峰數保留主數；主數生命靈數以個位計年齡', () => {
  // M=11→2, D=9, Y=1991→20→2; life path 22 → digit 4 → first ends at 36−4 = 32
  // P1 = 2+9 = 11 (master); P2 = 9+2 = 11 (master); P3 = 11+11 = 22 (master); P4 = 2+2 = 4
  const p = calculatePinnacles({ year: 1991, month: 11, day: 9 });
  expect(p.map(x => x.number)).toEqual([11, 11, 22, 4]);
  expect(p.map(x => [x.startAge, x.endAge])).toEqual([[0, 32], [32, 41], [41, 50], [50, null]]);
});

test('挑戰數', () => {
  // 1995-07-16: M=7, D=7, Y=6 → C1=|7−7|=0, C2=|7−6|=1, C3=|0−1|=1, C4=|7−6|=1
  expect(calculateChallenges(D1995).map(c => c.number)).toEqual([0, 1, 1, 1]);
  // 1991-11-09: M=2, D=9, Y=2 → C1=7, C2=7, C3=0, C4=0
  expect(calculateChallenges({ year: 1991, month: 11, day: 9 }).map(c => c.number)).toEqual([7, 7, 0, 0]);
  // same age spans as the pinnacles
  expect(calculateChallenges(D1995)[1]).toEqual({ index: 2, number: 1, startAge: 34, endAge: 43 });
});

test('個人流年 2026–2028（1995-07-16）', () => {
  // month+day = 7 + 7 = 14
  // 2026 → 10 → 1: 14+1 = 15 → 6
  // 2027 → 11 (master kept): 14+11 = 25 → 7
  // 2028 → 12 → 3: 14+3 = 17 → 8
  expect(calculatePersonalYear(D1995, 2026)).toBe(6);
  expect(calculatePersonalYears(D1995, 2026, 3)).toEqual({ 2026: 6, 2027: 7, 2028: 8 });
});

test('NumerologyEngine 新增部件（asOf 2026-07-11）', () => {
  const birth = new BirthData({ year: 1995, month: 7, day: 16, hour: 12, gender: 'male', name: 'Test Person' });
  const res = new NumerologyEngine({ asOf: '2026-07-11' }).run(birth);
  expect(res.byCategory('birthdayNumber')[0].value).toEqual({ number: 7, isMaster: false });
  expect(res.byCategory('attitude')[0].value).toEqual({ number: 5, isMaster: false });
  expect(res.byCategory('pinnacles').map(c => c.id)).toEqual(['pinnacle_1', 'pinnacle_2', 'pinnacle_3', 'pinnacle_4']);
  expect(res.byCategory('pinnacles').map(c => c.value.number)).toEqual([5, 4, 9, 4]);
  expect(res.byCategory('challenges').map(c => c.value.number)).toEqual([0, 1, 1, 1]);
  const py = res.byCategory('personalYears')[0].value;
  expect(py.fromYear).toBe(2026);
  expect(Object.keys(py.years)).toHaveLength(9);
  expect([py.years[2026], py.years[2027], py.years[2028]]).toEqual([6, 7, 8]);
  // consistent with the pre-existing single-year component
  expect(res.byCategory('personalYear')[0].value).toEqual({ number: 6, year: 2026 });
  // pre-existing components come first, unchanged in order
  expect(res.components.slice(0, 7).map(c => c.id)).toEqual([
    'life_path', 'expression', 'soul_urge', 'personality', 'digit_frequency', 'personal_year', 'personal_month',
  ]);
});

test('analyze()：新部件皆已分類、honesty 零違規', () => {
  const report = analyze(
    { year: 1995, month: 7, day: 16, hour: 12, gender: 'male', name: 'Test Person' },
    { asOf: '2026-07-11' },
  );
  expect(report.layers.unclassified).toEqual([]);
  expect(report.honesty.violations).toEqual([]);
  const layerOf = (category: string) =>
    report.layers.components.find(c => c.sourceSystem === 'numerology' && c.category === category)?.layer;
  expect(layerOf('birthdayNumber')).toBe('L0');
  expect(layerOf('attitude')).toBe('L0');
  expect(layerOf('pinnacles')).toBe('L1');
  expect(layerOf('challenges')).toBe('L1');
  expect(layerOf('personalYears')).toBe('L2');
});

// 回歸：asOf = 年初第一天時，個人流年／流月不得隨主機時區漂移（D-014）。
// new Date('2027-01-01') 是 UTC 午夜；在 UTC−8 主機上本地 getter 會讀成 2026-12-31。
test('personal year/month use the UTC date of asOf, independent of host timezone', () => {
  const report = analyze(
    { year: 1995, month: 7, day: 16, hour: 22, minute: 0, gender: 'male' },
    { asOf: '2027-01-01' },
  );
  const numerology = report.engines.find((e: { engineId: string }) => e.engineId === 'numerology');
  const value = (id: string) => numerology.components.find((c: { id: string }) => c.id === id).value;
  expect(value('personal_year').year).toBe(2027);
  expect(value('personal_month')).toMatchObject({ year: 2027, month: 1 });
  expect(value('personal_years').fromYear).toBe(2027);
});
