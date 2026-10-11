import { expect, test } from 'bun:test';
import { categoryValues, componentValue } from '../src/calculators/birthData';
import {
  extractNumerologyChart, numerologyCalculator,
  type NumerologyChart, type NumerologyNumber, type NumerologyPeriodValue,
} from '../src/calculators/numerology/calculator';
import { displayNumber } from '../src/calculators/numerology/numerology';
import { profileDateToBirthData } from '../src/calculators/profileDateBirthData';
import type { Component } from '../src/calculators/types';
import { NumerologyEngine } from '../src/engines/NumerologyEngine';
import type {
  NumerologyNumberValue, NumerologyPersonalYearValue, NumerologyPersonalMonthValue,
  NumerologyPersonalYearsValue, NumerologyDigitFrequencyValue,
} from '../src/engines/numerologyTypes';
import { createTimeContext } from '../src/time/createTimeContext';

// Public shapes and extraction frozen from master 86121463, independent of new contracts.
interface LegacyNumerologyNumber {
  number: number;
  isMaster: boolean;
  /** `'11/2'` for master numbers, `'7'` otherwise. */
  display: string;
}

interface LegacyNumerologyPeriodValue {
  index: number;
  number: number;
  startAge: number;
  endAge: number | null;
}

interface LegacyNumerologyChart {
  lifePath: LegacyNumerologyNumber | null;
  birthday: LegacyNumerologyNumber | null;
  attitude: LegacyNumerologyNumber | null;
  expression: LegacyNumerologyNumber | null;
  soulUrge: LegacyNumerologyNumber | null;
  personality: LegacyNumerologyNumber | null;
  pinnacles: LegacyNumerologyPeriodValue[];
  challenges: LegacyNumerologyPeriodValue[];
  personalYear: { number: number; year: number } | null;
  personalMonth: { number: number; year: number; month: number } | null;
  /** Personal-year numbers keyed by year, starting at the asOf year. */
  personalYears: Record<number, number>;
  /** Counts of digits 1–9 in the birth date. */
  digitFrequency: Record<string, number> | null;
}


type Accept<T extends true> = T;
type Reject<T extends false> = T;
type Same<A, B> = [A] extends [B] ? [B] extends [A] ? true : false : false;
type IsAny<T> = 0 extends (1 & T) ? true : false;
type ContainsAny<T> = IsAny<T> extends true ? true : T extends object
  ? true extends { [K in keyof T]-?: ContainsAny<T[K]> }[keyof T] ? true : false
  : false;
export type PublicCompatibility = [
  Accept<Same<NumerologyNumber, LegacyNumerologyNumber>>,
  Accept<Same<NumerologyPeriodValue, LegacyNumerologyPeriodValue>>,
  Accept<Same<NumerologyChart, LegacyNumerologyChart>>,
  Accept<Same<keyof NumerologyNumber, keyof LegacyNumerologyNumber>>,
  Accept<Same<keyof NumerologyPeriodValue, keyof LegacyNumerologyPeriodValue>>,
  Accept<Same<keyof NumerologyChart, keyof LegacyNumerologyChart>>,
  Accept<Same<Omit<NumerologyNumber, 'display'>, NumerologyNumberValue>>,
  Accept<Same<NonNullable<NumerologyChart['personalYear']>, NumerologyPersonalYearValue>>,
  Accept<Same<NonNullable<NumerologyChart['personalMonth']>, NumerologyPersonalMonthValue>>,
  Accept<Same<NumerologyChart['personalYears'], NumerologyPersonalYearsValue['years']>>,
  Reject<ContainsAny<NumerologyChart>>,
  Reject<undefined extends NumerologyChart['lifePath'] ? true : false>,
  Reject<undefined extends NumerologyChart['personalYear'] ? true : false>,
  Reject<undefined extends NumerologyChart['personalMonth'] ? true : false>,
  Reject<undefined extends NumerologyChart['digitFrequency'] ? true : false>,
  Reject<null extends NumerologyChart['personalYears'] ? true : false>,
  Reject<{ number: number } extends NumerologyNumberValue ? true : false>,
  Reject<{ number: number; year: number } extends NumerologyPersonalMonthValue ? true : false>,
  Reject<{ number: string; year: number } extends NumerologyPersonalYearValue ? true : false>,
  Reject<Omit<NumerologyPeriodValue, 'endAge'> extends NumerologyPeriodValue ? true : false>,
  Reject<Omit<NumerologyDigitFrequencyValue, '9'> extends NumerologyDigitFrequencyValue ? true : false>,
];
// Retain the loose public digit map, rather than importing the engine's required 1–9 keys.
const looseDigits: NonNullable<NumerologyChart['digitFrequency']> = { custom: 0 };

