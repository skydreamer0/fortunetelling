import { expect, test } from 'bun:test';
import { componentValue } from '../src/calculators/birthData';
import {
  extractTzolkinChart,
  tzolkinCalculator,
  type TzolkinChart,
  type TzolkinNamedKin,
} from '../src/calculators/tzolkin/calculator';
import type { Component } from '../src/calculators/types';
import { BirthData } from '../src/core/models/BirthData';
import { DreamspellEngine } from '../src/engines/DreamspellEngine';
import type {
  DreamspellKinValue,
  DreamspellOracleKinValue,
  DreamspellOracleValue,
  DreamspellSealValue,
  DreamspellToneValue,
  DreamspellWavespellValue,
} from '../src/engines/dreamspellTypes';
import { createTimeContext } from '../src/time/createTimeContext';

// Frozen public shapes from before the adapter reused the producer contracts.
// Do not derive these expectations from the implementation under test.
interface LegacyNamedKin {
  kin: number;
  seal: number;
  tone: number;
  name: string;
}

interface LegacyChart {
  kin: number | null;
  signature: string | null;
  color: string | null;
  tone: { number: number; name: string } | null;
  seal: { number: number; name: string; color: string } | null;
  wavespell: { number: number; startKin: number; seal: number; name: string } | null;
  castle: {
    number: 1 | 2 | 3 | 4 | 5;
    name: string;
    nameZh: string;
    color: 'red' | 'white' | 'blue' | 'yellow' | 'green';
    colorZh: string;
    startKin: number;
    endKin: number;
  } | null;
  oracle: {
    destiny: LegacyNamedKin;
    guide: LegacyNamedKin;
    analog: LegacyNamedKin;
    antipode: LegacyNamedKin;
    occult: LegacyNamedKin;
  } | null;
}

type Accept<T extends true> = T;
type Reject<T extends false> = T;
type IsAny<T> = 0 extends (1 & T) ? true : false;
type Same<A, B> = [A] extends [B] ? [B] extends [A] ? true : false : false;

// These compile with the workspace typecheck, including strictNullChecks.
export type PublicCompatibility = [
  Accept<Same<TzolkinNamedKin, LegacyNamedKin>>,
  Accept<Same<TzolkinChart, LegacyChart>>,
  Accept<Same<keyof TzolkinChart, keyof LegacyChart>>,
  Accept<Same<TzolkinNamedKin, DreamspellOracleKinValue>>,
  Accept<Same<NonNullable<TzolkinChart['kin']>, DreamspellKinValue['kin']>>,
  Accept<Same<NonNullable<TzolkinChart['signature']>, DreamspellKinValue['signature']>>,
  Accept<Same<NonNullable<TzolkinChart['color']>, DreamspellKinValue['color']>>,
  Accept<Same<NonNullable<TzolkinChart['tone']>, DreamspellToneValue>>,
  Accept<Same<NonNullable<TzolkinChart['seal']>, DreamspellSealValue>>,
  Accept<Same<NonNullable<TzolkinChart['wavespell']>, DreamspellWavespellValue>>,
  Accept<Same<NonNullable<TzolkinChart['oracle']>, DreamspellOracleValue>>,
];

export type NegativeContractChecks = [
  Reject<IsAny<TzolkinChart['kin']>>,
  Reject<IsAny<TzolkinChart['tone']>>,
  Reject<IsAny<TzolkinChart['seal']>>,
  Reject<IsAny<TzolkinChart['wavespell']>>,
  Reject<IsAny<TzolkinChart['castle']>>,
  Reject<IsAny<TzolkinChart['oracle']>>,
  Reject<IsAny<TzolkinNamedKin['kin']>>,
  Reject<undefined extends TzolkinChart['kin'] ? true : false>,
  Reject<undefined extends TzolkinChart['tone'] ? true : false>,
  Reject<undefined extends TzolkinChart['oracle'] ? true : false>,
  Reject<string extends TzolkinChart['kin'] ? true : false>,
  Reject<{ number: string; name: string } extends TzolkinChart['tone'] ? true : false>,
  Reject<{ number: number } extends TzolkinChart['tone'] ? true : false>,
  Reject<{ number: number; name: string } extends TzolkinChart['seal'] ? true : false>,
  Reject<Omit<DreamspellWavespellValue, 'startKin'> extends TzolkinChart['wavespell'] ? true : false>,
  Reject<Omit<DreamspellOracleValue, 'occult'> extends TzolkinChart['oracle'] ? true : false>,
  Reject<Omit<DreamspellOracleKinValue, 'name'> extends TzolkinNamedKin ? true : false>,
  Reject<Omit<LegacyChart, 'kin'> extends TzolkinChart ? true : false>,
  Reject<null extends TzolkinNamedKin ? true : false>,
];

