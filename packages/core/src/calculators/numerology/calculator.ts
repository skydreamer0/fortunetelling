/**
 * @fileoverview Numerology calculator — adapter over the v1 `NumerologyEngine` (V1-03).
 *
 * Uses the input profile's local calendar date (ARCHITECTURE-V2 §3.4), not a
 * clock-gap-shifted date; works with
 * an unknown birth time. Name-derived numbers (expression / soulUrge /
 * personality) are null when the name has no Latin letters — the engine's
 * warning is passed through. Personal year/month are evaluated at `asOf`.
 *
 * @module calculators/numerology/calculator
 */

import { NumerologyEngine } from '../../engines/NumerologyEngine';
import type {
  NumerologyDigitCounts,
  NumerologyNumberValue,
  NumerologyPersonalMonthValue,
  NumerologyPersonalYearValue,
  NumerologyPersonalYearsValue,
} from '../../engines/numerologyTypes';
import type { NumerologyPeriod } from './numerology';
import type { TimeContext } from '../../time/types';
import { categoryValues, componentValue, normalizeAsOf } from '../birthData';
import { profileDateToBirthData } from '../profileDateBirthData';
import type { Calculator, CalculatorConfig, ChartResult, Component } from '../types';
import { displayNumber } from './numerology';

/** A reduced number (1–9 or master 11/22/33). */
export interface NumerologyNumber extends NumerologyNumberValue {
  /** `'11/2'` for master numbers, `'7'` otherwise. */
  display: string;
}

export interface NumerologyPeriodValue extends NumerologyPeriod {}

export interface NumerologyChart {
  lifePath: NumerologyNumber | null;
  birthday: NumerologyNumber | null;
  attitude: NumerologyNumber | null;
  expression: NumerologyNumber | null;
  soulUrge: NumerologyNumber | null;
  personality: NumerologyNumber | null;
  pinnacles: NumerologyPeriodValue[];
  challenges: NumerologyPeriodValue[];
  personalYear: NumerologyPersonalYearValue | null;
  personalMonth: NumerologyPersonalMonthValue | null;
  /** Personal-year numbers keyed by year, starting at the asOf year. */
  personalYears: NumerologyPersonalYearsValue['years'];
  /** Counts of digits 1–9 in the birth date. */
  digitFrequency: NumerologyDigitCounts | null;
}

export const NUMEROLOGY_CALCULATOR_VERSION = '0.1.1';

function numberOf(components: readonly Component[], id: string): NumerologyNumber | null {
  const v = componentValue<NumerologyNumberValue>(components, id);
  return v ? { number: v.number, isMaster: v.isMaster, display: displayNumber(v.number) } : null;
}

/** Typed view of the engine components. */
export function extractNumerologyChart(components: readonly Component[]): NumerologyChart {
  const period = ({ index, number, startAge, endAge }: NumerologyPeriodValue): NumerologyPeriodValue => ({
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
    pinnacles: categoryValues<NumerologyPeriodValue>(components, 'pinnacles').map(period),
    challenges: categoryValues<NumerologyPeriodValue>(components, 'challenges').map(period),
    personalYear: componentValue<NumerologyPersonalYearValue>(components, 'personal_year'),
    personalMonth: componentValue<NumerologyPersonalMonthValue>(components, 'personal_month'),
    personalYears: { ...(componentValue<Pick<NumerologyPersonalYearsValue, 'years'>>(components, 'personal_years')?.years ?? {}) },
    digitFrequency: componentValue<NumerologyDigitCounts>(components, 'digit_frequency'),
  };
}

export const numerologyCalculator: Calculator<NumerologyChart> = {
  id: 'numerology',
  version: NUMEROLOGY_CALCULATOR_VERSION,
  // name: optional — used for expression/soulUrge/personality when present.
  requires: { time: false, location: false, name: false },
  calculate(ctx: TimeContext, config: CalculatorConfig = {}): ChartResult<NumerologyChart> {
    const { date } = normalizeAsOf(config.asOf, 'numerology');
    const birth = profileDateToBirthData(ctx, { name: config.name });
    const result = new NumerologyEngine({ asOf: date }).run(birth);
    const components = result.components;
    return {
      system: 'numerology',
      version: NUMEROLOGY_CALCULATOR_VERSION,
      chart: extractNumerologyChart(components),
      components,
      warnings: [...result.errors],
    };
  },
};
