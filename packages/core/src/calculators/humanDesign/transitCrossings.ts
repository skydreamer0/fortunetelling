/**
 * Station-aware numerical gate tracing (#63).
 *
 * Seed dates retain the configured sampling interval. Longitude speed brackets
 * stations, which are solved before tracing the two sides of a retrograde turn.
 * Each reported crossing carries its numerical time bracket. This does not
 * certify the physical accuracy of the ephemeris or a product timing tolerance.
 *
 * Station discovery is finite: probes at no more than 1.5-day separation are a
 * discovery guard, NOT proof that an arbitrary trajectory has no hidden roots.
 * The validated bodies/date matrix must be reported separately; callers must
 * not turn a successful numerical solve into a universal convergence claim.
 */
import { GATE_ARC_DEG, GATE_ORDER, MANDALA_START_DEG } from './mandala';

export interface LongitudeMotion {
  longitude: number;
  /** Degrees per day, negative when retrograde. */
  speed: number;
}

export interface TimeRoot {
  jd: number;
  lo: number;
  hi: number;
  /** Width of the final time bracket, not astronomical or product accuracy. */
  bracketSeconds: number;
}

export interface GateCrossing extends TimeRoot {
  from: number;
  to: number;
  longitude: number;
}

export interface GateTransitPath {
  gates: number[];
  crossings: GateCrossing[];
  stations: TimeRoot[];
  evaluations: number;
}

// These numerical algorithm choices require version/identity updates when changed.
export const HD_TRANSIT_NUMERICS = Object.freeze({
  maxStationScanDays: 3,
  rootBracketSeconds: 1,
  maxRootIterations: 64,
  maxStationRefinements: 8,
  maxEvaluations: 65_536,
  maxSubdivisionDepth: 32,
});

export class TransitResolutionError extends Error {
  constructor(message: string) {
    super(`Human Design transit resolution: ${message}`);
    this.name = 'TransitResolutionError';
  }
}

const norm = (value: number) => ((value % 360) + 360) % 360;
const arc = (a: number, b: number) => norm(b - a + 180) - 180;
const gate = (index: number) => GATE_ORDER[((index % 64) + 64) % 64]!;
const result = (lo: number, hi: number): TimeRoot => ({
  jd: lo + (hi - lo) / 2, lo, hi, bracketSeconds: (hi - lo) * 86_400,
});

/** A bounded bisection of one already-bracketed, continuous scalar root. */
export function bisectTransitRoot(
  residual: (jd: number) => number,
  start: number,
  end: number,
  bracketSeconds: number = HD_TRANSIT_NUMERICS.rootBracketSeconds,
  maxIterations: number = HD_TRANSIT_NUMERICS.maxRootIterations,
): TimeRoot {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end ||
      !Number.isFinite(bracketSeconds) || bracketSeconds <= 0 ||
      !Number.isInteger(maxIterations) || maxIterations < 0) {
    throw new RangeError('invalid transit root bounds or budget');
  }
  const at = (jd: number) => {
    const value = residual(jd);
    if (!Number.isFinite(value)) throw new TransitResolutionError('non-finite root residual');
    return value;
  };
  let lo = start, hi = end, left = at(lo);
  const right = at(hi);
  if (left === 0) return result(lo, lo);
  if (right === 0) return result(hi, hi);
  if (Math.sign(left) === Math.sign(right)) throw new TransitResolutionError('root is not bracketed');
  for (let iteration = 0; (hi - lo) * 86_400 > bracketSeconds; iteration++) {
    if (iteration >= maxIterations) throw new TransitResolutionError('root iteration budget exhausted');
    const mid = lo + (hi - lo) / 2;
    if (mid === lo || mid === hi) throw new TransitResolutionError('root cannot advance at floating-point precision');
    const value = at(mid);
    if (value === 0) return result(mid, mid);
    if (Math.sign(value) === Math.sign(left)) { lo = mid; left = value; }
    else hi = mid;
  }
  return result(lo, hi);
}

/**
 * Trace gate visits and optionally solve crossing times using real motion, not
 * linear interpolation. `resolveCrossings: false` saves crossing-time solves
 * for rules that emit only whole-window signals; station solves still run.
 */
