/**
 * @fileoverview Dreamspell / Tzolkin pure calculator (V1-07).
 *
 * Pure, deterministic functions — no I/O, no clock, no engine imports (D-014, D-016).
 *
 * Conventions (shared with `engines/DreamspellEngine.js`):
 *   - Kin 1–260. Tone t = ((kin − 1) mod 13) + 1  (1–13).
 *                Seal s = ((kin − 1) mod 20) + 1  (1–20; 20 = Yellow Sun, the
 *                "0" of the traditional 0–19 seal code).
 *   - Kin epoch 1987-07-26 = Kin 34 (D-004), and the Gregorian leap day 29 Feb is
 *     "0.0 Hunab Ku": it does not advance the count and shares 28 Feb's Kin.
 *
 * Oracle formulas (José Argüelles, *Dreamspell* 1990 / Law of Time "Fifth Force
 * Oracle"). Seal arithmetic uses the traditional 0–19 code, i.e. seal 20 ≡ 0;
 * results are mapped back to 1–20.
 *
 *   destiny  = the Kin itself.
 *   analog   = seal 19 − s (mod 20), same tone. Rationale: analog partners are
 *              the "supporting" pairs whose codes sum to 19 (Dragon 1 ↔ Mirror 18,
 *              Wind 2 ↔ Earth 17, Sun 0 ↔ Storm 19); colours pair Red↔White,
 *              Blue↔Yellow. Involution: 19 − (19 − s) = s.
 *   antipode = seal s + 10 (mod 20), same tone. Rationale: the "challenging"
 *              partner is diametrically opposite on the 20-seal wheel (Dragon ↔
 *              Monkey); colours pair Red↔Blue, White↔Yellow. Involution.
 *   occult   = seal 21 − s, tone 14 − t. Rationale: "hidden" partner whose seal
 *              codes sum to 21 and tones sum to 14; equivalently occult Kin =
 *              261 − kin (proof: (260 − kin) mod 13 ≡ −kin ⇒ tone 14 − t, and
 *              (260 − kin) mod 20 ≡ −kin ⇒ seal 21 − s). Involution.
 *   guide    = same tone, seal from the destiny's own colour family (seals
 *              ≡ s mod 4), offset chosen by tone:
 *                tones 1, 6, 11 → +0  (self-guided)
 *                tones 2, 7, 12 → +12
 *                tones 3, 8, 13 → +4
 *                tones 4, 9     → −4 (≡ +16)
 *                tones 5, 10    → +8
 *              All offsets are multiples of 4, so the colour is preserved.
 *
 * Cross-checked against the standard published Dreamspell oracle tables
 * (asserted in tests/tzolkin.test.ts):
 *   - Kin 1 Red Magnetic Dragon: guide Kin 1 (self), analog Kin 118 White
 *     Magnetic Mirror, antipode Kin 131 Blue Magnetic Monkey, occult Kin 260
 *     Yellow Cosmic Sun.
 *   - Kin 34 White Galactic Wizard (tone 8 — note: some older comments called
 *     it "Electric", which is tone 3; (34 − 1) mod 13 + 1 = 8): guide Kin 138
 *     White Galactic Mirror, analog Kin 125 Red Galactic Serpent, antipode
 *     Kin 164 Yellow Galactic Seed, occult Kin 227 Blue Rhythmic Hand.
 *   - Kin 84 Yellow Rhythmic Seed (1995-07-16): self-guided, analog Kin 175 Blue
 *     Rhythmic Eagle, antipode Kin 214 White Rhythmic Wizard, occult Kin 177
 *     Red Galactic Earth.
 *   - Guide spot checks: Kin 2 White Lunar Wind → White Lunar Wizard (Kin 54);
 *     Kin 3 Blue Electric Night → Blue Electric Hand; Kin 4 Yellow Self-Existing
 *     Seed → Yellow Self-Existing Sun; Kin 5 Red Overtone Serpent → Red Overtone
 *     Skywalker; Kin 11 Blue Spectral Monkey → self.
 *
 * @module calculators/tzolkin
 */

export interface CivilDate {
  year: number;
  month: number; // 1–12
  day: number; // 1–31
}

export interface KinRef {
  kin: number;
  seal: number;
  tone: number;
}

export interface Wavespell {
  /** 1–20 — which 13-day cycle of the 260-day count. */
  number: number;
  /** First Kin of the wavespell (tone 1). */
  startKin: number;
  /** Seal (1–20) of the start Kin; names the wavespell (Kin 1 → Red Dragon). */
  seal: number;
}

export interface Castle {
  number: 1 | 2 | 3 | 4 | 5;
  name: string;
  nameZh: string;
  color: 'red' | 'white' | 'blue' | 'yellow' | 'green';
  colorZh: string;
  /** Inclusive Kin range of this castle (52 Kin = 4 wavespells). */
  startKin: number;
  endKin: number;
}

export interface Oracle {
  destiny: KinRef;
  guide: KinRef;
  analog: KinRef;
  antipode: KinRef;
  occult: KinRef;
}

/** Length of the Tzolkin / Dreamspell cycle. */
export const CYCLE = 260;

/** Dreamspell epoch (D-004): 1987-07-26 is Kin 34 (White Galactic Wizard). */
export const EPOCH = Object.freeze({ year: 1987, month: 7, day: 26, kin: 34 });

const MS_PER_DAY = 86400000;

const mod = (n: number, m: number): number => ((n % m) + m) % m;

