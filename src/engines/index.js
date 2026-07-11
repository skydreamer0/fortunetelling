/**
 * @fileoverview Engine barrel + default registry factory.
 *
 * One place that knows about every concrete engine, so the rest of the app can
 * build a ready-to-run {@link EngineRegistry} without importing each engine.
 *
 * @module engines
 */

import { EngineRegistry } from '../core/EngineRegistry.js';
import { ZiweiEngine } from './ZiweiEngine.js';
import { NumerologyEngine } from './NumerologyEngine.js';
import { MingGuaEngine } from './MingGuaEngine.js';
import { DreamspellEngine } from './DreamspellEngine.js';
import { BaZiEngine } from './BaZiEngine.js';

export { ZiweiEngine } from './ZiweiEngine.js';
export { NumerologyEngine } from './NumerologyEngine.js';
export { MingGuaEngine } from './MingGuaEngine.js';
export { DreamspellEngine } from './DreamspellEngine.js';
export { BaZiEngine } from './BaZiEngine.js';

/**
 * Instantiate the default set of engines.
 *
 * @param {Object} [options]
 * @param {Date|string|null} [options.asOf=null] - Evaluation date passed to the
 *   time-aware engines (Ziwei/Numerology) for their L1/L2 layers.
 * @returns {import('../core/BaseEngine.js').BaseEngine[]}
 */
export function createEngines({ asOf = null } = {}) {
  let baziAsOf = asOf;
  if (asOf instanceof Date && !Number.isNaN(asOf.getTime())) {
    baziAsOf = asOf.toISOString().slice(0, 10);
  }

  return [
    new BaZiEngine({ asOf: baziAsOf }),
    new ZiweiEngine({ asOf }),
    new NumerologyEngine({ asOf }),
    new MingGuaEngine(),
    new DreamspellEngine(),
  ];
}

/**
 * Build an {@link EngineRegistry} pre-loaded with every default engine.
 *
 * @param {Object} [options]
 * @param {Date|string|null} [options.asOf=null]
 * @returns {EngineRegistry}
 */
export function createDefaultRegistry({ asOf = null } = {}) {
  return new EngineRegistry().registerAll(createEngines({ asOf }));
}
