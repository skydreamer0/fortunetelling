/**
 * @fileoverview Strongly-typed 紫微斗數 chart (ARCHITECTURE-V2 §4.1, V1-05).
 *
 * Date conventions: every `start` / `end` is an inclusive ISO civil date
 * 'YYYY-MM-DD'. Flow periods follow the lunar calendar — a 流年 runs from 春節
 * to the day before the next 春節, a 大限 covers the lunar years of its 虛歲
 * range, a 流月 covers its lunar month (see `astrolabe.ts` for leap months).
 *
 * @module calculators/ziwei/types
 */

import type { TimeBasis } from '../../time/types';

export type ZiweiMutagen = '祿' | '權' | '科' | '忌';

export interface ZiweiStar {
  name: string;
  /** iztro star type ('major' | 'soft' | 'tough' | 'adjective' | …). */
  type: string;
  /** 廟旺得利平不陷, '' when none. */
  brightness: string;
  /** D-005 normalised brightness (engine `brightnessScore`), null when none. */
  brightnessScore: number | null;
  /** 生年四化 on this star. */
  mutagen: ZiweiMutagen | null;
}

/** 生年四化 landing on a star. */
export interface ZiweiTransformation {
  star: string;
  mutagen: ZiweiMutagen;
}

export interface ZiweiPalace {
  /** iztro palace index 0–11 (0 = 寅). */
  index: number;
  /** Palace name, e.g. '命宮'. */
  name: string;
  stem: string;
  branch: string;
  isBodyPalace: boolean;
  isOriginalPalace: boolean;
  majorStars: ZiweiStar[];
  minorStars: ZiweiStar[];
  adjectiveStars: ZiweiStar[];
  /** 生年四化 on any star in this palace. */
  transformations: ZiweiTransformation[];
  /** 大限虛歲 [start, end]. */
  decadeRange: [number, number] | null;
}

export interface ZiweiPalaceRef {
  index: number;
  name: string;
  branch: string;
}

export interface ZiweiNatalTransformation extends ZiweiTransformation {
  palace: string;
  palaceIndex: number;
}

/** One 大限 as the engine emits it (`daXian_n`). */
export interface ZiweiDecade {
  index: number;
  palaceIndex: number;
  palaceName: string;
  range: [number, number];
  stem: string;
  branch: string;
  /** 大限四化 stars in 祿權科忌 order, null if the probe failed. */
  mutagen: string[] | null;
  isCurrent: boolean;
}

/** 流年 at asOf as the engine emits it (`flyingStars_yearly`). */
export interface ZiweiYearly {
  stem: string;
  branch: string;
  mutagen: string[];
  palaceIndex: number;
  asOf: string;
}

/** 三方四正 of one palace: [本宮, 對宮, 三合 (+4), 三合 (+8)] palace indices. */
export type ZiweiSanFang = [number, number, number, number];

/** Natal (time-invariant) part of a chart, built straight from an iztro astrolabe. */
export interface ZiweiNatalChart {
  /** 12 palaces in iztro order (index 0 = 寅). */
  palaces: ZiweiPalace[];
  soulPalace: ZiweiPalaceRef | null;
  bodyPalace: ZiweiPalaceRef | null;
  /** 五行局, e.g. '水二局'. */
  fiveElementBureau: string | null;
  /** 命主. */
  soulMaster: string | null;
  /** 身主. */
  bodyMaster: string | null;
  natalTransformations: ZiweiNatalTransformation[];
  /** Palace index → 三方四正 indices (array position = palace index). */
  sanFangSiZheng: ZiweiSanFang[];
}

// ─── Time resolution ──────────────────────────────────────────────────────

/**
 * 子時 day-change convention (ARCHITECTURE-V2 §3.4).
 * - `splitMidnight`（分早晚子，預設）: 23:00–24:00 is 晚子 of the SAME civil date
 *   (iztro timeIndex 12, iztro advances the lunar day internally); 00:00–01:00 is 早子 (0).
 * - `nextDayAt23`（子初換日）: 23:00 already starts the next day → next date, timeIndex 0.
 */
export type ZiweiZiHourConvention = 'splitMidnight' | 'nextDayAt23';

export interface ZiweiTimeOptions {
  /** Use true solar time (default true); false = local civil wall time. */
  useTrueSolarTime?: boolean;
  /** Default 'splitMidnight'. */
  ziHourConvention?: ZiweiZiHourConvention;
}

