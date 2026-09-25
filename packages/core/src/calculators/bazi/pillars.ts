/// <reference path="../../types/lunar-javascript.d.ts" />
/**
 * @fileoverview 八字四柱 / 大運 / 流年 / 流月 — pure functions of a {@link TimeContext} (V1-04).
 *
 * ## Clocks (ARCHITECTURE-V2 §3.4)
 * - **Year & month pillars** are decided by the birth INSTANT (`ctx.utc`) against
 *   the exact 節 instants of `time/solarTerms` (UTC). lunar-javascript computes
 *   節 on a fixed UTC+8 wall clock, so feeding it a foreign wall clock (New York,
 *   or a Taiwan DST wall clock) would shift the comparison by the offset
 *   difference. We never do that: the previous 節 ≤ birth instant gives the month
 *   branch (立春→寅 … 小寒→丑), its solar (立春) year gives the year pillar
 *   ((Y−4) mod 60) and the month stem follows 五虎遁 (甲己→丙寅, 乙庚→戊寅, 丙辛→庚寅,
 *   丁壬→壬寅, 戊癸→甲寅). For a UTC+8 civil birth this is identical to
 *   lunar-javascript's `getYearInGanZhiExact` / `getMonthInGanZhiExact`.
 * - **Day & hour pillars** use a wall clock: the birthplace TRUE SOLAR time
 *   (`ctx.solar.trueSolarIso`, default) or the local civil wall time
 *   (`ctx.local.iso`, `useTrueSolarTime: false`, which includes DST exactly like
 *   the legacy engine). That clock is fed to lunar-javascript's EightChar.
 *
 * ## 子時 convention (`ziHourConvention`)
 * - `'early'` — 子初換日: the day changes at 23:00 (23:00–23:59 takes the NEXT
 *   day's pillar) → lunar-javascript sect=1.
 * - `'late'` (default) — 子正換日 / 晚子時 stays on the current day; the day
 *   changes at 00:00 → sect=2. This is what the legacy `BaZiEngine` uses.
 * In both conventions the 23:00 hour pillar is 子 with the next day's stem
 * (五鼠遁 from the next day), as lunar-javascript computes it.
 *
 * ## 大運 (luck cycles)
 * Direction: 陽年男／陰年女 順 (forward), otherwise 逆; year polarity from the
 * 立春-exact year pillar. The span is birth → next 節 (順) or previous 節 → birth
 * (逆), in whole minutes (both instants truncated to the minute), converted as
 * lunar-javascript `getYun(gender, 2)`: 4320 min = 1 year, 360 min = 1 month,
 * 12 min = 1 day, 1 min = 2 hours (i.e. 3 days = 1 year). The start moment is
 * the birth LOCAL CIVIL wall time + that duration (lunar-javascript Solar
 * arithmetic), so step 1 matches the legacy engine's start year for UTC+8
 * births. Step i spans [start + 10(i−1) y, start + 10i y − 1 day] (ISO dates,
 * end inclusive, contiguous).
 *
 * ## Alternatives (邊界兩盤並算)
 * Driven by TimeContext flags, evaluated on the clock actually used:
 * - `near_shichen_boundary` (hit on the used basis): day/hour recomputed with the
 *   clock moved just across the boundary (1 min before it / exactly on it).
 * - `near_jie_boundary` (basis `instant`): year/month recomputed with the instant
 *   on the other side of the 節 (1 s before it / exactly on it).
 * - `zi_hour_convention` (used basis in `bases`): the other convention.
 * An alternative is only listed when its pillars actually differ.
 *
 * Pure (D-014): no clock, env or IO. lunar-javascript use is allowed here by D-031.
 * @module calculators/bazi/pillars
 */

import { Solar } from 'lunar-javascript';
import { JIE_NAMES, formatUtcIso, prevNextTerm, solarTermsAround, toTermRef, type SolarTermInstant } from '../../time/solarTerms';
import type { SolarTermRef, TimeBasis, TimeContext } from '../../time/types';

export const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'] as const;
export const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'] as const;

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const CST_OFFSET_MS = 8 * HOUR_MS;

