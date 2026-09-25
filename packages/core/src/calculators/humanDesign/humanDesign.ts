/**
 * @fileoverview Human Design chart (V2-04, ARCHITECTURE-V2 §4.1).
 *
 * Two activation sets, both from tropical apparent geocentric longitudes
 * (Swiss Ephemeris, D-027):
 * - Personality: at the birth instant (`TimeContext.jd.ut`).
 * - Design: at the instant the Sun was 88° of longitude earlier
 *   (`humanDesignDesignJd`, ≈ 88–89 days before birth, solved numerically).
 *
 * Bodies: Sun, Earth (Sun + 180°), Moon, North Node, South Node (+180°),
 * Mercury … Pluto. Node convention: **true node** by default. Jovian Archive's
 * MyBodyGraph and most HD software use the true (osculating) node; the mean
 * node is available via `node: 'mean'`. The two differ by up to ~1.7°, i.e.
 * occasionally a different line or gate for the nodes only.
 *
 * Derived structure (all pure, graph-based):
 * - Defined channel: both of its gates are activated (by personality, design or a mix).
 * - Defined center: an endpoint of a defined channel.
 * - Type: no defined center → Reflector; Sacral defined → Generator, or
 *   Manifesting Generator if any motor (Heart, Sacral, Solar Plexus, Root) is
 *   connected to the Throat through defined channels; Sacral undefined →
 *   Manifestor if a motor connects to the Throat, else Projector.
 * - Authority precedence (standard): Solar Plexus (emotional) > Sacral >
 *   Spleen (splenic) > Heart (ego: 'manifested' when the Heart reaches the Throat,
 *   else 'projected') > G connected to Throat (self-projected) > none/mental
 *   (Projector defined only in Head/Ajna/Throat) > lunar (Reflector).
 * - Profile: personality Sun line / design Sun line.
 * - Definition: number of connected components of the defined centers
 *   (0 none, 1 single, 2 split, 3 triple split, 4 quadruple split).
 * - Incarnation Cross: gates of P-Sun, P-Earth, D-Sun, D-Earth; angle from the
 *   profile (Right Angle for 1/3…4/6, Juxtaposition for 4/1, Left Angle for
 *   5/1…6/3). Cross names are not looked up (no verified table shipped).
 *
 * @module calculators/humanDesign/humanDesign
 */

import { humanDesignDesignJd, planetPositions, type PlanetPosition } from '../astro/index';
import {
  CENTERS,
  CHANNELS,
  GATE_CENTER,
  MOTOR_CENTERS,
  type Center,
  type Channel,
} from './bodygraph';
import { LINE_ARC_DEG, MANDALA_START_DEG, longitudeToActivation, type GateActivation, type Line } from './mandala';

export const HD_PLANETS = [
  'sun',
  'earth',
  'moon',
  'northNode',
  'southNode',
  'mercury',
  'venus',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
  'pluto',
] as const;
export type HdPlanet = (typeof HD_PLANETS)[number];

export type NodeKind = 'true' | 'mean';

export interface PlanetActivation extends GateActivation {
  planet: HdPlanet;
}

export type HdType = 'manifestor' | 'generator' | 'manifestingGenerator' | 'projector' | 'reflector';

export type HdAuthority =
  | 'emotional'
  | 'sacral'
  | 'splenic'
  | 'egoManifested'
  | 'egoProjected'
  | 'selfProjected'
  | 'mental'
  | 'lunar';

export type HdDefinition = 'none' | 'single' | 'split' | 'tripleSplit' | 'quadrupleSplit';

export type CrossAngle = 'rightAngle' | 'juxtaposition' | 'leftAngle';

export interface HdProfile {
  personalityLine: Line;
  designLine: Line;
  /** e.g. '1/3'. */
  label: string;
}

export interface HdIncarnationCross {
  angle: CrossAngle;
  personalitySun: number;
  personalityEarth: number;
  designSun: number;
  designEarth: number;
  /** e.g. '13/7 | 1/2' (P-Sun/P-Earth | D-Sun/D-Earth). */
  label: string;
}

export interface HdGate {
  gate: number;
  center: Center;
  /** Planets activating the gate from the personality side. */
  personality: HdPlanet[];
  /** Planets activating the gate from the design side. */
  design: HdPlanet[];
}