function assertKin(kin: number): void {
  if (!Number.isInteger(kin) || kin < 1 || kin > CYCLE) {
    throw new RangeError(`kin must be an integer in 1–260, got ${kin}`);
  }
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Number of 29 Feb dates on or before the given date (proleptic Gregorian). */
function leapDaysUpTo(year: number, month: number, day: number): number {
  const y = year - 1;
  let count = Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400);
  if (isLeapYear(year) && (month > 2 || (month === 2 && day === 29))) count += 1;
  return count;
}

/** Continuous day number with every 29 Feb collapsed onto its 28 Feb. */
function dreamspellDay(year: number, month: number, day: number): number {
  const gregDay = Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY);
  return gregDay - leapDaysUpTo(year, month, day);
}

/**
 * Dreamspell Kin (1–260) for a civil date. Same algorithm as
 * `DreamspellEngine#kinOf`: anchored at 1987-07-26 = Kin 34, leap day skipped.
 */
export function kinFromDate({ year, month, day }: CivilDate): number {
  const delta = dreamspellDay(year, month, day) - dreamspellDay(EPOCH.year, EPOCH.month, EPOCH.day);
  return mod(delta + (EPOCH.kin - 1), CYCLE) + 1;
}

/** Galactic tone 1–13. */
export function toneOf(kin: number): number {
  assertKin(kin);
  return ((kin - 1) % 13) + 1;
}

/** Solar seal 1–20 (20 = Yellow Sun). */
export function sealOf(kin: number): number {
  assertKin(kin);
  return ((kin - 1) % 20) + 1;
}

/**
 * Kin with the given tone (1–13) and seal (1–20), by the Chinese remainder
 * theorem: 40 ≡ 1 (mod 13), 40 ≡ 0 (mod 20); 221 ≡ 0 (mod 13), 221 ≡ 1 (mod 20).
 */
export function kinOf(tone: number, seal: number): number {
  if (!Number.isInteger(tone) || tone < 1 || tone > 13) throw new RangeError(`tone must be 1–13, got ${tone}`);
  if (!Number.isInteger(seal) || seal < 1 || seal > 20) throw new RangeError(`seal must be 1–20, got ${seal}`);
  return mod(40 * (tone - 1) + 221 * (seal - 1), CYCLE) + 1;
}

/** Wavespell (13-day cycle) containing the Kin; named by its tone-1 Kin's seal. */
export function wavespellOf(kin: number): Wavespell {
  assertKin(kin);
  const startKin = kin - ((kin - 1) % 13);
  return { number: Math.floor((kin - 1) / 13) + 1, startKin, seal: sealOf(startKin) };
}

const CASTLES: ReadonlyArray<Omit<Castle, 'number' | 'startKin' | 'endKin'>> = Object.freeze([
  { name: 'Red Eastern Castle of Turning', nameZh: '紅色東方轉化城堡', color: 'red', colorZh: '紅' },
  { name: 'White Northern Castle of Crossing', nameZh: '白色北方跨越城堡', color: 'white', colorZh: '白' },
  { name: 'Blue Western Castle of Burning', nameZh: '藍色西方燃燒城堡', color: 'blue', colorZh: '藍' },
  { name: 'Yellow Southern Castle of Giving', nameZh: '黃色南方給予城堡', color: 'yellow', colorZh: '黃' },
  { name: 'Green Central Castle of Enchantment', nameZh: '綠色中央魔法城堡', color: 'green', colorZh: '綠' },
]);

/** Castle (5 × 52 Kin) containing the Kin. */
export function castleOf(kin: number): Castle {
  assertKin(kin);
  const index = Math.floor((kin - 1) / 52);
  return {
    number: (index + 1) as Castle['number'],
    ...CASTLES[index],
    startKin: index * 52 + 1,
    endKin: index * 52 + 52,
  };
}

/** Guide seal offset (in 1–20 seal steps) by destiny tone; see module doc. */
const GUIDE_OFFSET_BY_TONE: Readonly<Record<number, number>> = Object.freeze({
  1: 0, 6: 0, 11: 0,
  2: 12, 7: 12, 12: 12,
  3: 4, 8: 4, 13: 4,
  4: -4, 9: -4,
  5: 8, 10: 8,
});

/** Normalize a 0–19-code seal arithmetic result back to 1–20 (0 → 20). */
const toSeal = (code: number): number => mod(code - 1, 20) + 1;

const ref = (tone: number, seal: number): KinRef => ({ kin: kinOf(tone, seal), seal, tone });

/** Analog seal: codes sum to 19 (seal 20 ≡ 0). */
export function analogSeal(seal: number): number {
  return toSeal(19 - (seal % 20));
}

/** Antipode seal: opposite on the 20-seal wheel. */
export function antipodeSeal(seal: number): number {
  return toSeal(seal + 10);
}

/** Occult seal: seals sum to 21. */
export function occultSeal(seal: number): number {
  return 21 - seal;
}

/** Guide seal: same colour family, offset by tone. */
export function guideSeal(seal: number, tone: number): number {
  return toSeal(seal + GUIDE_OFFSET_BY_TONE[tone]);
}

/** Fifth-force oracle of a Kin. */
export function oracleOf(kin: number): Oracle {
  const tone = toneOf(kin);
  const seal = sealOf(kin);
  return {
    destiny: { kin, seal, tone },
    guide: ref(tone, guideSeal(seal, tone)),
    analog: ref(tone, analogSeal(seal)),
    antipode: ref(tone, antipodeSeal(seal)),
    occult: ref(14 - tone, occultSeal(seal)),
  };
}
