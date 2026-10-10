/**
 * Internal run-local Ziwei natal capability, not a persisted ChartSnapshot.
 * The complete copied context/options must match; no hash or global cache is
 * used. Successful natal calculations alone are retained. Periods stay with
 * their consumers and retain the cooperative generator's existing yields.
 */
import type { DeepReadonly } from '../../core/calculationSpec';
import { canonicalStringify } from '../../portable/canonical';
import type { TimeContext } from '../../time/types';
import { createAstrolabe, natalChart, timeIndexFrom, type ZiweiAstrolabe } from './astrolabe';
import type { ZiweiNatalChart, ZiweiTimeIndexResult, ZiweiTimeOptions, ZiweiTimeResolution } from './types';

export interface ZiweiNatalBasis {
  readonly time: DeepReadonly<ZiweiTimeIndexResult> | null;
  readonly gender: 'male' | 'female';
  /** Private live library capability: iztro lazily attaches palace/star links. */
  astrolabeFor(time: ZiweiTimeResolution): ZiweiAstrolabe;
  natalFor(time: ZiweiTimeResolution): DeepReadonly<ZiweiNatalChart>;
}
export type ZiweiNatalBasisProvider = (ctx: TimeContext, options: ZiweiTimeOptions) => ZiweiNatalBasis;

const effectiveOptions = (options: ZiweiTimeOptions) => ({
  useTrueSolarTime: options.useTrueSolarTime ?? true,
  ziHourConvention: options.ziHourConvention ?? 'splitMidnight',
});

function freezeDeep<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

const resolutionKey = ({ date, timeIndex, basis, wallTime, ziHourConvention }: ZiweiTimeResolution) =>
  canonicalStringify({ date, timeIndex, basis, wallTime, ziHourConvention });

export function createZiweiNatalBasisProvider(ctx: TimeContext, options: ZiweiTimeOptions): ZiweiNatalBasisProvider {
  const source = structuredClone(ctx), selected = effectiveOptions(options);
  freezeDeep(source); freezeDeep(selected);
  const identity = canonicalStringify({ ctx: source, options: selected });
  let time: ZiweiNatalBasis['time'] | undefined;
  const astrolabes = new Map<string, ZiweiAstrolabe>();
  const views = new Map<string, DeepReadonly<ZiweiNatalChart>>();
  const getTime = () => {
    if (time === undefined) time = freezeDeep(timeIndexFrom(source, selected));
    return time;
  };
  const checkedKey = (candidate: ZiweiTimeResolution) => {
    const resolved = getTime(), key = resolutionKey(candidate);
    if (!resolved || ![resolved, ...resolved.alternatives].some(item => resolutionKey(item) === key)) {
      throw new Error('Ziwei natal basis resolution mismatch');
    }
    return key;
  };
  // Freeze only the shell and plain DTOs. Freezing a FunctionalAstrolabe would
  // break iztro's lazy links; it never crosses a public result boundary.
  const basis: ZiweiNatalBasis = Object.freeze({
    get time() { return getTime(); },
    gender: source.profile.gender,
    astrolabeFor(candidate: ZiweiTimeResolution) {
      const key = checkedKey(candidate);
      let astrolabe = astrolabes.get(key);
      if (!astrolabe) {
        astrolabe = createAstrolabe(candidate.date, candidate.timeIndex, source.profile.gender);
        astrolabes.set(key, astrolabe);
      }
      return astrolabe;
    },
    natalFor(candidate: ZiweiTimeResolution) {
      const key = checkedKey(candidate);
      let view = views.get(key);
      if (!view) {
        view = freezeDeep(structuredClone(natalChart(basis.astrolabeFor(candidate))));
        views.set(key, view);
      }
      return view;
    },
  });
  return (candidate, requested) => {
    if (canonicalStringify({ ctx: candidate, options: effectiveOptions(requested) }) !== identity) {
      throw new Error('Ziwei natal basis input mismatch');
    }
    return basis;
  };
}
