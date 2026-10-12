import { beforeAll, describe, expect, test } from 'bun:test';
import { initEphemeris, planetPositions } from '../src/calculators/astro/index';
import { type HdPlanet, type NodeKind } from '../src/calculators/humanDesign/humanDesign';
import { longitudeToActivation } from '../src/calculators/humanDesign/mandala';
import { HUMAN_DESIGN_CATALOG, sampleHumanDesignTransitWindow } from '../src/calculators/humanDesign/rules';
import { traceGateTransits, type LongitudeMotion } from '../src/calculators/humanDesign/transitCrossings';
import observed from './fixtures/humanDesignSampling.observed.json';
import type { SignalWindow } from '../src/signals/types';

beforeAll(async () => { await initEphemeris(); });
const jdOf = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000 + 2440587.5;
const YEAR = { grain: 'year', start: '2026-01-01', end: '2026-12-31' } as const;
const catalog = HUMAN_DESIGN_CATALOG.rules.find(rule => rule.id === 'humanDesign.transit.gates')!;
const cache = new Map<number, ReturnType<typeof planetPositions>>();

// Test-only adaptation reads speeds straight from the unchanged production
// ephemeris. This helper candidate does not activate new production rules.
function motionAt(jd: number, node: NodeKind, planet: HdPlanet): LongitudeMotion {
  let positions = cache.get(jd);
  if (!positions) {
    if (cache.size >= 4096) cache.clear();
    positions = planetPositions(jd);
    cache.set(jd, positions);
  }
  const body = planet === 'earth' ? 'sun' : planet === 'northNode' || planet === 'southNode'
    ? node === 'true' ? 'rahuTrue' : 'rahuMean' : planet;
  const position = positions.find(p => p.body === body)!;
  return { longitude: (position.longitude + (planet === 'earth' || planet === 'southNode' ? 180 : 0)) % 360, speed: position.speed };
}

describe('#63 finite real-ephemeris helper matrix; no production activation or universal oracle', () => {
  for (const saved of observed.cases) {
    test(`${saved.node} node ${saved.window.grain} ${saved.window.start}: five step levels retain gates and overlap root brackets`, () => {
      const window = saved.window as SignalWindow;
      const node = saved.node as NodeKind;
      const planets = Object.keys(catalog.params.planets[window.grain]) as HdPlanet[];
      const step = catalog.params.sampleDays[window.grain] as number;
      const levels = [1, 2, 4, 8, 16].map(divisor => {
        const { jds } = sampleHumanDesignTransitWindow(window, node, step / divisor);
        return planets.map(planet => traceGateTransits(jds, jd => motionAt(jd, node, planet)));
      });
      for (const level of levels) for (const [i, path] of level.entries()) {
        const first = levels[0]![i]!;
        expect(path.gates).toEqual(first.gates);
        expect(path.crossings.map(c => [c.from, c.to])).toEqual(first.crossings.map(c => [c.from, c.to]));
        for (const [j, crossing] of path.crossings.entries()) {
          expect(crossing.bracketSeconds).toBeLessThanOrEqual(1);
          expect(crossing.lo).toBeLessThanOrEqual(first.crossings[j]!.hi);
          expect(crossing.hi).toBeGreaterThanOrEqual(first.crossings[j]!.lo);
        }
      }
    }, 60_000);
  }

  for (const node of ['true', 'mean'] as const) {
    test(`${node} node known Jupiter visit includes gate 39 and agrees with the numerical reference`, () => {
      const { jds } = sampleHumanDesignTransitWindow(YEAR, node, 15);
      const path = traceGateTransits(jds, jd => motionAt(jd, node, 'jupiter'));
      expect(path.gates).toEqual([4, 7, 29, 31, 33, 39, 53, 56, 62]);
      expect(path.crossings).toHaveLength(10);
      const entry = path.crossings.find(c => c.from === 53 && c.to === 39)!;
      const exit = path.crossings.find(c => c.from === 39 && c.to === 53)!;
      for (const [crossing, reference, before, after] of [
        [entry, 2461105.8515970474, 53, 39], [exit, 2461115.455133223, 39, 53],
      ] as const) {
        expect(Math.abs(crossing.jd - reference) * 86_400).toBeLessThanOrEqual(1);
        expect(longitudeToActivation(motionAt(crossing.jd - 1 / 1440, node, 'jupiter').longitude).gate).toBe(before);
        expect(longitudeToActivation(motionAt(crossing.jd + 1 / 1440, node, 'jupiter').longitude).gate).toBe(after);
      }
    });
  }

  test('true-node June 2026 double station resolves even though both sampled endpoint speeds are negative', () => {
    const start = jdOf('2026-06-07');
    expect(motionAt(start, 'true', 'northNode').speed).toBeLessThan(0);
    expect(motionAt(start + 1.5, 'true', 'northNode').speed).toBeLessThan(0);
    expect(motionAt(start + 0.75, 'true', 'northNode').speed).toBeGreaterThan(0);
    const path = traceGateTransits([start, start + 3], jd => motionAt(jd, 'true', 'northNode'));
    const pair = path.stations.filter(s => s.jd > start && s.jd < start + 1.5);
    expect(pair).toHaveLength(2);
    for (const station of pair) {
      expect(station.bracketSeconds).toBeLessThanOrEqual(1);
      expect(motionAt(station.lo, 'true', 'northNode').speed * motionAt(station.hi, 'true', 'northNode').speed).toBeLessThanOrEqual(0);
    }
  });
});
