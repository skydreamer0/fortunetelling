/**
 * @fileoverview 八宅命卦 (Eight Mansions / Ming Gua) calculation engine.
 *
 * Derives a person's 本命卦 (life trigram / Kua number) purely from their
 * birth year — no chart, no time-of-day — and from it the eight 吉凶方位
 * (auspicious/inauspicious directions) of 八宅風水. Because everything here is
 * fixed at birth and never varies over time, every component is L0:
 *
 *   mingGua     → L0  本命卦（卦數/卦名/五行/東西四命/最佳方位）
 *   directions  → L0  八宅吉凶方位（生氣天醫延年伏位 / 絕命五鬼六煞禍害）
 *
 * The Kua number uses the millennium-corrected formula and a simplified 立春
 * (≈Feb 4) year boundary; scoring/interpretation of the directions lives in the
 * analysis layer, so this engine only attaches the raw, transparent inputs.
 *
 * @module engines/MingGuaEngine
 */

import { BaseEngine } from '../core/BaseEngine.js';

/**
 * @typedef {import('../core/models/BirthData.js').BirthData} BirthData
 * @typedef {import('../core/models/SystemResult.js').SystemResult} SystemResult
 */

// ─── Reference tables ───────────────────────────────────────────────────────

/**
 * Compass code → Chinese label. The eight cardinal/ordinal directions used by
 * 八宅. (`NW:'西北'` — note the fix versus the common mis-transcription.)
 * @type {Record<string, string>}
 */
const COMPASS_ZH = Object.freeze({
  N: '北',
  NE: '東北',
  E: '東',
  SE: '東南',
  S: '南',
  SW: '西南',
  W: '西',
  NW: '西北',
});

/**
 * Kua number → trigram info. Central 5 has no trigram, so it is absent here
 * (it is remapped to 2/8 before lookup).
 * @type {Record<number, { name: string, elementEn: string, elementZh: string, code: string, group: 'east'|'west' }>}
 */
const GUA_INFO = Object.freeze({
  1: { name: '坎', elementEn: 'water', elementZh: '水', code: 'N', group: 'east' },
  2: { name: '坤', elementEn: 'earth', elementZh: '土', code: 'SW', group: 'west' },
  3: { name: '震', elementEn: 'wood', elementZh: '木', code: 'E', group: 'east' },
  4: { name: '巽', elementEn: 'wood', elementZh: '木', code: 'SE', group: 'east' },
  6: { name: '乾', elementEn: 'metal', elementZh: '金', code: 'NW', group: 'west' },
  7: { name: '兌', elementEn: 'metal', elementZh: '金', code: 'W', group: 'west' },
  8: { name: '艮', elementEn: 'earth', elementZh: '土', code: 'NE', group: 'west' },
  9: { name: '離', elementEn: 'fire', elementZh: '火', code: 'S', group: 'east' },
});

/**
 * Group key → Chinese name (東四命 / 西四命).
 * @type {Record<'east'|'west', string>}
 */
const GROUP_ZH = Object.freeze({ east: '東四命', west: '西四命' });

/**
 * Kua number → eight 八宅 directions (compass codes).
 * `auspicious` = 生氣/天醫/延年/伏位 (吉); `inauspicious` = 絕命/五鬼/六煞/禍害 (凶).
 * @type {Record<number, { auspicious: Record<string, string>, inauspicious: Record<string, string> }>}
 */
const BAZHAI_DIRECTIONS = Object.freeze({
  1: {
    auspicious: { 生氣: 'SE', 天醫: 'E', 延年: 'S', 伏位: 'N' },
    inauspicious: { 絕命: 'SW', 五鬼: 'NE', 六煞: 'NW', 禍害: 'W' },
  },
  2: {
    auspicious: { 生氣: 'NE', 天醫: 'W', 延年: 'NW', 伏位: 'SW' },
    inauspicious: { 絕命: 'N', 五鬼: 'SE', 六煞: 'S', 禍害: 'E' },
  },
  3: {
    auspicious: { 生氣: 'S', 天醫: 'N', 延年: 'SE', 伏位: 'E' },
    inauspicious: { 絕命: 'W', 五鬼: 'NW', 六煞: 'NE', 禍害: 'SW' },
  },
  4: {
    auspicious: { 生氣: 'N', 天醫: 'S', 延年: 'E', 伏位: 'SE' },
    inauspicious: { 絕命: 'NE', 五鬼: 'W', 六煞: 'SW', 禍害: 'NW' },
  },
  6: {
    auspicious: { 生氣: 'W', 天醫: 'NE', 延年: 'SW', 伏位: 'NW' },
    inauspicious: { 絕命: 'S', 五鬼: 'E', 六煞: 'SE', 禍害: 'N' },
  },
  7: {
    auspicious: { 生氣: 'NW', 天醫: 'SW', 延年: 'NE', 伏位: 'W' },
    inauspicious: { 絕命: 'E', 五鬼: 'S', 六煞: 'N', 禍害: 'SE' },
  },
  8: {
    auspicious: { 生氣: 'SW', 天醫: 'NW', 延年: 'W', 伏位: 'NE' },
    inauspicious: { 絕命: 'SE', 五鬼: 'N', 六煞: 'E', 禍害: 'S' },
  },
  9: {
    auspicious: { 生氣: 'E', 天醫: 'SE', 延年: 'N', 伏位: 'S' },
    inauspicious: { 絕命: 'NW', 五鬼: 'SW', 六煞: 'W', 禍害: 'NE' },
  },
});

