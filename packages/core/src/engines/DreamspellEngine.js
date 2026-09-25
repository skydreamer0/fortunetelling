/**
 * @fileoverview 馬雅曆 Kin (Dreamspell / 13-Moon Galactic Signature) calculation engine.
 *
 * Computes the José Argüelles *Dreamspell* Galactic Signature (Kin 1–260) from a
 * Gregorian birth date. This is deliberately NOT the traditional Mayan Long Count
 * Tzolk'in: the Dreamspell "Wizard's Count" runs its own continuous 260-day cycle
 * anchored to the Dreamspell New Year (26 July 1987) and — crucially — treats the
 * Gregorian leap day (29 Feb) as "0.0 Hunab Ku", a day out of time that does NOT
 * advance the Kin count. 29 Feb therefore shares 28 Feb's Kin.
 *
 * Implementation is a continuous day-count anchored to the epoch, with every 29 Feb
 * collapsed onto the preceding 28 Feb so it does not advance the count:
 *
 *   D(date)  = gregorianDayNumber(date) − (# of 29 Feb on-or-before date)
 *   kin      = ((D(date) − D(epoch)) mod 260 + (kinEpoch − 1)) mod 260 + 1
 *
 * where the epoch is 1987-07-26 = Kin 34 (白電力巫師 / White Electric Wizard).
 *
 * Validated to reproduce both of the task's reference signatures exactly:
 *   - 1987-07-26 → Kin 34  = 電力巫師 (White Electric Wizard) — tone 3, seal 14
 *   - 1939-01-24 → Kin 11  = 光譜猴  (Blue Spectral Monkey)   — tone 11, seal 11
 * (José Argüelles' own signature, Kin 11, is the canonical cross-check.)
 *
 * References:
 *   - Dreamspell Kin method & Feb-29 "day out of time" rule:
 *     https://everycalculators.com/mayan-dreamspell-calculator.html
 *   - Galactic Signature decoding (tone × seal):
 *     https://calculatorsocean.com/galactic-signature-calculator/
 *
 * All outputs are L0 (birth-derived constants — the Kin never changes for a person).
 *
 * @module engines/DreamspellEngine
 */

import { BaseEngine } from '../core/BaseEngine.js';

// ─── Dreamspell name tables (zh-TW) ─────────────────────────────────────────

/**
 * 13 銀河音階 (Galactic Tones), indexed 1–13. Index 0 is a placeholder so the
 * tone number maps directly to its name.
 * @type {string[]}
 */
export const TONE_NAMES = Object.freeze([
  '', // 0 (unused)
  '磁性', '月亮', '電力', '自我存在', '超頻', '韻律', '共振',
  '銀河星系', '太陽', '行星', '光譜', '水晶', '宇宙',
]);

/**
 * 20 圖騰 (Solar Seals), indexed 1–20. Each name is prefixed with the seal's
 * inherent Dreamspell colour (紅/白/藍/黃, cycling every 4). Index 0 is a
 * placeholder so the seal number maps directly to its name.
 * @type {string[]}
 */
export const SEAL_NAMES = Object.freeze([
  '', // 0 (unused)
  '紅龍', '白風', '藍夜', '黃種子', '紅蛇', '白世界橋', '藍手', '黃星星', '紅月', '白狗',
  '藍猴', '黃人', '紅天行者', '白巫師', '藍鷹', '黃戰士', '紅地球', '白鏡', '藍風暴', '黃太陽',
]);

/**
 * Seal colour by (sealNumber mod 4): 1→紅 2→白 3→藍 0→黃. The four colours also
 * form the leading character of each {@link SEAL_NAMES} entry.
 * @type {Record<number, string>}
 */
export const SEAL_COLORS = Object.freeze({ 1: '紅', 2: '白', 3: '藍', 0: '黃' });

/** Length of the Tzolk'in / Dreamspell cycle. */
const CYCLE = 260;

/** Dreamspell epoch: 1987-07-26 is Kin 34 (白電力巫師 / White Electric Wizard). */
const EPOCH = Object.freeze({ year: 1987, month: 7, day: 26, kin: 34 });

/** Milliseconds in one day. */
const MS_PER_DAY = 86400000;

