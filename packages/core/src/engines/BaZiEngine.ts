/**
 * @fileoverview BaZi natal (L0) calculation engine.
 *
 * Birth input is always interpreted as Asia/Taipei civil time. This engine
 * deliberately does not apply UTC conversion, longitude correction, or true
 * solar time. Since Report v4 (D-032) `analyze()` runs the TimeContext-aware
 * subclass `core/timeContextEngines#TimeContextBaZiEngine`, which feeds this
 * engine the resolved wall clock and rebuilds the natal / 大運 / 流年
 * components from exact-節, true-solar pillars (`buildBaziNatalComponents`).
 *
 * @module engines/BaZiEngine
 */

import { LunarUtil, Solar } from 'lunar-javascript';
import { BaseEngine } from '../core/BaseEngine';
import type { BirthData } from '../core/models/BirthData';
import type { Component, SystemResult } from '../core/models/SystemResult';

const STEM_ELEMENTS: Readonly<Record<string, string>> = Object.freeze({
  甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水',
});

const YANG_STEMS = new Set(['甲', '丙', '戊', '庚', '壬']);

const ELEMENT_PRODUCES: Readonly<Record<string, string>> = Object.freeze({ 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' });
const ELEMENT_CONTROLS: Readonly<Record<string, string>> = Object.freeze({ 木: '土', 火: '金', 土: '水', 金: '木', 水: '火' });

const TEN_GODS = Object.freeze(['比肩', '劫財', '食神', '傷官', '偏財', '正財', '七殺', '正官', '偏印', '正印']);

/** Whether a ten-god group shows in a visible stem, only in hidden stems, or not at all. */
export type TenGodPresence = '顯' | '隱' | '無';

const TEN_GOD_GROUPS = Object.freeze([
  Object.freeze({ group: '官殺', context: '規範與權威', tenGods: Object.freeze(['正官', '七殺']) }),
  Object.freeze({ group: '財星', context: '資源與交換', tenGods: Object.freeze(['正財', '偏財']) }),
  Object.freeze({ group: '食傷', context: '表達與產出', tenGods: Object.freeze(['食神', '傷官']) }),
  Object.freeze({ group: '印星', context: '學習與支持', tenGods: Object.freeze(['正印', '偏印']) }),
  Object.freeze({ group: '比劫', context: '同儕與競合', tenGods: Object.freeze(['比肩', '劫財']) }),
]);

/** Calendar / clock convention echoed in the natal component. */
export interface BaziConvention {
  calendar: string;
  timezone: string;
  dayBoundary: string;
  trueSolarTime: boolean;
  library: string;
}

/** The four pillars as 干支 strings. */
export interface BaziPillars {
  year: string;
  month: string;
  day: string;
  time: string;
}

export const TAIPEI_CONVENTION = Object.freeze({
  calendar: 'gregorian',
  timezone: 'Asia/Taipei',
  dayBoundary: 'lunar-javascript sect=2',
  trueSolarTime: false,
  library: 'lunar-javascript@1.7.7',
});

export const ASOF_CONVENTION = Object.freeze({
  timezone: 'Asia/Taipei',
  time: '00:00:00',
  yearBoundary: 'liChun-exact',
  precision: 'date',
});
/**
 * Classify a stem relative to the day master using the orthodox five-element
 * producing/controlling cycles and the stem's yin/yang polarity.
 */
function tenGodFor(dayStem: string, stem: string): string {
  const dayElement = STEM_ELEMENTS[dayStem];
  const targetElement = STEM_ELEMENTS[stem];
  if (!dayElement || !targetElement) {
    throw new Error(`Unsupported heavenly stem: ${stem}`);
  }

  const samePolarity = YANG_STEMS.has(dayStem) === YANG_STEMS.has(stem);
  if (targetElement === dayElement) return samePolarity ? '比肩' : '劫財';
  if (ELEMENT_PRODUCES[dayElement] === targetElement) return samePolarity ? '食神' : '傷官';
  if (ELEMENT_PRODUCES[targetElement] === dayElement) return samePolarity ? '偏印' : '正印';
  if (ELEMENT_CONTROLS[dayElement] === targetElement) return samePolarity ? '偏財' : '正財';
  if (ELEMENT_CONTROLS[targetElement] === dayElement) return samePolarity ? '七殺' : '正官';

  throw new Error(`Cannot derive ten god for ${dayStem}/${stem}`);
}

/** Default wording of the `elements` limitation (civil clock, no true solar time). */
export const ELEMENTS_LIMITATION = '此為五行出現次數，不代表旺衰、月令、藏干權重或真太陽時校正。';

/**
 * The five natal (L0/L3) components — 四柱, 日主, 五行出現次數, 十神統計,
 * 十神關係角色 — derived purely from the four pillar strings. Hidden stems come
 * from `LunarUtil.ZHI_HIDE_GAN`, which is exactly what lunar-javascript's
 * `EightChar#get*HideGan()` return, so the engine output is unchanged.
 *
 * Exported so the TimeContext-aware engine (`core/timeContextEngines`) can
 * rebuild these components from exact-節 / true-solar pillars.
 *
 * @param options.convention - echoed in natal value/meta (default {@link TAIPEI_CONVENTION})
 * @param options.elementsLimitation - default {@link ELEMENTS_LIMITATION}
 * @returns component descriptors for `SystemResult#add`
 */
export function buildBaziNatalComponents(
  pillars: BaziPillars,
  { convention = TAIPEI_CONVENTION, elementsLimitation = ELEMENTS_LIMITATION }: { convention?: BaziConvention; elementsLimitation?: string } = {},
): Component[] {
  const all = [pillars.year, pillars.month, pillars.day, pillars.time];
  const dayStem = pillars.day[0]!;
  const visibleStems = all.map(gz => gz[0]!);
  const contextVisibleStems = [pillars.year[0]!, pillars.month[0]!, pillars.time[0]!];
  const hiddenStems: string[] = all.flatMap(gz => LunarUtil.ZHI_HIDE_GAN[gz[1]!]);
  const allStems = [...visibleStems, ...hiddenStems];
  const elementCounts: Record<string, number> = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  const tenGodCounts = Object.fromEntries(TEN_GODS.map(name => [name, 0]));

  for (const stem of allStems) {
    elementCounts[STEM_ELEMENTS[stem]!]! += 1;
    tenGodCounts[tenGodFor(dayStem, stem)]! += 1;
  }

  const visibleTenGods = contextVisibleStems.map(stem => tenGodFor(dayStem, stem));
  const hiddenTenGods = hiddenStems.map(stem => tenGodFor(dayStem, stem));
  const contextGroups = TEN_GOD_GROUPS.map(definition => {
    const breakdown = Object.fromEntries(definition.tenGods.map(name => [
      name,
      visibleTenGods.filter(tenGod => tenGod === name).length
        + hiddenTenGods.filter(tenGod => tenGod === name).length,
    ]));
    const visibleCount = visibleTenGods.filter(tenGod => definition.tenGods.includes(tenGod)).length;
    const hiddenCount = hiddenTenGods.filter(tenGod => definition.tenGods.includes(tenGod)).length;

    return {
      group: definition.group,
      context: definition.context,
      tenGods: [...definition.tenGods],
      breakdown,
      observedTenGods: definition.tenGods.filter(name => breakdown[name]! > 0),
      visibleCount,
      hiddenCount,
      count: visibleCount + hiddenCount,
      presence: (visibleCount > 0 ? '顯' : (hiddenCount > 0 ? '隱' : '無')) as TenGodPresence,
    };
  });
  const tenGodsContextTotal = contextGroups.reduce((sum, group) => sum + group.count, 0);
  const tenGodsContextGroups = contextGroups.map(group => ({
    ...group,
    share: tenGodsContextTotal > 0 ? group.count / tenGodsContextTotal : 0,
  }));

  return [
    {
      id: 'natal',
      name: '四柱',
      category: 'natal',
      value: { ...pillars, convention },
      meta: { convention },
    },
    {
      id: 'day_master',
      name: '日主',
      category: 'dayMaster',
      value: {
        stem: dayStem,
        element: STEM_ELEMENTS[dayStem],
        yinYang: YANG_STEMS.has(dayStem) ? '陽' : '陰',
      },
    },
    {
      id: 'elements',
      name: '五行出現次數',
      category: 'elements',
      value: {
        counts: elementCounts,
        total: allStems.length,
        includesHiddenStems: true,
        includesDayMaster: true,
        metric: 'occurrence-count',
        limitation: elementsLimitation,
      },
    },
    {
      id: 'ten_gods',
      name: '十神統計',
      category: 'tenGods',
      value: {
        counts: tenGodCounts,
        total: allStems.length,
        includesDayMaster: true,
      },
    },
    {
      id: 'tenGodsContext',
      name: '十神關係角色',
      category: 'tenGodsContext',
      value: {
        groups: tenGodsContextGroups,
        total: tenGodsContextTotal,
        includesHiddenStems: true,
        includesDayMaster: false,
        metric: 'occurrence-share',
        presenceConvention: 'visible-hidden-absent',
      },
    },
  ];
}

/**
 * BaZi L0 engine: four pillars, day master, five-element occurrence counts,
 * and ten-god occurrence counts.
 */
export class BaZiEngine extends BaseEngine {
  id = 'bazi';
  name = '八字';
  /** Evaluation date (YYYY-MM-DD) for 大運 `isCurrent` and 流年. */
  declare asOf: Date | string | null;

  /**
   * Accepted for a uniform default-engine factory signature. B1's L0 output
   * intentionally does not depend on the evaluation date.
   */
  constructor({ asOf = null }: { asOf?: Date | string | null } = {}) {
    super();
    this.asOf = asOf;
  }

  _compute(birth: BirthData): SystemResult {
    if (birth.timeKnown === false) {
      const unavailable = this.result();
      unavailable.meta = {
        unavailableReason: 'unknown-time',
        unavailableMessage: '出生時辰不確定，因此八字四柱、十神與大運未計算。',
      };
      return unavailable;
    }
    if (!this.asOf || typeof this.asOf !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(this.asOf)) {
      throw new Error(`BaZiEngine requires asOf in YYYY-MM-DD format, got: ${this.asOf}`);
    }
    const asOfParts = this.asOf.split('-').map(Number) as [number, number, number];
    const dateObj = new Date(asOfParts[0], asOfParts[1] - 1, asOfParts[2]);
    if (dateObj.getFullYear() !== asOfParts[0] || dateObj.getMonth() !== asOfParts[1] - 1 || dateObj.getDate() !== asOfParts[2]) {
      throw new Error(`BaZiEngine requires a valid calendar date, got: ${this.asOf}`);
    }

    const asOfCompareStr = `${this.asOf} 00:00:00`;
    const asOfSolar = Solar.fromYmdHms(asOfParts[0], asOfParts[1], asOfParts[2], 0, 0, 0);

    const solar = Solar.fromYmdHms(
      birth.year,
      birth.month,
      birth.day,
      birth.hour,
      birth.minute,
      0,
    );
    const eightChar = solar.getLunar().getEightChar();
    eightChar.setSect(2);

    let genderValue;
    if (birth.gender === 'male') {
      genderValue = 1;
    } else if (birth.gender === 'female') {
      genderValue = 0;
    } else {
      throw new Error(`BaZiEngine requires birth.gender to be 'male' or 'female', got: ${birth.gender}`);
    }
    const yun = eightChar.getYun(genderValue, 2);

    const pillars = {
      year: eightChar.getYear(),
      month: eightChar.getMonth(),
      day: eightChar.getDay(),
      time: eightChar.getTime(),
    };

    const result = this.result();
    result.meta = {
      asOfConvention: ASOF_CONVENTION,
      dayBoundary: 'eight-char sect=2',
      yunCalculation: 'getYun sect=2',
    };
    for (const component of buildBaziNatalComponents(pillars)) result.add(component);

    const daYuns = yun.getDaYun(11);
    const startSolarStr = yun.getStartSolar().toYmdHms();

    for (let i = 1; i <= 10; i++) {
      const dy = daYuns[i];
      const stepStart = `${String(parseInt(startSolarStr.substring(0, 4), 10) + (i - 1) * 10)}${startSolarStr.substring(4)}`;
      const stepEnd = `${String(parseInt(startSolarStr.substring(0, 4), 10) + i * 10)}${startSolarStr.substring(4)}`;

      const isCurrent = asOfCompareStr >= stepStart && asOfCompareStr < stepEnd;

      result.add({
        id: `daYun_${i}`,
        name: `大運 ${i}`,
        category: 'daYun',
        value: {
          index: i,
          ganZhi: dy.getGanZhi(),
          startYear: dy.getStartYear(),
          endYear: dy.getStartYear() + 9, // strict 9 years difference according to tests
          startAge: dy.getStartAge(),
          isCurrent,
          ageConvention: 'nominal-year-age',
        },
      });
    }

    result.add({
      id: 'liuNian',
      name: '流年',
      category: 'liuNian',
      value: {
        year: asOfParts[0],
        ganZhi: asOfSolar.getLunar().getYearInGanZhiExact(),
      },
    });

    return result;
  }
}