// The old extraction is retained only as a test oracle. Both nullish handling
// and JSON property order must remain identical, including legacy loose input.
function legacyExtract(components: readonly Component[]): LegacyChart {
  const kin = componentValue<{ kin: number; signature: string; color: string }>(components, 'kin');
  return {
    kin: kin?.kin ?? null,
    signature: kin?.signature ?? null,
    color: kin?.color ?? null,
    tone: componentValue<LegacyChart['tone']>(components, 'tone'),
    seal: componentValue<LegacyChart['seal']>(components, 'seal'),
    wavespell: componentValue<LegacyChart['wavespell']>(components, 'wavespell'),
    castle: componentValue<LegacyChart['castle']>(components, 'castle'),
    oracle: componentValue<LegacyChart['oracle']>(components, 'oracle'),
  };
}

const CHART_KEYS = ['kin', 'signature', 'color', 'tone', 'seal', 'wavespell', 'castle', 'oracle'];
const COMPONENT_IDS = ['kin', 'tone', 'seal', 'wavespell', 'castle', 'oracle'];
const EMPTY_CHART = {
  kin: null, signature: null, color: null, tone: null,
  seal: null, wavespell: null, castle: null, oracle: null,
} satisfies TzolkinChart;

function engine(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new DreamspellEngine().run(new BirthData({ year, month, day }));
}

function calculate(date: string) {
  return tzolkinCalculator.calculate(createTimeContext({
    date,
    time: null,
    timeAccuracy: 'unknown',
    gender: 'female',
    birthplace: { label: 'Taipei', lat: 25.03, lng: 121.5, timezone: 'Asia/Taipei' },
  }));
}

test('chart and producer payloads retain byte parity across all 260 Kin', () => {
  const seen = new Set<number>();
  for (let day = 0; day < 260; day++) {
    // A non-leap span covers each Kin exactly once.
    const date = new Date(Date.UTC(2001, 0, 1 + day)).toISOString().slice(0, 10);
    const source = engine(date);
    const result = calculate(date);
    const expected = legacyExtract(source.components);
    expect(source.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.system).toBe('tzolkin');
    expect(result.version).toBe('0.1.1');
    expect(JSON.stringify(result.components)).toBe(JSON.stringify(source.components));
    expect(result.components.map(component => component.id)).toEqual(COMPONENT_IDS);
    expect(JSON.stringify(result.chart)).toBe(JSON.stringify(expected));
    expect(Object.keys(result.chart)).toEqual(CHART_KEYS);
    expect(result.chart.oracle?.destiny.kin ?? null).toBe(result.chart.kin);
    seen.add(result.chart.kin!);
  }
  expect([...seen].sort((a, b) => a - b)).toEqual(Array.from({ length: 260 }, (_, i) => i + 1));
});

test('epoch, pre-epoch and leap-day charts preserve existing signatures and bytes', () => {
  for (const [date, kin] of [['1987-07-26', 34], ['1939-01-24', 11]] as const) {
    expect(calculate(date).chart.kin).toBe(kin);
  }
  for (const year of [2000, 2024]) {
    const before = calculate(`${year}-02-28`);
    const leap = calculate(`${year}-02-29`);
    const after = calculate(`${year}-03-01`);
    expect(JSON.stringify(leap)).toBe(JSON.stringify(before));
    expect(after.chart.kin).toBe((leap.chart.kin! % 260) + 1);
    for (const day of ['02-28', '02-29', '03-01']) {
      const components = engine(`${year}-${day}`).components;
      expect(JSON.stringify(extractTzolkinChart(components))).toBe(JSON.stringify(legacyExtract(components)));
    }
  }
});