export function traceGateTransits(
  seedJds: readonly number[],
  positionAt: (jd: number) => LongitudeMotion,
  options: { resolveCrossings?: boolean; maxEvaluations?: number } = {},
): GateTransitPath {
  const budget = options.maxEvaluations ?? HD_TRANSIT_NUMERICS.maxEvaluations;
  if (!Number.isInteger(budget) || budget < 1) throw new RangeError('invalid transit evaluation budget');
  for (let i = 0; i < seedJds.length; i++) {
    if (!Number.isFinite(seedJds[i]) || (i > 0 && seedJds[i]! <= seedJds[i - 1]!)) {
      throw new RangeError('transit seed dates must be finite and strictly increasing');
    }
  }
  const cache = new Map<number, LongitudeMotion>();
  const at = (jd: number) => {
    let value = cache.get(jd);
    if (!value) {
      if (cache.size >= budget) throw new TransitResolutionError('ephemeris evaluation budget exhausted');
      value = positionAt(jd);
      if (!Number.isFinite(value.longitude) || !Number.isFinite(value.speed)) {
        throw new TransitResolutionError('non-finite longitude or speed');
      }
      value = { longitude: norm(value.longitude), speed: value.speed };
      cache.set(jd, value);
    }
    return value;
  };
  const knots = new Set<number>();
  const subdivide = (a: number, b: number, depth: number) => {
    if (depth >= HD_TRANSIT_NUMERICS.maxSubdivisionDepth) {
      throw new TransitResolutionError('station subdivision budget exhausted');
    }
    const mid = a + (b - a) / 2;
    if (mid === a || mid === b) throw new TransitResolutionError('station probes cannot advance');
    const pa = at(a), pm = at(mid), pb = at(b);
    // An angular guard avoids selecting a shortest arc for a possible half turn.
    // It is a discovery guard based on sampled speeds, not a global speed bound.
    const wide = (b - a) * Math.max(Math.abs(pa.speed), Math.abs(pm.speed), Math.abs(pb.speed)) >= 90;
    if (b - a > HD_TRANSIT_NUMERICS.maxStationScanDays || wide) {
      subdivide(a, mid, depth + 1);
      subdivide(mid, b, depth + 1);
    } else {
      knots.add(a); knots.add(mid); knots.add(b);
    }
  };
  if (seedJds.length === 1) knots.add(seedJds[0]!);
  for (let i = 1; i < seedJds.length; i++) subdivide(seedJds[i - 1]!, seedJds[i]!, 0);

  const probes = [...knots].sort((a, b) => a - b);
  const stations: TimeRoot[] = [];
  const inspectStationPair = (a: number, b: number, depth: number) => {
    if (depth >= HD_TRANSIT_NUMERICS.maxSubdivisionDepth) {
      throw new TransitResolutionError('station subdivision budget exhausted');
    }
    const pa = at(a), pb = at(b);
    if (pa.speed * pb.speed < 0) {
      let station = bisectTransitRoot(jd => at(jd).speed, a, b);
      // A small time bracket alone cannot certify the visited gate at a
      // station: a sub-second excursion can lie entirely inside that bracket.
      // Refine near a boundary; fail explicitly if floating-point/tangency
      // ambiguity remains. Do not silently report the midpoint's gate alone.
      // Sampled speed * bracket width is a local discovery guard, not a proven
      // derivative bound for arbitrary callbacks; finite validation still applies.
      for (let refinement = 0; station.bracketSeconds > 0; refinement++) {
        const motion = at(station.jd);
        const remainder = norm(motion.longitude - MANDALA_START_DEG) % GATE_ARC_DEG;
        const distance = Math.min(remainder, GATE_ARC_DEG - remainder);
        const extent = (station.hi - station.lo) * Math.max(
          Math.abs(at(station.lo).speed), Math.abs(motion.speed), Math.abs(at(station.hi).speed),
        );
        // Covers roundoff in normalized longitude / boundary subtraction;
        // this is not an allowed physical angular error or product tolerance.
        const roundoff = 8 * Number.EPSILON * 360;
        if (distance > extent + roundoff) break;
        if (refinement >= HD_TRANSIT_NUMERICS.maxStationRefinements) {
          throw new TransitResolutionError('station gate occupancy unresolved near a boundary');
        }
        station = bisectTransitRoot(jd => at(jd).speed, station.lo, station.hi, station.bracketSeconds / 4);
      }
      stations.push(station);
      // Keep both sides of the final bracket as well as its midpoint. This
      // retains observed gate visits near a station without extrapolation.
      knots.add(station.lo); knots.add(station.jd); knots.add(station.hi);
    } else {
      const delta = arc(pa.longitude, pb.longitude);
      if (pa.speed === 0 && pb.speed === 0) {
        // Zero-speed endpoints do not imply a stationary interval. Probe the
        // interior before deciding; it may separate consecutive stations.
        const mid = a + (b - a) / 2;
        if (mid === a || mid === b) throw new TransitResolutionError('station probes cannot advance');
        const pm = at(mid);
        if (delta !== 0 || pm.speed !== 0 || arc(pa.longitude, pm.longitude) !== 0) {
          knots.add(mid);
          inspectStationPair(a, mid, depth + 1);
          inspectStationPair(mid, b, depth + 1);
        }
        return;
      }
      // Same-sign endpoint speeds can still enclose TWO stations. Besides a
      // contradictory secant, use a cubic Hermite derivative extremum as a
      // subdivision trigger. The cubic is never used as a root or longitude.
      const span = b - a;
      const quadratic = 3 * delta / span - 2 * pa.speed - pb.speed;
      const cubic = -2 * delta / span + pa.speed + pb.speed;
      const vertex = cubic === 0 ? -1 : -quadratic / (3 * cubic);
      const vertexSpeed = pa.speed + 2 * quadratic * vertex + 3 * cubic * vertex * vertex;
      const direction = Math.sign(pa.speed || pb.speed);
      const reverses = vertex > 0 && vertex < 1 && vertexSpeed * direction < 0;
      if (delta * direction < 0 || reverses) {
        const mid = a + span / 2;
        if (mid === a || mid === b) throw new TransitResolutionError('station probes cannot advance');
        knots.add(mid);
        inspectStationPair(a, mid, depth + 1);
        inspectStationPair(mid, b, depth + 1);
      }
    }
  };
  for (let i = 1; i < probes.length; i++) inspectStationPair(probes[i - 1]!, probes[i]!, 0);
  // Include exact sampled stations once (a bracket endpoint can already be zero).
  const stationKnots = [...knots].sort((a, b) => a - b);
  for (let i = 1; i + 1 < stationKnots.length; i++) {
    const jd = stationKnots[i]!;
    if (at(jd).speed === 0 && at(stationKnots[i - 1]!).speed * at(stationKnots[i + 1]!).speed < 0 &&
        !stations.some(station => station.jd === jd)) {
      stations.push(result(jd, jd));
    }
  }
  stations.sort((a, b) => a.jd - b.jd);

  const points = [...knots].sort((a, b) => a - b);
  const seen = new Set<number>();
  const crossings: GateCrossing[] = [];
  if (points.length) seen.add(gate(Math.floor(norm(at(points[0]!).longitude - MANDALA_START_DEG) / GATE_ARC_DEG)));
  for (let i = 1; i < points.length; i++) {
    const lo = points[i - 1]!, hi = points[i]!;
    const start = at(lo).longitude;
    const a = norm(start - MANDALA_START_DEG);
    const delta = arc(start, at(hi).longitude);
    const first = Math.floor(a / GATE_ARC_DEG);
    const last = Math.floor((a + delta) / GATE_ARC_DEG);
    const direction = last >= first ? 1 : -1;
    for (let k = first; k !== last + direction; k += direction) seen.add(gate(k));
    if (options.resolveCrossings === false) continue;
    for (let k = first; k !== last; k += direction) {
      const boundary = (direction > 0 ? k + 1 : k) * GATE_ARC_DEG;
      const root = bisectTransitRoot(jd => arc(start, at(jd).longitude) - (boundary - a), lo, hi);
      crossings.push({ ...root, from: gate(k), to: gate(k + direction), longitude: norm(boundary + MANDALA_START_DEG) });
    }
  }
  return { gates: [...seen].sort((a, b) => a - b), crossings, stations, evaluations: cache.size };
}
