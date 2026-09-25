/**
 * @fileoverview Exact 節氣 instants from lunar-javascript, converted to UTC.
 *
 * lunar-javascript's `getJieQiTable()` returns Solar objects whose wall-clock
 * reading is in China Standard Time (UTC+8, fixed, no DST) — its algorithm
 * (壽星天文曆) adds 8 h to the TT→UT instant. Verified: 立春 2026 =
 * 2026-02-04 04:02:08 CST (= 2026-02-03T20:02:08Z), 冬至 1999 =
 * 1999-12-22 15:43:48 CST (= 07:43:48Z; USNO: 07:44 UT). We therefore subtract
 * exactly 8 h to get UTC. Precision: whole seconds, astronomical accuracy ≈1 min.
 *
 * Note: D-016 restricts lunar-javascript to engines/; the time layer (D-026)
 * is the designated replacement owner of calendar conversion.
 * @module time/solarTerms
 */

import { Solar } from 'lunar-javascript';
import type { SolarTermRef } from './types';

const CST_OFFSET_MS = 8 * 3_600_000;

/** Table keys for next-cycle entries use pinyin; map them to names. */
const PINYIN_TO_NAME: Readonly<Record<string, string>> = Object.freeze({
  DA_XUE: '大雪',
  DONG_ZHI: '冬至',
  XIAO_HAN: '小寒',
  DA_HAN: '大寒',
  LI_CHUN: '立春',
  YU_SHUI: '雨水',
  JING_ZHE: '惊蛰',
});

/** 12 節 (month-starting terms), lunar-javascript names. */
export const JIE_NAMES: readonly string[] = Object.freeze([
  '立春', '惊蛰', '清明', '立夏', '芒种', '小暑', '立秋', '白露', '寒露', '立冬', '大雪', '小寒',
]);
/** 12 中氣, lunar-javascript names. */
export const QI_NAMES: readonly string[] = Object.freeze([
  '雨水', '春分', '谷雨', '小满', '夏至', '大暑', '处暑', '秋分', '霜降', '小雪', '冬至', '大寒',
]);

const HANT: Readonly<Record<string, string>> = Object.freeze({
  惊蛰: '驚蟄',
  谷雨: '穀雨',
  小满: '小滿',
  芒种: '芒種',
  处暑: '處暑',
});

export function toHant(name: string): string {
  return HANT[name] ?? name;
}

export type SolarTermInstant = { name: string; kind: 'jie' | 'qi'; utcMs: number };

function termsForLunarYearAround(year: number): SolarTermInstant[] {
  const table = Solar.fromYmd(year, 6, 1).getLunar().getJieQiTable();
  const out: SolarTermInstant[] = [];
  for (const key of Object.keys(table)) {
    const s = table[key];
    const name = PINYIN_TO_NAME[key] ?? key;
    const kind = JIE_NAMES.includes(name) ? 'jie' : QI_NAMES.includes(name) ? 'qi' : null;
    if (!kind) continue;
    const cstNaive = Date.UTC(s.getYear(), s.getMonth() - 1, s.getDay(), s.getHour(), s.getMinute(), s.getSecond());
    out.push({ name, kind, utcMs: cstNaive - CST_OFFSET_MS });
  }
  return out;
}

/** All terms from roughly year−1 December to year+2 March, sorted, deduplicated. */
export function solarTermsAround(utcMs: number): SolarTermInstant[] {
  const year = new Date(utcMs + CST_OFFSET_MS).getUTCFullYear();
  const seen = new Set<string>();
  const all: SolarTermInstant[] = [];
  for (const y of [year - 1, year, year + 1]) {
    for (const t of termsForLunarYearAround(y)) {
      const k = `${t.name}@${t.utcMs}`;
      if (!seen.has(k)) {
        seen.add(k);
        all.push(t);
      }
    }
  }
  return all.sort((a, b) => a.utcMs - b.utcMs);
}

/** Previous (≤ t) and next (> t) term of a kind. A term exactly at t counts as "previous" (already in effect). */
export function prevNextTerm(
  terms: SolarTermInstant[],
  utcMs: number,
  kind: 'jie' | 'qi',
): { prev: SolarTermInstant; next: SolarTermInstant } {
  const ofKind = terms.filter((t) => t.kind === kind);
  let prev: SolarTermInstant | undefined;
  let next: SolarTermInstant | undefined;
  for (const t of ofKind) {
    if (t.utcMs <= utcMs) prev = t;
    else {
      next = t;
      break;
    }
  }
  if (!prev || !next) throw new RangeError(`solar term table does not cover ${new Date(utcMs).toISOString()}`);
  return { prev, next };
}

export function formatUtcIso(utcMs: number): string {
  const d = new Date(Math.round(utcMs / 1000) * 1000);
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function toTermRef(t: SolarTermInstant): SolarTermRef {
  return { name: t.name, nameHant: toHant(t.name), kind: t.kind, utcIso: formatUtcIso(t.utcMs) };
}
