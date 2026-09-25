/**
 * Minimal chart input for the 八字 rule engine (V1-10).
 *
 * `fromBaziComponents` adapts today's BaZiEngine components (`natal`, `daYun_N`,
 * `liuNian`); the V1-04 calculator will later build the same `BaziRuleChart` directly.
 */
import { parseGanZhi } from './relations';

export const NATAL_PILLARS = ['year', 'month', 'day', 'hour'] as const;
export type NatalPillar = (typeof NATAL_PILLARS)[number];

export interface BaziLuckCycle {
  index: number;
  ganZhi: string;
  /** ISO date (YYYY-MM-DD). */
  start: string;
  /** ISO date (YYYY-MM-DD), inclusive. */
  end: string;
  /** Source component id; defaults to `daYun_<index>`. */
  componentId?: string;
}

export interface BaziAnnual {
  year: number;
  ganZhi: string;
  /** ISO span; defaults to the Gregorian calendar year. */
  start?: string;
  end?: string;
  /** Source component id; defaults to `liuNian`. */
  componentId?: string;
}

export interface BaziMonthly {
  start: string;
  end: string;
  ganZhi: string;
  componentId?: string;
}

export interface BaziRuleChart {
  pillars: Record<NatalPillar, string | null>;
  luckCycles: BaziLuckCycle[];
  annual?: BaziAnnual;
  monthly?: BaziMonthly[];
  /** Component id of the natal pillars; defaults to `natal`. */
  natalComponentId?: string;
}

interface ComponentLike {
  id: string;
  category?: string;
  value?: any;
}

/**
 * Luck-cycle span convention: BaZiEngine only exposes `startYear`/`endYear`, so a
 * cycle is taken as `startYear-01-01 … endYear-12-31` (year precision).
 */
export function fromBaziComponents(input: readonly ComponentLike[] | { components: readonly ComponentLike[] }): BaziRuleChart {
  const components = Array.isArray(input) ? input : (input as { components: readonly ComponentLike[] }).components;
  if (!Array.isArray(components)) throw new Error('fromBaziComponents: expected a component array or a result with components');

  const natal = components.find((c) => c.id === 'natal');
  const pillars: Record<NatalPillar, string | null> = { year: null, month: null, day: null, hour: null };
  if (natal?.value) {
    pillars.year = natal.value.year ?? null;
    pillars.month = natal.value.month ?? null;
    pillars.day = natal.value.day ?? null;
    // BaZiEngine names the hour pillar `time`.
    pillars.hour = natal.value.time ?? natal.value.hour ?? null;
  }

  const luckCycles: BaziLuckCycle[] = components
    .filter((c) => c.category === 'daYun' && c.value)
    .map((c) => ({
      index: c.value.index,
      ganZhi: c.value.ganZhi,
      start: `${String(c.value.startYear).padStart(4, '0')}-01-01`,
      end: `${String(c.value.endYear).padStart(4, '0')}-12-31`,
      componentId: c.id,
    }));

  const chart: BaziRuleChart = { pillars, luckCycles, natalComponentId: natal ? natal.id : 'natal' };
  const liuNian = components.find((c) => c.category === 'liuNian' && c.value);
  if (liuNian) chart.annual = { year: liuNian.value.year, ganZhi: liuNian.value.ganZhi, componentId: liuNian.id };
  return normalizeChart(chart);
}

/** Validate every 干支 and return a copy with luck cycles / months in canonical order. */
export function normalizeChart(chart: BaziRuleChart): BaziRuleChart {
  for (const p of NATAL_PILLARS) {
    const gz = chart.pillars?.[p];
    if (gz != null) parseGanZhi(gz);
  }
  const luckCycles = [...(chart.luckCycles ?? [])]
    .map((c) => {
      parseGanZhi(c.ganZhi);
      if (!(c.start <= c.end)) throw new Error(`BaziRuleChart: luck cycle ${c.index} start after end`);
      return { ...c };
    })
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.index - b.index));
  const out: BaziRuleChart = {
    pillars: { year: null, month: null, day: null, hour: null, ...chart.pillars },
    luckCycles,
    natalComponentId: chart.natalComponentId ?? 'natal',
  };
  if (chart.annual) {
    parseGanZhi(chart.annual.ganZhi);
    out.annual = { ...chart.annual };
  }
  if (chart.monthly) {
    out.monthly = chart.monthly
      .map((m) => {
        parseGanZhi(m.ganZhi);
        return { ...m };
      })
      .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  }
  return out;
}
