/// <reference path="../../types/lunar-javascript.d.ts" />
/**
 * @fileoverview 紫微斗數 on TimeContext (V1-05): time → iztro timeIndex, the
 * iztro astrolabe, its typed natal view and the 大限／流年／流月 sequences.
 *
 * Pure and deterministic (D-014): every iztro call gets an explicit solar date
 * string (never a `Date`, whose host-zone getters iztro would read), and no call
 * reads the clock. iztro global config is never touched (defaults: 年/運限以
 * 正月初一分界, 虛歲逐年 +1, 晚子時 advances the lunar day).
 *
 * Time (ARCHITECTURE-V2 §3.4): true solar time by default. The wall time on the
 * chosen clock is turned into (date, timeIndex); if true solar time crosses
 * midnight the date moves with it. 子時 handling follows `ZiweiZiHourConvention`.
 *
 * Lunar calendar spans (春節, lunar month starts) come from lunar-javascript.
 *
 * @module calculators/ziwei/astrolabe
 */

import { astro } from 'iztro';
import { Lunar, LunarYear, Solar } from 'lunar-javascript';
import { brightnessScore } from '../../engines/ZiweiEngine.js';
import type { TimeBasis, TimeContext } from '../../time/types';
import type {
  ZiweiZiHourConvention,
  ZiweiAlternativeReason,
  ZiweiDecadePeriod,
  ZiweiMonthlyPeriod,
  ZiweiMutagen,
  ZiweiNatalChart,
  ZiweiNatalTransformation,
  ZiweiPalace,
  ZiweiPalaceRef,
  ZiweiSanFang,
  ZiweiStar,
  ZiweiTimeAlternative,
  ZiweiTimeIndexResult,
  ZiweiTimeOptions,
  ZiweiTimeResolution,
  ZiweiYearlyPeriod,
} from './types';

export type ZiweiAstrolabe = ReturnType<typeof astro.bySolar>;

const LANGUAGE = 'zh-TW';
const DAY_MS = 86_400_000;
const WALL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/;

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

// ─── Date helpers (UTC arithmetic on civil dates, host-zone independent) ────

