/**
 * @fileoverview Jyotish (Vedic / Parashari) chart math (V2-03).
 *
 * Every planetary longitude, the ayanamsa and the lunar nodes come from Swiss
 * Ephemeris via `calculators/astro` (D-027); this module only does the
 * traditional arithmetic on top. Everything is pure and synchronous, but the
 * ephemeris must have been initialised with `await initEphemeris()` — calling
 * any ephemeris-backed function before that throws a clear error.
 *
 * Conventions (all documented here so they can be cross-checked):
 *
 * - **Zodiac**: sidereal, default Lahiri (Chitrapaksha) ayanamsa, true
 *   (nutation-included) value as returned by Swiss Ephemeris. Raman and
 *   Krishnamurti are selectable.
 * - **Nodes**: Rahu = mean node by default (`node: 'true'` selects the
 *   osculating node); Ketu = Rahu + 180°.
 * - **Houses**: whole-sign from the Lagna sign (house 1 = Lagna sign).
 * - **Nakshatra**: 27 equal spans of 13°20′ from 0° sidereal Aries; each has 4
 *   padas of 3°20′.
 * - **Dignity** (Brihat Parashara Hora Shastra, ch. 3), resolved in this order:
 *     1. exaltation sign → `exalted` (whole sign), EXCEPT where the exaltation
 *        sign is also the moolatrikona sign: Moon in Taurus is exalted 0–3°,
 *        moolatrikona 3–30°; Mercury in Virgo is exalted 0–15°, moolatrikona
 *        15–20°, own 20–30°.
 *     2. debilitation sign (7th from exaltation) → `debilitated`.
 *     3. moolatrikona range → `moolatrikona`:
 *        Sun Leo 0–20°, Moon Taurus 3–30°, Mars Aries 0–12°, Mercury Virgo
 *        15–20°, Jupiter Sagittarius 0–10°, Venus Libra 0–15°, Saturn
 *        Aquarius 0–20°.
 *     4. own sign (traditional rulers) → `own`.
 *     5. otherwise `neutral`.
 *   Nodes: the texts disagree; we use the widely used convention Rahu exalted
 *   in Taurus / debilitated in Scorpio, Ketu exalted in Scorpio / debilitated
 *   in Taurus, and no own/moolatrikona signs for the nodes.
 *   Friendship-based dignities (friend/enemy sign) are not modelled.
 * - **House lords**: traditional seven rulers (no Uranus/Neptune/Pluto).
 * - **Divisional charts** (BPHS ch. 6):
 *     D1 (rashi) = the sign itself.
 *     D9 (navamsa): 9 parts of 3°20′. Movable signs (Aries, Cancer, Libra,
 *       Capricorn) count from the sign itself, fixed signs (Taurus, Leo,
 *       Scorpio, Aquarius) from the 9th, dual signs (Gemini, Virgo,
 *       Sagittarius, Pisces) from the 5th. This is identical to
 *       `floor(longitude / 3°20′) mod 12` counted from Aries.
 *     D10 (dasamsa): 10 parts of 3°. Odd signs count from the sign itself,
 *       even signs from the 9th sign from it.
 * - **Vimshottari dasha**: nakshatra lord sequence Ketu 7, Venus 20, Sun 6,
 *   Moon 10, Mars 7, Rahu 18, Jupiter 16, Saturn 19, Mercury 17 (= 120 y).
 *   Birth mahadasha = lord of the Moon's nakshatra; the fraction of that
 *   nakshatra already traversed is the fraction of the mahadasha already
 *   elapsed at birth. Antardashas start with the mahadasha lord and follow the
 *   same order; antar length = maha length × antarYears / 120.
 *   Year length: 365.25 days (Julian year). Some schools use a 360-day
 *   "savana" year or the sidereal year (365.2564 d) — the result dates then
 *   drift by up to ~1.7 years over 120 years; select via `yearDays`.
 *
 * @module calculators/jyotish/jyotish
 */

import { isEphemerisReady, type Ayanamsa } from '../astro/ephemeris';
import { ascendantAndHouses, norm360, planetPositions } from '../astro/positions';

// ─── Static tables ────────────────────────────────────────────────────────────

