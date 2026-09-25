/**
 * @fileoverview Jyotish calculator (V2-03, ARCHITECTURE-V2 §4 / §4.1).
 *
 * Needs a known birth time and the birthplace (Lagna depends on both). Time
 * unknown → `time_unknown` warning and an EMPTY chart: no Lagna, houses,
 * Moon-based dasha or transits are guessed (a noon Moon can be off by ±6.5°,
 * i.e. a different nakshatra / dasha lord).
 *
 * `calculate` is pure once `await initEphemeris()` has resolved (throws a clear
 * error otherwise). `config.asOf` (required, D-014) selects the running
 * maha/antar dasha and the transit snapshot.
 *
 * @module calculators/jyotish/calculator
 */

import { EPHEMERIS_MOSHIER_WARNING, type Ayanamsa } from '../astro/ephemeris';
import { ayanamsaValue } from '../astro/positions';
import { flagWarnings, normalizeAsOf } from '../birthData';
import type { TimeContext } from '../../time/types';
import type { Calculator, CalculatorConfig, ChartResult, Component } from '../types';
import {
  dashaAt,
  divisionalChart,
  grahaPositions,
  houseLords,
  isoToJd,
  lagnaPosition,
  requireEphemeris,
  transitSnapshot,
  vimshottari,
  type ActiveDasha,
  type DivisionalChart,
  type GrahaPosition,
  type HouseLord,
  type LagnaPosition,
  type NodeMode,
  type TransitSnapshot,
  type Vimshottari,
} from './jyotish';

export const JYOTISH_CALCULATOR_VERSION = '1.0.0';

export interface JyotishConfig extends CalculatorConfig {
  /** Default 'lahiri'. */
  ayanamsa?: Ayanamsa;
  /** Rahu/Ketu: 'mean' (default) or 'true' node. */
  node?: NodeMode;
  /** Days per Vimshottari year, default 365.25. */
  dashaYearDays?: number;
}

export interface JyotishChart {
  /** False when the birth time is unknown; everything below is then empty/null. */
  timeKnown: boolean;
  settings: { ayanamsa: Ayanamsa; node: NodeMode; dashaYearDays: number; houseSystem: 'whole_sign' };
  /** Ayanamsa value (degrees) at birth; null when time unknown. */
  ayanamsaDegrees: number | null;
  birthJd: number | null;
  lagna: LagnaPosition | null;
  planets: GrahaPosition[];
  houseLords: HouseLord[];
  divisionalCharts: { D1: DivisionalChart; D9: DivisionalChart; D10: DivisionalChart } | null;
  dasha: Vimshottari | null;
  /** State at `config.asOf`. */
  current: {
    asOf: string;
    asOfJd: number;
    dasha: ActiveDasha | null;
    transits: TransitSnapshot | null;
  };
}

const TIME_WARNINGS = ['time_unknown', 'dst_gap', 'dst_overlap'] as const;

function emptyChart(settings: JyotishChart['settings'], asOf: string, asOfJd: number): JyotishChart {
  return {
    timeKnown: false,
    settings,
    ayanamsaDegrees: null,
    birthJd: null,
    lagna: null,
    planets: [],
    houseLords: [],
    divisionalCharts: null,
    dasha: null,
    current: { asOf, asOfJd, dasha: null, transits: null },
  };
}

/** Build the chart (exported for tests / rules; `jyotishCalculator.calculate` wraps it). */
export function buildJyotishChart(ctx: TimeContext, config: JyotishConfig = {}): JyotishChart {
  const { ymd } = normalizeAsOf(config.asOf, 'Jyotish');
  const asOfJd = isoToJd(`${ymd}T00:00:00Z`);
  const settings: JyotishChart['settings'] = {
    ayanamsa: config.ayanamsa ?? 'lahiri',
    node: config.node ?? 'mean',
    dashaYearDays: config.dashaYearDays ?? 365.25,
    houseSystem: 'whole_sign',
  };
  if (ctx.jd === null) return emptyChart(settings, ymd, asOfJd);
  requireEphemeris();

  const opts = { ayanamsa: settings.ayanamsa, node: settings.node };
  const jd = ctx.jd.ut;
  const { lat, lng } = ctx.profile.birthplace;
  const lagna = lagnaPosition(jd, lat, lng, opts);
  const planets = grahaPositions(jd, lagna.sign, opts);
  const moon = planets.find((p) => p.graha === 'moon')!;
  const dasha = vimshottari(moon.longitude, jd, { yearDays: settings.dashaYearDays });

  return {
    timeKnown: true,
    settings,
    ayanamsaDegrees: ayanamsaValue(jd, settings.ayanamsa),
    birthJd: jd,
    lagna,
    planets,
    houseLords: houseLords(lagna.sign, planets),
    divisionalCharts: {
      D1: divisionalChart('D1', planets, lagna.longitude),
      D9: divisionalChart('D9', planets, lagna.longitude),
      D10: divisionalChart('D10', planets, lagna.longitude),
    },
    dasha,
    current: {
      asOf: ymd,
      asOfJd,
      dasha: dashaAt(dasha, asOfJd),
      transits: transitSnapshot(asOfJd, { moonSign: moon.sign, lagnaSign: lagna.sign }, opts),
    },
  };
}