function numberOf(components: readonly Component[], id: string): LegacyNumerologyNumber | null {
  const v = componentValue<{ number: number; isMaster: boolean }>(components, id);
  return v ? { number: v.number, isMaster: v.isMaster, display: displayNumber(v.number) } : null;
}

/** Typed view of the engine components. */
function legacyExtract(components: readonly Component[]): LegacyNumerologyChart {
  const period = ({ index, number, startAge, endAge }: LegacyNumerologyPeriodValue): LegacyNumerologyPeriodValue => ({
    index,
    number,
    startAge,
    endAge,
  });
  return {
    lifePath: numberOf(components, 'life_path'),
    birthday: numberOf(components, 'birthday_number'),
    attitude: numberOf(components, 'attitude'),
    expression: numberOf(components, 'expression'),
    soulUrge: numberOf(components, 'soul_urge'),
    personality: numberOf(components, 'personality'),
    pinnacles: categoryValues<LegacyNumerologyPeriodValue>(components, 'pinnacles').map(period),
    challenges: categoryValues<LegacyNumerologyPeriodValue>(components, 'challenges').map(period),
    personalYear: componentValue<{ number: number; year: number }>(components, 'personal_year'),
    personalMonth: componentValue<{ number: number; year: number; month: number }>(components, 'personal_month'),
    personalYears: { ...(componentValue<{ years: Record<number, number> }>(components, 'personal_years')?.years ?? {}) },
    digitFrequency: componentValue<Record<string, number>>(components, 'digit_frequency'),
  };
}


const KEYS = ['lifePath', 'birthday', 'attitude', 'expression', 'soulUrge', 'personality',
  'pinnacles', 'challenges', 'personalYear', 'personalMonth', 'personalYears', 'digitFrequency'];
const PLACE = { label: 'Taipei', lat: 25.03, lng: 121.5, timezone: 'Asia/Taipei' };

test('typed adapter preserves name, master number, asOf and known/unknown time bytes', () => {
  for (const date of ['1995-07-16', '1991-11-09', '2000-02-29', '1980-01-01']) {
    for (const name of ['', '中文', 'Test Person', 'AEIOU', 'BCDF', 'Y']) {
      for (const time of ['12:00', null]) {
        for (const asOf of ['2025-12-31', '2026-01-01', '2026-07-11']) {
          const ctx = createTimeContext({ date, time, name, gender: 'male',
            timeAccuracy: time === null ? 'unknown' : 'exact', birthplace: PLACE });
          const source = new NumerologyEngine({ asOf: new Date(asOf) }).run(profileDateToBirthData(ctx));
          const actual = numerologyCalculator.calculate(ctx, { asOf });
          expect(JSON.stringify(actual)).toBe(JSON.stringify({
            system: 'numerology', version: '0.1.1', chart: legacyExtract(source.components),
            components: source.components, warnings: [...source.errors],
          }));
          expect(Object.keys(actual.chart)).toEqual(KEYS);
          expect(Object.keys(actual.chart.lifePath!)).toEqual(['number', 'isMaster', 'display']);
          for (const p of [...actual.chart.pinnacles, ...actual.chart.challenges]) {
            expect(Object.keys(p)).toEqual(['index', 'number', 'startAge', 'endAge']);
          }
          expect(actual.chart.pinnacles[3].endAge).toBeNull();
        }
      }
    }
  }
});

