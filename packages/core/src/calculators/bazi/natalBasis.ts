/**
 * Internal, run-local sharing of the accurate bazi natal calculations.
 * This is not a persisted ChartSnapshot or a cross-run cache. Period/asOf
 * projections and legacy component calculations remain with their consumers.
 *
 * Both getters are lazy so consumers retain their original failure order:
 * pillars -> legacy engine -> luck in the main engine, and legacy engine ->
 * pillars -> luck in the typed calculator. Only successful values are retained.
 */
import type { TimeContext } from '../../time/types';
import type { DeepReadonly } from '../../core/calculationSpec';
import { canonicalStringify } from '../../portable/canonical';
import { computePillars, luckCycles, type BaziPillarConfig, type BaziPillarsResult, type LuckCycles } from './pillars';

export type BaziNatalBasis = DeepReadonly<{
  pillars: BaziPillarsResult;
  luckCycles: LuckCycles;
}>;

/** Internal capability: every consumer must present the matching complete context/options. */
export type BaziNatalBasisProvider = (ctx: TimeContext, options: BaziPillarConfig) => BaziNatalBasis;

function effectiveOptions(options: BaziPillarConfig) {
  return {
    useTrueSolarTime: options.useTrueSolarTime ?? true,
    ziHourConvention: options.ziHourConvention ?? 'late',
  };
}

function freezeDeep<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

/** No calculation or clock access here; the private copied source cannot drift after creation. */
export function createBaziNatalBasisProvider(ctx: TimeContext, options: BaziPillarConfig): BaziNatalBasisProvider {
  const source = structuredClone(ctx);
  const selected = effectiveOptions(options);
  freezeDeep(source);
  freezeDeep(selected);
  const identity = canonicalStringify({ ctx: source, options: selected });
  let natalPillars: BaziNatalBasis['pillars'] | undefined;
  let natalLuck: BaziNatalBasis['luckCycles'] | undefined;

  // Do not recursively freeze/enumerate this shell: that would invoke the
  // getters eagerly and move errors outside the existing engine boundary.
  const basis: BaziNatalBasis = Object.freeze({
    get pillars() {
      if (natalPillars === undefined) {
        natalPillars = freezeDeep(structuredClone(computePillars(source, selected)));
      }
      return natalPillars;
    },
    get luckCycles() {
      if (natalLuck === undefined) {
        natalLuck = freezeDeep(structuredClone(luckCycles(source, source.profile.gender, selected)));
      }
      return natalLuck;
    },
  });

  return (candidate, requested) => {
    if (canonicalStringify({ ctx: candidate, options: effectiveOptions(requested) }) !== identity) {
      throw new Error('Bazi natal basis input mismatch');
    }
    return basis;
  };
}