/** v1-style components (id / name / category / value) so the chart can be layered later. */
export function jyotishComponents(chart: JyotishChart): Component[] {
  if (!chart.timeKnown) return [];
  const out: Component[] = [
    {
      id: 'ayanamsa',
      name: `Ayanamsa (${chart.settings.ayanamsa})`,
      category: 'settings',
      value: { ...chart.settings, degrees: chart.ayanamsaDegrees },
    },
    { id: 'lagna', name: 'Lagna 上升', category: 'lagna', value: chart.lagna },
  ];
  for (const p of chart.planets) {
    out.push({ id: `graha_${p.graha}`, name: `${p.name} ${p.nameZh}`, category: 'graha', value: p });
  }
  for (const h of chart.houseLords) {
    const occupants = chart.planets.filter((p) => p.house === h.house).map((p) => p.graha);
    out.push({ id: `house_${h.house}`, name: `第${h.house}宮 Bhava ${h.house}`, category: 'house', value: { ...h, occupants } });
  }
  for (const d of Object.values(chart.divisionalCharts!)) {
    out.push({ id: `varga_${d.id}`, name: `Varga ${d.id}`, category: 'divisional', value: d });
  }
  const v = chart.dasha!;
  out.push({
    id: 'dasha_balance',
    name: 'Vimshottari balance at birth',
    category: 'dasha',
    value: {
      moonNakshatra: v.moonNakshatra,
      lord: v.moonNakshatraLord,
      elapsedFraction: v.elapsedFraction,
      balanceYears: v.balanceYears,
      yearDays: v.yearDays,
    },
  });
  for (const m of v.mahadashas) {
    out.push({
      id: `mahadasha_${m.index}`,
      name: `Mahadasha ${m.lord}`,
      category: 'mahadasha',
      value: {
        lord: m.lord,
        years: m.years,
        start: m.start,
        end: m.end,
        antardashas: m.antardashas.map((a) => ({ lord: a.lord, years: a.years, start: a.start, end: a.end })),
      },
    });
  }
  if (chart.current.dasha) {
    const { maha, antar } = chart.current.dasha;
    out.push({
      id: 'current_dasha',
      name: 'Current dasha',
      category: 'current',
      value: {
        asOf: chart.current.asOf,
        maha: { index: maha.index, lord: maha.lord, start: maha.start, end: maha.end },
        antar: { lord: antar.lord, start: antar.start, end: antar.end },
      },
    });
  }
  if (chart.current.transits) {
    out.push({ id: 'transits', name: 'Gochara (slow grahas)', category: 'current', value: chart.current.transits });
  }
  return out;
}

export const jyotishCalculator: Calculator<JyotishChart, JyotishConfig> = {
  id: 'jyotish',
  version: JYOTISH_CALCULATOR_VERSION,
  requires: { time: true, location: true, name: false },
  calculate(ctx: TimeContext, config: JyotishConfig = {}): ChartResult<JyotishChart> {
    const chart = buildJyotishChart(ctx, config);
    const warnings = flagWarnings(ctx, TIME_WARNINGS);
    if (ctx.jd === null && !warnings.includes('time_unknown')) warnings.unshift('time_unknown');
    if (chart.timeKnown) warnings.push(EPHEMERIS_MOSHIER_WARNING);
    return {
      system: 'jyotish',
      version: JYOTISH_CALCULATOR_VERSION,
      chart,
      components: jyotishComponents(chart),
      warnings,
    };
  },
};

