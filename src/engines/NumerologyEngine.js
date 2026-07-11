/**
 * @fileoverview 生命靈數 (Pythagorean Numerology) calculation engine.
 *
 * Derives numerology numbers from a person's birth date and (Latin) name, then
 * emits them as the project's standard {@link SystemResult} components, with
 * `category` keys that {@link LayerClassifier} maps to L0–L2 layers:
 *
 *   lifePath        → L0  生命靈數（由出生年月日推得，一生核心）
 *   expression      → L0  表達數（姓名全字母）
 *   soulUrge        → L0  靈魂數（姓名母音）
 *   personality     → L0  人格數（姓名子音）
 *   digitFrequency  → L0  生命靈數九宮格頻次（出生日期數字分布）
 *   personalYear    → L2  個人流年數（隨年變）
 *   personalMonth   → L2  個人流月數（隨月變）
 *
 * All numbers use the Pythagorean reduction, preserving the master numbers
 * 11/22/33. Scoring/interpretation lives in the analysis layer; this engine only
 * attaches the raw, transparent numbers those rules need.
 *
 * @module engines/NumerologyEngine
 */

import { BaseEngine } from '../core/BaseEngine.js';

/**
 * Vowels used to split a name into 靈魂數 (vowels) vs 人格數 (consonants).
 * Note: Y is treated as a CONSONANT here (not a vowel), per the classic
 * Pythagorean convention adopted by this engine.
 * @type {ReadonlySet<string>}
 */
const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);

/**
 * Pythagorean letter value for an uppercase A–Z letter.
 * A=1 … I=9, J=1 … R=9, S=1 … Z=8 (i.e. ((charCode - 65) % 9) + 1).
 *
 * @param {string} letter - A single uppercase A–Z character.
 * @returns {number} Value 1–9.
 */
export function letterValue(letter) {
  return ((letter.charCodeAt(0) - 65) % 9) + 1;
}

/**
 * Reduce a number to a single digit by repeatedly summing its decimal digits,
 * preserving the master numbers 11/22/33 (which are never reduced further).
 *
 * @param {number} n
 * @returns {number} A single digit 1–9, or a master number 11/22/33.
 */
export function reduceNumber(n) {
  while (n > 9 && n !== 11 && n !== 22 && n !== 33) {
    let sum = 0;
    let rest = n;
    while (rest > 0) {
      sum += rest % 10;
      rest = Math.floor(rest / 10);
    }
    n = sum;
  }
  return n;
}

/**
 * @typedef {import('../core/models/BirthData.js').BirthData} BirthData
 * @typedef {import('../core/models/SystemResult.js').SystemResult} SystemResult
 */

/**
 * 生命靈數 engine.
 *
 * @extends BaseEngine
 */
export class NumerologyEngine extends BaseEngine {
  id = 'numerology';
  name = '生命靈數';

  /**
   * @param {Object} [options]
   * @param {Date|string|null} [options.asOf=null] - Evaluation date for the
   *   time-varying layers (個人流年/流月). Defaults to "now" at compute time.
   */
  constructor({ asOf = null } = {}) {
    super();
    this.asOf = asOf;
  }

  /**
   * @param {BirthData} birth
   * @returns {SystemResult}
   */
  _compute(birth) {
    const result = this.result();

    this.#addLifePath(result, birth);
    this.#addNameNumbers(result, birth);
    this.#addDigitFrequency(result, birth);
    this.#addPersonalPeriods(result, birth);

    result.meta = {
      name: birth.name,
    };

    return result;
  }

  // ─── L0: Life path (生命靈數) ────────────────────────────────────────────

  /**
   * Compute the life-path number from the birth date: reduce each of year,
   * month and day, sum them, then reduce again (preserving master numbers).
   *
   * @param {SystemResult} result
   * @param {BirthData} birth
   */
  #addLifePath(result, birth) {
    const number = reduceNumber(
      reduceNumber(birth.year) + reduceNumber(birth.month) + reduceNumber(birth.day),
    );
    result.add({
      id: 'life_path',
      name: '生命靈數',
      category: 'lifePath',
      value: { number, isMaster: this.#isMaster(number) },
    });
  }

