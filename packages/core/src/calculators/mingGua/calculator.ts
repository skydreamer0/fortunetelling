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
import type {
  MingGuaDirectionsValue,
  MingGuaDirectionValue,
  MingGuaMetadata,
  MingGuaValue,
} from '../../engines/mingGuaTypes';
import type { TimeContext } from '../../time/types';
import { componentValue, timeContextToBirthData } from '../birthData';
import type { Calculator, CalculatorConfig, ChartResult, Component } from '../types';

/** Compass code (e.g. 'SE') and Chinese label (e.g. '東南'). */
export interface MingGuaDirection extends MingGuaDirectionValue {}

export interface MingGuaInfo extends Pick<MingGuaValue,
  'name' | 'element' | 'elementZh' | 'group' | 'groupName' | 'yearForGua'
> {
  /** 1–9 except 5. */
  number: MingGuaValue['guaNumber'];
}

export interface MingGuaChart {
  gua: MingGuaInfo | null;
  /** 伏位 direction code. */
  bestDirection: MingGuaValue['bestDirection'] | null;
  /** 生氣 / 天醫 / 延年 / 伏位 and 絕命 / 五鬼 / 六煞 / 禍害. */
  directions: {
    [Kind in keyof MingGuaDirectionsValue]: Record<string, MingGuaDirection>;
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
    const boundaryAmbiguous = Boolean((result.meta as Partial<Pick<MingGuaMetadata, 'boundaryAmbiguous'>> | undefined)?.boundaryAmbiguous);
    return {
      system: 'mingGua',
      version: MINGGUA_CALCULATOR_VERSION,
      chart: extractMingGuaChart(components),
      components,
      warnings: [...(boundaryAmbiguous ? ['near_jie_boundary'] : []), ...result.errors],
    };
  },
};
