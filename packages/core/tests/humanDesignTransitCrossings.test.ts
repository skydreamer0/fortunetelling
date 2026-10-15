import { describe, expect, test } from 'vitest';
import { gatesAlong } from '../src/calculators/humanDesign/rules';
import { bisectTransitRoot, traceGateTransits, TransitResolutionError } from '../src/calculators/humanDesign/transitCrossings';
const DAY_SECONDS = 86_400;

describe('bounded root solver', () => {
  test('returns a genuine sign bracket and its numerical width', () => {
    const root = bisectTransitRoot(t => t * t - 2, 1, 2);
    expect(root.lo * root.lo - 2).toBeLessThanOrEqual(0);
    expect(root.hi * root.hi - 2).toBeGreaterThanOrEqual(0);
    expect(root.bracketSeconds).toBeLessThanOrEqual(1);
    expect(Math.abs(root.jd - Math.sqrt(2)) * DAY_SECONDS).toBeLessThanOrEqual(root.bracketSeconds / 2);
  });

  test('retains exact endpoint roots and fails instead of accepting an unbracketed or unresolved root', () => {
    expect(bisectTransitRoot(t => t - 1, 1, 2)).toEqual({ jd: 1, lo: 1, hi: 1, bracketSeconds: 0 });
    expect(bisectTransitRoot(t => t - 2, 1, 2)).toEqual({ jd: 2, lo: 2, hi: 2, bracketSeconds: 0 });
    expect(() => bisectTransitRoot(t => t * t + 1, -1, 1)).toThrow(TransitResolutionError);
    expect(() => bisectTransitRoot(() => NaN, 1, 2)).toThrow(TransitResolutionError);
    expect(() => bisectTransitRoot(t => t * t - 2, 1, 2, 1, 0)).toThrow('iteration budget');
    expect(() => bisectTransitRoot(t => t, 2, 1)).toThrow(RangeError);
    expect(() => bisectTransitRoot(t => t, -1, 1, 0)).toThrow(RangeError);
  });
});

