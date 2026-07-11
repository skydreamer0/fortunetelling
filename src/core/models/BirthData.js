/**
 * @fileoverview Unified birth data input model for all fortune-telling engines.
 * Handles Gregorian-to-Lunar conversion, solar term detection, and validation.
 * @module core/models/BirthData
 */

import { Solar, Lunar } from 'lunar-javascript';

/**
 * @typedef {Object} BirthDataParams
 * @property {number} year  - Gregorian year (e.g. 1990)
 * @property {number} month - Gregorian month (1-12)
 * @property {number} day   - Gregorian day (1-31)
 * @property {number} [hour=12]       - Hour in 24h format (0-23)
 * @property {number} [minute=0]      - Minute (0-59)
 * @property {number} [longitude=121.5]  - Longitude for True Solar Time
 * @property {number} [latitude=25.05]   - Latitude for True Solar Time
 * @property {'male'|'female'} [gender='male'] - Gender
 * @property {string} [name=''] - Full name (for numerology engines)
 */

/**
 * @typedef {Object} LunarDateInfo
 * @property {number} year    - Lunar year
 * @property {number} month   - Lunar month (negative for leap month)
 * @property {number} day     - Lunar day
 * @property {boolean} isLeap - Whether the lunar month is a leap month
 * @property {string} yearInChinese  - Chinese representation of the year
 * @property {string} monthInChinese - Chinese representation of the month
 * @property {string} dayInChinese   - Chinese representation of the day
 */

/**
 * @typedef {Object} SolarTermInfo
 * @property {string} currentTerm     - Current solar term name (empty if not on a term day)
 * @property {string} prevJie         - Previous Jie (節) name
 * @property {string} prevJieDate     - Previous Jie solar date (YYYY-MM-DD)
 * @property {string} nextJie         - Next Jie (節) name
 * @property {string} nextJieDate     - Next Jie solar date (YYYY-MM-DD)
 * @property {string} prevQi          - Previous Qi (氣) name
 * @property {string} prevQiDate      - Previous Qi solar date (YYYY-MM-DD)
 */

/**
 * Unified birth data input model used by all calculation engines.
 * Provides Gregorian date storage, Lunar date conversion, solar term info,
 * and iztro-compatible time index calculation.
 */
export class BirthData {
  /** @type {number} Gregorian year */
  year;
  /** @type {number} Gregorian month (1-12) */
  month;
  /** @type {number} Gregorian day (1-31) */
  day;
  /** @type {number} Hour in 24h format (0-23) */
  hour;
  /** @type {number} Minute (0-59) */
  minute;
  /** @type {number} Longitude for True Solar Time */
  longitude;
  /** @type {number} Latitude for True Solar Time */
  latitude;
  /** @type {'male'|'female'} Gender */
  gender;
  /** @type {string} Full name (optional, for numerology) */
  name;

  /** @private @type {LunarDateInfo|null} Cached lunar date */
  _lunarCache = null;
  /** @private @type {SolarTermInfo|null} Cached solar term info */
  _solarTermCache = null;

  /**
   * @param {BirthDataParams} params
   */
  constructor({
    year,
    month,
    day,
    hour = 12,
    minute = 0,
    longitude = 121.5,
    latitude = 25.05,
    gender = 'male',
    name = '',
  }) {
    this.year = year;
    this.month = month;
    this.day = day;
    this.hour = hour;
    this.minute = minute;
    this.longitude = longitude;
    this.latitude = latitude;
    this.gender = gender;
    this.name = name;
  }

  /**
   * Convert birth date to lunar calendar date using lunar-javascript.
   * Result is cached after first computation.
   * @returns {LunarDateInfo}
   */
  get lunarDate() {
    if (this._lunarCache) return this._lunarCache;

    const solar = Solar.fromYmd(this.year, this.month, this.day);
    const lunar = solar.getLunar();

    this._lunarCache = {
      year: lunar.getYear(),
      month: lunar.getMonth(),
      day: lunar.getDay(),
      isLeap: lunar.getMonth() < 0,
      yearInChinese: lunar.getYearInChinese(),
      monthInChinese: lunar.getMonthInChinese(),
      dayInChinese: lunar.getDayInChinese(),
    };

    return this._lunarCache;
  }

