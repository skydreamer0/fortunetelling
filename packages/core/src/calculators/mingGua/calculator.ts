/**
 * @fileoverview 八宅命卦 calculator — adapter over the v1 `MingGuaEngine` (V1-03).
 *
 * Behaviour is exactly the engine's, including the Feb-4 立春 approximation
 * (D-017). Births on Feb 3–5 (local civil date) get the
 * `lichun_approximation` warning, as D-017 requires; the exact 立春 instant
 * from the TimeContext is a later task (with a version bump).
 *
 * @module calculators/mingGua/calculator
 */

import { MingGuaEngine } from '../../engines/MingGuaEngine.js';
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
    const nearLichun = birth.month === 2 && birth.day >= 3 && birth.day <= 5;
    return {
      system: 'mingGua',
      version: MINGGUA_CALCULATOR_VERSION,
      chart: extractMingGuaChart(components),
      components,
      warnings: [...(nearLichun ? ['lichun_approximation'] : []), ...result.errors],
    };
  },
};