export const GRAHAS = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn', 'rahu', 'ketu'] as const;
export type Graha = (typeof GRAHAS)[number];
/** The seven visible planets that can rule a sign. */
export type SignLord = Exclude<Graha, 'rahu' | 'ketu'>;

export const GRAHA_NAMES: Readonly<Record<Graha, { sanskrit: string; zh: string }>> = Object.freeze({
  sun: { sanskrit: 'Surya', zh: '太陽' },
  moon: { sanskrit: 'Chandra', zh: '月亮' },
  mars: { sanskrit: 'Mangala', zh: '火星' },
  mercury: { sanskrit: 'Budha', zh: '水星' },
  jupiter: { sanskrit: 'Guru', zh: '木星' },
  venus: { sanskrit: 'Shukra', zh: '金星' },
  saturn: { sanskrit: 'Shani', zh: '土星' },
  rahu: { sanskrit: 'Rahu', zh: '羅睺' },
  ketu: { sanskrit: 'Ketu', zh: '計都' },
});

export interface SignInfo {
  /** 1 = Aries … 12 = Pisces. */
  number: number;
  sanskrit: string;
  english: string;
  zh: string;
  lord: SignLord;
  modality: 'movable' | 'fixed' | 'dual';
}

const SIGN_ROWS: [string, string, string, SignLord][] = [
  ['Mesha', 'Aries', '白羊', 'mars'],
  ['Vrishabha', 'Taurus', '金牛', 'venus'],
  ['Mithuna', 'Gemini', '雙子', 'mercury'],
  ['Karka', 'Cancer', '巨蟹', 'moon'],
  ['Simha', 'Leo', '獅子', 'sun'],
  ['Kanya', 'Virgo', '處女', 'mercury'],
  ['Tula', 'Libra', '天秤', 'venus'],
  ['Vrishchika', 'Scorpio', '天蠍', 'mars'],
  ['Dhanu', 'Sagittarius', '射手', 'jupiter'],
  ['Makara', 'Capricorn', '摩羯', 'saturn'],
  ['Kumbha', 'Aquarius', '水瓶', 'saturn'],
  ['Meena', 'Pisces', '雙魚', 'jupiter'],
];
const MODALITIES = ['movable', 'fixed', 'dual'] as const;

export const SIGNS: readonly SignInfo[] = Object.freeze(
  SIGN_ROWS.map(([sanskrit, english, zh, lord], i) =>
    Object.freeze({ number: i + 1, sanskrit, english, zh, lord, modality: MODALITIES[i % 3] }),
  ),
);

export interface NakshatraInfo {
  /** 1–27. */
  number: number;
  name: string;
  /** Vimshottari lord. */
  lord: Graha;
}

const NAKSHATRA_NAMES = [
  'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu', 'Pushya', 'Ashlesha',
  'Magha', 'Purva Phalguni', 'Uttara Phalguni', 'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha',
  'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha', 'Purva Bhadrapada',
  'Uttara Bhadrapada', 'Revati',
];

/** Vimshottari order (also the nakshatra-lord cycle starting at Ashwini). */
export const DASHA_ORDER: readonly Graha[] = Object.freeze([
  'ketu', 'venus', 'sun', 'moon', 'mars', 'rahu', 'jupiter', 'saturn', 'mercury',
]);

export const DASHA_YEARS: Readonly<Record<Graha, number>> = Object.freeze({
  ketu: 7, venus: 20, sun: 6, moon: 10, mars: 7, rahu: 18, jupiter: 16, saturn: 19, mercury: 17,
});

export const VIMSHOTTARI_TOTAL_YEARS = 120;

export const NAKSHATRAS: readonly NakshatraInfo[] = Object.freeze(
  NAKSHATRA_NAMES.map((name, i) => Object.freeze({ number: i + 1, name, lord: DASHA_ORDER[i % 9] })),
);

/** 13°20′ */
export const NAKSHATRA_SPAN = 360 / 27;
/** 3°20′ */
export const PADA_SPAN = NAKSHATRA_SPAN / 4;
/** 3°20′ */
export const NAVAMSA_SPAN = 30 / 9;
/** 3° */
export const DASAMSA_SPAN = 30 / 10;