describe('station-aware tracing, synthetic trajectory contracts', () => {
  test('direct, retrograde, wrap and multiple gate crossings have real time brackets', () => {
    for (const [start, speed, sequence] of [
      [301, 2, ['60>41']], [303, -2, ['41>60']], [359, 2, []], [302.5, 11.5, ['41>19', '19>13']],
    ] as const) {
      const path = traceGateTransits([0, 1], t => ({ longitude: start + t * speed, speed }));
      expect(path.crossings.map(c => `${c.from}>${c.to}`)).toEqual([...sequence]);
      for (const crossing of path.crossings) {
        const exact = (crossing.longitude - start) / speed;
        expect(crossing.lo).toBeLessThanOrEqual(exact);
        expect(crossing.hi).toBeGreaterThanOrEqual(exact);
        expect(crossing.bracketSeconds).toBeLessThanOrEqual(1);
      }
    }
    const wrapped = traceGateTransits([0, 1], t => ({ longitude: 359 + 5 * t, speed: 5 }));
    expect(wrapped.crossings.map(c => `${c.from}>${c.to}`)).toEqual(['25>17']);
  });

  test('same-gate endpoints cannot hide the retrograde gate visit', () => {
    const at = (t: number) => ({ longitude: 301 + 2 * (t - 1) ** 2, speed: 4 * (t - 1) });
    expect(gatesAlong([at(0).longitude, at(2).longitude])).toEqual([41]);
    const coarse = traceGateTransits([0, 2], at);
    const fine = traceGateTransits([0, 0.5, 1, 1.5, 2], at);
    expect(coarse.gates).toEqual([41, 60]);
    expect(fine.gates).toEqual(coarse.gates);
    expect(coarse.stations).toEqual([{ jd: 1, lo: 1, hi: 1, bracketSeconds: 0 }]);
    expect(coarse.crossings.map(c => `${c.from}>${c.to}`)).toEqual(['41>60', '60>41']);
    for (const [index, crossing] of coarse.crossings.entries()) {
      const exact = 1 + (index === 0 ? -1 : 1) / Math.sqrt(2);
      expect(crossing.lo).toBeLessThanOrEqual(exact);
      expect(crossing.hi).toBeGreaterThanOrEqual(exact);
      expect(crossing.bracketSeconds).toBeLessThanOrEqual(1);
    }
    const noTimes = traceGateTransits([0, 2], at, { resolveCrossings: false });
    expect(noTimes.gates).toEqual(coarse.gates);
    expect(noTimes.stations).toEqual(coarse.stations);
    expect(noTimes.crossings).toEqual([]);
  });

  test('midpoint speed detects two stations despite matching endpoint directions', () => {
    const at = (t: number) => {
      const x = t - 1;
      return { longitude: 302 + (x ** 3 - x) / 2, speed: (3 * x * x - 1) / 2 };
    };
    const path = traceGateTransits([0, 2], at);
    expect(at(0).speed).toBeGreaterThan(0);
    expect(at(2).speed).toBeGreaterThan(0);
    expect(path.stations).toHaveLength(2);
    for (const [index, station] of path.stations.entries()) {
      const exact = 1 + (index === 0 ? -1 : 1) / Math.sqrt(3);
      expect(station.lo).toBeLessThanOrEqual(exact);
      expect(station.hi).toBeGreaterThanOrEqual(exact);
      expect(station.bracketSeconds).toBeLessThanOrEqual(1);
    }
    expect(path.gates).toEqual([41, 60]);
  });

  test('sub-second station excursion is refined; unresolved tangency is never silently dropped', () => {
    const station = 0.707105;
    const excursion = (t: number) => ({ longitude: 302 + 1e-12 - (t - station) ** 2, speed: -2 * (t - station) });
    const coarse = traceGateTransits([0, 2], excursion);
    const seeded = traceGateTransits([0, station, 2], excursion);
    expect(coarse.gates).toEqual([41, 60]);
    expect(coarse.gates).toEqual(seeded.gates);
    expect(coarse.crossings.map(c => `${c.from}>${c.to}`)).toEqual(['60>41', '41>60']);
    expect(coarse.stations[0]!.bracketSeconds).toBeLessThan(0.17479);
    const tangent = (t: number) => ({ longitude: 302 - (t - station) ** 2, speed: -2 * (t - station) });
    expect(() => traceGateTransits([0, 2], tangent)).toThrow('station gate occupancy unresolved');
    // Exact sampled zero-speed boundary contacts follow the existing half-open
    // gate convention. Two same-time transitions describe singleton occupancy,
    // not a positive-duration gate visit or an approved product timing model.
    const exact = traceGateTransits([0, station, 2], tangent);
    expect(exact.crossings.map(c => [c.from, c.to, c.jd])).toEqual([[60, 41, station], [41, 60, station]]);
  });

  test('a zero-speed seed endpoint cannot hide a later interior station', () => {
    const at = (t: number) => ({ longitude: 302.01 + t ** 3 / 3 - t ** 2 / 4, speed: t * (t - 0.5) });
    for (const seeds of [[0, 2], [0, 1, 2], [0, 0.5, 1, 1.5, 2]]) {
      const path = traceGateTransits(seeds, at);
      expect(path.gates).toEqual([41, 60]);
      expect(path.crossings.map(c => `${c.from}>${c.to}`)).toEqual(['41>60', '60>41']);
      expect(path.stations).toEqual([{ jd: 0.5, lo: 0.5, hi: 0.5, bracketSeconds: 0 }]);
      for (const crossing of path.crossings) {
        expect((at(crossing.lo).longitude - 302) * (at(crossing.hi).longitude - 302)).toBeLessThanOrEqual(0);
        expect(crossing.bracketSeconds).toBeLessThanOrEqual(1);
      }
    }
  });

  test('finite discovery explicitly retains an adversarial oscillation counterexample; it is not a completeness oracle', () => {
    const at = (t: number) => ({
      longitude: 301.9 + 0.01 * t + 0.2 * (1 - Math.cos(4 * Math.PI * t)),
      speed: 0.01 + 0.8 * Math.PI * Math.sin(4 * Math.PI * t),
    });
    const coarse = traceGateTransits([0, 1], at);
    const dense = traceGateTransits(Array.from({ length: 17 }, (_, i) => i / 16), at);
    expect(coarse.gates).toEqual([60]);
    expect(dense.gates).toEqual([41, 60]);
    expect(coarse.stations).toHaveLength(0);
    expect(dense.stations).toHaveLength(4);
  });

  test('empty, stationary, exact-boundary and bounded failure cases stay explicit', () => {
    expect(traceGateTransits([], () => { throw new Error('unused'); })).toEqual({ gates: [], crossings: [], stations: [], evaluations: 0 });
    expect(traceGateTransits([0, 1], () => ({ longitude: 302, speed: 0 })).gates).toEqual([41]);
    const touches = traceGateTransits([0, 2], t => ({ longitude: 302 - (t - 1) ** 2, speed: -2 * (t - 1) }));
    expect(touches.gates).toEqual([41, 60]);
    expect(touches.crossings.map(c => [c.from, c.to, c.jd])).toEqual([[60, 41, 1], [41, 60, 1]]);
    expect(() => traceGateTransits([1, 0], () => ({ longitude: 0, speed: 0 }))).toThrow(RangeError);
    expect(() => traceGateTransits([0, 0], () => ({ longitude: 0, speed: 0 }))).toThrow(RangeError);
    expect(() => traceGateTransits([0], () => ({ longitude: NaN, speed: 0 }))).toThrow(TransitResolutionError);
    expect(() => traceGateTransits([0, 2], t => ({ longitude: t, speed: 1 }), { maxEvaluations: 2 })).toThrow('evaluation budget');
    expect(() => traceGateTransits([0, 2], t => ({ longitude: -t, speed: 1 }))).toThrow('subdivision budget');
  });
});

