/**
 * @fileoverview Radar builder (Block G v2).
 *
 * Pure functions: take `SystemResult[]` (engine outputs) and produce `Radar[]`
 * matching ARCHITECTURE §4.2 verbatim. No engine imports, no divination
 * libraries, no wall-clock reads — this module only aggregates components.
 *
 * Launch radars (one per system, D-009; no cross-axis normalization, D-010):
 *
 *   bazi_element_balance       radar  5 axes  %   from bazi `elements`
 *   ziwei_palace_strength      radar 12 axes  分  from ziwei `palaces`
 *   numerology_digit_frequency bar    9 axes  次  from numerology `digitFrequency`
 *
 * Every axis carries a `ruleId` resolvable via {@link ScoringRules#getRule},
 * the actual `inputs` substituted into the formula (auditable), and the
 * asset/liability notes from {@link module:analysis/AxisNotes}.
 *
 * @module analysis/RadarBuilder
 */

import { getAxisNotes } from './AxisNotes.js';

/**
 * @typedef {import('../core/models/SystemResult.js').SystemResult} SystemResult
 * @typedef {import('../core/models/SystemResult.js').Component} Component
 */

/**
 * @typedef {Object} RadarAxis
 * @property {string} key           - Stable axis key
 * @property {string} label         - Display label
 * @property {number} value         - 0–100（或次數，依 unit）
 * @property {'%'|'次'|'分'} unit   - Score unit
 * @property {string} ruleId        - Must resolve via ScoringRules.getRule()
 * @property {Object} inputs        - Actual substituted variable values
 * @property {string[]} assets      - 資產面
 * @property {string[]} liabilities - 負債面
 */

/**
 * @typedef {Object} Radar
 * @property {string} id     - Radar id (e.g. 'bazi_element_balance')
 * @property {string} system - Source engine id
 * @property {string} title  - Display title
 * @property {'radar'|'bar'} kind - 頻次類用 bar
 * @property {RadarAxis[]} axes
 */

// ─── Axis Definitions ───────────────────────────────────────────────────────

/**
 * Five-element axes in canonical order, each bound to its ScoringRules id and
 * the input variable name the rule's formula uses.
 * @type {ReadonlyArray<{ key: string, label: string, ruleId: string, countInput: string }>}
 */
const ELEMENT_AXES = Object.freeze([
  { key: 'wood', label: '木', ruleId: 'bazi_wood_strength', countInput: 'woodCount' },
  { key: 'fire', label: '火', ruleId: 'bazi_fire_strength', countInput: 'fireCount' },
  { key: 'earth', label: '土', ruleId: 'bazi_earth_strength', countInput: 'earthCount' },
  { key: 'metal', label: '金', ruleId: 'bazi_metal_strength', countInput: 'metalCount' },
  { key: 'water', label: '水', ruleId: 'bazi_water_strength', countInput: 'waterCount' },
]);

/** Digits covered by the numerology frequency bar chart. */
const DIGITS = Object.freeze(['1', '2', '3', '4', '5', '6', '7', '8', '9']);

/** Round to two decimals (avoids noisy float tails while staying auditable). */
const round2 = (n) => Math.round(n * 100) / 100;

// ─── Per-System Builders ────────────────────────────────────────────────────

/**
 * Build the 八字五行 occurrence-share radar from the bazi `elements` component.
 *
 * Each axis is an independent share of the same total (D-010: no cross-axis
 * normalization — equal counts yield equal heights). Shares of one total sum
 * to ≈100%. This reflects occurrence counts only, not 旺衰 strength (B1).
 *
 * @param {SystemResult} baziResult
 * @returns {Radar|null} null when the `elements` component is missing/unusable
 */
export function buildElementBalanceRadar(baziResult) {
  const component = findComponent(baziResult, 'elements');
  const counts = component?.value?.counts;
  const total = component?.value?.total;
  if (!counts || !(total > 0)) return null;

  return {
    id: 'bazi_element_balance',
    system: 'bazi',
    title: '八字五行出現占比',
    kind: 'radar',
    axes: ELEMENT_AXES.map(({ key, label, ruleId, countInput }) => {
      const count = counts[label] ?? 0;
      return {
        key,
        label,
        value: round2((count / total) * 100),
        unit: '%',
        ruleId,
        inputs: { [countInput]: count, totalElements: total },
        ...getAxisNotes('bazi_element_balance', label),
      };
    }),
  };
}

