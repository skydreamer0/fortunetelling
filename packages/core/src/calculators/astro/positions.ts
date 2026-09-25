/**
 * @fileoverview Planet positions, ascendant/houses and ayanamsa (V2-01).
 *
 * All inputs are Julian Days in UT (`TimeContext.jd.ut`, ARCHITECTURE-V2 §3.4).
 * Positions are apparent geocentric ecliptic-of-date longitudes from Swiss
 * Ephemeris (Moshier mode); sidereal output subtracts the true ayanamsa of the
 * chosen mode. Pure and synchronous once `initEphemeris()` has resolved.
 *
 * @module calculators/astro/positions
 */

import { SE_BODY, ayanamsaUt, calcUt, housesUt, type Ayanamsa } from './ephemeris';

export type Body =
  | 'sun'
  | 'moon'
  | 'mercury'
  | 'venus'
  | 'mars'
  | 'jupiter'
  | 'saturn'
  | 'uranus'
  | 'neptune'
  | 'pluto'
  | 'rahuMean'
  | 'rahuTrue'
  | 'ketuMean'
  | 'ketuTrue';

export type PlanetPosition = {
  body: Body;
  /** Ecliptic longitude, degrees in [0, 360). */
  longitude: number;
  /** Ecliptic latitude, degrees. */
  latitude: number;
  /** Geocentric distance, AU. */
  distance: number;
  /** Longitude speed, degrees/day (negative = retrograde). */
  speed: number;
  retrograde: boolean;
};

export type SiderealOption = { ayanamsa: Ayanamsa };

export type PositionOptions = { sidereal?: SiderealOption };

/** Output order; Ketu entries are derived from the matching Rahu (+180°). */
export const BODIES: readonly Body[] = Object.freeze([
  'sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto',
  'rahuMean', 'rahuTrue', 'ketuMean', 'ketuTrue',
]);

const SE_NUMBER: Readonly<Record<Exclude<Body, 'ketuMean' | 'ketuTrue'>, number>> = Object.freeze({
  sun: SE_BODY.sun,
  moon: SE_BODY.moon,
  mercury: SE_BODY.mercury,
  venus: SE_BODY.venus,
  mars: SE_BODY.mars,
  jupiter: SE_BODY.jupiter,
  saturn: SE_BODY.saturn,
  uranus: SE_BODY.uranus,
  neptune: SE_BODY.neptune,
  pluto: SE_BODY.pluto,
  rahuMean: SE_BODY.meanNode,
  rahuTrue: SE_BODY.trueNode,
});

/** Normalise degrees to [0, 360). */
export function norm360(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r === 360 ? 0 : r;
}

export function planetPositions(jdUt: number, opts: PositionOptions = {}): PlanetPosition[] {
  const ayanamsa = opts.sidereal?.ayanamsa;
  const byBody = new Map<Body, PlanetPosition>();
  for (const [body, seNum] of Object.entries(SE_NUMBER) as [Body, number][]) {
    const p = calcUt(jdUt, seNum, ayanamsa);
    byBody.set(body, {
      body,
      longitude: norm360(p.longitude),
      latitude: p.latitude,
      distance: p.distance,
      speed: p.longitudeSpeed,
      retrograde: p.longitudeSpeed < 0,
    });
  }
  for (const [ketu, rahu] of [['ketuMean', 'rahuMean'], ['ketuTrue', 'rahuTrue']] as const) {
    const r = byBody.get(rahu)!;
    byBody.set(ketu, { ...r, body: ketu, longitude: norm360(r.longitude + 180), latitude: -r.latitude });
  }
  return BODIES.map((b) => byBody.get(b)!);
}

/** True ayanamsa (nutation included) in degrees for a UT Julian Day. */
export function ayanamsaValue(jdUt: number, kind: Ayanamsa): number {
  return ayanamsaUt(jdUt, kind);
}

export type HouseSystemId = 'whole_sign' | 'placidus' | 'equal';

export type HousesResult = {
  system: HouseSystemId;
  /** Ascendant (lagna) longitude in [0, 360). */
  ascendant: number;
  /** Midheaven longitude in [0, 360). */
  mc: number;
  /** Cusps of houses 1–12 (index 0 = house 1), degrees in [0, 360). */
  cusps: number[];
  /** Ayanamsa subtracted, or null for tropical. */
  ayanamsa: number | null;
  warnings: string[];
};

/**
 * Placidus is undefined inside the polar circles; Swiss Ephemeris then returns
 * Porphyry cusps. We flag it rather than silently mislabel the system.
 */
const POLAR_LATITUDE = 66.0;

/**
 * Ascendant, MC and 12 cusps. Sidereal results subtract the ayanamsa from the
 * tropical angles (what swe_houses_ex does for SEFLG_SIDEREAL); whole-sign and
 * equal cusps are then built from the sidereal ascendant.
 */
export function ascendantAndHouses(
  jdUt: number,
  lat: number,
  lng: number,
  system: HouseSystemId,
  sidereal?: SiderealOption,
): HousesResult {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new RangeError(`latitude out of range: ${lat}`);
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new RangeError(`longitude out of range: ${lng}`);
  const warnings: string[] = [];
  const raw = housesUt(jdUt, lat, lng, system === 'placidus' ? 'P' : 'A');
  const ayan = sidereal ? ayanamsaValue(jdUt, sidereal.ayanamsa) : null;
  const shift = ayan ?? 0;
  const ascendant = norm360(raw.ascendant - shift);
  const mc = norm360(raw.mc - shift);
  let cusps: number[];
  if (system === 'placidus') {
    if (Math.abs(lat) >= POLAR_LATITUDE) warnings.push('houses:placidus_polar_porphyry_fallback');
    cusps = raw.cusps.map((c) => norm360(c - shift));
  } else if (system === 'equal') {
    cusps = Array.from({ length: 12 }, (_, i) => norm360(ascendant + 30 * i));
  } else {
    const first = Math.floor(ascendant / 30) * 30;
    cusps = Array.from({ length: 12 }, (_, i) => norm360(first + 30 * i));
  }
  return { system, ascendant, mc, cusps, ayanamsa: ayan, warnings };
}