test('loose extraction preserves missing/nullish/falsey fields and first-match IDs', () => {
  expect(extractNumerologyChart([])).toEqual(legacyExtract([]));
  for (const id of ['life_path', 'birthday_number', 'attitude', 'expression', 'soul_urge',
    'personality', 'personal_year', 'personal_month', 'personal_years', 'digit_frequency']) {
    for (const value of [undefined, null, 0, false, '', {}, { number: 11, isMaster: true }]) {
      const components = [
        { id, category: 'legacy', name: 'first', value },
        { id, category: 'legacy', name: 'duplicate', value: { number: 9, isMaster: false } },
      ];
      expect(extractNumerologyChart(components)).toEqual(legacyExtract(components));
      expect(JSON.stringify(extractNumerologyChart(components))).toBe(JSON.stringify(legacyExtract(components)));
      expect(Object.keys(extractNumerologyChart(components))).toEqual(KEYS);
    }
  }
});

test('references, projection keys and category order retain the legacy contract', () => {
  const year = { number: 3, year: 2026 };
  const month = { number: 4, year: 2026, month: 1 };
  const years = { 2026: 3, 2027: 4 };
  const period = { index: 4, number: 11, startAge: 50, endAge: null, isMaster: true, extra: 1 };
  const components: Component[] = [
    { id: 'personal_year', name: '', category: 'legacy', value: year },
    { id: 'personal_month', name: '', category: 'legacy', value: month },
    { id: 'personal_years', name: '', category: 'legacy', value: { years } },
    { id: 'digit_frequency', name: '', category: 'legacy', value: looseDigits },
    { id: 'arbitrary', name: '', category: 'pinnacles', value: period },
    { id: 'arbitrary2', name: '', category: 'pinnacles', value: { ...period, index: 2 } },
    { id: 'arbitrary3', name: '', category: 'challenges', value: period },
  ];
  const chart = extractNumerologyChart(components);
  expect(JSON.stringify(chart)).toBe(JSON.stringify(legacyExtract(components)));
  expect(chart.personalYear).toBe(year);
  expect(chart.personalMonth).toBe(month);
  expect(chart.digitFrequency).toBe(looseDigits);
  expect(chart.personalYears).not.toBe(years);
  expect(chart.personalYears).toEqual(years);
  expect(chart.pinnacles[0]).not.toBe(period);
  expect(chart.pinnacles.map(p => p.index)).toEqual([4, 2]);
  expect(Object.keys(chart.pinnacles[0])).toEqual(['index', 'number', 'startAge', 'endAge']);
});

test('invalid nullish period entries retain the existing throw rather than being silently filtered', () => {
  for (const category of ['pinnacles', 'challenges']) {
    for (const value of [null, undefined]) {
      const components = [{ id: 'loose', name: '', category, value }];
      expect(() => legacyExtract(components)).toThrow(TypeError);
      expect(() => extractNumerologyChart(components)).toThrow(TypeError);
    }
  }
});

