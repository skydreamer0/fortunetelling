/**
 * @fileoverview 紫微斗數 (Zi Wei Dou Shu) calculation engine.
 *
 * Thin wrapper over the `iztro` library. Its only job is *extraction*: turn an
 * iztro astrolabe into the project's standard {@link SystemResult} components,
 * with `category` keys that {@link LayerClassifier} maps to L0–L3 layers:
 *
 *   natal           → L0  整體命盤摘要（命主/身主/五行局/生肖）
 *   palaces         → L0  十二宮結構
 *   mainStars       → L0  主星落宮 + 廟旺利得平不陷亮度（計分用）
 *   fourTransforms  → L0  生年四化（祿權科忌）
 *   daXian          → L1  當前大限（十年一變）
 *   xiaoXian        → L2  小限（每年一變）
 *   flyingStars     → L2  流年四化 / 流耀（每年一變）
 *   soulVsBody      → L3  命宮 vs 身宮對照（先天格局 vs 後天/情境反應）
 *   sanFangSiZheng  → L3  命宮與身宮的三方四正（情境中被會照的組合）
 *
 * Scoring itself (weighting brightness, 三方四正加權) lives in the analysis
 * layer; this engine only attaches the raw, transparent inputs those rules need.
 *
 * @module engines/ZiweiEngine
 */

import { astro } from 'iztro';
import { BaseEngine } from '../core/BaseEngine.js';

/**
 * 廟旺利得平不陷 → numeric weight (7 best … 1 worst). Exposed so the scoring
 * layer and the engine agree on one transparent brightness scale.
 * @type {Record<string, number>}
 */
export const BRIGHTNESS_WEIGHTS = Object.freeze({
  廟: 7,
  旺: 6,
  得: 5,
  利: 4,
  平: 3,
  不: 2,
  陷: 1,
});

/** Highest brightness weight, for normalizing to 0–1. */
const MAX_BRIGHTNESS = 7;

/**
 * Convert an iztro brightness string into a normalized 0–1 score.
 * Returns `null` when the star carries no brightness (e.g. many minor stars).
 *
 * @param {string|undefined} brightness
 * @returns {number|null}
 */
export function brightnessScore(brightness) {
  if (!brightness || !(brightness in BRIGHTNESS_WEIGHTS)) return null;
  return Math.round((BRIGHTNESS_WEIGHTS[brightness] / MAX_BRIGHTNESS) * 100) / 100;
}

/**
 * @typedef {import('../core/models/BirthData.js').BirthData} BirthData
 * @typedef {import('../core/models/SystemResult.js').SystemResult} SystemResult
 */

/**
 * 紫微斗數 engine.
 *
 * @extends BaseEngine
 */
export class ZiweiEngine extends BaseEngine {
  id = 'ziwei';
  name = '紫微斗數';

  /**
   * @param {Object} [options]
   * @param {string} [options.language='zh-TW'] - iztro output language. Must be a
   *   Chinese locale for the brightness strings (廟旺利得平不陷) to line up with
   *   {@link BRIGHTNESS_WEIGHTS}.
   * @param {Date|string|null} [options.asOf=null] - Evaluation date for the
   *   time-varying layers (大限/小限/流年). Defaults to "now" at compute time.
   */
  constructor({ language = 'zh-TW', asOf = null } = {}) {
    super();
    this.language = language;
    this.asOf = asOf;
  }

  /**
   * @param {BirthData} birth
   * @returns {SystemResult}
   */
  _compute(birth) {
    const astrolabe = astro.bySolar(
      birth.solarDateStr,
      birth.timeIndex,
      birth.genderZh,
      true, // fixLeap: correct leap month around lunar 15th
      this.language,
    );

    const result = this.result();

    this.#addNatal(result, astrolabe);
    this.#addPalacesAndStars(result, astrolabe);
    this.#addFourTransforms(result, astrolabe);
    this.#addContextFacets(result, astrolabe);
    this.#addHoroscope(result, astrolabe);

    result.meta = {
      solarDate: astrolabe.solarDate,
      lunarDate: astrolabe.lunarDate,
      chineseDate: astrolabe.chineseDate,
      time: astrolabe.time,
      fiveElementsClass: astrolabe.fiveElementsClass,
      copyright: astrolabe.copyright,
    };

    return result;
  }

  // ─── L0: Natal summary ──────────────────────────────────────────────────