export interface HdChannel extends Channel {
  /** Which side(s) activate the channel's two gates. */
  activation: 'personality' | 'design' | 'both' | 'mixed';
}

/** Structure derived from a set of activated gates (no ephemeris). */
export interface HdStructure {
  channels: HdChannel[];
  definedCenters: Center[];
  undefinedCenters: Center[];
  type: HdType;
  authority: HdAuthority;
  definition: HdDefinition;
  /** Connected components of defined centers, each sorted in CENTERS order. */
  components: Center[][];
  /** Motor centers connected to the Throat through defined channels. */
  motorsToThroat: Center[];
}

export interface HumanDesignNatal extends HdStructure {
  birthJdUt: number;
  designJdUt: number;
  node: NodeKind;
  personality: PlanetActivation[];
  design: PlanetActivation[];
  gates: HdGate[];
  profile: HdProfile;
  incarnationCross: HdIncarnationCross;
}

export interface HumanDesignOptions {
  /** Lunar node convention (default 'true'). */
  node?: NodeKind;
}

// ─── Activations ─────────────────────────────────────────────────────────

const add180 = (d: number) => (d + 180) % 360;

/** All 13 activations at a UT Julian Day (tropical). */
export function activationsAt(jdUt: number, node: NodeKind = 'true'): PlanetActivation[] {
  const pos = new Map<string, PlanetPosition>(planetPositions(jdUt).map((p) => [p.body, p]));
  const lon = (b: string) => pos.get(b)!.longitude;
  const nn = lon(node === 'true' ? 'rahuTrue' : 'rahuMean');
  const longitudes: Record<HdPlanet, number> = {
    sun: lon('sun'),
    earth: add180(lon('sun')),
    moon: lon('moon'),
    northNode: nn,
    southNode: add180(nn),
    mercury: lon('mercury'),
    venus: lon('venus'),
    mars: lon('mars'),
    jupiter: lon('jupiter'),
    saturn: lon('saturn'),
    uranus: lon('uranus'),
    neptune: lon('neptune'),
    pluto: lon('pluto'),
  };
  return HD_PLANETS.map((planet) => ({ planet, ...longitudeToActivation(longitudes[planet]) }));
}

// ─── Structure (pure over gates) ─────────────────────────────────────────

const DEFINITIONS: readonly HdDefinition[] = ['none', 'single', 'split', 'tripleSplit', 'quadrupleSplit'];

/**
 * Derive channels, centers, type, authority and definition from activated gates.
 * `designGates` defaults to empty so hand-built gate sets can be tested directly.
 */
