/**
 * @fileoverview Engine barrel + default registry factory.
 *
 * One place that knows about every concrete engine, so the rest of the app can
 * build a ready-to-run {@link EngineRegistry} without importing each engine.
 *
 * @module engines
 */

import { EngineRegistry } from '../core/EngineRegistry';
import type { BaseEngine } from '../core/BaseEngine';
import { ZiweiEngine } from './ZiweiEngine';
import { NumerologyEngine } from './NumerologyEngine';
import { MingGuaEngine } from './MingGuaEngine';
import { DreamspellEngine } from './DreamspellEngine';
import { BaZiEngine } from './BaZiEngine';

export { ZiweiEngine } from './ZiweiEngine';
export { NumerologyEngine } from './NumerologyEngine';
export { MingGuaEngine } from './MingGuaEngine';
export { DreamspellEngine } from './DreamspellEngine';
export { BaZiEngine } from './BaZiEngine';

/**
 * Instantiate the default set of engines.
 *
 * @param options.asOf - (default null) Evaluation date passed to the
 *   time-aware engines (Ziwei/Numerology) for their L1/L2 layers.
 */
export function createEngines({ asOf = null }: { asOf?: Date | string | null } = {}): BaseEngine[] {
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
 * @param options.asOf - (default null)
 */
export function createDefaultRegistry({ asOf = null }: { asOf?: Date | string | null } = {}): EngineRegistry {
  return new EngineRegistry().registerAll(createEngines({ asOf }));
}