export type Dignity = 'exalted' | 'debilitated' | 'moolatrikona' | 'own' | 'neutral';

/** Exaltation sign (1–12) per BPHS; nodes per the convention in the module doc. */
export const EXALTATION_SIGN: Readonly<Record<Graha, number>> = Object.freeze({
  sun: 1, moon: 2, mars: 10, mercury: 6, jupiter: 4, venus: 12, saturn: 7, rahu: 2, ketu: 8,
});

/** Moolatrikona sign and degree range [from, to) within it. */
export const MOOLATRIKONA: Readonly<Partial<Record<Graha, { sign: number; from: number; to: number }>>> = Object.freeze({
  sun: { sign: 5, from: 0, to: 20 },
  moon: { sign: 2, from: 3, to: 30 },
  mars: { sign: 1, from: 0, to: 12 },
  mercury: { sign: 6, from: 15, to: 20 },
  jupiter: { sign: 9, from: 0, to: 10 },
  venus: { sign: 7, from: 0, to: 15 },
  saturn: { sign: 11, from: 0, to: 20 },
});

/** Exaltation portion when the exaltation sign is also the moolatrikona sign. */
const EXALTED_UP_TO: Readonly<Partial<Record<Graha, number>>> = Object.freeze({ moon: 3, mercury: 15 });

// ─── Pure arithmetic ──────────────────────────────────────────────────────────

/** Sign number 1–12 for a sidereal longitude. */
export function signOf(longitude: number): number {
  return Math.floor(norm360(longitude) / 30) + 1;
}

/** Wrap any integer to a sign number 1–12. */
export function wrapSign(n: number): number {
  return ((((n - 1) % 12) + 12) % 12) + 1;
}

export function signInfo(sign: number): SignInfo {
  const s = SIGNS[sign - 1];
  if (!s) throw new RangeError(`sign must be 1–12, got ${sign}`);
  return s;
}

/** Whole-sign house (1–12) of `sign` counted from `fromSign` (fromSign itself = 1). */
export function houseFrom(fromSign: number, sign: number): number {
  return wrapSign(sign - fromSign + 1);
}

export interface NakshatraPosition {
  number: number;
  name: string;
  lord: Graha;
  /** 1–4. */
  pada: number;
  /** Fraction of the nakshatra already traversed, [0, 1). */
  fraction: number;
}

/**
 * Absolute pada index 0–107 (= absolute navamsa index): each is 3°20′.
 * Computed as `lon × 108 / 360` (not `lon / 3.333…`) so exact boundaries such
 * as 20° do not fall one step short through floating-point error.
 */
function padaIndex(lon: number): number {
  return Math.min(107, Math.floor((lon * 108) / 360));
}

export function nakshatraOf(longitude: number): NakshatraPosition {
  const lon = norm360(longitude);
  const abs = padaIndex(lon);
  const idx = Math.floor(abs / 4);
  const n = NAKSHATRAS[idx];
  const fraction = Math.min(Math.max((lon * 27) / 360 - idx, 0), 1 - Number.EPSILON);
  return { number: n.number, name: n.name, lord: n.lord, pada: (abs % 4) + 1, fraction };
}

/** Navamsa (D9) sign 1–12 — see module doc for the movable/fixed/dual rule. */
export function navamsaSign(longitude: number): number {
  const lon = norm360(longitude);
  const abs = padaIndex(lon);
  const sign = Math.floor(abs / 9) + 1;
  const part = abs % 9;
  const modality = signInfo(sign).modality;
  const start = modality === 'movable' ? sign : modality === 'fixed' ? wrapSign(sign + 8) : wrapSign(sign + 4);
  return wrapSign(start + part);
}

/** Dasamsa (D10) sign 1–12: odd signs count from themselves, even signs from the 9th. */
export function dasamsaSign(longitude: number): number {
  const lon = norm360(longitude);
  const abs = Math.min(119, Math.floor(lon / DASAMSA_SPAN));
  const sign = Math.floor(abs / 10) + 1;
  const part = abs % 10;
  const start = sign % 2 === 1 ? sign : wrapSign(sign + 8);
  return wrapSign(start + part);
}

