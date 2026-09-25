/**
 * @fileoverview Rave Mandala: the 64 I Ching gates laid around the tropical
 * zodiac (V2-04, ARCHITECTURE-V2 §4.1).
 *
 * Each gate spans 360/64 = 5.625°, each line 5.625/6 = 0.9375°; lines subdivide
 * into 6 colors, colors into 6 tones, tones into 5 bases.
 *
 * The wheel starts with Gate 41 at 302° tropical (2°00′ Aquarius — the Sun
 * enters it around 22 January, the "Rave New Year") and runs forward through
 * the zodiac in the order below. Cross-checks encoded in tests:
 * - the vernal equinox (0° Aries) lies in Gate 25 (28°15′ Pisces – 3°52′30″ Aries);
 * - Gate 1 starts at 13°15′ Scorpio and Gate 2 at 13°15′ Taurus;
 * - classical opposite pairs sit 32 gates (180°) apart: 1/2, 13/7, 25/46,
 *   10/15, 37/40, 9/16, 24/44, 19/33 (the Right Angle Cross gate pairs).
 *
 * Pure data + arithmetic; no ephemeris access.
 *
 * @module calculators/humanDesign/mandala
 */

/** Tropical longitude where the wheel starts (start of Gate 41). */
export const MANDALA_START_DEG = 302;
export const GATE_ARC_DEG = 360 / 64; // 5.625
export const LINE_ARC_DEG = GATE_ARC_DEG / 6; // 0.9375
export const COLOR_ARC_DEG = LINE_ARC_DEG / 6;
export const TONE_ARC_DEG = COLOR_ARC_DEG / 6;
export const BASE_ARC_DEG = TONE_ARC_DEG / 5;

/** Gate order around the wheel, starting at {@link MANDALA_START_DEG}. */
export const GATE_ORDER: readonly number[] = Object.freeze([
  41, 19, 13, 49, 30, 55, 37, 63, 22, 36, 25, 17, 21, 51, 42, 3,
  27, 24, 2, 23, 8, 20, 16, 35, 45, 12, 15, 52, 39, 53, 62, 56,
  31, 33, 7, 4, 29, 59, 40, 64, 47, 6, 46, 18, 48, 57, 32, 50,
  28, 44, 1, 43, 14, 34, 9, 5, 26, 11, 10, 58, 38, 54, 61, 60,
]);

export type Line = 1 | 2 | 3 | 4 | 5 | 6;

export interface GateActivation {
  gate: number;
  line: Line;
  /** 1–6. */
  color: number;
  /** 1–6. */
  tone: number;
  /** 1–5. */
  base: number;
  /** Tropical longitude the activation was computed from, [0, 360). */
  longitude: number;
}

function norm360(d: number): number {
  const r = d % 360;
  return r < 0 ? r + 360 : r === 360 ? 0 : r;
}

/** Start longitude (tropical, [0,360)) of a gate. */
export function gateStartLongitude(gate: number): number {
  const i = GATE_ORDER.indexOf(gate);
  if (i < 0) throw new RangeError(`unknown gate ${gate}`);
  return norm360(MANDALA_START_DEG + i * GATE_ARC_DEG);
}

/**
 * Gate / line / color / tone / base for a tropical ecliptic longitude.
 * Boundaries are half-open: a longitude exactly on a gate start belongs to that gate.
 */
export function longitudeToActivation(longitude: number): GateActivation {
  if (!Number.isFinite(longitude)) throw new RangeError(`longitude must be finite, got ${longitude}`);
  const lon = norm360(longitude);
  const offset = norm360(lon - MANDALA_START_DEG);
  // Clamp indices so floating error at an upper edge never overflows.
  const gateIdx = Math.min(63, Math.floor(offset / GATE_ARC_DEG));
  let rem = offset - gateIdx * GATE_ARC_DEG;
  const lineIdx = Math.min(5, Math.floor(rem / LINE_ARC_DEG));
  rem -= lineIdx * LINE_ARC_DEG;
  const colorIdx = Math.min(5, Math.floor(rem / COLOR_ARC_DEG));
  rem -= colorIdx * COLOR_ARC_DEG;
  const toneIdx = Math.min(5, Math.floor(rem / TONE_ARC_DEG));
  rem -= toneIdx * TONE_ARC_DEG;
  const baseIdx = Math.min(4, Math.floor(rem / BASE_ARC_DEG));
  return {
    gate: GATE_ORDER[gateIdx]!,
    line: (lineIdx + 1) as Line,
    color: colorIdx + 1,
    tone: toneIdx + 1,
    base: baseIdx + 1,
    longitude: lon,
  };
}
