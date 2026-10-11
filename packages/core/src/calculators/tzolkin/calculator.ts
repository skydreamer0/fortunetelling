/**
 * @fileoverview Tzolkin (Dreamspell) calculator — adapter over the v1
 * `DreamspellEngine` (V1-03).
 *
 * Uses the input profile's local calendar date (ARCHITECTURE-V2 §3.4, anchor D-004),
 * not a clock-gap-shifted date;
 * no time, location or asOf needed.
 *
 * @module calculators/tzolkin/calculator
 */

import { DreamspellEngine } from '../../engines/DreamspellEngine';
import type {
  DreamspellKinValue,
  DreamspellOracleKinValue,
  DreamspellOracleValue,
  DreamspellSealValue,
  DreamspellToneValue,
  DreamspellWavespellValue,
} from '../../engines/dreamspellTypes';
import type { TimeContext } from '../../time/types';
import { componentValue } from '../birthData';
import { profileDateToBirthData } from '../profileDateBirthData';
import type { Calculator, CalculatorConfig, ChartResult, Component } from '../types';
import type { Castle } from './tzolkin';

/** Named oracle Kin, e.g. '白電力巫師'. */
export interface TzolkinNamedKin extends DreamspellOracleKinValue {}

export interface TzolkinChart {
  /** 1–260; null only if the engine failed. */
  kin: DreamspellKinValue['kin'] | null;
  /** e.g. '電力巫師'. */
  signature: DreamspellKinValue['signature'] | null;
  color: DreamspellKinValue['color'] | null;
  tone: DreamspellToneValue | null;
  seal: DreamspellSealValue | null;
  wavespell: DreamspellWavespellValue | null;
  castle: Castle | null;
  oracle: {
    [Role in keyof DreamspellOracleValue]: TzolkinNamedKin;
  } | null;
}

export const TZOLKIN_CALCULATOR_VERSION = '0.1.1';

/** Typed view of the engine components. */
export function extractTzolkinChart(components: readonly Component[]): TzolkinChart {
  const kin = componentValue<DreamspellKinValue>(components, 'kin');
  return {
    kin: kin?.kin ?? null,
    signature: kin?.signature ?? null,
    color: kin?.color ?? null,
    tone: componentValue<TzolkinChart['tone']>(components, 'tone'),
    seal: componentValue<TzolkinChart['seal']>(components, 'seal'),
    wavespell: componentValue<TzolkinChart['wavespell']>(components, 'wavespell'),
    castle: componentValue<Castle>(components, 'castle'),
    oracle: componentValue<TzolkinChart['oracle']>(components, 'oracle'),
  };
}

export const tzolkinCalculator: Calculator<TzolkinChart> = {
  id: 'tzolkin',
  version: TZOLKIN_CALCULATOR_VERSION,
  requires: { time: false, location: false, name: false },
  calculate(ctx: TimeContext, config: CalculatorConfig = {}): ChartResult<TzolkinChart> {
    const birth = profileDateToBirthData(ctx, { name: config.name });
    const result = new DreamspellEngine().run(birth);
    const components = result.components as Component[];
    return {
      system: 'tzolkin',
      version: TZOLKIN_CALCULATOR_VERSION,
      chart: extractTzolkinChart(components),
      components,
      warnings: [...result.errors],
    };
  },
};
