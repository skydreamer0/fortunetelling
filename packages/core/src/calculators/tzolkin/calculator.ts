/**
 * @fileoverview Tzolkin (Dreamspell) calculator — adapter over the v1
 * `DreamspellEngine` (V1-03).
 *
 * Uses the birthplace's local civil date (ARCHITECTURE-V2 §3.4, anchor D-004);
 * no time, location or asOf needed.
 *
 * @module calculators/tzolkin/calculator
 */

import { DreamspellEngine } from '../../engines/DreamspellEngine';
import type { TimeContext } from '../../time/types';
import { componentValue, timeContextToBirthData } from '../birthData';
import type { Calculator, CalculatorConfig, ChartResult, Component } from '../types';
import type { Castle, KinRef } from './tzolkin';

export interface TzolkinNamedKin extends KinRef {
  /** e.g. '白電力巫師'. */
  name: string;
}

export interface TzolkinChart {
  /** 1–260; null only if the engine failed. */
  kin: number | null;
  /** e.g. '電力巫師'. */
  signature: string | null;
  color: string | null;
  tone: { number: number; name: string } | null;
  seal: { number: number; name: string; color: string } | null;
  wavespell: { number: number; startKin: number; seal: number; name: string } | null;
  castle: Castle | null;
  oracle: {
    destiny: TzolkinNamedKin;
    guide: TzolkinNamedKin;
    analog: TzolkinNamedKin;
    antipode: TzolkinNamedKin;
    occult: TzolkinNamedKin;
  } | null;
}

export const TZOLKIN_CALCULATOR_VERSION = '0.1.0';

/** Typed view of the engine components. */
export function extractTzolkinChart(components: readonly Component[]): TzolkinChart {
  const kin = componentValue<{ kin: number; signature: string; color: string }>(components, 'kin');
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
    const birth = timeContextToBirthData(ctx, { name: config.name });
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