export type DivisionalChartId = 'D1' | 'D9' | 'D10';

export function divisionalSign(chart: DivisionalChartId, longitude: number): number {
  if (chart === 'D1') return signOf(longitude);
  if (chart === 'D9') return navamsaSign(longitude);
  return dasamsaSign(longitude);
}

/** Dignity of a graha at a sidereal longitude (rules in the module doc). */
export function dignityOf(graha: Graha, longitude: number): Dignity {
  const sign = signOf(longitude);
  const deg = norm360(longitude) - (sign - 1) * 30;
  const exSign = EXALTATION_SIGN[graha];
  const mt = MOOLATRIKONA[graha];
  if (sign === exSign) {
    const upTo = EXALTED_UP_TO[graha];
    if (upTo === undefined || deg < upTo) return 'exalted';
  }
  if (sign === wrapSign(exSign + 6)) return 'debilitated';
  if (mt && mt.sign === sign && deg >= mt.from && deg < mt.to) return 'moolatrikona';
  if (graha !== 'rahu' && graha !== 'ketu' && signInfo(sign).lord === graha) return 'own';
  return 'neutral';
}

// ─── Ephemeris-backed chart ───────────────────────────────────────────────────

export type NodeMode = 'mean' | 'true';

export interface JyotishOptions {
  /** Default 'lahiri'. */
  ayanamsa?: Ayanamsa;
  /** Rahu/Ketu node type, default 'mean'. */
  node?: NodeMode;
}

export interface SignPlacement {
  sign: number;
  signName: string;
  signNameZh: string;
  /** Degrees within the sign, [0, 30). */
  degree: number;
}

export interface GrahaPosition extends SignPlacement {
  graha: Graha;
  name: string;
  nameZh: string;
  /** Sidereal ecliptic longitude, [0, 360). */
  longitude: number;
  /** °/day. */
  speed: number;
  retrograde: boolean;
  nakshatra: number;
  nakshatraName: string;
  nakshatraLord: Graha;
  pada: number;
  /** Whole-sign house from the Lagna; null when there is no Lagna. */
  house: number | null;
  dignity: Dignity;
}

export interface LagnaPosition extends SignPlacement {
  longitude: number;
  nakshatra: number;
  nakshatraName: string;
  pada: number;
}

export function requireEphemeris(): void {
  if (!isEphemerisReady()) {
    throw new Error('Jyotish: ephemeris not initialised — await initEphemeris() from calculators/astro first');
  }
}

function placement(longitude: number): SignPlacement {
  const sign = signOf(longitude);
  const s = signInfo(sign);
  return { sign, signName: s.sanskrit, signNameZh: s.zh, degree: norm360(longitude) - (sign - 1) * 30 };
}

const ASTRO_BODY: Record<Graha, Record<NodeMode, string>> = {
  sun: { mean: 'sun', true: 'sun' },
  moon: { mean: 'moon', true: 'moon' },
  mars: { mean: 'mars', true: 'mars' },
  mercury: { mean: 'mercury', true: 'mercury' },
  jupiter: { mean: 'jupiter', true: 'jupiter' },
  venus: { mean: 'venus', true: 'venus' },
  saturn: { mean: 'saturn', true: 'saturn' },
  rahu: { mean: 'rahuMean', true: 'rahuTrue' },
  ketu: { mean: 'ketuMean', true: 'ketuTrue' },
};

/** Raw sidereal longitude + speed of the nine grahas at a UT Julian Day. */
export function siderealGrahas(
  jdUt: number,
  opts: JyotishOptions = {},
): Record<Graha, { longitude: number; speed: number }> {
  requireEphemeris();
  const ayanamsa = opts.ayanamsa ?? 'lahiri';
  const node = opts.node ?? 'mean';
  const all = planetPositions(jdUt, { sidereal: { ayanamsa } });
  const out = {} as Record<Graha, { longitude: number; speed: number }>;
  for (const g of GRAHAS) {
    const p = all.find((x) => x.body === ASTRO_BODY[g][node])!;
    out[g] = { longitude: p.longitude, speed: p.speed };
  }
  return out;
}

