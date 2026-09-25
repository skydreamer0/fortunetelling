/**
 * @fileoverview ① 時間標準化層 — the single source of time for all calculators
 * (ARCHITECTURE-V2 §3, D-026). Pure and deterministic (D-014): no system
 * clock, no env, no IO; the same profile yields a deep-equal TimeContext.
 *
 * Pipeline: civil wall time @ IANA zone → UTC (Intl/tzdata) → JD(UT), ΔT, JD(TT)
 * → LMT (UTC + lng·4 min) → true solar time (LMT + equation of time)
 * → lunar date (civil date) + exact prev/next 節/氣 → boundary flags.
 * @module time/createTimeContext
 */

import { Solar } from 'lunar-javascript';
import type { BirthProfile, TimeAccuracy } from '../profile/types';
import { validateBirthProfile } from '../profile/validate';
import { deltaTDecimalYear, deltaTSeconds, equationOfTimeMinutes, julianDayFromUnixMs } from './astro';
import { formatUtcIso, prevNextTerm, solarTermsAround, toTermRef, type SolarTermInstant } from './solarTerms';
import type { LunarDate, SolarTerms, TimeBasis, TimeContext, TimeContextOptions, TimeFlag, ShichenBoundaryHit } from './types';
import { resolveWallTime, standardOffsetMinutes } from './zone';

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/**
 * 時辰交界容忍值（分鐘）：出生時刻距奇數整點（子丑交界 01:00…亥子交界 23:00）
 * 小於此值即標 `near_shichen_boundary`。`approx1h` 的 60 分鐘代表幾乎必定標記——
 * 這是誠實的：±1 小時的誤差本來就無法決定時辰。
 */
export const SHICHEN_BOUNDARY_TOLERANCE_MINUTES: Readonly<Record<Exclude<TimeAccuracy, 'unknown'>, number>> =
  Object.freeze({ exact: 5, approx15m: 15, approx1h: 60 });

/**
 * 節氣交節容忍值（分鐘）：出生瞬間距前後「節」小於此值即標 `near_jie_boundary`。
 * `exact` 放寬到 30 分鐘，涵蓋節氣演算法本身（≈1 分鐘）與出生紀錄常見的
 * 整點／半點取整誤差。時間未知時改為「日期層級」：當地出生日內有交節即標記。
 */
export const JIE_BOUNDARY_TOLERANCE_MINUTES: Readonly<Record<Exclude<TimeAccuracy, 'unknown'>, number>> =
  Object.freeze({ exact: 30, approx15m: 30, approx1h: 60 });

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

