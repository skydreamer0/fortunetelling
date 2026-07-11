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

const TAIPEI_CONVENTION = Object.freeze({
  calendar: 'gregorian',
  timezone: 'Asia/Taipei',
  dayBoundary: 'lunar-javascript sect=2',
  trueSolarTime: false,
  library: 'lunar-javascript@1.7.7',
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

    const result = this.result();
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

    return result;
  }
}