/**
 * Build the 紫微十二宮 strength radar from the ziwei `palaces` components.
 *
 * Per-axis formula（同 ScoringRules `ziwei_palace_strength`）:
 *
 *   score = mainStarBrightness × 0.6
 *         + min(auxiliaryStarCount × 10, 100) × 0.2
 *         + fourTransformBonus × 0.2
 *
 *   - mainStarBrightness：宮內主星最高亮度分數 ×100（0–100），無主星計 0。
 *   - auxiliaryStarCount：宮內輔星（minorStars）數量。
 *   - fourTransformBonus：宮內任一星帶生年四化（祿權科忌）→ 100，否則 0。
 *
 * @param {SystemResult} ziweiResult
 * @returns {Radar|null} null when no `palaces` components are present
 */
export function buildPalaceStrengthRadar(ziweiResult) {
  const palaces = findComponents(ziweiResult, 'palaces');
  if (palaces.length === 0) return null;

  return {
    id: 'ziwei_palace_strength',
    system: 'ziwei',
    title: '紫微十二宮位力量',
    kind: 'radar',
    axes: palaces.map((palace) => {
      const { index, name, majorStars = [], minorStars = [], adjectiveStars = [] } = palace.value ?? {};

      const brightnessScores = majorStars
        .map((star) => star.brightnessScore)
        .filter((score) => typeof score === 'number');
      const mainStarBrightness = brightnessScores.length > 0
        ? round2(Math.max(...brightnessScores) * 100)
        : 0;

      const auxiliaryStarCount = minorStars.length;

      const hasBirthMutagen = [...majorStars, ...minorStars, ...adjectiveStars]
        .some((star) => star.mutagen != null && star.mutagen !== '');
      const fourTransformBonus = hasBirthMutagen ? 100 : 0;

      const value = round2(
        mainStarBrightness * 0.6
        + Math.min(auxiliaryStarCount * 10, 100) * 0.2
        + fourTransformBonus * 0.2,
      );

      return {
        key: `palace_${index}`,
        label: name,
        value,
        unit: '分',
        ruleId: 'ziwei_palace_strength',
        inputs: { mainStarBrightness, auxiliaryStarCount, fourTransformBonus },
        ...getAxisNotes('ziwei_palace_strength', name),
      };
    }),
  };
}

/**
 * Build the 生命靈數 digit-frequency bar chart from the numerology
 * `digitFrequency` component. Values are raw occurrence counts（單位「次」，
 * D-011）— no percentage conversion and no cross-axis normalization (D-010).
 *
 * @param {SystemResult} numerologyResult
 * @returns {Radar|null} null when the `digitFrequency` component is missing
 */
export function buildDigitFrequencyRadar(numerologyResult) {
  const component = findComponent(numerologyResult, 'digitFrequency');
  const counts = component?.value;
  if (!counts) return null;

  return {
    id: 'numerology_digit_frequency',
    system: 'numerology',
    title: '生命靈數數字頻次',
    kind: 'bar',
    axes: DIGITS.map((digit) => {
      const occurrences = counts[digit] ?? 0;
      return {
        key: `digit_${digit}`,
        label: digit,
        value: occurrences,
        unit: '次',
        ruleId: 'numerology_digit_frequency',
        inputs: { digitOccurrences: occurrences },
        ...getAxisNotes('numerology_digit_frequency', digit),
      };
    }),
  };
}

// ─── Entry Point ────────────────────────────────────────────────────────────

/**
 * Build every available launch radar from a set of engine results.
 *
 * Systems whose results are missing (or lack the required component) are
 * skipped silently — the radar list only contains what the data supports.
 *
 * @param {SystemResult[]} systemResults - Engine outputs from analyze()
 * @returns {Radar[]}
 */
export function buildRadars(systemResults) {
  const results = Array.isArray(systemResults) ? systemResults : [];
  const byEngine = new Map(results.map((result) => [result?.engineId, result]));

  /** @type {Radar[]} */
  const radars = [];

  const bazi = byEngine.get('bazi');
  if (bazi) {
    const radar = buildElementBalanceRadar(bazi);
    if (radar) radars.push(radar);
  }

  const ziwei = byEngine.get('ziwei');
  if (ziwei) {
    const radar = buildPalaceStrengthRadar(ziwei);
    if (radar) radars.push(radar);
  }

  const numerology = byEngine.get('numerology');
  if (numerology) {
    const radar = buildDigitFrequencyRadar(numerology);
    if (radar) radars.push(radar);
  }

  return radars;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * All components of a category, tolerant of plain-object SystemResults
 * (e.g. deserialized reports in tests).
 *
 * @param {SystemResult|{ components?: Component[] }} result
 * @param {string} category
 * @returns {Component[]}
 */
function findComponents(result, category) {
  const components = result?.components;
  if (!Array.isArray(components)) return [];
  return components.filter((c) => c.category === category);
}

/**
 * First component of a category, or null.
 *
 * @param {SystemResult|{ components?: Component[] }} result
 * @param {string} category
 * @returns {Component|null}
 */
function findComponent(result, category) {
  return findComponents(result, category)[0] ?? null;
}
