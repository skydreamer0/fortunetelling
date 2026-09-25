/**
 * @fileoverview Find the instant the Sun reaches a given tropical longitude (V2-02).
 *
 * Used for the Human Design "design" moment (Sun 88° of arc before the birth
 * Sun, ARCHITECTURE-V2 §4.1) and for cross-checking 節氣 instants. The Sun's
 * apparent longitude increases monotonically (≈0.95–1.02°/day), so Newton's
 * method with the ephemeris' own speed converges in a few steps; a bracketing
 * bisection is the fallback. Deterministic: fixed iteration rules, no clock.
 *
 * @module calculators/astro/sunLongitudeSolve
 */

import { SE_BODY, calcUt } from './ephemeris';
import { norm360 } from './positions';

/** Mean tropical motion of the Sun, °/day (360 / 365.2422). */
export const SUN_MEAN_MOTION = 360 / 365.2422;

export type SunSolveOptions = {
  /** Convergence tolerance in degrees of arc (default 1e-9°, ≈ 0.1 ms of time). */
  toleranceDeg?: number;
  /** Newton iteration cap before falling back to bisection (default 30). */
  maxIterations?: number;
};

/** Apparent tropical Sun longitude at a UT Julian Day, [0, 360). */
export function sunLongitude(jdUt: number): number {
  return norm360(calcUt(jdUt, SE_BODY.sun).longitude);
}

/** Signed angular difference a − b wrapped to (−180, 180]. */
function wrap180(d: number): number {
  const r = norm360(d);
  return r > 180 ? r - 360 : r;
}

/**
 * UT Julian Day at which the apparent tropical Sun longitude equals
 * `targetDeg`, choosing the crossing nearest `aroundJd` (the Sun passes each
 * longitude once a year, so any guess within ±180 days picks a unique root).
 */
export function findJdWhenSunLongitude(targetDeg: number, aroundJd: number, opts: SunSolveOptions = {}): number {
  if (!Number.isFinite(targetDeg)) throw new RangeError(`targetDeg must be finite, got ${targetDeg}`);
  if (!Number.isFinite(aroundJd)) throw new RangeError(`aroundJd must be finite, got ${aroundJd}`);
  const target = norm360(targetDeg);
  const tol = opts.toleranceDeg ?? 1e-9;
  const maxIter = opts.maxIterations ?? 30;

  // Initial guess from mean motion, then Newton with the true speed.
  let jd = aroundJd + wrap180(target - sunLongitude(aroundJd)) / SUN_MEAN_MOTION;
  for (let i = 0; i < maxIter; i++) {
    const p = calcUt(jd, SE_BODY.sun);
    const diff = wrap180(target - p.longitude);
    if (Math.abs(diff) <= tol) return jd;
    jd += diff / p.longitudeSpeed;
  }
  return bisect(target, jd - 2, jd + 2, tol);
}

/** Bisection on [lo, hi] (must bracket the root); fallback path only. */
function bisect(target: number, lo: number, hi: number, tol: number): number {
  const f = (jd: number) => wrap180(sunLongitude(jd) - target);
  if (f(lo) > 0 || f(hi) < 0) throw new Error('findJdWhenSunLongitude: failed to bracket root');
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (Math.abs(fm) <= tol || hi - lo < 1e-12) return mid;
    if (fm < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Human Design design arc: the Sun 88° of longitude before birth. */
export const HD_DESIGN_ARC_DEG = 88;

/** UT Julian Day of the Human Design "design" moment for a birth instant. */
export function humanDesignDesignJd(birthJdUt: number, opts: SunSolveOptions = {}): number {
  const target = sunLongitude(birthJdUt) - HD_DESIGN_ARC_DEG;
  return findJdWhenSunLongitude(target, birthJdUt - HD_DESIGN_ARC_DEG / SUN_MEAN_MOTION, opts);
}