  /**
   * @param {SystemResult} result
   * @param {import('iztro/lib/astro/FunctionalAstrolabe').IFunctionalAstrolabe} astrolabe
   */
  #addNatal(result, astrolabe) {
    result.add({
      id: 'natal_summary',
      name: '命盤總覽',
      category: 'natal',
      value: {
        soul: astrolabe.soul,                       // 命主
        body: astrolabe.body,                       // 身主
        fiveElementsClass: astrolabe.fiveElementsClass, // 五行局
        zodiac: astrolabe.zodiac,                   // 生肖
        sign: astrolabe.sign,                       // 星座
        soulPalaceBranch: astrolabe.earthlyBranchOfSoulPalace,
        bodyPalaceBranch: astrolabe.earthlyBranchOfBodyPalace,
        lunarDate: astrolabe.lunarDate,
        chineseDate: astrolabe.chineseDate,
      },
    });
  }

  // ─── L0: Palaces + main stars ───────────────────────────────────────────

  /**
   * Emit one `palaces` component per palace, plus one `mainStars` component per
   * major star (carrying brightness + its normalized score for the radar).
   *
   * @param {SystemResult} result
   * @param {import('iztro/lib/astro/FunctionalAstrolabe').IFunctionalAstrolabe} astrolabe
   */
  #addPalacesAndStars(result, astrolabe) {
    for (const palace of astrolabe.palaces) {
      result.add({
        id: `palace_${palace.index}`,
        name: palace.name,
        category: 'palaces',
        value: {
          index: palace.index,
          name: palace.name,
          heavenlyStem: palace.heavenlyStem,
          earthlyBranch: palace.earthlyBranch,
          isBodyPalace: palace.isBodyPalace,
          isOriginalPalace: palace.isOriginalPalace,
          decadalRange: palace.decadal?.range ?? null,
          majorStars: palace.majorStars.map(this.#serializeStar),
          minorStars: palace.minorStars.map(this.#serializeStar),
          adjectiveStars: palace.adjectiveStars.map(this.#serializeStar),
        },
      });

      for (const star of palace.majorStars) {
        result.add({
          id: `mainStar_${star.name}`,
          name: star.name,
          category: 'mainStars',
          value: {
            star: star.name,
            palace: palace.name,
            palaceIndex: palace.index,
            brightness: star.brightness ?? '',
            brightnessScore: brightnessScore(star.brightness),
            mutagen: star.mutagen ?? null,
          },
        });
      }
    }
  }

  // ─── L0: Birth-year four transformations (生年四化) ──────────────────────

  /**
   * Scan every star for a `mutagen` (祿/權/科/忌) — those are the birth-year
   * four transformations, a permanent (L0) feature of the chart.
   *
   * @param {SystemResult} result
   * @param {import('iztro/lib/astro/FunctionalAstrolabe').IFunctionalAstrolabe} astrolabe
   */
  #addFourTransforms(result, astrolabe) {
    for (const palace of astrolabe.palaces) {
      const stars = [...palace.majorStars, ...palace.minorStars, ...palace.adjectiveStars];
      for (const star of stars) {
        if (!star.mutagen) continue;
        result.add({
          id: `mutagen_${star.mutagen}`,
          name: `${star.name} 化${star.mutagen}`,
          category: 'fourTransforms',
          value: {
            star: star.name,
            mutagen: star.mutagen,
            palace: palace.name,
            palaceIndex: palace.index,
          },
        });
      }
    }
  }

  // ─── L3: Context-switch facets (命宮vs身宮 / 三方四正) ────────────────────

  /**
   * Emit the context-dependent (L3) facets of the chart:
   *
   *   - `soulVsBody`：命宮（先天格局）與身宮（後天發展、情境反應）的對照。
   *   - `sanFangSiZheng`：命宮與身宮各自的三方四正（本宮/對宮/財帛位/官祿位），
   *     即互動情境中被會照的宮位組合。
   *
   * These feed the StateSwitchTable. They are hypotheses to be verified by the
   * person（待驗證假說）— the layer's language rule enforces the weaker claim.
   * Wrapped defensively so a lookup failure degrades to a warning.
   *
   * @param {SystemResult} result
   * @param {import('iztro/lib/astro/FunctionalAstrolabe').IFunctionalAstrolabe} astrolabe
   */
  #addContextFacets(result, astrolabe) {
    try {
      const soulPalace = astrolabe.palaces.find(p => p.name === '命宮') ?? null;
      const bodyPalace = astrolabe.palaces.find(p => p.isBodyPalace) ?? null;

      if (soulPalace && bodyPalace) {
        result.add({
          id: 'context_soul_vs_body',
          name: '命宮 vs 身宮',
          category: 'soulVsBody',
          value: {
            samePalace: soulPalace.index === bodyPalace.index, // 命身同宮
            soul: this.#serializePalaceFacet(soulPalace),
            body: this.#serializePalaceFacet(bodyPalace),
          },
        });
      } else {
        result.warn('命宮或身宮定位失敗，略過 soulVsBody（L3）部件。');
      }

      for (const [facetId, palace] of [['soul', soulPalace], ['body', bodyPalace]]) {
        if (!palace) continue;
        // 命身同宮時兩組三方四正相同，只輸出一組
        if (facetId === 'body' && soulPalace && palace.index === soulPalace.index) continue;

        const surrounded = astrolabe.surroundedPalaces(palace.index);
        result.add({
          id: `context_sanfang_${facetId}`,
          name: `${palace.name}三方四正`,
          category: 'sanFangSiZheng',
          value: {
            anchor: palace.name,
            target: this.#serializePalaceFacet(surrounded.target),
            opposite: this.#serializePalaceFacet(surrounded.opposite),
            wealth: this.#serializePalaceFacet(surrounded.wealth),
            career: this.#serializePalaceFacet(surrounded.career),
          },
        });
      }
    } catch (err) {
      result.warn(`L3 情境部件計算失敗：${err.message}`);
    }
  }

  // ─── L1/L2: Time-varying periods ────────────────────────────────────────

  /**
   * Add the current 大限 (L1), 小限 (L2) and 流年四化 (L2) via iztro's horoscope.
   * Wrapped defensively: if the horoscope lookup fails, the natal (L0) data is
   * still returned and a warning is recorded rather than aborting the engine.
   *
   * @param {SystemResult} result
   * @param {import('iztro/lib/astro/FunctionalAstrolabe').IFunctionalAstrolabe} astrolabe
   */
  #addHoroscope(result, astrolabe) {
    const target = this.asOf ? new Date(this.asOf) : new Date();
    let horoscope;
    try {
      horoscope = astrolabe.horoscope(target);
    } catch (err) {
      result.warn(`運限計算失敗（${target.toISOString().slice(0, 10)}）：${err.message}`);
      return;
    }

    const decadal = horoscope.decadal;
    if (decadal) {
      const decadalPalace = astrolabe.palaces[decadal.index];
      result.add({
        id: 'daXian_current',
        name: `當前大限（${decadalPalace?.name ?? ''}）`,
        category: 'daXian',
        value: {
          name: decadal.name,
          range: decadalPalace?.decadal?.range ?? null,
          heavenlyStem: decadal.heavenlyStem,
          earthlyBranch: decadal.earthlyBranch,
          palaceIndex: decadal.index,
          mutagen: decadal.mutagen,
          asOf: target.toISOString().slice(0, 10),
        },
      });
    }

    const age = horoscope.age;
    if (age) {
      result.add({
        id: 'xiaoXian_current',
        name: `小限（虛歲 ${age.nominalAge ?? '?'}）`,
        category: 'xiaoXian',
        value: {
          nominalAge: age.nominalAge ?? null,
          heavenlyStem: age.heavenlyStem,
          earthlyBranch: age.earthlyBranch,
          palaceIndex: age.index,
          asOf: target.toISOString().slice(0, 10),
        },
      });
    }

    const yearly = horoscope.yearly;
    if (yearly) {
      result.add({
        id: 'flyingStars_yearly',
        name: '流年四化',
        category: 'flyingStars',
        value: {
          heavenlyStem: yearly.heavenlyStem,
          earthlyBranch: yearly.earthlyBranch,
          mutagen: yearly.mutagen,
          palaceIndex: yearly.index,
          asOf: target.toISOString().slice(0, 10),
        },
      });
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  /**
   * Serialize a palace into the compact shape the L3 facets need
   * (identity + major stars only).
   *
   * @param {import('iztro/lib/astro/FunctionalPalace').IFunctionalPalace} palace
   * @returns {{ name: string, index: number, earthlyBranch: string, majorStars: Object[] }}
   */
  #serializePalaceFacet(palace) {
    return {
      name: palace.name,
      index: palace.index,
      earthlyBranch: palace.earthlyBranch,
      majorStars: palace.majorStars.map(this.#serializeStar),
    };
  }

  /**
   * Serialize an iztro star into a plain, transparent object.
   *
   * @param {import('iztro/lib/data/types/star').Star} star
   * @returns {{ name: string, type: string, brightness: string, brightnessScore: number|null, mutagen: string|null }}
   */
  #serializeStar(star) {
    return {
      name: star.name,
      type: star.type,
      brightness: star.brightness ?? '',
      brightnessScore: brightnessScore(star.brightness),
      mutagen: star.mutagen ?? null,
    };
  }
}