  /**
   * Get solar term information for the birth date.
   * Result is cached after first computation.
   * @returns {SolarTermInfo}
   */
  get solarTermInfo() {
    if (this._solarTermCache) return this._solarTermCache;

    const solar = Solar.fromYmd(this.year, this.month, this.day);
    const lunar = solar.getLunar();

    const currentJieQi = lunar.getCurrentJieQi();
    const prevJie = lunar.getPrevJie();
    const nextJie = lunar.getNextJie();
    const prevQi = lunar.getPrevQi();

    this._solarTermCache = {
      currentTerm: currentJieQi ? currentJieQi.getName() : '',
      prevJie: prevJie ? prevJie.getName() : '',
      prevJieDate: prevJie ? prevJie.getSolar().toYmd() : '',
      nextJie: nextJie ? nextJie.getName() : '',
      nextJieDate: nextJie ? nextJie.getSolar().toYmd() : '',
      prevQi: prevQi ? prevQi.getName() : '',
      prevQiDate: prevQi ? prevQi.getSolar().toYmd() : '',
    };

    return this._solarTermCache;
  }

  /**
   * Calculate the iztro time index (時辰序號) from the birth hour.
   *
   * Mapping: 0 = 早子時 (23:00-01:00 early), 1 = 丑時 (01:00-03:00), ...
   * 12 = 晚子時 (23:00-01:00 late)
   *
   * @returns {number} Time index (0-12)
   */
  get timeIndex() {
    const h = this.hour;
    if (h >= 23 || h < 1) return 0;
    if (h >= 1 && h < 3) return 1;
    if (h >= 3 && h < 5) return 2;
    if (h >= 5 && h < 7) return 3;
    if (h >= 7 && h < 9) return 4;
    if (h >= 9 && h < 11) return 5;
    if (h >= 11 && h < 13) return 6;
    if (h >= 13 && h < 15) return 7;
    if (h >= 15 && h < 17) return 8;
    if (h >= 17 && h < 19) return 9;
    if (h >= 19 && h < 21) return 10;
    if (h >= 21 && h < 23) return 11;
    return 0;
  }

  /**
   * Format the solar date as an iztro-compatible string: 'YYYY-M-D'.
   * @returns {string}
   */
  get solarDateStr() {
    return `${this.year}-${this.month}-${this.day}`;
  }

  /**
   * Get the iztro-compatible gender string.
   * @returns {'男'|'女'}
   */
  get genderZh() {
    return this.gender === 'male' ? '男' : '女';
  }

  /**
   * Validate all required fields. Throws on invalid input.
   * @returns {true} Returns true if valid.
   * @throws {Error} If any field is invalid.
   */
  validate() {
    if (!Number.isInteger(this.year) || this.year < 1900 || this.year > 2100) {
      throw new Error(`Invalid year: ${this.year}. Must be integer between 1900 and 2100.`);
    }
    if (!Number.isInteger(this.month) || this.month < 1 || this.month > 12) {
      throw new Error(`Invalid month: ${this.month}. Must be integer between 1 and 12.`);
    }
    if (!Number.isInteger(this.day) || this.day < 1 || this.day > 31) {
      throw new Error(`Invalid day: ${this.day}. Must be integer between 1 and 31.`);
    }

    // Validate the actual date by constructing it
    const testDate = new Date(this.year, this.month - 1, this.day);
    if (
      testDate.getFullYear() !== this.year ||
      testDate.getMonth() !== this.month - 1 ||
      testDate.getDate() !== this.day
    ) {
      throw new Error(`Invalid date: ${this.year}-${this.month}-${this.day} does not exist.`);
    }

    if (!Number.isInteger(this.hour) || this.hour < 0 || this.hour > 23) {
      throw new Error(`Invalid hour: ${this.hour}. Must be integer between 0 and 23.`);
    }
    if (!Number.isInteger(this.minute) || this.minute < 0 || this.minute > 59) {
      throw new Error(`Invalid minute: ${this.minute}. Must be integer between 0 and 59.`);
    }
    if (typeof this.longitude !== 'number' || this.longitude < -180 || this.longitude > 180) {
      throw new Error(`Invalid longitude: ${this.longitude}. Must be between -180 and 180.`);
    }
    if (typeof this.latitude !== 'number' || this.latitude < -90 || this.latitude > 90) {
      throw new Error(`Invalid latitude: ${this.latitude}. Must be between -90 and 90.`);
    }
    if (this.gender !== 'male' && this.gender !== 'female') {
      throw new Error(`Invalid gender: ${this.gender}. Must be 'male' or 'female'.`);
    }
    if (typeof this.name !== 'string') {
      throw new Error(`Invalid name: name must be a string.`);
    }

    return true;
  }

  /**
   * Create a plain-object snapshot of this BirthData for serialization.
   * @returns {BirthDataParams}
   */
  toJSON() {
    return {
      year: this.year,
      month: this.month,
      day: this.day,
      hour: this.hour,
      minute: this.minute,
      longitude: this.longitude,
      latitude: this.latitude,
      gender: this.gender,
      name: this.name,
    };
  }
}