// ─── Engine ─────────────────────────────────────────────────────────────────

/**
 * 八宅命卦 engine. Birth-year-only, entirely L0.
 *
 * @extends BaseEngine
 */
export class MingGuaEngine extends BaseEngine {
  id = 'minggua';
  name = '八宅命卦';

  constructor() {
    super();
  }

  /**
   * @param {BirthData} birth
   * @returns {SystemResult}
   */
  _compute(birth) {
    // 1. 立春 year boundary (simplified ≈Feb 4). Births before 立春 belong to the
    //    previous solar year. This is a fixed Feb-4 approximation; a future
    //    refinement could read birth.solarTermInfo for the exact 立春 instant.
    const yearForGua =
      birth.month < 2 || (birth.month === 2 && birth.day < 4) ? birth.year - 1 : birth.year;

    // 2. Digit reduction of the last two digits down to a single digit (1–9).
    const d = this.#reduceToSingleDigit((yearForGua % 100).toString());

    // 3. Kua number (millennium-corrected).
    let kua =
      yearForGua < 2000
        ? birth.gender === 'male'
          ? 10 - d
          : d + 5
        : birth.gender === 'male'
          ? 9 - d
          : d + 6;

    if (kua > 9) kua -= 9;
    if (kua === 0) kua = 9;
    // Central 5 has no trigram: males → 2 (坤), females → 8 (艮).
    if (kua === 5) kua = birth.gender === 'male' ? 2 : 8;

    const gua = GUA_INFO[kua];
    const dirs = BAZHAI_DIRECTIONS[kua];

    const result = this.result();

    // ─── L0: 本命卦 ─────────────────────────────────────────────────────────
    result.add({
      id: 'ming_gua',
      name: '本命卦',
      category: 'mingGua',
      value: {
        guaNumber: kua,
        name: gua.name,
        element: gua.elementEn,
        elementZh: gua.elementZh,
        group: gua.group,
        groupName: GROUP_ZH[gua.group],
        bestDirection: dirs.auspicious.伏位, // 伏位 = the trigram's own seat
        yearForGua,
      },
    });

    // ─── L0: 八宅吉凶方位 ───────────────────────────────────────────────────
    result.add({
      id: 'directions',
      name: '吉凶方位',
      category: 'directions',
      value: {
        auspicious: this.#labelDirections(dirs.auspicious),
        inauspicious: this.#labelDirections(dirs.inauspicious),
      },
    });

    result.meta = {
      yearForGua,
      guaNumber: kua,
      guaName: gua.name,
      group: GROUP_ZH[gua.group],
    };

    return result;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Repeatedly sum the digits of a numeric string until a single digit (1–9)
   * remains. e.g. "91" → 10 → 1.
   *
   * @param {string} digits
   * @returns {number}
   */
  #reduceToSingleDigit(digits) {
    let sum = digits.split('').reduce((acc, ch) => acc + Number(ch), 0);
    while (sum > 9) {
      sum = String(sum)
        .split('')
        .reduce((acc, ch) => acc + Number(ch), 0);
    }
    return sum;
  }

  /**
   * Turn a `{ 名稱: compassCode }` map into `{ 名稱: { code, zh } }`.
   *
   * @param {Record<string, string>} map
   * @returns {Record<string, { code: string, zh: string }>}
   */
  #labelDirections(map) {
    /** @type {Record<string, { code: string, zh: string }>} */
    const out = {};
    for (const [name, code] of Object.entries(map)) {
      out[name] = { code, zh: COMPASS_ZH[code] };
    }
    return out;
  }
}
