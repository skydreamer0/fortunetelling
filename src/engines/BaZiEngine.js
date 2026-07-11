/**
 * @fileoverview BaZi natal (L0) calculation engine.
 *
 * Birth input is always interpreted as Asia/Taipei civil time. This engine
 * deliberately does not apply UTC conversion, longitude correction, or true
 * solar time; those need a future timezone/location-aware BirthData contract.
 *
 * @module engines/BaZiEngine
 */

import { Solar } from 'lunar-javascript';
import { BaseEngine } from '../core/BaseEngine.js';

const STEM_ELEMENTS = Object.freeze({
  甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水',
});

const YANG_STEMS = new Set(['甲', '丙', '戊', '庚', '壬']);

const ELEMENT_PRODUCES = Object.freeze({ 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' });
const ELEMENT_CONTROLS = Object.freeze({ 木: '土', 火: '金', 土: '水', 金: '木', 水: '火' });

const TEN_GODS = Object.freeze(['比肩', '劫財', '食神', '傷官', '偏財', '正財', '七殺', '正官', '偏印', '正印']);

/**
 * @typedef {'顯'|'隱'|'無'} TenGodPresence
 */
const TEN_GOD_GROUPS = Object.freeze([
  Object.freeze({ group: '官殺', context: '規範與權威', tenGods: Object.freeze(['正官', '七殺']) }),
  Object.freeze({ group: '財星', context: '資源與交換', tenGods: Object.freeze(['正財', '偏財']) }),
  Object.freeze({ group: '食傷', context: '表達與產出', tenGods: Object.freeze(['食神', '傷官']) }),
  Object.freeze({ group: '印星', context: '學習與支持', tenGods: Object.freeze(['正印', '偏印']) }),
  Object.freeze({ group: '比劫', context: '同儕與競合', tenGods: Object.freeze(['比肩', '劫財']) }),
]);

const TAIPEI_CONVENTION = Object.freeze({
  calendar: 'gregorian',
  timezone: 'Asia/Taipei',
  dayBoundary: 'lunar-javascript sect=2',
  trueSolarTime: false,
  library: 'lunar-javascript@1.7.7',
});

const ASOF_CONVENTION = Object.freeze({
  timezone: 'Asia/Taipei',
  time: '00:00:00',
  yearBoundary: 'liChun-exact',
  precision: 'date',
});
/**
 * Classify a stem relative to the day master using the orthodox five-element
 * producing/controlling cycles and the stem's yin/yang polarity.
 *
 * @param {string} dayStem
 * @param {string} stem
 * @returns {string}
 */
function tenGodFor(dayStem, stem) {
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

/**
 * BaZi L0 engine: four pillars, day master, five-element occurrence counts,
 * and ten-god occurrence counts.
 */
export class BaZiEngine extends BaseEngine {
  id = 'bazi';
  name = '八字';

  /**
   * Accepted for a uniform default-engine factory signature. B1's L0 output
   * intentionally does not depend on the evaluation date.
   *
   * @param {Object} [options]
   * @param {Date|string|null} [options.asOf=null]
   */
  constructor({ asOf = null } = {}) {
    super();
    this.asOf = asOf;
  }

  /**
   * @param {import('../core/models/BirthData.js').BirthData} birth
   * @returns {import('../core/models/SystemResult.js').SystemResult}
   */
  _compute(birth) {
    if (!this.asOf || typeof this.asOf !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(this.asOf)) {
      throw new Error(`BaZiEngine requires asOf in YYYY-MM-DD format, got: ${this.asOf}`);
    }
    const asOfParts = this.asOf.split('-').map(Number);
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
    const dayStem = eightChar.getDayGan();
    const visibleStems = [
      eightChar.getYearGan(),
      eightChar.getMonthGan(),
      dayStem,
      eightChar.getTimeGan(),
    ];
    const contextVisibleStems = [
      eightChar.getYearGan(),
      eightChar.getMonthGan(),
      eightChar.getTimeGan(),
    ];
    const hiddenStems = [
      ...eightChar.getYearHideGan(),
      ...eightChar.getMonthHideGan(),
      ...eightChar.getDayHideGan(),
      ...eightChar.getTimeHideGan(),
    ];
    const allStems = [...visibleStems, ...hiddenStems];
    const elementCounts = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
    const tenGodCounts = Object.fromEntries(TEN_GODS.map(name => [name, 0]));

    for (const stem of allStems) {
      elementCounts[STEM_ELEMENTS[stem]] += 1;
      tenGodCounts[tenGodFor(dayStem, stem)] += 1;
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
        observedTenGods: definition.tenGods.filter(name => breakdown[name] > 0),
        visibleCount,
        hiddenCount,
        count: visibleCount + hiddenCount,
        /** @type {TenGodPresence} */
        presence: visibleCount > 0 ? '顯' : (hiddenCount > 0 ? '隱' : '無'),
      };
    });
    const tenGodsContextTotal = contextGroups.reduce((sum, group) => sum + group.count, 0);
    const tenGodsContextGroups = contextGroups.map(group => ({
      ...group,
      share: tenGodsContextTotal > 0 ? group.count / tenGodsContextTotal : 0,
    }));

    const result = this.result();
    result.meta = {
      asOfConvention: ASOF_CONVENTION,
      dayBoundary: 'eight-char sect=2',
      yunCalculation: 'getYun sect=2',
    };

    result.add({
      id: 'natal',
      name: '四柱',
      category: 'natal',
      value: { ...pillars, convention: TAIPEI_CONVENTION },
      meta: { convention: TAIPEI_CONVENTION },
    });
    result.add({
      id: 'day_master',
      name: '日主',
      category: 'dayMaster',
      value: {
        stem: dayStem,
        element: STEM_ELEMENTS[dayStem],
        yinYang: YANG_STEMS.has(dayStem) ? '陽' : '陰',
      },
    });
    result.add({
      id: 'elements',
      name: '五行出現次數',
      category: 'elements',
      value: {
        counts: elementCounts,
        total: allStems.length,
        includesHiddenStems: true,
        includesDayMaster: true,
        metric: 'occurrence-count',
        limitation: '此為五行出現次數，不代表旺衰、月令、藏干權重或真太陽時校正。',
      },
    });
    result.add({
      id: 'ten_gods',
      name: '十神統計',
      category: 'tenGods',
      value: {
        counts: tenGodCounts,
        total: allStems.length,
        includesDayMaster: true,
      },
    });
    result.add({
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
    });

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