export type ZiHourConvention = 'early' | 'late';

export interface BaziPillarConfig {
  /** Day/hour pillars from true solar time (default true) or local civil wall time. */
  useTrueSolarTime?: boolean;
  /** 'early' = 23:00 belongs to the next day (sect=1); 'late' (default) = day changes at 00:00 (sect=2). */
  ziHourConvention?: ZiHourConvention;
}

export interface BaziPillars {
  year: string;
  month: string;
  day: string;
  /** 時柱. */
  hour: string;
}

export type BaziAlternativeReason = 'near_shichen_boundary' | 'near_jie_boundary' | 'zi_hour_convention';

export interface BaziAlternative {
  reason: BaziAlternativeReason;
  pillars: BaziPillars;
  /** Short note on what was changed (e.g. the moved clock or the other convention). */
  detail: string;
}

export interface BaziPillarsResult {
  pillars: BaziPillars;
  alternatives: BaziAlternative[];
  /** The wall clock used for the day/hour pillars. */
  clock: { basis: TimeBasis; iso: string };
  conventions: { useTrueSolarTime: boolean; ziHourConvention: ZiHourConvention; sect: 1 | 2 };
  /** Solar (立春) year of the birth instant and the 節 that opened the birth month. */
  solarYear: number;
  monthJie: SolarTermRef;
}

// ─── small helpers ──────────────────────────────────────────────────────────

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/** 干支 of a sexagenary index 0 (甲子) … 59 (癸亥). */
export function ganZhiAt(index: number): string {
  const i = mod(index, 60);
  return STEMS[i % 10] + BRANCHES[i % 12];
}

/** Sexagenary index of a 干支 string. */
export function ganZhiIndex(gz: string): number {
  const s = STEMS.indexOf(gz[0] as (typeof STEMS)[number]);
  const b = BRANCHES.indexOf(gz[1] as (typeof BRANCHES)[number]);
  if (s < 0 || b < 0 || gz.length !== 2 || s % 2 !== b % 2) throw new Error(`Invalid 干支: ${gz}`);
  for (let i = 0; i < 60; i++) if (i % 10 === s && i % 12 === b) return i;
  throw new Error(`Invalid 干支: ${gz}`);
}

export function yearGanZhi(solarYear: number): string {
  return ganZhiAt(solarYear - 4);
}

/** 月柱 of month k (0 = 寅月 opened by 立春 … 11 = 丑月 opened by 小寒) of a solar year (五虎遁). */
export function monthGanZhi(solarYear: number, k: number): string {
  const yearStem = mod(solarYear - 4, 10);
  const stem = mod(yearStem * 2 + 2 + k, 10);
  const branch = mod(2 + k, 12);
  return STEMS[stem] + BRANCHES[branch];
}

/** Solar (立春) year of the month opened by a 節. 小寒 falls in January of the next Gregorian year. */
function solarYearOfJie(jie: SolarTermInstant): number {
  const cstYear = new Date(jie.utcMs + CST_OFFSET_MS).getUTCFullYear();
  return JIE_NAMES.indexOf(jie.name) === 11 ? cstYear - 1 : cstYear;
}

/** Year & month pillars of a UTC instant (exact 節 comparison). */
export function yearMonthAt(utcMs: number): { year: string; month: string; solarYear: number; jie: SolarTermInstant } {
  const { prev } = prevNextTerm(solarTermsAround(utcMs), utcMs, 'jie');
  const k = JIE_NAMES.indexOf(prev.name);
  const solarYear = solarYearOfJie(prev);
  return { year: yearGanZhi(solarYear), month: monthGanZhi(solarYear, k), solarYear, jie: prev };
}

const NAIVE_ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/;

/** 'YYYY-MM-DDTHH:mm:ss…' wall reading → naive ms (UTC fields = wall fields). */
function naiveMs(iso: string): number {
  const m = NAIVE_ISO.exec(iso);
  if (!m) throw new Error(`Unexpected wall-clock ISO: ${iso}`);
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number);
  return Date.UTC(y, mo - 1, d, h, mi, s);
}

function naiveIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19);
}

function sectOf(convention: ZiHourConvention): 1 | 2 {
  return convention === 'early' ? 1 : 2;
}

/** Day & hour pillars of a wall-clock reading via lunar-javascript EightChar. */
function dayHourAt(wallMs: number, sect: 1 | 2): { day: string; hour: string } {
  const d = new Date(wallMs);
  const ec = Solar.fromYmdHms(
    d.getUTCFullYear(),
    d.getUTCMonth() + 1,
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
  )
    .getLunar()
    .getEightChar();
  ec.setSect(sect);
  return { day: ec.getDay(), hour: ec.getTime() };
}

function samePillars(a: BaziPillars, b: BaziPillars): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day && a.hour === b.hour;
}

function requireKnownTime(ctx: TimeContext): { utcMs: number; civilIso: string; trueSolarIso: string } {
  if (ctx.utc === null || ctx.local === null || ctx.solar === null) {
    throw new TypeError('bazi pillars need a known birth time (TimeContext has time_unknown)');
  }
  return { utcMs: Date.parse(ctx.utc.iso), civilIso: ctx.local.iso.slice(0, 19), trueSolarIso: ctx.solar.trueSolarIso };
}

function resolveConfig(config: BaziPillarConfig): { useTrueSolarTime: boolean; ziHourConvention: ZiHourConvention } {
  const ziHourConvention = config.ziHourConvention ?? 'late';
  if (ziHourConvention !== 'early' && ziHourConvention !== 'late') {
    throw new RangeError(`ziHourConvention must be 'early' or 'late', got: ${String(ziHourConvention)}`);
  }
  return { useTrueSolarTime: config.useTrueSolarTime ?? true, ziHourConvention };
}

// ─── public API ───────────────────────────────────────────────────────────

/**
 * Four pillars of a TimeContext (see module doc for the clocks and conventions),
 * plus flag-driven alternative charts. Throws when the birth time is unknown.
 */
export function computePillars(ctx: TimeContext, config: BaziPillarConfig = {}): BaziPillarsResult {
  const { utcMs, civilIso, trueSolarIso } = requireKnownTime(ctx);
  const { useTrueSolarTime, ziHourConvention } = resolveConfig(config);
  const basis: TimeBasis = useTrueSolarTime ? 'trueSolar' : 'civil';
  const clockIso = useTrueSolarTime ? trueSolarIso : civilIso;
  const clockMs = naiveMs(clockIso);
  const sect = sectOf(ziHourConvention);

  const ym = yearMonthAt(utcMs);
  const dh = dayHourAt(clockMs, sect);
  const pillars: BaziPillars = { year: ym.year, month: ym.month, day: dh.day, hour: dh.hour };

  const alternatives: BaziAlternative[] = [];
  const push = (reason: BaziAlternativeReason, alt: BaziPillars, detail: string) => {
    if (!samePillars(alt, pillars)) alternatives.push({ reason, pillars: alt, detail });
  };

  for (const flag of ctx.flags) {
    if (flag.code === 'near_shichen_boundary') {
      const hit = flag.data.hits.find((h) => h.basis === basis);
      if (!hit) continue;
      const dayStart = clockMs - mod(clockMs, 24 * HOUR_MS);
      const boundaryMs = dayStart + Number(hit.boundary.slice(0, 2)) * HOUR_MS;
      // Born after the boundary → alternative just before it; born before → exactly on it.
      const altClock = hit.minutesFromBoundary >= 0 ? boundaryMs - MINUTE_MS : boundaryMs;
      const alt = dayHourAt(altClock, sect);
      push('near_shichen_boundary', { ...pillars, day: alt.day, hour: alt.hour }, `${basis} clock ${naiveIso(altClock)} (boundary ${hit.boundary})`);
    } else if (flag.code === 'near_jie_boundary' && flag.data.basis === 'instant') {
      const termMs = Date.parse(flag.data.term.utcIso);
      const altUtc = flag.data.minutesFromTerm >= 0 ? termMs - 1000 : termMs;
      const alt = yearMonthAt(altUtc);
      push('near_jie_boundary', { ...pillars, year: alt.year, month: alt.month }, `instant ${formatUtcIso(altUtc)} (${flag.data.term.nameHant} ${flag.data.term.utcIso})`);
    } else if (flag.code === 'zi_hour_convention' && flag.data.bases.includes(basis)) {
      const other: ZiHourConvention = ziHourConvention === 'early' ? 'late' : 'early';
      const alt = dayHourAt(clockMs, sectOf(other));
      push('zi_hour_convention', { ...pillars, day: alt.day, hour: alt.hour }, `ziHourConvention '${other}'`);
    }
  }

  return {
    pillars,
    alternatives,
    clock: { basis, iso: clockIso },
    conventions: { useTrueSolarTime, ziHourConvention, sect },
    solarYear: ym.solarYear,
    monthJie: toTermRef(ym.jie),
  };
}

