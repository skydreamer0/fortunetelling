/**
 * @fileoverview Human Design calculator (V2-04, ARCHITECTURE-V2 §4, §4.1).
 *
 * Reads only `ctx.jd.ut` (the birthplace matters only through the UT instant;
 * no houses, so `requires.location` is false). Needs a known birth time: both
 * the personality and design activations depend on it, so with an unknown time
 * the chart is empty and `time_unknown` is warned.
 *
 * `await initEphemeris()` must have resolved before `calculate` (D-027); if not,
 * the chart is empty and `ephemeris:not_initialised` is warned instead of throwing.
 *
 * Warnings: time flags (`time_unknown`, `dst_gap`, `dst_overlap`), then
 * `ephemeris:moshier_fallback`, then `humanDesign:near_profile_line_boundary`
 * when either Sun is within {@link PROFILE_LINE_TOLERANCE_DEG} of a line edge
 * (≈ 30 min of Sun motion — the profile could flip with a slightly different time).
 *
 * @module calculators/humanDesign/calculator
 */

import { EPHEMERIS_MOSHIER_WARNING, isEphemerisReady } from '../astro/index';
import type { TimeContext } from '../../time/types';
import { flagWarnings } from '../birthData';
import type { Calculator, CalculatorConfig, ChartResult, Component } from '../types';
import { CENTERS, CENTER_NAMES, type Center } from './bodygraph';
import {
  computeHumanDesign,
  distanceToLineBoundary,
  type HdAuthority,
  type HdChannel,
  type HdDefinition,
  type HdGate,
  type HdIncarnationCross,
  type HdProfile,
  type HdType,
  type NodeKind,
  type PlanetActivation,
} from './humanDesign';

export const HUMAN_DESIGN_CALCULATOR_VERSION = '1.0.0';

export const EPHEMERIS_NOT_INITIALISED_WARNING = 'ephemeris:not_initialised';
export const NEAR_PROFILE_LINE_WARNING = 'humanDesign:near_profile_line_boundary';
/** Sun moves ~0.0204°/30 min; flag profiles this close to a line edge. */
export const PROFILE_LINE_TOLERANCE_DEG = 0.02;

export interface HumanDesignConfig extends CalculatorConfig {
  /** Lunar node convention (default 'true'). */
  node?: NodeKind;
}

/** Typed chart. All fields empty/null when time is unknown. */
export interface HumanDesignChart {
  birthJdUt: number | null;
  designJdUt: number | null;
  node: NodeKind;
  personality: PlanetActivation[];
  design: PlanetActivation[];
  gates: HdGate[];
  channels: HdChannel[];
  definedCenters: Center[];
  undefinedCenters: Center[];
  type: HdType | null;
  authority: HdAuthority | null;
  profile: HdProfile | null;
  definition: HdDefinition | null;
  incarnationCross: HdIncarnationCross | null;
}

const TIME_WARNINGS = ['time_unknown', 'dst_gap', 'dst_overlap'] as const;

function emptyChart(node: NodeKind): HumanDesignChart {
  return {
    birthJdUt: null,
    designJdUt: null,
    node,
    personality: [],
    design: [],
    gates: [],
    channels: [],
    definedCenters: [],
    undefinedCenters: [],
    type: null,
    authority: null,
    profile: null,
    definition: null,
    incarnationCross: null,
  };
}

const TYPE_NAMES: Record<HdType, string> = {
  manifestor: 'Manifestor',
  generator: 'Generator',
  manifestingGenerator: 'Manifesting Generator',
  projector: 'Projector',
  reflector: 'Reflector',
};

/** v1-style components (ids are stable; `hd_` prefix). */
export function humanDesignComponents(chart: HumanDesignChart): Component[] {
  if (!chart.type) return [];
  const defined = new Set(chart.definedCenters);
  const out: Component[] = [
    { id: 'hd_type', name: 'Type', category: 'type', value: { type: chart.type, name: TYPE_NAMES[chart.type] } },
    { id: 'hd_authority', name: 'Authority', category: 'authority', value: { authority: chart.authority } },
    { id: 'hd_profile', name: 'Profile', category: 'profile', value: chart.profile },
    { id: 'hd_definition', name: 'Definition', category: 'definition', value: { definition: chart.definition } },
    { id: 'hd_incarnation_cross', name: 'Incarnation Cross', category: 'incarnationCross', value: chart.incarnationCross },
  ];
  for (const c of CENTERS) {
    out.push({ id: `hd_center_${c}`, name: CENTER_NAMES[c], category: 'centers', value: { center: c, defined: defined.has(c) } });
  }
  for (const ch of chart.channels) {
    out.push({ id: `hd_channel_${ch.id}`, name: `Channel ${ch.id}`, category: 'channels', value: ch });
  }
  for (const side of ['personality', 'design'] as const) {
    for (const a of chart[side]) {
      out.push({ id: `hd_${side}_${a.planet}`, name: `${side} ${a.planet}`, category: side, value: a });
    }
  }
  return out;
}

export const humanDesignCalculator: Calculator<HumanDesignChart, HumanDesignConfig> = {
  id: 'humanDesign',
  version: HUMAN_DESIGN_CALCULATOR_VERSION,
  requires: { time: true, location: false, name: false },
  calculate(ctx: TimeContext, config: HumanDesignConfig = {}): ChartResult<HumanDesignChart> {
    const node = config.node ?? 'true';
    const warnings = flagWarnings(ctx, TIME_WARNINGS);
    const empty = (extra: string[]): ChartResult<HumanDesignChart> => ({
      system: 'humanDesign',
      version: HUMAN_DESIGN_CALCULATOR_VERSION,
      chart: emptyChart(node),
      components: [],
      warnings: [...warnings, ...extra],
    });

    if (ctx.jd === null) {
      return empty(warnings.includes('time_unknown') ? [] : ['time_unknown']);
    }
    if (!isEphemerisReady()) return empty([EPHEMERIS_NOT_INITIALISED_WARNING]);

    const natal = computeHumanDesign(ctx.jd.ut, { node });
    const chart: HumanDesignChart = {
      birthJdUt: natal.birthJdUt,
      designJdUt: natal.designJdUt,
      node: natal.node,
      personality: natal.personality,
      design: natal.design,
      gates: natal.gates,
      channels: natal.channels,
      definedCenters: natal.definedCenters,
      undefinedCenters: natal.undefinedCenters,
      type: natal.type,
      authority: natal.authority,
      profile: natal.profile,
      definition: natal.definition,
      incarnationCross: natal.incarnationCross,
    };
    warnings.push(EPHEMERIS_MOSHIER_WARNING);
    const suns = [natal.personality, natal.design].map((s) => s.find((a) => a.planet === 'sun')!);
    if (suns.some((s) => distanceToLineBoundary(s.longitude) < PROFILE_LINE_TOLERANCE_DEG)) {
      warnings.push(NEAR_PROFILE_LINE_WARNING);
    }
    return {
      system: 'humanDesign',
      version: HUMAN_DESIGN_CALCULATOR_VERSION,
      chart,
      components: humanDesignComponents(chart),
      warnings,
    };
  },
};
