/// <reference path="../../types/lunar-javascript.d.ts" />
/**
 * @fileoverview 八字 calculator — TimeContext-native (V1-04).
 *
 * The typed `chart` comes from the pure `./pillars` module:
 * - pillars: year/month by the exact 節 instant, day/hour on the true solar
 *   clock (default; `useTrueSolarTime: false` → local civil wall time, which
 *   reproduces the legacy engine), `ziHourConvention` 'late' (sect=2) by default;
 * - `alternatives` when a time boundary flag makes the chart ambiguous;
 * - `luckCycles` with ISO start/end dates and 起運 exact to the month;
 * - `annualSequence` (asOf year −1 … +9 by default) and `monthly` (asOf solar year).
 *
 * `components` are still the legacy `BaZiEngine` output (civil Taipei wall time,
 * sect=2) so that `analyze()` / Report v3 and the LayerClassifier stay
 * byte-identical. When the chart pillars differ from those civil pillars the
 * warning `pillars_differ_from_civil` is emitted and both are in the chart
 * (`pillars` vs `civilPillars`).
 *
 * @module calculators/bazi/calculator
 */

import { LunarUtil } from 'lunar-javascript';
import { BaZiEngine } from '../../engines/BaZiEngine.js';
import type { TimeContext, TimeFlag } from '../../time/types';
import { categoryValues, componentValue, normalizeAsOf, timeContextToBirthData } from '../birthData';
import type { Calculator, CalculatorConfig, ChartResult, Component } from '../types';
import {
  annualPillars,
  computePillars,
  luckCycles as computeLuckCycles,
  monthlyPillars,
  solarYearOfAsOf,
  type AnnualPillar,
  type BaziAlternative,
  type BaziPillars,
  type LuckCycles,
  type MonthlyPillar,
  type ZiHourConvention,
} from './pillars';

export type { BaziPillars, BaziAlternative, AnnualPillar, MonthlyPillar, ZiHourConvention } from './pillars';

export type FiveElement = '木' | '火' | '土' | '金' | '水';

export interface BaziDayMaster {
  stem: string;
  element: FiveElement;
  yinYang: '陽' | '陰';
}

/** One 大運 step. The first seven fields keep the legacy engine's `daYun_N` shape. */
export interface BaziLuckCycle {
  index: number;
  ganZhi: string;
  startYear: number;
  endYear: number;
  /** Nominal (虛歲) starting age: startYear − birth year + 1. */
  startAge: number;
  /** Whether asOf falls in [start, end]. */
  isCurrent: boolean;
  ageConvention: string;
  /** V1-04: ISO start date 'YYYY-MM-DD' (birthplace civil calendar). */
  start?: string;
  /** V1-04: ISO end date, inclusive. */
  end?: string;
  /** V1-04: exact age at the start of the step. */
  startAgeExact?: { years: number; months: number; days: number; hours: number };
}

/** 流年 at asOf (legacy shape: Gregorian asOf year + 立春-exact 干支 at asOf 00:00 Taipei). */
export interface BaziAnnual {
  year: number;
  ganZhi: string;
}

export interface BaziLuckStart {
  direction: '順' | '逆';
  /** 起運 age, exact to the month (days/hours as lunar-javascript sect=2). */
  age: { years: number; months: number; days: number; hours: number };
  /** 起運 date 'YYYY-MM-DD'. */
  date: string;
  /** The 節 the start is measured to (name, UTC instant). */
  jie: { name: string; nameHant: string; utcIso: string };
}

export interface BaziConventions {
  useTrueSolarTime: boolean;
  ziHourConvention: ZiHourConvention;
  /** Clock of the day/hour pillars and its wall reading. */
  clock: { basis: 'trueSolar' | 'civil'; iso: string };
  yearMonthBasis: 'jie-instant';
}

export interface BaziChart {
  /** null when the time is unknown or the engine failed. */
  pillars: BaziPillars | null;
  dayMaster: BaziDayMaster | null;
  /** 五行出現次數 (occurrence counts only, D-019), incl. hidden stems — of `pillars`. */
  fiveElements: Record<FiveElement, number> | null;
  /** 十神出現次數, incl. hidden stems — of `pillars`. */
  tenGods: Record<string, number> | null;
  luckCycles: BaziLuckCycle[];
  annual: BaziAnnual | null;
  // ── V1-04 (absent when the birth time is unknown) ──
  /** Boundary alternatives (兩盤並算). */
  alternatives?: BaziAlternative[];
  /** The legacy engine's civil-clock pillars (what `components` describe). */
  civilPillars?: BaziPillars;
  luckStart?: BaziLuckStart;
  /** 流年 sequence with exact 立春 spans. */
  annualSequence?: AnnualPillar[];
  /** 流月 of the asOf solar year with exact 節 spans. */
  monthly?: MonthlyPillar[];
  conventions?: BaziConventions;
}