export function deriveStructure(
  personalityGates: Iterable<number>,
  designGates: Iterable<number> = [],
): HdStructure {
  const pSet = new Set(personalityGates);
  const dSet = new Set(designGates);
  const on = (g: number) => pSet.has(g) || dSet.has(g);

  const channels: HdChannel[] = CHANNELS.filter((c) => on(c.gates[0]) && on(c.gates[1])).map((c) => {
    const [a, b] = c.gates;
    const pBoth = pSet.has(a) && pSet.has(b);
    const dBoth = dSet.has(a) && dSet.has(b);
    const activation = pBoth && dBoth ? 'both' : pBoth ? 'personality' : dBoth ? 'design' : 'mixed';
    return { ...c, activation };
  });

  const adj = new Map<Center, Set<Center>>(CENTERS.map((c) => [c, new Set<Center>()]));
  for (const ch of channels) {
    const [x, y] = ch.centers;
    adj.get(x)!.add(y);
    adj.get(y)!.add(x);
  }
  const definedSet = new Set<Center>(channels.flatMap((c) => [...c.centers]));
  const definedCenters = CENTERS.filter((c) => definedSet.has(c));
  const undefinedCenters = CENTERS.filter((c) => !definedSet.has(c));

  const reach = (start: Center): Set<Center> => {
    const seen = new Set<Center>([start]);
    const stack = [start];
    while (stack.length) {
      for (const n of adj.get(stack.pop()!)!) {
        if (!seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
    return seen;
  };

  // Connected components, in CENTERS order of their first member.
  const components: Center[][] = [];
  const assigned = new Set<Center>();
  for (const c of definedCenters) {
    if (assigned.has(c)) continue;
    const comp = reach(c);
    comp.forEach((x) => assigned.add(x));
    components.push(CENTERS.filter((x) => comp.has(x)));
  }

  const throatReach = definedSet.has('throat') ? reach('throat') : new Set<Center>();
  const motorsToThroat = MOTOR_CENTERS.filter((m) => throatReach.has(m));
  const motorThroat = motorsToThroat.length > 0;
  const sacral = definedSet.has('sacral');

  let type: HdType;
  if (definedCenters.length === 0) type = 'reflector';
  else if (sacral) type = motorThroat ? 'manifestingGenerator' : 'generator';
  else type = motorThroat ? 'manifestor' : 'projector';

  let authority: HdAuthority;
  if (type === 'reflector') authority = 'lunar';
  else if (definedSet.has('solarPlexus')) authority = 'emotional';
  else if (sacral) authority = 'sacral';
  else if (definedSet.has('spleen')) authority = 'splenic';
  else if (definedSet.has('heart')) authority = throatReach.has('heart') ? 'egoManifested' : 'egoProjected';
  else if (definedSet.has('g') && throatReach.has('g')) authority = 'selfProjected';
  else authority = 'mental';

  const definition = DEFINITIONS[Math.min(components.length, 4)]!;

  return { channels, definedCenters, undefinedCenters, type, authority, definition, components, motorsToThroat };
}

// ─── Profile / cross ─────────────────────────────────────────────────────

export function crossAngle(personalityLine: Line, designLine: Line): CrossAngle {
  if (personalityLine === 4 && designLine === 1) return 'juxtaposition';
  return personalityLine >= 5 ? 'leftAngle' : 'rightAngle';
}

function gatesOf(personality: PlanetActivation[], design: PlanetActivation[]): HdGate[] {
  const map = new Map<number, HdGate>();
  const touch = (a: PlanetActivation, side: 'personality' | 'design') => {
    let g = map.get(a.gate);
    if (!g) {
      g = { gate: a.gate, center: GATE_CENTER[a.gate]!, personality: [], design: [] };
      map.set(a.gate, g);
    }
    g[side].push(a.planet);
  };
  personality.forEach((a) => touch(a, 'personality'));
  design.forEach((a) => touch(a, 'design'));
  return [...map.values()].sort((a, b) => a.gate - b.gate);
}

const find = (acts: PlanetActivation[], p: HdPlanet) => acts.find((a) => a.planet === p)!;

/** Full natal chart. Requires `await initEphemeris()` beforehand. */
export function computeHumanDesign(birthJdUt: number, opts: HumanDesignOptions = {}): HumanDesignNatal {
  const node = opts.node ?? 'true';
  const designJdUt = humanDesignDesignJd(birthJdUt);
  const personality = activationsAt(birthJdUt, node);
  const design = activationsAt(designJdUt, node);
  const structure = deriveStructure(
    personality.map((a) => a.gate),
    design.map((a) => a.gate),
  );
  const pSun = find(personality, 'sun');
  const pEarth = find(personality, 'earth');
  const dSun = find(design, 'sun');
  const dEarth = find(design, 'earth');
  const profile: HdProfile = {
    personalityLine: pSun.line,
    designLine: dSun.line,
    label: `${pSun.line}/${dSun.line}`,
  };
  return {
    birthJdUt,
    designJdUt,
    node,
    personality,
    design,
    gates: gatesOf(personality, design),
    ...structure,
    profile,
    incarnationCross: {
      angle: crossAngle(pSun.line, dSun.line),
      personalitySun: pSun.gate,
      personalityEarth: pEarth.gate,
      designSun: dSun.gate,
      designEarth: dEarth.gate,
      label: `${pSun.gate}/${pEarth.gate} | ${dSun.gate}/${dEarth.gate}`,
    },
  };
}

/** Degrees from `longitude` to the nearest line boundary on the mandala. */
export function distanceToLineBoundary(longitude: number): number {
  const off = (((longitude - MANDALA_START_DEG) % 360) + 360) % 360;
  const r = off % LINE_ARC_DEG;
  return Math.min(r, LINE_ARC_DEG - r);
}