/** Full graha positions; `lagnaSign` null → houses are null. */
export function grahaPositions(jdUt: number, lagnaSign: number | null, opts: JyotishOptions = {}): GrahaPosition[] {
  const raw = siderealGrahas(jdUt, opts);
  return GRAHAS.map((g) => {
    const { longitude, speed } = raw[g];
    const nak = nakshatraOf(longitude);
    const pl = placement(longitude);
    return {
      graha: g,
      name: GRAHA_NAMES[g].sanskrit,
      nameZh: GRAHA_NAMES[g].zh,
      longitude,
      speed,
      // Sun and Moon are never retrograde; nodes follow their speed sign.
      retrograde: g !== 'sun' && g !== 'moon' && speed < 0,
      ...pl,
      nakshatra: nak.number,
      nakshatraName: nak.name,
      nakshatraLord: nak.lord,
      pada: nak.pada,
      house: lagnaSign === null ? null : houseFrom(lagnaSign, pl.sign),
      dignity: dignityOf(g, longitude),
    };
  });
}

export function lagnaPosition(jdUt: number, lat: number, lng: number, opts: JyotishOptions = {}): LagnaPosition {
  requireEphemeris();
  const h = ascendantAndHouses(jdUt, lat, lng, 'whole_sign', { ayanamsa: opts.ayanamsa ?? 'lahiri' });
  const nak = nakshatraOf(h.ascendant);
  return {
    longitude: h.ascendant,
    ...placement(h.ascendant),
    nakshatra: nak.number,
    nakshatraName: nak.name,
    pada: nak.pada,
  };
}

// ─── House lords ─────────────────────────────────────────────────────────────

export interface HouseLord {
  house: number;
  sign: number;
  signName: string;
  lord: SignLord;
  /** House the lord occupies (whole sign), when positions are known. */
  lordHouse: number | null;
}

export function houseLords(lagnaSign: number, grahas: readonly GrahaPosition[] = []): HouseLord[] {
  return Array.from({ length: 12 }, (_, i) => {
    const sign = wrapSign(lagnaSign + i);
    const s = signInfo(sign);
    const lordPos = grahas.find((g) => g.graha === s.lord);
    return { house: i + 1, sign, signName: s.sanskrit, lord: s.lord, lordHouse: lordPos ? houseFrom(lagnaSign, lordPos.sign) : null };
  });
}

/** Houses (from Lagna) a graha rules; empty for the nodes. */
export function housesRuledBy(graha: Graha, lagnaSign: number): number[] {
  const out: number[] = [];
  for (let h = 1; h <= 12; h++) if (signInfo(wrapSign(lagnaSign + h - 1)).lord === graha) out.push(h);
  return out;
}

// ─── Divisional charts ───────────────────────────────────────────────────────

export interface DivisionalChart {
  id: DivisionalChartId;
  /** Divisional Lagna sign, null when time is unknown. */
  lagna: number | null;
  /** Divisional sign (1–12) of each graha. */
  grahas: Record<Graha, number>;
}

export function divisionalChart(
  id: DivisionalChartId,
  grahas: readonly { graha: Graha; longitude: number }[],
  lagnaLongitude: number | null,
): DivisionalChart {
  const signs = {} as Record<Graha, number>;
  for (const g of grahas) signs[g.graha] = divisionalSign(id, g.longitude);
  return { id, lagna: lagnaLongitude === null ? null : divisionalSign(id, lagnaLongitude), grahas: signs };
}

// ─── Vimshottari dasha ───────────────────────────────────────────────────────

export const UNIX_EPOCH_JD = 2440587.5;

