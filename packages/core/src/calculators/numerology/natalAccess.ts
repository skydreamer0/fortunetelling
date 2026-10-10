/** Internal friend access to private engine natal routines; not a public API. */
import type { NumerologyEngine } from '../../engines/NumerologyEngine';
import type { BirthData } from '../../core/models/BirthData';
import type { SystemResult } from '../../core/models/SystemResult';

type NatalProjection = (birth: BirthData) => SystemResult;
// Instance capability registration only. No profile/spec/hash/result cache.
const access = new WeakMap<NumerologyEngine, NatalProjection>();

export function registerNumerologyNatal(engine: NumerologyEngine, project: NatalProjection): void {
  if (access.has(engine)) throw new Error('Numerology natal capability already registered');
  access.set(engine, project);
}

export function numerologyNatal(engine: NumerologyEngine, birth: BirthData): SystemResult {
  const project = access.get(engine);
  if (!project) throw new Error('Numerology natal capability is unavailable');
  return project(birth);
}
