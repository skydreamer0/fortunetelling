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
 * The Kua number uses the millennium-corrected formula and the exact 立春
 * instant as the year boundary (`calculators/mingGua/mingGua.ts`, replacing the
 * old Feb-4 approximation of D-017). BirthData carries no timezone yet, so its
 * civil date/time is read as UTC+8 (Asia/Taipei, same convention as
 * BaZiEngine); an unknown time is taken as local noon and, if the birth date is
 * the 立春 day itself, the result is flagged as ambiguous. Scoring/interpretation
 * of the directions lives in the analysis layer, so this engine only attaches
 * the raw, transparent inputs.
 *
 * @module engines/MingGuaEngine
 */

import { BaseEngine } from '../core/BaseEngine';
import {
  MING_GUA_YEAR_BOUNDARY,
  fixedOffsetCivilToUtcMs,
  liChunUtcMs,
  mingGuaFromInstant,
} from '../calculators/mingGua/mingGua';
import type { BirthData } from '../core/models/BirthData';
import type { SystemResult } from '../core/models/SystemResult';

// ─── Reference tables ───────────────────────────────────────────────────────

/**
 * Compass code → Chinese label. The eight cardinal/ordinal directions used by
 * 八宅. (`NW:'西北'` — note the fix versus the common mis-transcription.)
 */
const COMPASS_ZH: Readonly<Record<string, string>> = Object.freeze({
  N: '北',
  NE: '東北',
  E: '東',
  SE: '東南',
  S: '南',
  SW: '西南',
  W: '西',
  NW: '西北',
});

interface GuaInfo {
  name: string;
  elementEn: string;
  elementZh: string;
  code: string;
  group: 'east' | 'west';
}

/**
 * Kua number → trigram info. Central 5 has no trigram, so it is absent here
 * (it is remapped to 2/8 before lookup).
 */
const GUA_INFO: Readonly<Record<number, GuaInfo>> = Object.freeze({
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
 */
const GROUP_ZH: Readonly<Record<'east' | 'west', string>> = Object.freeze({ east: '東四命', west: '西四命' });

/** BirthData has no zone: civil time is read at this fixed offset (Asia/Taipei). */
const CIVIL_OFFSET_MINUTES = 8 * 60;
const TIME_CONVENTION = 'UTC+8 (Asia/Taipei civil time; BirthData has no timezone)';

function isoUtc(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Kua number → eight 八宅 directions (compass codes).
 * `auspicious` = 生氣/天醫/延年/伏位 (吉); `inauspicious` = 絕命/五鬼/六煞/禍害 (凶).
 */
const BAZHAI_DIRECTIONS: Readonly<Record<number, { auspicious: Record<string, string>; inauspicious: Record<string, string> }>> = Object.freeze({
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

  _compute(birth: BirthData): SystemResult {
    // 1. Birth instant: civil date/time read as UTC+8; unknown time → local noon.
    const hour = birth.timeKnown ? birth.hour : 12;
    const minute = birth.timeKnown ? birth.minute : 0;
    const birthUtcMs = fixedOffsetCivilToUtcMs(
      birth.year,
      birth.month,
      birth.day,
      hour,
      minute,
      CIVIL_OFFSET_MINUTES,
    );

    // 2. Exact 立春 year boundary + millennium-corrected Kua number (5 → 2/8).
    //    (Legacy behaviour: any non-'male' gender uses the female formula.)
    const { solarYear: yearForGua, guaNumber: kua } = mingGuaFromInstant(
      birthUtcMs,
      birth.gender === 'male' ? 'male' : 'female',
    );

    // 3. Unknown time on the 立春 day itself: the side of the boundary cannot be
    //    decided. Noon is used; flag it instead of silently picking a side.
    const liChunThisYear = liChunUtcMs(birth.year);
    const liChunLocal = new Date(liChunThisYear + CIVIL_OFFSET_MINUTES * 60_000);
    const boundaryAmbiguous =
      !birth.timeKnown &&
      liChunLocal.getUTCMonth() + 1 === birth.month &&
      liChunLocal.getUTCDate() === birth.day;
    // 立春 of the birth's Gregorian year = the boundary this birth is compared to.
    const liChunUtc = isoUtc(liChunThisYear);

    const gua = GUA_INFO[kua]!;
    const dirs = BAZHAI_DIRECTIONS[kua]!;

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
        yearBoundary: MING_GUA_YEAR_BOUNDARY,
        liChunUtc,
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
      yearBoundary: MING_GUA_YEAR_BOUNDARY,
      timeConvention: TIME_CONVENTION,
      liChunUtc,
      boundaryAmbiguous,
    };

    if (boundaryAmbiguous) {
      result.warn(
        `出生時間未知且出生日為立春當日（立春 ${liChunUtc}）：命卦年以當地正午判定為 ${yearForGua}，` +
          '實際可能屬於相鄰年份。',
      );
    }

    return result;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Turn a `{ 名稱: compassCode }` map into `{ 名稱: { code, zh } }`.
   */
  #labelDirections(map: Record<string, string>): Record<string, { code: string; zh: string }> {
    const out: Record<string, { code: string; zh: string }> = {};
    for (const [name, code] of Object.entries(map)) {
      out[name] = { code, zh: COMPASS_ZH[code]! };
    }
    return out;
  }
}