/** UT Julian Day → 'YYYY-MM-DDTHH:mm:ssZ' (rounded to whole seconds). */
export function jdToIso(jd: number): string {
  const ms = Math.round((jd - UNIX_EPOCH_JD) * 86400) * 1000;
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function isoToJd(iso: string | Date): number {
  const ms = iso instanceof Date ? iso.getTime() : Date.parse(iso);
  if (Number.isNaN(ms)) throw new RangeError(`invalid date: ${String(iso)}`);
  return ms / 86_400_000 + UNIX_EPOCH_JD;
}

export interface DashaPeriod {
  lord: Graha;
  /** Duration in years of `yearDays` days. */
  years: number;
  startJd: number;
  endJd: number;
  start: string;
  end: string;
}

export interface Antardasha extends DashaPeriod {
  mahaLord: Graha;
}

export interface Mahadasha extends DashaPeriod {
  /** 0-based position in the sequence from birth. */
  index: number;
  antardashas: Antardasha[];
}

export interface VimshottariOptions {
  /** Days per dasha year, default 365.25 (see module doc). */
  yearDays?: number;
}

export interface Vimshottari {
  yearDays: number;
  moonNakshatra: number;
  moonNakshatraLord: Graha;
  /** Fraction of the Moon's nakshatra traversed at birth = fraction of the first maha elapsed. */
  elapsedFraction: number;
  /** Years of the first mahadasha remaining at birth. */
  balanceYears: number;
  birthJd: number;
  /**
   * Nine mahadashas forming one 120-year cycle. The first starts at its
   * theoretical start (before birth, `start ≤ birth`) so each period keeps its
   * full length; `balanceYears` is what remained at birth.
   */
  mahadashas: Mahadasha[];
}

function nextLords(first: Graha): Graha[] {
  const i = DASHA_ORDER.indexOf(first);
  return Array.from({ length: 9 }, (_, k) => DASHA_ORDER[(i + k) % 9]);
}

function period(lord: Graha, years: number, startJd: number, yearDays: number): DashaPeriod {
  const endJd = startJd + years * yearDays;
  return { lord, years, startJd, endJd, start: jdToIso(startJd), end: jdToIso(endJd) };
}

export function antardashas(maha: DashaPeriod, yearDays: number): Antardasha[] {
  let t = maha.startJd;
  return nextLords(maha.lord).map((lord) => {
    const years = (maha.years * DASHA_YEARS[lord]) / VIMSHOTTARI_TOTAL_YEARS;
    const p = period(lord, years, t, yearDays);
    t = p.endJd;
    return { ...p, mahaLord: maha.lord };
  });
}

/** Mahadasha sequence starting at `firstStartJd` with `first` as lord, `cycles` × 9 periods. */
export function mahadashaSequence(first: Graha, firstStartJd: number, yearDays: number, count = 9): Mahadasha[] {
  const lords = nextLords(first);
  const out: Mahadasha[] = [];
  let t = firstStartJd;
  for (let k = 0; k < count; k++) {
    const lord = lords[k % 9];
    const p = period(lord, DASHA_YEARS[lord], t, yearDays);
    out.push({ ...p, index: k, antardashas: antardashas(p, yearDays) });
    t = p.endJd;
  }
  return out;
}

export function vimshottari(moonLongitude: number, birthJd: number, opts: VimshottariOptions = {}): Vimshottari {
  const yearDays = opts.yearDays ?? 365.25;
  if (!(yearDays > 0)) throw new RangeError(`yearDays must be positive, got ${yearDays}`);
  const nak = nakshatraOf(moonLongitude);
  const lordYears = DASHA_YEARS[nak.lord];
  const balanceYears = (1 - nak.fraction) * lordYears;
  const firstStartJd = birthJd - nak.fraction * lordYears * yearDays;
  return {
    yearDays,
    moonNakshatra: nak.number,
    moonNakshatraLord: nak.lord,
    elapsedFraction: nak.fraction,
    balanceYears,
    birthJd,
    mahadashas: mahadashaSequence(nak.lord, firstStartJd, yearDays),
  };
}

export interface ActiveDasha {
  maha: DashaPeriod & { index: number };
  antar: Antardasha;
}

/**
 * Maha/antar dasha running at `jd`. Extends the cycle past 120 years
 * (repeating the sequence) when needed; null before the first maha starts.
 */
export function dashaAt(v: Vimshottari, jd: number): ActiveDasha | null {
  const first = v.mahadashas[0];
  if (jd < first.startJd) return null;
  const cycleDays = VIMSHOTTARI_TOTAL_YEARS * v.yearDays;
  const cycle = Math.floor((jd - first.startJd) / cycleDays);
  const seq = cycle === 0 ? v.mahadashas : mahadashaSequence(first.lord, first.startJd + cycle * cycleDays, v.yearDays);
  for (const m of seq) {
    if (jd >= m.startJd && jd < m.endJd) {
      const antar = m.antardashas.find((a) => jd >= a.startJd && jd < a.endJd) ?? m.antardashas[8];
      const { antardashas: _a, ...maha } = m;
      return { maha: { ...maha, index: m.index + cycle * 9 }, antar };
    }
  }
  return null;
}

/** All maha/antar periods (including cycle repeats) overlapping [startJd, endJd]. */
export function dashasOverlapping(v: Vimshottari, startJd: number, endJd: number): { maha: Mahadasha[]; antar: Antardasha[] } {
  const first = v.mahadashas[0];
  const cycleDays = VIMSHOTTARI_TOTAL_YEARS * v.yearDays;
  const maha: Mahadasha[] = [];
  if (endJd < first.startJd) return { maha, antar: [] };
  const c0 = Math.max(0, Math.floor((startJd - first.startJd) / cycleDays));
  const c1 = Math.floor((endJd - first.startJd) / cycleDays);
  for (let c = c0; c <= c1; c++) {
    const seq = c === 0 ? v.mahadashas : mahadashaSequence(first.lord, first.startJd + c * cycleDays, v.yearDays);
    for (const m of seq) if (m.startJd <= endJd && m.endJd > startJd) maha.push({ ...m, index: m.index + c * 9 });
  }
  const antar = maha.flatMap((m) => m.antardashas.filter((a) => a.startJd <= endJd && a.endJd > startJd));
  return { maha, antar };
}

// ─── Transits ────────────────────────────────────────────────────────────────

export const TRANSIT_GRAHAS = ['jupiter', 'saturn', 'rahu', 'ketu'] as const;
export type TransitGraha = (typeof TRANSIT_GRAHAS)[number];

export interface TransitPosition extends SignPlacement {
  graha: TransitGraha;
  longitude: number;
  retrograde: boolean;
  /** Whole-sign house counted from the natal Moon sign. */
  houseFromMoon: number;
  /** Whole-sign house counted from the natal Lagna sign; null if unknown. */
  houseFromLagna: number | null;
}

export type SadeSatiPhase = 'rising' | 'peak' | 'setting';

export interface TransitSnapshot {
  jd: number;
  date: string;
  natalMoonSign: number;
  natalLagnaSign: number | null;
  planets: TransitPosition[];
  /** Saturn in the 12th / 1st / 2nd sign from the natal Moon. */
  sadeSati: { active: boolean; phase: SadeSatiPhase | null };
}

export function sadeSatiPhase(saturnHouseFromMoon: number): SadeSatiPhase | null {
  return saturnHouseFromMoon === 12 ? 'rising' : saturnHouseFromMoon === 1 ? 'peak' : saturnHouseFromMoon === 2 ? 'setting' : null;
}

/** Sidereal positions of the slow grahas at `jdUt`, relative to the natal Moon / Lagna signs. */
export function transitSnapshot(
  jdUt: number,
  natal: { moonSign: number; lagnaSign: number | null },
  opts: JyotishOptions = {},
): TransitSnapshot {
  const raw = siderealGrahas(jdUt, opts);
  const planets = TRANSIT_GRAHAS.map((g) => {
    const pl = placement(raw[g].longitude);
    return {
      graha: g,
      longitude: raw[g].longitude,
      retrograde: raw[g].speed < 0,
      ...pl,
      houseFromMoon: houseFrom(natal.moonSign, pl.sign),
      houseFromLagna: natal.lagnaSign === null ? null : houseFrom(natal.lagnaSign, pl.sign),
    };
  });
  const phase = sadeSatiPhase(planets.find((p) => p.graha === 'saturn')!.houseFromMoon);
  return {
    jd: jdUt,
    date: jdToIso(jdUt),
    natalMoonSign: natal.moonSign,
    natalLagnaSign: natal.lagnaSign,
    planets,
    sadeSati: { active: phase !== null, phase },
  };
}