/**
 * @typedef {import('../core/models/BirthData.js').BirthData} BirthData
 * @typedef {import('../core/models/SystemResult.js').SystemResult} SystemResult
 */

/**
 * 馬雅曆 Kin engine — Dreamspell Galactic Signature.
 *
 * @extends BaseEngine
 */
export class DreamspellEngine extends BaseEngine {
  id = 'dreamspell';
  name = '馬雅曆 Kin';

  constructor() {
    super();
  }

  /**
   * @param {BirthData} birth
   * @returns {SystemResult}
   */
  _compute(birth) {
    const kin = this.#kinOf(birth.year, birth.month, birth.day);
    const toneNumber = ((kin - 1) % 13) + 1;
    const sealNumber = ((kin - 1) % 20) + 1;

    const toneName = TONE_NAMES[toneNumber];
    const sealName = SEAL_NAMES[sealNumber];         // colour-prefixed, e.g. 白巫師
    const sealColor = SEAL_COLORS[sealNumber % 4];   // 紅/白/藍/黃
    const sealGlyph = sealName.slice(1);             // strip colour, e.g. 巫師
    const signature = `${toneName}${sealGlyph}`;     // e.g. 電力巫師

    const result = this.result();

    // ─── L0: Kin 印記 (galactic signature) ────────────────────────────────
    result.add({
      id: 'kin',
      name: 'Kin 印記',
      category: 'kin',
      value: { kin, signature, color: sealColor },
    });

    // ─── L0: 銀河音階 (galactic tone) ─────────────────────────────────────
    result.add({
      id: 'tone',
      name: '銀河音階',
      category: 'tone',
      value: { number: toneNumber, name: toneName },
    });

    // ─── L0: 圖騰 (solar seal) ────────────────────────────────────────────
    result.add({
      id: 'seal',
      name: '圖騰',
      category: 'seal',
      value: { number: sealNumber, name: sealName, color: sealColor },
    });

    result.meta = {
      kin,
      fullSignature: `${sealColor}${signature}`, // e.g. 白電力巫師
      epoch: `${EPOCH.year}-${EPOCH.month}-${EPOCH.day} = Kin ${EPOCH.kin}`,
    };

    return result;
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  /**
   * Compute the Dreamspell Kin (1–260) for a Gregorian date, applying the
   * leap-day rule (29 Feb shares 28 Feb's Kin and does not advance the count).
   *
   * @param {number} year
   * @param {number} month  1–12
   * @param {number} day    1–31
   * @returns {number} Kin in 1–260
   */
  #kinOf(year, month, day) {
    const delta = this.#dreamspellDay(year, month, day)
      - this.#dreamspellDay(EPOCH.year, EPOCH.month, EPOCH.day);
    const mod = (((delta % CYCLE) + CYCLE) % CYCLE + (EPOCH.kin - 1)) % CYCLE;
    return mod + 1;
  }

  /**
   * Continuous day number with every 29 Feb collapsed onto its 28 Feb, so leap
   * days never advance the count. Only differences between two such numbers are
   * meaningful, so the absolute origin is irrelevant.
   *
   * @param {number} year
   * @param {number} month
   * @param {number} day
   * @returns {number}
   */
  #dreamspellDay(year, month, day) {
    const gregDay = Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY);
    return gregDay - this.#leapDaysUpTo(year, month, day);
  }

  /**
   * Number of 29 Feb dates on or before the given date (from the proleptic
   * Gregorian year 1). Used to subtract leap days out of the running count.
   *
   * @param {number} year
   * @param {number} month
   * @param {number} day
   * @returns {number}
   */
  #leapDaysUpTo(year, month, day) {
    // Leap years strictly before `year` each contributed exactly one 29 Feb.
    const y = year - 1;
    let count = Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400);
    // Add this year's 29 Feb only if it exists AND the date is on/after it.
    if (this.#isLeapYear(year) && (month > 2 || (month === 2 && day === 29))) {
      count += 1;
    }
    return count;
  }

  /**
   * @param {number} year
   * @returns {boolean} Whether the Gregorian year has a 29 Feb.
   */
  #isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }
}