function isoFromParts(y: number, m: number, d: number): string {
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

/** 'YYYY-MM-DD' shifted by `days`. */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + days * DAY_MS);
  return isoFromParts(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** iztro date string ('YYYY-M-D', unpadded — the format ZiweiEngine passes). */
function iztroDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}-${m}-${d}`;
}

/** 春節（正月初一）of lunar year `lunarYear`, ISO date. */
export function lunarNewYear(lunarYear: number): string {
  return Lunar.fromYmd(lunarYear, 1, 1).getSolar().toYmd();
}

/** Lunar year (changes at 春節) of an ISO civil date. */
export function lunarYearOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Solar.fromYmd(y, m, d).getLunar().getYear();
}

// ─── Time → timeIndex ───────────────────────────────────────────────────────

/** Map a wall reading 'YYYY-MM-DDTHH:mm:ss' to (date, timeIndex). */
export function resolveZiweiWallTime(
  wall: string,
  convention: ZiweiZiHourConvention,
): { date: string; timeIndex: number } {
  const m = WALL.exec(wall);
  if (!m) throw new Error(`ziwei: unexpected wall time ${wall}`);
  const [y, mo, d, h, mi] = m.slice(1, 6).map(Number);
  const date = isoFromParts(y, mo, d);
  const minute = h * 60 + mi;
  if (minute >= 23 * 60) {
    return convention === 'nextDayAt23' ? { date: addDays(date, 1), timeIndex: 0 } : { date, timeIndex: 12 };
  }
  if (minute < 60) return { date, timeIndex: 0 };
  return { date, timeIndex: Math.floor((minute + 60) / 120) };
}

function wallOf(ctx: TimeContext, basis: TimeBasis): string {
  if (!ctx.solar || !ctx.local) throw new Error('ziwei: time unknown');
  return basis === 'trueSolar' ? ctx.solar.trueSolarIso : ctx.local.iso.slice(0, 19);
}

function resolution(wall: string, basis: TimeBasis, ziHourConvention: ZiweiZiHourConvention): ZiweiTimeResolution {
  return { ...resolveZiweiWallTime(wall, ziHourConvention), basis, wallTime: wall, ziHourConvention };
}

/**
 * Birth time → iztro (date, timeIndex) on true solar time (default) or civil
 * time, plus alternatives:
 * - `near_shichen_boundary` hit on the chosen clock → the neighbouring 時辰
 *   across that boundary;
 * - `zi_hour_convention` on the chosen clock at 23:00–24:00 → the other
 *   子時 convention (晚子 same day ↔ next-day 早子);
 * - true solar time used and the civil clock gives another (date, timeIndex)
 *   → the civil reading (`civil_time`).
 *
 * @returns null when the birth time is unknown (no guessing).
 */
export function timeIndexFrom(ctx: TimeContext, options: ZiweiTimeOptions = {}): ZiweiTimeIndexResult | null {
  if (ctx.local === null || ctx.solar === null) return null;
  const useTrueSolarTime = options.useTrueSolarTime ?? true;
  const convention = options.ziHourConvention ?? 'splitMidnight';
  const basis: TimeBasis = useTrueSolarTime ? 'trueSolar' : 'civil';
  const wall = wallOf(ctx, basis);
  const primary = resolution(wall, basis, convention);

  const primaryKey = `${primary.date}|${primary.timeIndex}`;
  const alternatives: ZiweiTimeAlternative[] = [];
  const add = (r: ZiweiTimeResolution, reason: ZiweiAlternativeReason) => {
    const key = `${r.date}|${r.timeIndex}`;
    if (key === primaryKey) return;
    const existing = alternatives.find((a) => `${a.date}|${a.timeIndex}` === key);
    if (existing) {
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
    } else {
      alternatives.push({ ...r, reasons: [reason] });
    }
  };

  for (const flag of ctx.flags) {
    if (flag.code === 'near_shichen_boundary') {
      for (const hit of flag.data.hits) {
        if (hit.basis !== basis) continue;
        const boundaryHour = Number(hit.boundary.slice(0, 2));
        // After the boundary → the 時辰 before it (boundary − 1 min); before it → the one starting at it.
        const altMinute = hit.minutesFromBoundary >= 0 ? boundaryHour * 60 - 1 : boundaryHour * 60;
        const altWall = `${wall.slice(0, 11)}${pad(Math.floor(altMinute / 60))}:${pad(altMinute % 60)}:00`;
        add(resolution(altWall, basis, convention), 'near_shichen_boundary');
      }
    }
    if (flag.code === 'zi_hour_convention' && flag.data.bases.includes(basis) && Number(wall.slice(11, 13)) >= 23) {
      add(resolution(wall, basis, convention === 'splitMidnight' ? 'nextDayAt23' : 'splitMidnight'), 'zi_hour_convention');
    }
  }
  if (useTrueSolarTime) add(resolution(wallOf(ctx, 'civil'), 'civil', convention), 'civil_time');
  return { ...primary, alternatives };
}

// ─── Astrolabe ──────────────────────────────────────────────────────────────

/** iztro `bySolar` for an explicit solar date + timeIndex (fixLeap on, zh-TW). */
export function createAstrolabe(date: string, timeIndex: number, gender: 'male' | 'female'): ZiweiAstrolabe {
  return astro.bySolar(iztroDate(date), timeIndex, gender === 'male' ? '男' : '女', true, LANGUAGE);
}

/**
 * Build the astrolabe for a TimeContext.
 * @returns null when the birth time is unknown.
 */
export function buildAstrolabe(
  ctx: TimeContext,
  config: ZiweiTimeOptions = {},
): { astrolabe: ZiweiAstrolabe; time: ZiweiTimeIndexResult } | null {
  const time = timeIndexFrom(ctx, config);
  if (!time) return null;
  return { astrolabe: createAstrolabe(time.date, time.timeIndex, ctx.profile.gender), time };
}

/** Lunar year of the astrolabe's birth date — the base iztro uses for 虛歲. */
export function birthLunarYearOf(astrolabe: ZiweiAstrolabe): number {
  return astrolabe.rawDates.lunarDate.lunarYear;
}

// ─── Typed natal view ───────────────────────────────────────────────────────

type IztroStar = { name: string; type: string; brightness?: string; mutagen?: string };

const toMutagen = (v: unknown): ZiweiMutagen | null =>
  v === '祿' || v === '權' || v === '科' || v === '忌' ? v : null;

function toStar(s: IztroStar): ZiweiStar {
  return {
    name: s.name,
    type: s.type,
    brightness: s.brightness ?? '',
    brightnessScore: brightnessScore(s.brightness),
    mutagen: toMutagen(s.mutagen),
  };
}

/** [本宮, 對宮, 三合 +4, 三合 +8] — palace index follows branch order. */
export function sanFangOf(index: number): ZiweiSanFang {
  return [index, (index + 6) % 12, (index + 4) % 12, (index + 8) % 12];
}

/** Typed natal chart (same serialisation as ZiweiEngine for palaces/stars). */
export function natalChart(astrolabe: ZiweiAstrolabe): ZiweiNatalChart {
  const natalTransformations: ZiweiNatalTransformation[] = [];
  const palaces: ZiweiPalace[] = astrolabe.palaces.map((p) => {
    const major = (p.majorStars as IztroStar[]).map(toStar);
    const minor = (p.minorStars as IztroStar[]).map(toStar);
    const adjective = (p.adjectiveStars as IztroStar[]).map(toStar);
    const transformations = [...major, ...minor, ...adjective]
      .filter((s) => s.mutagen)
      .map((s) => ({ star: s.name, mutagen: s.mutagen as ZiweiMutagen }));
    for (const t of transformations) natalTransformations.push({ ...t, palace: p.name, palaceIndex: p.index });
    const range = p.decadal?.range;
    return {
      index: p.index,
      name: p.name,
      stem: p.heavenlyStem,
      branch: p.earthlyBranch,
      isBodyPalace: p.isBodyPalace,
      isOriginalPalace: p.isOriginalPalace,
      majorStars: major,
      minorStars: minor,
      adjectiveStars: adjective,
      transformations,
      decadeRange: Array.isArray(range) && range.length === 2 ? [range[0], range[1]] : null,
    };
  });
  const ref = (p: ZiweiPalace | undefined): ZiweiPalaceRef | null =>
    p ? { index: p.index, name: p.name, branch: p.branch } : null;
  return {
    palaces,
    soulPalace: ref(palaces.find((p) => p.name === '命宮')),
    bodyPalace: ref(palaces.find((p) => p.isBodyPalace)),
    fiveElementBureau: astrolabe.fiveElementsClass ?? null,
    soulMaster: astrolabe.soul ?? null,
    bodyMaster: astrolabe.body ?? null,
    natalTransformations,
    sanFangSiZheng: palaces.map((p) => sanFangOf(p.index)),
  };
}

// ─── Flow sequences ─────────────────────────────────────────────────────────

/**
 * Full 大限 sequence with ISO spans on lunar-year boundaries: 虛歲 n is lunar
 * year `birthLunarYear + n − 1` (春節 → day before next 春節). 四化 via iztro
 * `horoscope(start)`.
 *
 * @param birthLunarYear lunar birth year (default: from the astrolabe).
 */
export function decadeSequence(astrolabe: ZiweiAstrolabe, birthLunarYear = birthLunarYearOf(astrolabe)): ZiweiDecadePeriod[] {
  return astrolabe.palaces
    .filter((p) => Array.isArray(p.decadal?.range) && p.decadal.range.length === 2)
    .slice()
    .sort((a, b) => a.decadal.range[0] - b.decadal.range[0])
    .map((p, i) => {
      const [s, e] = p.decadal.range;
      const start = lunarNewYear(birthLunarYear + s - 1);
      const end = addDays(lunarNewYear(birthLunarYear + e), -1);
      const decadal = astrolabe.horoscope(iztroDate(start)).decadal;
      if (decadal.index !== p.index) {
        throw new Error(`ziwei: decade probe mismatch at ${start} (expected palace ${p.index}, got ${decadal.index})`);
      }
      return {
        id: `daXian_${i + 1}`,
        index: i + 1,
        palaceIndex: p.index,
        palaceName: p.name,
        stem: p.decadal.heavenlyStem,
        branch: p.decadal.earthlyBranch,
        ageRange: [s, e] as [number, number],
        mutagen: [...decadal.mutagen],
        start,
        end,
      };
    });
}

/**
 * `count` consecutive 流年 starting at lunar year `fromYear`. Each span runs
 * 春節 → day before the next 春節, so consecutive entries are contiguous.
 */
export function yearlySequence(astrolabe: ZiweiAstrolabe, fromYear: number, count: number): ZiweiYearlyPeriod[] {
  const out: ZiweiYearlyPeriod[] = [];
  for (let y = fromYear; y < fromYear + count; y++) {
    const start = lunarNewYear(y);
    const end = addDays(lunarNewYear(y + 1), -1);
    const h = astrolabe.horoscope(iztroDate(start));
    out.push({
      id: `liuNian_${pad(y, 4)}`,
      lunarYear: y,
      stem: h.yearly.heavenlyStem,
      branch: h.yearly.earthlyBranch,
      palaceIndex: h.yearly.index,
      mutagen: [...h.yearly.mutagen],
      nominalAge: h.age.nominalAge,
      decadePalaceIndex: h.decadal.index,
      start,
      end,
    });
  }
  return out;
}

/**
 * The 12 流月 of lunar year `year`. Month m spans from its 初一 to the day
 * before month m+1 starts. A leap month is split the way iztro assigns it:
 * 閏月 初一–十五 extend the preceding month, 十六 onward start the next one.
 * Month 12 ends the day before the next 春節. 流月命宮／四化 via iztro
 * `horoscope(start)`.
 */
export function monthlySequence(astrolabe: ZiweiAstrolabe, year: number): ZiweiMonthlyPeriod[] {
  const months = (LunarYear.fromYear(year).getMonths() as any[]).filter((m) => m.getYear() === year);
  // Start date of each regular month 1..12 (index 0..11).
  const starts: string[] = [];
  for (const m of months) {
    const first: string = Solar.fromJulianDay(m.getFirstJulianDay()).toYmd();
    const num: number = m.getMonth();
    if (num > 0) {
      // Keep a start already moved earlier by the preceding leap month's split.
      if (starts[num - 1] === undefined) starts[num - 1] = first;
    } else if (Math.abs(num) < 12) {
      // Leap month after |num|: its 十六 starts month |num|+1.
      starts[Math.abs(num)] = addDays(first, 15);
    }
  }
  const nextNewYear = lunarNewYear(year + 1);
  const out: ZiweiMonthlyPeriod[] = [];
  for (let i = 0; i < 12; i++) {
    const start = starts[i];
    if (start === undefined) throw new Error(`ziwei: missing lunar month ${i + 1} of ${year}`);
    const end = addDays(i < 11 ? starts[i + 1] : nextNewYear, -1);
    const h = astrolabe.horoscope(iztroDate(start));
    out.push({
      id: `liuYue_${pad(year, 4)}_${pad(i + 1)}`,
      lunarYear: year,
      lunarMonth: i + 1,
      stem: h.monthly.heavenlyStem,
      branch: h.monthly.earthlyBranch,
      palaceIndex: h.monthly.index,
      mutagen: [...h.monthly.mutagen],
      start,
      end,
    });
  }
  return out;
}
