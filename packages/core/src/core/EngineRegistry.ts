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

import { BaseEngine } from './BaseEngine';
import type { SystemResult } from './models/SystemResult';
import type { BirthData } from './models/BirthData';

/**
 * Registry of engines keyed by their stable `id`.
 */
export class EngineRegistry {
  #engines: Map<string, BaseEngine> = new Map();

  /**
   * Register an engine instance. Later registrations with the same id replace
   * earlier ones. Chainable.
   */
  register(engine: BaseEngine): this {
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
   */
  registerAll(engines: BaseEngine[]): this {
    for (const e of engines) this.register(e);
    return this;
  }

  /**
   * Remove an engine by id.
   *
   * @returns True if an engine was removed.
   */
  unregister(id: string): boolean {
    return this.#engines.delete(id);
  }

  /**
   * Look up a single registered engine.
   */
  get(id: string): BaseEngine | undefined {
    return this.#engines.get(id);
  }

  /**
   * @returns Whether an engine with this id is registered.
   */
  has(id: string): boolean {
    return this.#engines.has(id);
  }

  /**
   * @returns All registered engine ids, in registration order.
   */
  get ids(): string[] {
    return [...this.#engines.keys()];
  }

  /**
   * @returns Number of registered engines.
   */
  get size(): number {
    return this.#engines.size;
  }

  /**
   * Run every registered engine against the birth data.
   *
   * @returns One result per engine, in registration order.
   */
  runAll(birthData: BirthData): SystemResult[] {
    return this.ids.map(id => this.#engines.get(id)!.run(birthData));
  }

  /**
   * Run only the named engines (ignores unknown ids silently, but reports them
   * via the returned array being shorter — use {@link has} to pre-check).
   */
  runSome(ids: string[], birthData: BirthData): SystemResult[] {
    return ids
      .filter(id => this.#engines.has(id))
      .map(id => this.#engines.get(id)!.run(birthData));
  }

  /**
   * Run a single engine by id.
   *
   * @throws {Error} If the id is not registered.
   */
  runOne(id: string, birthData: BirthData): SystemResult {
    const engine = this.#engines.get(id);
    if (!engine) throw new Error(`No engine registered with id "${id}".`);
    return engine.run(birthData);
  }
}

/**
 * Shared singleton registry for app-wide use. Engines can self-register into
 * this at import time; callers that need isolation can construct their own
 * {@link EngineRegistry} instead.
 */
export const registry: EngineRegistry = new EngineRegistry();