export interface BaziCalculatorConfig extends CalculatorConfig {
  /** Default true. false → local civil wall time (legacy engine parity). */
  useTrueSolarTime?: boolean;
  /** Default 'late' (sect=2, legacy). 'early' → 23:00 starts the next day (sect=1). */
  ziHourConvention?: ZiHourConvention;
  /** 流年 sequence range; default { from: asOf year − 1, count: 11 }. */
  annualRange?: { from: number; count: number };
}

export const BAZI_CALCULATOR_VERSION = '1.0.0';

const STEM_ELEMENTS: Readonly<Record<string, FiveElement>> = Object.freeze({
  甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水',
});
const YANG_STEMS = new Set(['甲', '丙', '戊', '庚', '壬']);
const PRODUCES: Readonly<Record<FiveElement, FiveElement>> = Object.freeze({ 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' });
const CONTROLS: Readonly<Record<FiveElement, FiveElement>> = Object.freeze({ 木: '土', 火: '金', 土: '水', 金: '木', 水: '火' });
const TEN_GODS = ['比肩', '劫財', '食神', '傷官', '偏財', '正財', '七殺', '正官', '偏印', '正印'] as const;

function tenGodFor(dayStem: string, stem: string): string {
  const de = STEM_ELEMENTS[dayStem];
  const te = STEM_ELEMENTS[stem];
  const same = YANG_STEMS.has(dayStem) === YANG_STEMS.has(stem);
  if (te === de) return same ? '比肩' : '劫財';
  if (PRODUCES[de] === te) return same ? '食神' : '傷官';
  if (PRODUCES[te] === de) return same ? '偏印' : '正印';
  if (CONTROLS[de] === te) return same ? '偏財' : '正財';
  if (CONTROLS[te] === de) return same ? '七殺' : '正官';
  throw new Error(`Cannot derive ten god for ${dayStem}/${stem}`);
}

/** Day master, five-element and ten-god occurrence counts of a set of pillars (same method as BaZiEngine). */
export function pillarStats(p: BaziPillars): {
  dayMaster: BaziDayMaster;
  fiveElements: Record<FiveElement, number>;
  tenGods: Record<string, number>;
} {
  const all = [p.year, p.month, p.day, p.hour];
  const stems = [...all.map((gz) => gz[0]), ...all.flatMap((gz) => LunarUtil.ZHI_HIDE_GAN[gz[1]] as string[])];
  const dayStem = p.day[0];
  const fiveElements: Record<FiveElement, number> = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  const tenGods: Record<string, number> = Object.fromEntries(TEN_GODS.map((n) => [n, 0]));
  for (const s of stems) {
    fiveElements[STEM_ELEMENTS[s]] += 1;
    tenGods[tenGodFor(dayStem, s)] += 1;
  }
  return {
    dayMaster: { stem: dayStem, element: STEM_ELEMENTS[dayStem], yinYang: YANG_STEMS.has(dayStem) ? '陽' : '陰' },
    fiveElements,
    tenGods,
  };
}

/** Typed view of the legacy engine components (civil clock). */
export function extractBaziChart(components: readonly Component[]): BaziChart {
  const natal = componentValue<{ year: string; month: string; day: string; time: string }>(components, 'natal');
  const elements = componentValue<{ counts: Record<FiveElement, number> }>(components, 'elements');
  const tenGods = componentValue<{ counts: Record<string, number> }>(components, 'ten_gods');
  return {
    pillars: natal ? { year: natal.year, month: natal.month, day: natal.day, hour: natal.time } : null,
    dayMaster: componentValue<BaziDayMaster>(components, 'day_master'),
    fiveElements: elements ? { ...elements.counts } : null,
    tenGods: tenGods ? { ...tenGods.counts } : null,
    luckCycles: categoryValues<BaziLuckCycle>(components, 'daYun'),
    annual: componentValue<BaziAnnual>(components, 'liuNian'),
  };
}

/**
 * Flag → warning codes, evaluated on the clock the chart actually uses
 * (shichen / zi-hour hits on the other clock do not affect the chart).
 */
function baziWarnings(ctx: TimeContext, basis: 'trueSolar' | 'civil'): string[] {
  const out: string[] = [];
  for (const flag of ctx.flags as TimeFlag[]) {
    switch (flag.code) {
      case 'time_unknown':
      case 'dst_gap':
      case 'dst_overlap':
      case 'near_jie_boundary':
        out.push(flag.code);
        break;
      case 'near_shichen_boundary':
        if (flag.data.hits.some((h) => h.basis === basis)) out.push(flag.code);
        break;
      case 'zi_hour_convention':
        if (flag.data.bases.includes(basis)) out.push(flag.code);
        break;
      default:
        break;
    }
  }
  return out;
}

function sameP(a: BaziPillars, b: BaziPillars): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day && a.hour === b.hour;
}

export const baziCalculator: Calculator<BaziChart, BaziCalculatorConfig> = {
  id: 'bazi',
  version: BAZI_CALCULATOR_VERSION,
  // Longitude drives true solar time; the timezone drives the UTC instant.
  requires: { time: true, location: true, name: false },
  calculate(ctx: TimeContext, config: BaziCalculatorConfig = {}): ChartResult<BaziChart> {
    const { ymd } = normalizeAsOf(config.asOf, 'bazi');
    const birth = timeContextToBirthData(ctx, { name: config.name });
    // Legacy components (civil clock) — unchanged so analyze()/Report v3 stay identical.
    const result = new BaZiEngine({ asOf: ymd }).run(birth);
    const components = result.components as Component[];
    const legacy = extractBaziChart(components);
    const useTrueSolarTime = config.useTrueSolarTime ?? true;
    const basis = useTrueSolarTime ? 'trueSolar' : 'civil';

    // Time unknown (or engine failure): no chart, no guessing.
    if (ctx.utc === null || legacy.pillars === null) {
      return {
        system: 'bazi',
        version: BAZI_CALCULATOR_VERSION,
        chart: legacy,
        components,
        warnings: [...baziWarnings(ctx, 'civil'), ...result.errors],
      };
    }

    const pillarCfg = { useTrueSolarTime, ziHourConvention: config.ziHourConvention };
    const pr = computePillars(ctx, pillarCfg);
    const stats = pillarStats(pr.pillars);
    const luck: LuckCycles = computeLuckCycles(ctx, ctx.profile.gender, pillarCfg);
    const birthYear = Number(ctx.local!.iso.slice(0, 4));
    const luckCycles: BaziLuckCycle[] = luck.steps.map((s) => {
      const startYear = Number(s.start.slice(0, 4));
      return {
        index: s.index,
        ganZhi: s.ganZhi,
        startYear,
        endYear: startYear + 9,
        startAge: startYear - birthYear + 1,
        isCurrent: s.start <= ymd && ymd <= s.end,
        ageConvention: 'nominal-year-age',
        start: s.start,
        end: s.end,
        startAgeExact: s.startAge,
      };
    });
    const asOfYear = Number(ymd.slice(0, 4));
    const range = config.annualRange ?? { from: asOfYear - 1, count: 11 };

    const chart: BaziChart = {
      pillars: pr.pillars,
      dayMaster: stats.dayMaster,
      fiveElements: stats.fiveElements,
      tenGods: stats.tenGods,
      luckCycles,
      annual: legacy.annual,
      alternatives: pr.alternatives,
      civilPillars: legacy.pillars,
      luckStart: {
        direction: luck.direction,
        age: luck.startAge,
        date: luck.startDate,
        jie: { name: luck.jie.name, nameHant: luck.jie.nameHant, utcIso: luck.jie.utcIso },
      },
      annualSequence: annualPillars(range.from, range.count),
      monthly: monthlyPillars(solarYearOfAsOf(ymd)),
      conventions: {
        useTrueSolarTime: pr.conventions.useTrueSolarTime,
        ziHourConvention: pr.conventions.ziHourConvention,
        clock: pr.clock,
        yearMonthBasis: 'jie-instant',
      },
    };

    const warnings = baziWarnings(ctx, basis);
    if (!sameP(pr.pillars, legacy.pillars)) warnings.push('pillars_differ_from_civil');
    return {
      system: 'bazi',
      version: BAZI_CALCULATOR_VERSION,
      chart,
      components,
      warnings: [...warnings, ...result.errors],
    };
  },
};

export { toBaziRuleChart } from './ruleChart';