// Exact calculator blob e91e8e0856f30df8d7cf590eee5dce7f456b0551.
const BASE_CALCULATOR_SOURCE = "/**\n * @fileoverview Numerology calculator — adapter over the v1 `NumerologyEngine` (V1-03).\n *\n * Uses the input profile's local calendar date (ARCHITECTURE-V2 §3.4), not a\n * clock-gap-shifted date; works with\n * an unknown birth time. Name-derived numbers (expression / soulUrge /\n * personality) are null when the name has no Latin letters — the engine's\n * warning is passed through. Personal year/month are evaluated at `asOf`.\n *\n * @module calculators/numerology/calculator\n */\n\nimport { NumerologyEngine } from '../../engines/NumerologyEngine';\nimport type { TimeContext } from '../../time/types';\nimport { categoryValues, componentValue, normalizeAsOf } from '../birthData';\nimport { profileDateToBirthData } from '../profileDateBirthData';\nimport type { Calculator, CalculatorConfig, ChartResult, Component } from '../types';\nimport { displayNumber } from './numerology';\n\n/** A reduced number (1–9 or master 11/22/33). */\nexport interface NumerologyNumber {\n  number: number;\n  isMaster: boolean;\n  /** `'11/2'` for master numbers, `'7'` otherwise. */\n  display: string;\n}\n\nexport interface NumerologyPeriodValue {\n  index: number;\n  number: number;\n  startAge: number;\n  endAge: number | null;\n}\n\nexport interface NumerologyChart {\n  lifePath: NumerologyNumber | null;\n  birthday: NumerologyNumber | null;\n  attitude: NumerologyNumber | null;\n  expression: NumerologyNumber | null;\n  soulUrge: NumerologyNumber | null;\n  personality: NumerologyNumber | null;\n  pinnacles: NumerologyPeriodValue[];\n  challenges: NumerologyPeriodValue[];\n  personalYear: { number: number; year: number } | null;\n  personalMonth: { number: number; year: number; month: number } | null;\n  /** Personal-year numbers keyed by year, starting at the asOf year. */\n  personalYears: Record<number, number>;\n  /** Counts of digits 1–9 in the birth date. */\n  digitFrequency: Record<string, number> | null;\n}\n\nexport const NUMEROLOGY_CALCULATOR_VERSION = '0.1.1';\n\nfunction numberOf(components: readonly Component[], id: string): NumerologyNumber | null {\n  const v = componentValue<{ number: number; isMaster: boolean }>(components, id);\n  return v ? { number: v.number, isMaster: v.isMaster, display: displayNumber(v.number) } : null;\n}\n\n/** Typed view of the engine components. */\nexport function extractNumerologyChart(components: readonly Component[]): NumerologyChart {\n  const period = ({ index, number, startAge, endAge }: NumerologyPeriodValue): NumerologyPeriodValue => ({\n    index,\n    number,\n    startAge,\n    endAge,\n  });\n  return {\n    lifePath: numberOf(components, 'life_path'),\n    birthday: numberOf(components, 'birthday_number'),\n    attitude: numberOf(components, 'attitude'),\n    expression: numberOf(components, 'expression'),\n    soulUrge: numberOf(components, 'soul_urge'),\n    personality: numberOf(components, 'personality'),\n    pinnacles: categoryValues<NumerologyPeriodValue>(components, 'pinnacles').map(period),\n    challenges: categoryValues<NumerologyPeriodValue>(components, 'challenges').map(period),\n    personalYear: componentValue<{ number: number; year: number }>(components, 'personal_year'),\n    personalMonth: componentValue<{ number: number; year: number; month: number }>(components, 'personal_month'),\n    personalYears: { ...(componentValue<{ years: Record<number, number> }>(components, 'personal_years')?.years ?? {}) },\n    digitFrequency: componentValue<Record<string, number>>(components, 'digit_frequency'),\n  };\n}\n\nexport const numerologyCalculator: Calculator<NumerologyChart> = {\n  id: 'numerology',\n  version: NUMEROLOGY_CALCULATOR_VERSION,\n  // name: optional — used for expression/soulUrge/personality when present.\n  requires: { time: false, location: false, name: false },\n  calculate(ctx: TimeContext, config: CalculatorConfig = {}): ChartResult<NumerologyChart> {\n    const { date } = normalizeAsOf(config.asOf, 'numerology');\n    const birth = profileDateToBirthData(ctx, { name: config.name });\n    const result = new NumerologyEngine({ asOf: date }).run(birth);\n    const components = result.components as Component[];\n    return {\n      system: 'numerology',\n      version: NUMEROLOGY_CALCULATOR_VERSION,\n      chart: extractNumerologyChart(components),\n      components,\n      warnings: [...result.errors],\n    };\n  },\n};\n";
test('type-only adapter refactor leaves executable JavaScript unchanged', async () => {
  const current = await Bun.file(new URL('../src/calculators/numerology/calculator.ts', import.meta.url)).text();
  const transpiler = new Bun.Transpiler({ loader: 'ts' });
  expect(transpiler.transformSync(current)).toBe(transpiler.transformSync(BASE_CALCULATOR_SOURCE));
});
