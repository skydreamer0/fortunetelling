import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { expect, test } from 'vitest';
import { componentValue, timeContextToBirthData } from '../src/calculators/birthData';
import {
  extractMingGuaChart,
  mingGuaCalculator,
  type MingGuaChart,
  type MingGuaDirection,
  type MingGuaInfo,
} from '../src/calculators/mingGua/calculator';
import { liChunUtcMs } from '../src/calculators/mingGua/mingGua';
import type { Component } from '../src/calculators/types';
import { MingGuaEngine } from '../src/engines/MingGuaEngine';
import type {
  MingGuaDirectionsValue,
  MingGuaDirectionValue,
  MingGuaValue,
} from '../src/engines/mingGuaTypes';
import type { BirthProfile } from '../src/profile/types';
import { createTimeContext } from '../src/time/createTimeContext';

// Frozen public shapes from 2c57b39e, independent of the producer contracts.
interface LegacyDirection {
  code: string;
  zh: string;
}

interface LegacyInfo {
  number: number;
  name: string;
  element: string;
  elementZh: string;
  group: 'east' | 'west';
  groupName: string;
  yearForGua: number;
}

interface LegacyChart {
  gua: LegacyInfo | null;
  bestDirection: string | null;
  directions: {
    auspicious: Record<string, LegacyDirection>;
    inauspicious: Record<string, LegacyDirection>;
  } | null;
}

type Accept<T extends true> = T;
type Reject<T extends false> = T;
type IsAny<T> = 0 extends (1 & T) ? true : false;
type Same<A, B> = [A] extends [B] ? [B] extends [A] ? true : false : false;

export type PublicCompatibility = [
  Accept<Same<MingGuaDirection, LegacyDirection>>,
  Accept<Same<MingGuaInfo, LegacyInfo>>,
  Accept<Same<MingGuaChart, LegacyChart>>,
  Accept<Same<keyof MingGuaDirection, keyof LegacyDirection>>,
  Accept<Same<keyof MingGuaInfo, keyof LegacyInfo>>,
  Accept<Same<keyof MingGuaChart, keyof LegacyChart>>,
  Accept<Same<MingGuaDirection, MingGuaDirectionValue>>,
  Accept<Same<NonNullable<MingGuaChart['directions']>, MingGuaDirectionsValue>>,
  Accept<Same<NonNullable<MingGuaChart['bestDirection']>, MingGuaValue['bestDirection']>>,
  Accept<Same<MingGuaInfo['number'], MingGuaValue['guaNumber']>>,
  Accept<Same<Omit<MingGuaInfo, 'number'>, Pick<MingGuaValue,
    'name' | 'element' | 'elementZh' | 'group' | 'groupName' | 'yearForGua'
  >>>,
];

export type NegativeContractChecks = [
  Reject<IsAny<MingGuaChart['gua']>>,
  Reject<IsAny<MingGuaChart['bestDirection']>>,
  Reject<IsAny<MingGuaChart['directions']>>,
  Reject<IsAny<MingGuaInfo['number']>>,
  Reject<IsAny<MingGuaInfo['group']>>,
  Reject<IsAny<MingGuaDirection['code']>>,
  Reject<IsAny<MingGuaDirection['zh']>>,
  Reject<undefined extends MingGuaChart['gua'] ? true : false>,
  Reject<undefined extends MingGuaChart['bestDirection'] ? true : false>,
  Reject<undefined extends MingGuaChart['directions'] ? true : false>,
  Reject<string extends MingGuaInfo['number'] ? true : false>,
  Reject<'north' extends MingGuaInfo['group'] ? true : false>,
  Reject<null extends MingGuaDirection ? true : false>,
  Reject<{ code: string } extends MingGuaDirection ? true : false>,
  Reject<{ code: number; zh: string } extends MingGuaDirection ? true : false>,
  Reject<Omit<LegacyInfo, 'yearForGua'> extends MingGuaInfo ? true : false>,
  Reject<Omit<LegacyChart, 'gua'> extends MingGuaChart ? true : false>,
  Reject<{ auspicious: Record<string, LegacyDirection> } extends MingGuaChart['directions'] ? true : false>,
  Reject<{ auspicious: Record<string, string>; inauspicious: Record<string, string> } extends MingGuaChart['directions'] ? true : false>,
];

// Frozen extraction: assertions above must not silently narrow the loose input
// API, change nullish handling, copy passthrough references or reorder fields.
function legacyExtract(components: readonly Component[]): LegacyChart {
  const g = componentValue<{
    guaNumber: number;
    name: string;
    element: string;
    elementZh: string;
    group: 'east' | 'west';
    groupName: string;
    bestDirection: string;
    yearForGua: number;
  }>(components, 'ming_gua');
  return {
    gua: g
      ? {
          number: g.guaNumber,
          name: g.name,
          element: g.element,
          elementZh: g.elementZh,
          group: g.group,
          groupName: g.groupName,
          yearForGua: g.yearForGua,
        }
      : null,
    bestDirection: g?.bestDirection ?? null,
    directions: componentValue<LegacyChart['directions']>(components, 'directions'),
  };
}

