/**
 * @fileoverview Central registry and orchestrator for calculation engines.
 *
 * Engines register themselves once; the registry then runs any subset (or all)
 * of them against a single {@link BirthData} and returns an array of
 * {@link SystemResult} — the exact shape {@link LayerClassifier#classify} and
 * the radar builders consume. This is the one place that knows about "all the
 * systems", so the rest of the app stays decoupled from individual engines.
 *
 * @module core/EngineRegistry
 */

import { BaseEngine } from './BaseEngine.js';

/**
 * @typedef {import('./models/SystemResult.js').SystemResult} SystemResult
 * @typedef {import('./models/BirthData.js').BirthData} BirthData
 */

/**
 * Registry of engines keyed by their stable `id`.
 */
export class EngineRegistry {
  /** @type {Map<string, BaseEngine>} */
  #engines = new Map();

  /**
   * Register an engine instance. Later registrations with the same id replace
   * earlier ones. Chainable.
   *
   * @param {BaseEngine} engine
   * @returns {this}
   */
  register(engine) {
    if (!(engine instanceof BaseEngine)) {
      throw new Error('Only BaseEngine instances can be registered.');
    }
    if (!engine.id || engine.id === 'base') {
      throw new Error(`Engine "${engine.name}" must declare a unique, non-default id.`);
    }
    this.#engines.set(engine.id, engine);
    return this;
  }

  /**
   * Register several engines at once. Chainable.
   *
   * @param {BaseEngine[]} engines
   * @returns {this}
   */
  registerAll(engines) {
    for (const e of engines) this.register(e);
    return this;
  }

  /**
   * Remove an engine by id.
   *
   * @param {string} id
   * @returns {boolean} True if an engine was removed.
   */
  unregister(id) {
    return this.#engines.delete(id);
  }

  /**
   * Look up a single registered engine.
   *
   * @param {string} id
   * @returns {BaseEngine | undefined}
   */
  get(id) {
    return this.#engines.get(id);
  }

  /**
   * @returns {boolean} Whether an engine with this id is registered.
   */
  has(id) {
    return this.#engines.has(id);
  }

  /**
   * @returns {string[]} All registered engine ids, in registration order.
   */
  get ids() {
    return [...this.#engines.keys()];
  }

  /**
   * @returns {number} Number of registered engines.
   */
  get size() {
    return this.#engines.size;
  }

  /**
   * Run every registered engine against the birth data.
   *
   * @param {BirthData} birthData
   * @returns {SystemResult[]} One result per engine, in registration order.
   */
  runAll(birthData) {
    return this.ids.map(id => this.#engines.get(id).run(birthData));
  }

  /**
   * Run only the named engines (ignores unknown ids silently, but reports them
   * via the returned array being shorter — use {@link has} to pre-check).
   *
   * @param {string[]} ids
   * @param {BirthData} birthData
   * @returns {SystemResult[]}
   */
  runSome(ids, birthData) {
    return ids
      .filter(id => this.#engines.has(id))
      .map(id => this.#engines.get(id).run(birthData));
  }

  /**
   * Run a single engine by id.
   *
   * @param {string} id
   * @param {BirthData} birthData
   * @returns {SystemResult}
   * @throws {Error} If the id is not registered.
   */
  runOne(id, birthData) {
    const engine = this.#engines.get(id);
    if (!engine) throw new Error(`No engine registered with id "${id}".`);
    return engine.run(birthData);
  }
}

/**
 * Shared singleton registry for app-wide use. Engines can self-register into
 * this at import time; callers that need isolation can construct their own
 * {@link EngineRegistry} instead.
 *
 * @type {EngineRegistry}
 */
export const registry = new EngineRegistry();
