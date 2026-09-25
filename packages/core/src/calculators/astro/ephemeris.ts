/**
 * @fileoverview Swiss Ephemeris (WASM) loader and thin synchronous wrapper (V2-01, D-027).
 *
 * Library: `@swisseph/browser` — Swiss Ephemeris 2.10.03 compiled to WebAssembly,
 * with the Moshier analytical ephemeris built in (no .se1 data files needed;
 * sub-arcsecond for the planets, a few arcseconds for the Moon, 1800–2200 and
 * far beyond). Runs unchanged in Bun (tests) and the browser (Vite): the WASM is
 * located via `new URL('./swisseph.wasm', import.meta.url)` inside the package.
 *
 * License: Swiss Ephemeris and this binding are AGPL-3.0. Serving the app to
 * others over a network requires publishing the source (see D-027).
 *
 * Lifecycle: `await initEphemeris()` once (idempotent; concurrent callers share
 * one load, a failed load can be retried). Everything after that is synchronous
 * and pure — no clock, no IO. The package is loaded by dynamic `import()` so a
 * web bundle only fetches it when an astro calculator actually runs.
 *
 * Numeric constants below are the documented Swiss Ephemeris C constants
 * (swephexp.h); they are written out so this module has no static runtime
 * import of the WASM package.
 *
 * @module calculators/astro/ephemeris
 */

import type { SwissEphemeris } from '@swisseph/browser';

/** swephexp.h: SEFLG_MOSEPH | SEFLG_SPEED, the flags for every position call. */
export const SEFLG_MOSEPH = 4;
export const SEFLG_SPEED = 256;
export const SEFLG_SIDEREAL = 65536;
export const BASE_FLAGS = SEFLG_MOSEPH | SEFLG_SPEED;

/** swephexp.h body numbers. */
export const SE_BODY = Object.freeze({
  sun: 0,
  moon: 1,
  mercury: 2,
  venus: 3,
  mars: 4,
  jupiter: 5,
  saturn: 6,
  uranus: 7,
  neptune: 8,
  pluto: 9,
  meanNode: 10,
  trueNode: 11,
});

/** swephexp.h SE_SIDM_* ayanamsa modes. */
export const SE_SIDM = Object.freeze({ lahiri: 1, raman: 3, krishnamurti: 5 });

export type Ayanamsa = keyof typeof SE_SIDM;

/** Which ephemeris backs the calculations. Only Moshier today (no .se1 files are shipped). */
export type EphemerisMode = 'moshier';

/**
 * Warning code calculators should add to `ChartResult.warnings` (D-027: without
 * .se1 files we run on the built-in Moshier ephemeris).
 */
export const EPHEMERIS_MOSHIER_WARNING = 'ephemeris:moshier_fallback';

export type RawPosition = {
  longitude: number;
  latitude: number;
  distance: number;
  longitudeSpeed: number;
};

export type RawHouses = { cusps: number[]; ascendant: number; mc: number };

let swe: SwissEphemeris | null = null;
let loading: Promise<void> | null = null;

/** Load the WASM module. Idempotent and safe to call concurrently. */
export function initEphemeris(): Promise<void> {
  if (swe) return Promise.resolve();
  if (!loading) {
    loading = (async () => {
      const mod = await import('@swisseph/browser');
      const instance = new mod.SwissEphemeris();
      await instance.init();
      swe = instance;
    })().catch((err) => {
      loading = null; // allow a retry
      throw err;
    });
  }
  return loading;
}

export function isEphemerisReady(): boolean {
  return swe !== null;
}

function ready(): SwissEphemeris {
  if (!swe) throw new Error('Ephemeris not initialised: await initEphemeris() first');
  return swe;
}

export function ephemerisInfo(): { version: string; mode: EphemerisMode } {
  return { version: ready().version(), mode: 'moshier' };
}

/**
 * Sync wrapper over swe_calc_ut. `jdUt` is a Julian Day in UT; the library
 * applies its own ΔT. Output is apparent geocentric ecliptic of date
 * (tropical, or sidereal when `ayanamsa` is given).
 */
export function calcUt(jdUt: number, body: number, ayanamsa?: Ayanamsa): RawPosition {
  const s = ready();
  assertFinite(jdUt, 'jdUt');
  let flags = BASE_FLAGS;
  if (ayanamsa) {
    s.setSiderealMode(SE_SIDM[ayanamsa], 0, 0);
    flags |= SEFLG_SIDEREAL;
  }
  const p = s.calculatePosition(jdUt, body, flags);
  return { longitude: p.longitude, latitude: p.latitude, distance: p.distance, longitudeSpeed: p.longitudeSpeed };
}

/**
 * True ayanamsa (nutation included) — the exact quantity swe_calc_ut subtracts
 * for SEFLG_SIDEREAL, so `tropical − ayanamsa ≡ sidereal`.
 */
export function ayanamsaUt(jdUt: number, ayanamsa: Ayanamsa): number {
  const s = ready();
  assertFinite(jdUt, 'jdUt');
  s.setSiderealMode(SE_SIDM[ayanamsa], 0, 0);
  return s.getAyanamsaExUt(jdUt, SEFLG_MOSEPH);
}

/** Tropical house cusps via swe_houses. `hsys` is the one-letter SE code. */
export function housesUt(jdUt: number, lat: number, lng: number, hsys: 'P' | 'W' | 'A'): RawHouses {
  const s = ready();
  assertFinite(jdUt, 'jdUt');
  // HouseSystem is a string enum whose values are these letters.
  const h = s.calculateHouses(jdUt, lat, lng, hsys as Parameters<SwissEphemeris['calculateHouses']>[3]);
  return { cusps: h.cusps.slice(1, 13), ascendant: h.ascendant, mc: h.mc };
}

function assertFinite(n: number, name: string): void {
  if (!Number.isFinite(n)) throw new RangeError(`${name} must be a finite number, got ${n}`);
}