const CHART_KEYS = ['gua', 'bestDirection', 'directions'];
const INFO_KEYS = ['number', 'name', 'element', 'elementZh', 'group', 'groupName', 'yearForGua'];
const EMPTY_CHART = { gua: null, bestDirection: null, directions: null } satisfies MingGuaChart;
const PLACE = { label: 'Taipei', lat: 25.03, lng: 121.5, timezone: 'Asia/Taipei' };

function context(date: string, time: string | null, gender: BirthProfile['gender']) {
  return createTimeContext({
    date, time, gender, timeAccuracy: time === null ? 'unknown' : 'exact', birthplace: PLACE,
  });
}

function checkParity(date: string, time: string | null, gender: BirthProfile['gender']) {
  const ctx = context(date, time, gender);
  const source = new MingGuaEngine().run(timeContextToBirthData(ctx));
  const result = mingGuaCalculator.calculate(ctx);
  const boundaryAmbiguous = Boolean((source.meta as { boundaryAmbiguous?: boolean } | undefined)?.boundaryAmbiguous);
  const expected = {
    system: 'mingGua',
    version: '0.1.0',
    chart: legacyExtract(source.components),
    components: source.components,
    warnings: [...(boundaryAmbiguous ? ['near_jie_boundary'] : []), ...source.errors],
  };
  expect(JSON.stringify(result)).toBe(JSON.stringify(expected));
  expect(Object.keys(result.chart)).toEqual(CHART_KEYS);
  expect(Object.keys(result.chart.gua!)).toEqual(INFO_KEYS);
  expect(result.components.map(component => component.id)).toEqual(['ming_gua', 'directions']);
  return result;
}

test('chart contracts preserve 160 year, gender and known/unknown time adapter results', () => {
  const numbers = new Set<number>();
  for (let year = 1990; year < 2010; year++) {
    for (const gender of ['male', 'female'] as const) {
      for (const time of ['00:00', '12:00', '23:59', null]) {
        const result = checkParity(`${year}-06-15`, time, gender);
        expect(result.warnings).toEqual([]);
        expect(result.chart.gua?.yearForGua).toBe(year);
        numbers.add(result.chart.gua!.number);
      }
    }
  }
  expect([...numbers].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 6, 7, 8, 9]);
});

test('exact Li Chun sides and unknown-time warning order retain existing bytes', () => {
  for (const year of [1920, 1985, 2000, 2021, 2025, 2026]) {
    const boundary = liChunUtcMs(year);
    for (const gender of ['male', 'female'] as const) {
      for (const offset of [-3_600_000, 3_600_000]) {
        const civil = new Date(boundary + offset + 8 * 3_600_000).toISOString();
        const result = checkParity(civil.slice(0, 10), civil.slice(11, 16), gender);
        expect(result.chart.gua?.yearForGua).toBe(offset < 0 ? year - 1 : year);
        expect(result.warnings).toEqual([]);
      }
      const local = new Date(boundary + 8 * 3_600_000).toISOString().slice(0, 10);
      const unknown = checkParity(local, null, gender);
      expect(unknown.warnings[0]).toBe('near_jie_boundary');
      expect(unknown.warnings).toHaveLength(2);
      expect(unknown.warnings[1]).toContain('立春');
      const nextDay = new Date(boundary + 8 * 3_600_000 + 86_400_000).toISOString().slice(0, 10);
      expect(checkParity(nextDay, null, gender).warnings).toEqual([]);
    }
  }
});

function fixtureComponents(): Component[] {
  return new MingGuaEngine().run(timeContextToBirthData(context('1990-06-15', '12:00', 'male'))).components;
}

test('empty, missing and nullish components keep legacy output and property order', () => {
  expect(extractMingGuaChart([])).toEqual(EMPTY_CHART);
  const components = fixtureComponents();
  for (const id of ['ming_gua', 'directions']) {
    const missing = components.filter(component => component.id !== id);
    expect(JSON.stringify(extractMingGuaChart(missing))).toBe(JSON.stringify(legacyExtract(missing)));
    for (const value of [null, undefined]) {
      const loose = components.map(component => component.id === id ? { ...component, value } : component);
      const chart = extractMingGuaChart(loose);
      expect(chart).toEqual(legacyExtract(loose));
      expect(JSON.stringify(chart)).toBe(JSON.stringify(legacyExtract(loose)));
      expect(Object.keys(chart)).toEqual(CHART_KEYS);
      if (id === 'ming_gua') {
        expect(chart.gua).toBeNull();
        expect(chart.bestDirection).toBeNull();
      } else if (value === null) {
        expect(chart.directions).toBeNull();
      } else {
        // A present undefined stays undefined; absence is normalized to null.
        expect(chart.directions).toBeUndefined();
        expect(JSON.stringify(chart)).not.toContain('"directions"');
      }
    }
  }
});