export interface LuckCycleStep {
  index: number;
  ganZhi: string;
  /** ISO date 'YYYY-MM-DD' (birthplace civil calendar). */
  start: string;
  /** ISO date, inclusive (the day before the next step starts). */
  end: string;
  /** Exact age at the start of the step. */
  startAge: { years: number; months: number; days: number; hours: number };
}

export interface LuckCycles {
  direction: '順' | '逆';
  forward: boolean;
  /** The 節 the start is measured to (順: next 節; 逆: previous 節). */
  jie: SolarTermRef;
  /** Age at the first step (起運歲數), lunar-javascript sect=2 conversion. */
  startAge: { years: number; months: number; days: number; hours: number };
  /** 起運 moment on the birthplace civil wall clock, 'YYYY-MM-DDTHH:mm:ss'. */
  startIso: string;
  /** 起運 date, 'YYYY-MM-DD'. */
  startDate: string;
  steps: LuckCycleStep[];
}

function solarToIsoDate(s: any): string {
  return `${String(s.getYear()).padStart(4, '0')}-${String(s.getMonth()).padStart(2, '0')}-${String(s.getDay()).padStart(2, '0')}`;
}

function solarToIso(s: any): string {
  return `${solarToIsoDate(s)}T${String(s.getHour()).padStart(2, '0')}:${String(s.getMinute()).padStart(2, '0')}:${String(s.getSecond()).padStart(2, '0')}`;
}

/**
 * 大運: direction, 起運 (exact to month, and day/hour as the library computes it),
 * and `count` (default 10) contiguous 10-year steps with ISO start/end dates.
 */
export function luckCycles(
  ctx: TimeContext,
  gender: 'male' | 'female',
  config: BaziPillarConfig & { count?: number } = {},
): LuckCycles {
  if (gender !== 'male' && gender !== 'female') throw new Error(`luckCycles requires gender 'male' or 'female', got: ${String(gender)}`);
  const { utcMs, civilIso } = requireKnownTime(ctx);
  const count = config.count ?? 10;
  const ym = yearMonthAt(utcMs);
  const yangYear = mod(ym.solarYear - 4, 10) % 2 === 0;
  const forward = yangYear === (gender === 'male');

  const { prev, next } = prevNextTerm(solarTermsAround(utcMs), utcMs, 'jie');
  const jie = forward ? next : prev;
  const minuteOf = (ms: number) => Math.floor(ms / MINUTE_MS);
  let minutes = forward ? minuteOf(jie.utcMs) - minuteOf(utcMs) : minuteOf(utcMs) - minuteOf(jie.utcMs);
  const years = Math.floor(minutes / 4320);
  minutes -= years * 4320;
  const months = Math.floor(minutes / 360);
  minutes -= months * 360;
  const days = Math.floor(minutes / 12);
  minutes -= days * 12;
  const hours = minutes * 2;

  const b = new Date(naiveMs(civilIso));
  const birth = Solar.fromYmdHms(b.getUTCFullYear(), b.getUTCMonth() + 1, b.getUTCDate(), b.getUTCHours(), b.getUTCMinutes(), b.getUTCSeconds());
  const start = birth.nextYear(years).nextMonth(months).next(days).nextHour(hours);

  const monthIdx = ganZhiIndex(ym.month);
  const steps: LuckCycleStep[] = [];
  for (let i = 1; i <= count; i++) {
    steps.push({
      index: i,
      ganZhi: ganZhiAt(monthIdx + (forward ? i : -i)),
      start: solarToIsoDate(start.nextYear((i - 1) * 10)),
      end: solarToIsoDate(start.nextYear(i * 10).next(-1)),
      startAge: { years: years + (i - 1) * 10, months, days, hours },
    });
  }
  return {
    direction: forward ? '順' : '逆',
    forward,
    jie: toTermRef(jie),
    startAge: { years, months, days, hours },
    startIso: solarToIso(start),
    startDate: solarToIsoDate(start),
    steps,
  };
}

