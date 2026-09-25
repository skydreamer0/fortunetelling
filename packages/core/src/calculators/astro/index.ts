/**
 * @fileoverview Astronomy core (Swiss Ephemeris WASM) for Jyotish / Human Design.
 * Call `await initEphemeris()` before any other export; everything else is sync.
 * @module calculators/astro
 */

export {
  initEphemeris,
  isEphemerisReady,
  ephemerisInfo,
  EPHEMERIS_MOSHIER_WARNING,
} from './ephemeris';
export type { Ayanamsa, EphemerisMode } from './ephemeris';
export { planetPositions, ascendantAndHouses, ayanamsaValue, norm360, BODIES } from './positions';
export type {
  Body,
  PlanetPosition,
  PositionOptions,
  SiderealOption,
  HouseSystemId,
  HousesResult,
} from './positions';
export {
  findJdWhenSunLongitude,
  sunLongitude,
  humanDesignDesignJd,
  HD_DESIGN_ARC_DEG,
  SUN_MEAN_MOTION,
} from './sunLongitudeSolve';
export type { SunSolveOptions } from './sunLongitudeSolve';