test('first-match ID lookup preserves direction references and gua projection', () => {
  const components = fixtureComponents();
  const directions = { auspicious: { example: { code: 'N', zh: '北' } }, inauspicious: {} };
  const first = { id: 'directions', name: 'first', category: 'legacy-category', value: directions };
  const sourceGua = componentValue<MingGuaValue>(components, 'ming_gua')!;
  const chart = extractMingGuaChart([first, ...components]);
  expect(chart.directions).toBe(directions);
  expect(chart.gua).not.toBe(sourceGua);
  expect(Object.keys(chart.gua!)).toEqual(INFO_KEYS);
  expect(chart.gua).not.toHaveProperty('bestDirection');
  expect(chart.gua).not.toHaveProperty('yearBoundary');
  expect(chart.gua).not.toHaveProperty('liChunUtc');
  expect(JSON.stringify(chart)).toBe(JSON.stringify(legacyExtract([first, ...components])));
  const duplicateGua = { ...components[0], value: { ...sourceGua, name: 'first' } };
  const duplicated = [duplicateGua, ...components];
  expect(extractMingGuaChart(duplicated).gua?.name).toBe('first');
  expect(JSON.stringify(extractMingGuaChart(duplicated))).toBe(JSON.stringify(legacyExtract(duplicated)));
});

// Exact 2c57b39e calculator, blob 0b98e74af57bddb706423e5e4a36eec6df96611e.
const BASE_CALCULATOR_SOURCE = `/**
 * @fileoverview 八宅命卦 calculator — adapter over the v1 \`MingGuaEngine\` (V1-03).
 *
 * Behaviour is exactly the engine's. Since V1-08 the engine uses the exact
 * 立春 instant (D-017 closed); when the birth time is unknown and the birth
 * date is the 立春 day itself, the engine marks \`meta.boundaryAmbiguous\` and
 * this adapter surfaces it as \`near_jie_boundary\`.
 *
 * @module calculators/mingGua/calculator
 */

import { MingGuaEngine } from '../../engines/MingGuaEngine';
import type { MingGuaValue } from '../../engines/mingGuaTypes';
import type { TimeContext } from '../../time/types';
import { componentValue, timeContextToBirthData } from '../birthData';
import type { Calculator, CalculatorConfig, ChartResult, Component } from '../types';

export interface MingGuaDirection {
  /** Compass code, e.g. 'SE'. */
  code: string;
  /** e.g. '東南'. */
  zh: string;
}

export interface MingGuaInfo {
  /** 1–9 except 5. */
  number: number;
  /** Trigram, e.g. '坎'. */
  name: string;
  element: string;
  elementZh: string;
  group: 'east' | 'west';
  groupName: string;
  /** Solar year used (before Feb 4 → previous year). */
  yearForGua: number;
}

export interface MingGuaChart {
  gua: MingGuaInfo | null;
  /** 伏位 direction code. */
  bestDirection: string | null;
  directions: {
    /** 生氣 / 天醫 / 延年 / 伏位. */
    auspicious: Record<string, MingGuaDirection>;
    /** 絕命 / 五鬼 / 六煞 / 禍害. */
    inauspicious: Record<string, MingGuaDirection>;
  } | null;
}

export const MINGGUA_CALCULATOR_VERSION = '0.1.0';

type EngineGua = MingGuaValue;

/** Typed view of the engine components. */
export function extractMingGuaChart(components: readonly Component[]): MingGuaChart {
  const g = componentValue<EngineGua>(components, 'ming_gua');
  return {
    gua: g
      ? {
          number: g.guaNumber,
          name: g.name,
          element: g.element,
          elementZh: g.elementZh,
          group: g.group,
          groupName: g.groupName,
          yearForGua: g.yearForGua,
        }
      : null,
    bestDirection: g?.bestDirection ?? null,
    directions: componentValue<MingGuaChart['directions']>(components, 'directions'),
  };
}

export const mingGuaCalculator: Calculator<MingGuaChart> = {
  id: 'mingGua',
  version: MINGGUA_CALCULATOR_VERSION,
  requires: { time: false, location: false, name: false },
  calculate(ctx: TimeContext, config: CalculatorConfig = {}): ChartResult<MingGuaChart> {
    const birth = timeContextToBirthData(ctx, { name: config.name });
    const result = new MingGuaEngine().run(birth);
    const components = result.components as Component[];
    const boundaryAmbiguous = Boolean((result.meta as { boundaryAmbiguous?: boolean } | undefined)?.boundaryAmbiguous);
    return {
      system: 'mingGua',
      version: MINGGUA_CALCULATOR_VERSION,
      chart: extractMingGuaChart(components),
      components,
      warnings: [...(boundaryAmbiguous ? ['near_jie_boundary'] : []), ...result.errors],
    };
  },
};
`;

test('calculator emits byte-identical JavaScript to the frozen pre-refactor source', async () => {
  const source = readFileSync(new URL('../src/calculators/mingGua/calculator.ts', import.meta.url), 'utf8');
  const transpiler = { transformSync: (source: string) => transformSync(source, { loader: 'ts', format: 'esm', target: 'esnext' }).code };
  const before = transpiler.transformSync(BASE_CALCULATOR_SOURCE);
  const after = transpiler.transformSync(source);
  expect(after.length).toBeGreaterThan(0);
  expect(after).toBe(before);
});