/** 'YYYY-MM-DDTHH:mm:ss' of a naive-ms wall reading, rounded to the second. */
export function formatNaiveIso(naiveMs: number): string {
  const d = new Date(Math.round(naiveMs / 1000) * 1000);
  return (
    `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  );
}

function formatOffset(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? '-' : '+';
  const totalSec = Math.round(Math.abs(offsetMinutes) * 60);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${sign}${pad(h)}:${pad(m)}${s ? `:${pad(s)}` : ''}`;
}

/** Minutes since local midnight (fractional) of a naive-ms wall reading. */
function minutesOfDay(naiveMs: number): number {
  return (((naiveMs % DAY_MS) + DAY_MS) % DAY_MS) / MINUTE_MS;
}

/** Nearest odd-hour shichen boundary and signed distance (positive = after it). */
export function shichenBoundaryDistance(minuteOfDay: number): { boundaryHour: number; minutesFromBoundary: number } {
  const sinceOdd = (((minuteOfDay - 60) % 120) + 120) % 120; // minutes since the last odd hour
  if (sinceOdd <= 60) {
    const boundaryHour = (Math.round((minuteOfDay - sinceOdd) / 60) + 24) % 24;
    return { boundaryHour, minutesFromBoundary: sinceOdd };
  }
  const boundaryHour = (Math.round((minuteOfDay - sinceOdd + 120) / 60) + 24) % 24;
  return { boundaryHour, minutesFromBoundary: sinceOdd - 120 };
}

function isZiHour(minuteOfDay: number): boolean {
  return minuteOfDay >= 23 * 60 || minuteOfDay < 60;
}

function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function lunarOf(year: number, month: number, day: number): LunarDate {
  const lunar = Solar.fromYmd(year, month, day).getLunar();
  const m: number = lunar.getMonth();
  return {
    year: lunar.getYear(),
    month: Math.abs(m),
    day: lunar.getDay(),
    isLeap: m < 0,
    yearGanZhi: lunar.getYearInGanZhi(),
    monthInChinese: lunar.getMonthInChinese(),
    dayInChinese: lunar.getDayInChinese(),
    zodiac: lunar.getYearShengXiao(),
  };
}

function solarTermsFor(terms: SolarTermInstant[], refUtcMs: number, reference: SolarTerms['reference']): SolarTerms {
  const jie = prevNextTerm(terms, refUtcMs, 'jie');
  const qi = prevNextTerm(terms, refUtcMs, 'qi');
  return {
    reference,
    referenceUtcIso: formatUtcIso(refUtcMs),
    prevJie: toTermRef(jie.prev),
    nextJie: toTermRef(jie.next),
    prevQi: toTermRef(qi.prev),
    nextQi: toTermRef(qi.next),
  };
}

/**
 * Build the TimeContext for a birth profile.
 *
 * - Input is validated with `validateBirthProfile`; invalid input throws RangeError.
 * - DST gap: the non-existent wall time is shifted forward by the gap length
 *   (e.g. 00:30 on a 00:00→01:00 spring-forward becomes 01:30) and flagged.
 * - DST overlap: the earlier instant (pre-transition offset) is used by
 *   default (`options.dstOverlap`), and flagged with both candidates.
 * - time unknown: `local`, `utc`, `jd`, `solar` are null; `lunar` uses the civil
 *   date; `solarTerms` are relative to local 12:00; `near_jie_boundary` is
 *   raised (basis 'date') when a 節 falls within the local civil day.
 */
export function createTimeContext(input: BirthProfile, options: TimeContextOptions = {}): TimeContext {
  const validation = validateBirthProfile(input);
  if (validation.ok === false) {
    throw new RangeError(`Invalid BirthProfile: ${validation.errors.join('; ')}`);
  }
  const profile = validation.profile;
  const { timezone: tz, lng } = profile.birthplace;
  const [year, month, day] = profile.date.split('-').map(Number);
  const flags: TimeFlag[] = [];

  // ── time unknown: date-level only ────────────────────────────────────────
  if (profile.time === null) {
    const noon = resolveWallTime(tz, Date.UTC(year, month - 1, day, 12)).utcMs;
    const dayStart = resolveWallTime(tz, Date.UTC(year, month - 1, day)).utcMs;
    const dayEnd = resolveWallTime(tz, Date.UTC(year, month - 1, day + 1)).utcMs;
    const terms = solarTermsAround(noon);
    flags.push({ code: 'time_unknown', detail: '出生時間未知：需時間的系統不可算，不得猜測' });
    const jieInDay = terms.find((t) => t.kind === 'jie' && t.utcMs >= dayStart && t.utcMs < dayEnd);
    if (jieInDay) {
      flags.push({
        code: 'near_jie_boundary',
        detail: `出生當日交${toTermRef(jieInDay).nameHant}，時間未知無法判定交節前後`,
        data: { basis: 'date', term: toTermRef(jieInDay) },
      });
    }
    return {
      profile,
      local: null,
      utc: null,
      jd: null,
      solar: null,
      lunar: lunarOf(year, month, day),
      solarTerms: solarTermsFor(terms, noon, 'local_noon'),
      flags,
    };
  }

  // ── civil → UTC ──────────────────────────────────────────────────────────
  const [hour, minute] = profile.time.split(':').map(Number);
  const requestedNaive = Date.UTC(year, month - 1, day, hour, minute);
  const resolution = resolveWallTime(tz, requestedNaive, options.dstOverlap ?? 'earlier');
  const utcMs = resolution.utcMs;
  const offset = resolution.offsetMinutes;
  const localNaive = utcMs + offset * MINUTE_MS;
  const localDate = new Date(localNaive);
  const stdOffset = standardOffsetMinutes(tz, localDate.getUTCFullYear());
  const dst = offset > stdOffset;

  // ── JD / ΔT ──────────────────────────────────────────────────────────────
  const jdUt = julianDayFromUnixMs(utcMs);
  const dT = deltaTSeconds(deltaTDecimalYear(utcMs));
  const jdTt = jdUt + dT / 86400;

  // ── LMT / true solar time ────────────────────────────────────────────────
  const lmtNaive = utcMs + lng * 4 * MINUTE_MS;
  const eot = equationOfTimeMinutes(jdUt);
  const trueSolarNaive = lmtNaive + eot * MINUTE_MS;

  // ── lunar & solar terms ─────────────────────────────────────────────────
  const lunar = lunarOf(localDate.getUTCFullYear(), localDate.getUTCMonth() + 1, localDate.getUTCDate());
  const terms = solarTermsAround(utcMs);
  const solarTerms = solarTermsFor(terms, utcMs, 'birth');
  const jie = prevNextTerm(terms, utcMs, 'jie');

  // ── flags (fixed order) ─────────────────────────────────────────────────
  if (dst) {
    flags.push({
      code: 'dst_applied',
      detail: `夏令時間：UTC${formatOffset(offset)}（標準 UTC${formatOffset(stdOffset)}）`,
      data: { utcOffsetMinutes: offset, standardOffsetMinutes: stdOffset },
    });
  }
  const requestedLocal = formatNaiveIso(requestedNaive);
  if (resolution.kind === 'gap') {
    flags.push({
      code: 'dst_gap',
      detail: `${requestedLocal} 因撥快時鐘不存在，已順延 ${resolution.gapMinutes} 分鐘；請使用者確認`,
      data: {
        requestedLocal,
        resolvedLocal: formatNaiveIso(localNaive),
        gapMinutes: resolution.gapMinutes,
        requiresConfirmation: true,
      },
    });
  }
  if (resolution.kind === 'overlap') {
    flags.push({
      code: 'dst_overlap',
      detail: `${requestedLocal} 因撥慢時鐘出現兩次，採用${resolution.chosen === 'earlier' ? '較早' : '較晚'}的一次；請使用者確認`,
      data: {
        requestedLocal,
        chosen: resolution.chosen,
        candidates: resolution.candidates.map((c) => ({ utcIso: formatUtcIso(c.utcMs), utcOffsetMinutes: c.offsetMinutes })),
        requiresConfirmation: true,
      },
    });
  }

  const accuracy = profile.timeAccuracy as Exclude<TimeAccuracy, 'unknown'>;
  const shichenTol = SHICHEN_BOUNDARY_TOLERANCE_MINUTES[accuracy];
  const clocks: [TimeBasis, number][] = [
    ['trueSolar', minutesOfDay(trueSolarNaive)],
    ['civil', minutesOfDay(localNaive)],
  ];
  const hits: ShichenBoundaryHit[] = [];
  for (const [basis, mod] of clocks) {
    const { boundaryHour, minutesFromBoundary } = shichenBoundaryDistance(mod);
    if (Math.abs(minutesFromBoundary) < shichenTol) {
      hits.push({ basis, boundary: `${pad(boundaryHour)}:00`, minutesFromBoundary: round(minutesFromBoundary, 2) });
    }
  }
  if (hits.length > 0) {
    flags.push({
      code: 'near_shichen_boundary',
      detail: `距時辰交界小於 ${shichenTol} 分鐘（${hits.map((h) => `${h.basis} ${h.boundary}`).join('、')}）：時柱／命宮可能兩解`,
      data: { toleranceMinutes: shichenTol, hits },
    });
  }

  const jieTol = JIE_BOUNDARY_TOLERANCE_MINUTES[accuracy];
  const nearest = [jie.prev, jie.next]
    .map((t) => ({ t, diff: (utcMs - t.utcMs) / MINUTE_MS }))
    .sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff))[0];
  if (Math.abs(nearest.diff) < jieTol) {
    const term = toTermRef(nearest.t);
    flags.push({
      code: 'near_jie_boundary',
      detail: `距${term.nameHant}交節 ${Math.abs(round(nearest.diff, 1))} 分鐘（容忍 ${jieTol}）：月柱${term.name === '立春' ? '與年柱' : ''}可能兩解`,
      data: { basis: 'instant', term, minutesFromTerm: round(nearest.diff, 2), toleranceMinutes: jieTol },
    });
  }

  const ziBases = clocks.filter(([, mod]) => isZiHour(mod)).map(([basis]) => basis);
  if (ziBases.length > 0) {
    flags.push({
      code: 'zi_hour_convention',
      detail: `落在子時 23:00–00:59（${ziBases.join('、')}）：早晚子時換日由 calculator config 決定`,
      data: { bases: ziBases },
    });
  }

  return {
    profile,
    local: { iso: `${formatNaiveIso(localNaive)}${formatOffset(offset)}`, utcOffsetMinutes: offset, dst },
    utc: { iso: formatUtcIso(utcMs) },
    jd: { ut: jdUt, tt: jdTt, deltaTSeconds: round(dT, 3) },
    solar: {
      lmtIso: formatNaiveIso(lmtNaive),
      trueSolarIso: formatNaiveIso(trueSolarNaive),
      equationOfTimeMinutes: round(eot, 4),
    },
    lunar,
    solarTerms,
    flags,
  };
}
