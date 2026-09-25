/**
 * @fileoverview 八宅命卦 calculator — adapter over the v1 `MingGuaEngine` (V1-03).
 *
 * Behaviour is exactly the engine's. Since V1-08 the engine uses the exact
 * 立春 instant (D-017 closed); when the birth time is unknown and the birth
 * date is the 立春 day itself, the engine marks `meta.boundaryAmbiguous` and
 * this adapter surfaces it as `near_jie_boundary`.
 *
 * @module calculators/mingGua/calculator
 */

import { MingGuaEngine } from '../../engines/MingGuaEngine';
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

type EngineGua = Omit<MingGuaInfo, 'number'> & { guaNumber: number; bestDirection: string };

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