test('empty and individually missing components retain nullable fields and output order', () => {
  expect(extractTzolkinChart([])).toEqual(EMPTY_CHART);
  const components = engine('1987-07-26').components;
  for (const id of COMPONENT_IDS) {
    const partial = components.filter(component => component.id !== id);
    const chart = extractTzolkinChart(partial);
    expect(JSON.stringify(chart)).toBe(JSON.stringify(legacyExtract(partial)));
    expect(Object.keys(chart)).toEqual(CHART_KEYS);
    const missing = id === 'kin' ? ['kin', 'signature', 'color'] as const : [id as keyof TzolkinChart];
    for (const key of missing) expect(chart[key]).toBeNull();
  }
});

test('loose legacy nullish values remain unchanged without adding runtime validation', () => {
  const components = engine('1987-07-26').components;
  for (const id of COMPONENT_IDS) {
    for (const value of [null, undefined]) {
      const loose = components.map(component => component.id === id ? { ...component, value } : component);
      const chart = extractTzolkinChart(loose);
      expect(chart).toEqual(legacyExtract(loose));
      expect(JSON.stringify(chart)).toBe(JSON.stringify(legacyExtract(loose)));
      expect(Object.keys(chart)).toEqual(CHART_KEYS);
      if (id === 'kin') {
        expect([chart.kin, chart.signature, chart.color]).toEqual([null, null, null]);
      } else {
        // componentValue returns an emitted undefined unchanged, unlike absence.
        if (value === null) expect(chart[id as keyof TzolkinChart]).toBeNull();
        else expect(chart[id as keyof TzolkinChart]).toBeUndefined();
      }
    }
  }
});

test('extraction keeps first-match lookup and passes through payload references', () => {
  const components = engine('1987-07-26').components;
  const duplicate = { id: 'tone', name: 'duplicate', category: 'tone', value: { number: 1, name: 'first' } };
  const chart = extractTzolkinChart([duplicate, ...components]);
  expect(chart.tone).toBe(duplicate.value);
  for (const id of ['seal', 'wavespell', 'castle', 'oracle'] as const) {
    expect(chart[id]).toBe(components.find(component => component.id === id)!.value);
  }
  expect(JSON.stringify(chart)).toBe(JSON.stringify(legacyExtract([duplicate, ...components])));
});

// Exact calculator source at 15e4919b (blob f72eb625bbcc70bc920751ca16f4fb834cc0b8c9).
// Compare actual emitted JavaScript rather than inferring erasure from the diff.
const BASE_CALCULATOR_SOURCE = `/**
 * @fileoverview Tzolkin (Dreamspell) calculator — adapter over the v1
 * \`DreamspellEngine\` (V1-03).
 *
 * Uses the input profile's local calendar date (ARCHITECTURE-V2 §3.4, anchor D-004),
 * not a clock-gap-shifted date;
 * no time, location or asOf needed.
 *
 * @module calculators/tzolkin/calculator
 */

import { DreamspellEngine } from '../../engines/DreamspellEngine';
import type { TimeContext } from '../../time/types';
import { componentValue } from '../birthData';
import { profileDateToBirthData } from '../profileDateBirthData';
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

export const TZOLKIN_CALCULATOR_VERSION = '0.1.1';

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
`;

test('calculator emits byte-identical JavaScript to the frozen pre-refactor source', async () => {
  const source = await Bun.file(new URL('../src/calculators/tzolkin/calculator.ts', import.meta.url)).text();
  const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'bun' });
  const before = transpiler.transformSync(BASE_CALCULATOR_SOURCE);
  const after = transpiler.transformSync(source);
  expect(after.length).toBeGreaterThan(0);
  expect(after).toBe(before);
});