/** The (date, timeIndex) pair handed to iztro `bySolar`. */
export interface ZiweiTimeResolution {
  /** Solar date given to iztro, 'YYYY-MM-DD' (may differ from the civil date). */
  date: string;
  /** iztro timeIndex 0–12 (0 = 早子, 12 = 晚子). */
  timeIndex: number;
  /** Clock the wall time was read from. */
  basis: TimeBasis;
  /** Wall time on that clock, 'YYYY-MM-DDTHH:mm:ss'. */
  wallTime: string;
  ziHourConvention: ZiweiZiHourConvention;
}

export type ZiweiAlternativeReason = 'near_shichen_boundary' | 'zi_hour_convention' | 'civil_time';

export interface ZiweiTimeAlternative extends ZiweiTimeResolution {
  /** Why this reading is plausible (several when they coincide), in detection order. */
  reasons: ZiweiAlternativeReason[];
}

export interface ZiweiTimeIndexResult extends ZiweiTimeResolution {
  /** Other plausible (date, timeIndex) pairs, deduplicated, primary excluded. */
  alternatives: ZiweiTimeAlternative[];
}

/** A second chart computed for an alternative time (兩盤並算, D-026). */
export interface ZiweiAlternativeChart extends ZiweiNatalChart {
  resolution: ZiweiTimeAlternative;
}

// ─── Flow sequences ───────────────────────────────────────────────────────

/** One 大限 with precise lunar-year date span. */
export interface ZiweiDecadePeriod {
  /** Same id as the engine component, 'daXian_n' (n = 1-based order). */
  id: string;
  index: number;
  palaceIndex: number;
  palaceName: string;
  stem: string;
  branch: string;
  /** 虛歲 [start, end]. */
  ageRange: [number, number];
  /** 大限四化 stars in 祿權科忌 order. */
  mutagen: string[];
  /** 春節 of the lunar year in which 虛歲 = ageRange[0]. */
  start: string;
  /** Day before 春節 of the year after 虛歲 = ageRange[1]. */
  end: string;
}

/** One 流年 (lunar year). */
export interface ZiweiYearlyPeriod {
  /** 'liuNian_YYYY' — chart-level id (not an engine component). */
  id: string;
  lunarYear: number;
  stem: string;
  branch: string;
  /** Natal palace index acting as 流年命宮. */
  palaceIndex: number;
  /** 流年四化 stars in 祿權科忌 order. */
  mutagen: string[];
  /** 虛歲 during this lunar year. */
  nominalAge: number;
  /** Natal palace index of the 大限 (or 童限) in force. */
  decadePalaceIndex: number;
  /** 春節 of `lunarYear`. */
  start: string;
  /** Day before the next 春節. */
  end: string;
}

/** One 流月 (lunar month). */
export interface ZiweiMonthlyPeriod {
  /** 'liuYue_YYYY_MM' — chart-level id (not an engine component). */
  id: string;
  lunarYear: number;
  /** Lunar month 1–12. */
  lunarMonth: number;
  stem: string;
  branch: string;
  /** Natal palace index acting as 流月命宮. */
  palaceIndex: number;
  /** 流月四化 stars in 祿權科忌 order. */
  mutagen: string[];
  start: string;
  end: string;
}

// ─── Full chart ───────────────────────────────────────────────────────────

/** The part of the chart that is a typed view of the engine components. */
export interface ZiweiEngineChart {
  palaces: ZiweiPalace[];
  soulPalace: ZiweiPalaceRef | null;
  bodyPalace: ZiweiPalaceRef | null;
  fiveElementBureau: string | null;
  soulMaster: string | null;
  bodyMaster: string | null;
  natalTransformations: ZiweiNatalTransformation[];
  decades: ZiweiDecade[];
  yearly: ZiweiYearly | null;
}

export interface ZiweiChart extends ZiweiEngineChart {
  /** Palace index → 三方四正 indices; empty when the time is unknown. */
  sanFangSiZheng: ZiweiSanFang[];
  /** How the birth time was mapped to iztro; null when the time is unknown. */
  time: ZiweiTimeResolution | null;
  /** Charts for alternative times (shichen boundary / 子時 convention / civil clock). */
  alternatives: ZiweiAlternativeChart[];
  /** Lunar year of the chart's birth date (base of 虛歲); null when the time is unknown. */
  birthLunarYear: number | null;
  /** Full 大限 sequence with ISO spans. */
  decadeSequence: ZiweiDecadePeriod[];
  /** 流年 for lunar years asOf−1 … asOf+9. */
  yearlySequence: ZiweiYearlyPeriod[];
  /** 12 流月 of the asOf lunar year. */
  monthlySequence: ZiweiMonthlyPeriod[];
}