/** Exact 立春 instant (UTC ms) of a Gregorian year. */
export function liChunUtcMs(year: number): number {
  const t = solarTermsAround(Date.UTC(year, 5, 1)).find(
    (x) => x.name === '立春' && new Date(x.utcMs + CST_OFFSET_MS).getUTCFullYear() === year,
  );
  if (!t) throw new RangeError(`立春 not found for ${year}`);
  return t.utcMs;
}

export interface AnnualPillar {
  /** Solar (立春) year. */
  year: number;
  ganZhi: string;
  /** Exact 立春 instant, UTC ISO. */
  start: string;
  /** Next year's 立春 instant (exclusive), UTC ISO. */
  end: string;
}

/** 流年 for `count` consecutive solar years from `fromYear`, each spanning 立春 → next 立春. */
export function annualPillars(fromYear: number, count: number): AnnualPillar[] {
  if (!Number.isInteger(fromYear) || !Number.isInteger(count) || count < 0) {
    throw new RangeError(`annualPillars(fromYear, count) needs integers, got ${fromYear}, ${count}`);
  }
  const out: AnnualPillar[] = [];
  let start = count > 0 ? liChunUtcMs(fromYear) : 0;
  for (let y = fromYear; y < fromYear + count; y++) {
    const end = liChunUtcMs(y + 1);
    out.push({ year: y, ganZhi: yearGanZhi(y), start: formatUtcIso(start), end: formatUtcIso(end) });
    start = end;
  }
  return out;
}

export interface MonthlyPillar {
  /** Solar (立春) year the month belongs to. */
  solarYear: number;
  /** 0 = 寅月 (立春) … 11 = 丑月 (小寒). */
  index: number;
  ganZhi: string;
  /** Opening 節 (Traditional Chinese display name). */
  jie: string;
  /** Opening 節 instant, UTC ISO. */
  start: string;
  /** Next 節 instant (exclusive), UTC ISO. */
  end: string;
}

/** 12 流月 of a solar (立春) year, each spanning its 節 → next 節. */
export function monthlyPillars(year: number): MonthlyPillar[] {
  if (!Number.isInteger(year)) throw new RangeError(`monthlyPillars(year) needs an integer, got ${year}`);
  const lichun = liChunUtcMs(year);
  const jies = solarTermsAround(Date.UTC(year, 5, 1)).filter((t) => t.kind === 'jie' && t.utcMs >= lichun);
  if (jies.length < 13) throw new RangeError(`solar term table does not cover solar year ${year}`);
  return jies.slice(0, 12).map((t, k) => ({
    solarYear: year,
    index: k,
    ganZhi: monthGanZhi(year, k),
    jie: toTermRef(t).nameHant,
    start: formatUtcIso(t.utcMs),
    end: formatUtcIso(jies[k + 1].utcMs),
  }));
}

/**
 * Solar (立春) year of an asOf date, read as 00:00 Asia/Taipei (UTC+8) like the
 * legacy engine's `liuNian` (ASOF_CONVENTION).
 */
export function solarYearOfAsOf(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  const utcMs = Date.UTC(y, m - 1, d) - CST_OFFSET_MS;
  return utcMs >= liChunUtcMs(y) ? y : y - 1;
}