  // ─── L0: Name-derived numbers (表達數/靈魂數/人格數) ──────────────────────

  /**
   * Emit the expression (all letters), soul-urge (vowels) and personality
   * (consonants) numbers derived from the name. If the name has no A–Z letters,
   * record a warning and skip all three.
   *
   * @param {SystemResult} result
   * @param {BirthData} birth
   */
  #addNameNumbers(result, birth) {
    const letters = this.#latinLetters(birth.name);
    if (letters.length === 0) {
      result.warn('姓名無拉丁字母，略過表達數/靈魂數/人格數計算');
      return;
    }

    let allSum = 0;
    let vowelSum = 0;
    let consonantSum = 0;
    for (const letter of letters) {
      const value = letterValue(letter);
      allSum += value;
      if (VOWELS.has(letter)) vowelSum += value;
      else consonantSum += value;
    }

    const expression = reduceNumber(allSum);
    const soulUrge = reduceNumber(vowelSum);
    const personality = reduceNumber(consonantSum);

    result.add({
      id: 'expression',
      name: '表達數',
      category: 'expression',
      value: { number: expression, isMaster: this.#isMaster(expression) },
    });
    result.add({
      id: 'soul_urge',
      name: '靈魂數',
      category: 'soulUrge',
      value: { number: soulUrge, isMaster: this.#isMaster(soulUrge) },
    });
    result.add({
      id: 'personality',
      name: '人格數',
      category: 'personality',
      value: { number: personality, isMaster: this.#isMaster(personality) },
    });
  }

  // ─── L0: Digit frequency (九宮格頻次) ────────────────────────────────────

  /**
   * Count occurrences of each digit 1–9 across the concatenated digits of the
   * birth year, month and day. The digit 0 is ignored; all of 1–9 are included
   * in the output (with zero counts).
   *
   * @param {SystemResult} result
   * @param {BirthData} birth
   */
  #addDigitFrequency(result, birth) {
    /** @type {Record<string, number>} */
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };
    const digits = `${birth.year}${birth.month}${birth.day}`;
    for (const ch of digits) {
      if (ch >= '1' && ch <= '9') counts[ch] += 1;
    }
    result.add({
      id: 'digit_frequency',
      name: '生命靈數九宮格頻次',
      category: 'digitFrequency',
      value: counts,
    });
  }

  // ─── L2: Personal year / month (個人流年/流月數) ─────────────────────────

  /**
   * Add the personal-year (L2) and personal-month (L2) numbers relative to the
   * evaluation date (`asOf`, default now).
   *
   * @param {SystemResult} result
   * @param {BirthData} birth
   */
  #addPersonalPeriods(result, birth) {
    const target = this.asOf ? new Date(this.asOf) : new Date();
    const currentYear = target.getFullYear();
    const currentMonth = target.getMonth() + 1;

    const personalYear = reduceNumber(
      reduceNumber(birth.month) + reduceNumber(birth.day) + reduceNumber(currentYear),
    );
    result.add({
      id: 'personal_year',
      name: '個人流年數',
      category: 'personalYear',
      value: { number: personalYear, year: currentYear },
    });

    const personalMonth = reduceNumber(personalYear + currentMonth);
    result.add({
      id: 'personal_month',
      name: '個人流月數',
      category: 'personalMonth',
      value: { number: personalMonth, year: currentYear, month: currentMonth },
    });
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  /**
   * Extract the uppercase A–Z letters from a string, ignoring every other
   * character (spaces, punctuation, digits, non-Latin scripts, etc.).
   *
   * @param {string} name
   * @returns {string[]} Array of single uppercase A–Z characters.
   */
  #latinLetters(name) {
    if (typeof name !== 'string') return [];
    const matches = name.toUpperCase().match(/[A-Z]/g);
    return matches ?? [];
  }

  /**
   * Whether a (already reduced) number is a master number 11/22/33.
   *
   * @param {number} number
   * @returns {boolean}
   */
  #isMaster(number) {
    return number === 11 || number === 22 || number === 33;
  }
}
