/**
 * @fileoverview Abstract base class for all fortune-telling calculation engines.
 *
 * Provides the shared, reusable lifecycle every engine gets for free:
 *   1. input validation (via BirthData.validate)
 *   2. timing
 *   3. delegation to the subclass's `_compute`
 *   4. uniform error handling → always returns a {@link SystemResult}
 *
 * A concrete engine only has to:
 *   - declare `id` and `name`
 *   - implement `_compute(birthData)` returning either a SystemResult or a plain
 *     array of components (which the base wraps into a SystemResult).
 *
 * This keeps individual engines thin and guarantees every engine speaks the same
 * downstream contract.
 *
 * @module core/BaseEngine
 */

import { SystemResult } from './models/SystemResult.js';
import { BirthData } from './models/BirthData.js';

/**
 * @typedef {import('./models/SystemResult.js').Component} Component
 */

/**
 * Abstract calculation engine. Do not instantiate directly — subclass it.
 *
 * @abstract
 */
export class BaseEngine {
  /**
   * Stable, machine-readable engine id. Must match the `sourceSystem` keys used
   * in LayerClassifier / ScoringRules (e.g. "ziwei", "numerology").
   * @type {string}
   */
  id = 'base';

  /**
   * Human-readable display name (Chinese), e.g. "紫微斗數".
   * @type {string}
   */
  name = 'Base Engine';

  constructor() {
    if (new.target === BaseEngine) {
      throw new Error('BaseEngine is abstract and cannot be instantiated directly.');
    }
  }

  /**
   * Public entry point. Validates input, times the run, delegates to `_compute`,
   * and always returns a well-formed {@link SystemResult} — a failed engine
   * produces an empty result carrying the error rather than throwing, so one
   * broken engine never aborts the whole report.
   *
   * @param {BirthData} birthData
   * @returns {SystemResult}
   */
  run(birthData) {
    const start = (typeof performance !== 'undefined' ? performance : Date).now();

    if (!(birthData instanceof BirthData)) {
      return this.#failure(birthData, 'run() expects a BirthData instance.', start);
    }

    try {
      birthData.validate();
    } catch (err) {
      return this.#failure(birthData, `輸入資料無效：${err.message}`, start);
    }

    try {
      const raw = this._compute(birthData);
      const result = this.#normalize(raw);
      result.durationMs = this.#elapsed(start);
      return result;
    } catch (err) {
      return this.#failure(birthData, `計算失敗：${err.message}`, start);
    }
  }

  /**
   * Subclass hook — the actual calculation. Must be overridden.
   *
   * May return either a {@link SystemResult} or a plain `Component[]`, which the
   * base class will wrap. Throwing here is safe: `run()` converts it into an
   * error-carrying result.
   *
   * @abstract
   * @param {BirthData} birthData
   * @returns {SystemResult | Component[]}
   */
  // eslint-disable-next-line no-unused-vars
  _compute(birthData) {
    throw new Error(`${this.constructor.name} must implement _compute(birthData).`);
  }

  /**
   * Convenience factory for a SystemResult pre-tagged with this engine's
   * id/name. Subclasses use it inside `_compute` to build results fluently.
   *
   * @param {import('./models/SystemResult.js').Component[]} [components]
   * @returns {SystemResult}
   */
  result(components = []) {
    return new SystemResult({ engineId: this.id, engineName: this.name, components });
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  /**
   * Coerce a subclass return value into a SystemResult.
   * @param {SystemResult | Component[]} raw
   * @returns {SystemResult}
   */
  #normalize(raw) {
    if (raw instanceof SystemResult) return raw;
    if (Array.isArray(raw)) return this.result(raw);
    throw new Error('_compute must return a SystemResult or an array of components.');
  }

  /**
   * Build an empty result that records why the engine failed.
   * @param {*} birthData
   * @param {string} message
   * @param {number} start
   * @returns {SystemResult}
   */
  #failure(birthData, message, start) {
    const result = new SystemResult({
      engineId: this.id,
      engineName: this.name,
      errors: [message],
    });
    result.durationMs = this.#elapsed(start);
    return result;
  }

  /**
   * @param {number} start
   * @returns {number} Rounded elapsed milliseconds.
   */
  #elapsed(start) {
    const now = (typeof performance !== 'undefined' ? performance : Date).now();
    return Math.round((now - start) * 100) / 100;
  }
}
