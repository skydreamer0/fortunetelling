import { beforeAll, describe, expect, test } from 'bun:test';
import { initEphemeris } from '../src/calculators/astro/index';
import { humanDesignCalculator } from '../src/calculators/humanDesign/calculator';
import { longitudesAt, type NodeKind } from '../src/calculators/humanDesign/humanDesign';
import { gateStartLongitude, longitudeToActivation } from '../src/calculators/humanDesign/mandala';
import { evaluateHumanDesignRules, HUMAN_DESIGN_CATALOG, humanDesignTransitRuleForSampling, sampleHumanDesignTransitWindow } from '../src/calculators/humanDesign/rules';
import type { BirthProfile } from '../src/profile/types';
import { createTimeContext } from '../src/time/index';
import observed from './fixtures/humanDesignSampling.observed.json';
import { compareSampling, interpolatedCrossings, type SamplingWindow } from './helpers/humanDesignSampling';

const PROFILE = observed.profile as BirthProfile;
const jdOf = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000 + 2440587.5;
const YEAR_2026 = { grain: 'year', start: '2026-01-01', end: '2026-12-31' } as const;
beforeAll(async () => { await initEphemeris(); });

function chartFor(node: NodeKind, date = PROFILE.date) {
  return humanDesignCalculator.calculate(createTimeContext({ ...PROFILE, date }), { node }).chart;
}

// Test-only numerical reference for the specific Jupiter station counterexample.
// The bracket must contain one crossing of the 39/53 boundary, away from 0°.
// Stopping at a one-second bracket is a numerical-resolution bound, NOT a claim
// about the physical accuracy of the ephemeris or of the production sampling.
function jupiterBoundaryRoot(start: string, end: string) {
  const boundary = gateStartLongitude(53);
  let lo = jdOf(start), hi = jdOf(end);
  const residual = (jd: number) => longitudesAt(jd).jupiter - boundary;
  expect(residual(lo) * residual(hi)).toBeLessThan(0);
  for (let i = 0; hi - lo > 1 / 86400; i++) {
    if (i >= 60) throw new Error('Jupiter reference root did not converge');
    const mid = (lo + hi) / 2;
    if (residual(lo) * residual(mid) > 0) lo = mid;
    else hi = mid;
  }
  return { jd: (lo + hi) / 2, bracketSeconds: (hi - lo) * 86400 };
}

describe('#48 Human Design step-halving: real ephemeris characterization, not a precision pass', () => {
  test('test seams preserve the catalog defaults, exact sample schedule and production signals', () => {
    const entry = HUMAN_DESIGN_CATALOG.rules.find(rule => rule.id === 'humanDesign.transit.gates')!;
    expect(entry.params.sampleDays).toEqual({ year: 15, month: 3 });
    const chart = chartFor('true');
    const preExtractionSignalDigests: Record<string, string> = {
      '2026-01-01': 'b65c86371fea745b8eb4d13738d0b78c141911686cc42b21f3265335ff0c16dc',
      '2024-02-01': '1f83bde53fbb304de866c02a8b12a557ba3ca0911d6e2310edaca5512b23fa64',
      '2026-05-01': '9303d42c76bd520760bb57f66363dc0716822761eef0c088deedfbe9e5028dec',
    };
    for (const window of [YEAR_2026, { grain: 'month', start: '2024-02-01', end: '2024-02-29' }, { grain: 'month', start: '2026-05-01', end: '2026-05-31' }] as const) {
      const step = entry.params.sampleDays[window.grain] as number;
      const expectedJds: number[] = [];
      // Original production loop, before extraction: inclusive end date, exact tail.
      const end = jdOf(window.end) + 1;
      for (let jd = jdOf(window.start); jd < end; jd += step) expectedJds.push(jd);
      expectedJds.push(end);
      const sample = sampleHumanDesignTransitWindow(window, chart.node, step);
      expect(new Bun.CryptoHasher('sha256').update(JSON.stringify(evaluateHumanDesignRules(chart, window))).digest('hex'))
        .toBe(preExtractionSignalDigests[window.start]!);
      expect(sample.jds).toEqual(expectedJds);
      expect(sample.samples).toEqual(expectedJds.map(jd => longitudesAt(jd, chart.node)));
      expect(evaluateHumanDesignRules(chart, window, { rules: [humanDesignTransitRuleForSampling(window.grain, step)] }))
        .toEqual(evaluateHumanDesignRules(chart, window));
    }
    for (const invalid of [0, -1, Infinity, NaN]) {
      expect(() => humanDesignTransitRuleForSampling('year', invalid)).toThrow(RangeError);
    }
  });

  test('crossing diagnostic handles direct, retrograde and wrapped arcs', () => {
    expect(interpolatedCrossings([0, 1], [301, 303])).toEqual([{ from: 60, to: 41, jd: 0.5 }]);
    expect(interpolatedCrossings([0, 1], [303, 301])).toEqual([{ from: 41, to: 60, jd: 0.5 }]);
    // Crossing longitude 0° alone is not a gate transition: gate 25 straddles it.
    expect(interpolatedCrossings([0, 1], [359, 1])).toEqual([]);
    expect(interpolatedCrossings([0, 1], [302.5, 314])).toHaveLength(2);
  });

  for (const saved of observed.cases) {
    test(`${saved.node} node ${saved.window.grain} ${saved.window.start}: gates, every estimated crossing, and actual signals`, () => {
      const window = saved.window as SamplingWindow;
      const result = compareSampling(chartFor(saved.node as NodeKind), window);
      expect(result.stepDays).toEqual(saved.stepDays);
      expect(result.sampleCounts).toEqual(saved.sampleCounts);
      expect(result.planets.map(planet => String(planet.planet))).toEqual(saved.planets.map(planet => planet.planet));
      for (const [i, planet] of result.planets.entries()) {
        const recorded = saved.planets[i]!;
        expect(planet.coarseGates).toEqual(recorded.coarseGates);
        expect(planet.fineGates).toEqual(recorded.fineGates);
        expect(planet.coarseCrossings.map(c => `${c.from}>${c.to}`)).toEqual(recorded.coarseCrossingSequence);
        expect(planet.fineCrossings.map(c => `${c.from}>${c.to}`)).toEqual(recorded.fineCrossingSequence);
        if (recorded.crossingShiftHours === null) {
          expect(window).toEqual(YEAR_2026);
          expect(planet.planet).toBe('jupiter');
          expect(planet.sameCrossingSequence).toBe(false); // do not pair unrelated crossings by index
          expect(planet.maxCrossingShiftHours).toBeNull();
          expect(planet.fineGates.filter(g => !planet.coarseGates.includes(g))).toEqual([39]);
        } else {
          expect(planet.coarseGates).toEqual(planet.fineGates);
          expect(planet.sameCrossingSequence).toBe(true);
          expect(planet.coarseCrossings).toHaveLength(recorded.crossingShiftHours.length);
          for (const [index, crossing] of planet.coarseCrossings.entries()) {
            const actualHours = Math.abs(crossing.jd - planet.fineCrossings[index]!.jd) * 24;
            // 10^-6 hour (~3.6 ms) only compares a diagnostic to its recorded value.
            // Large real drifts remain large; this is NOT an allowed timing error.
            expect(actualHours).toBeCloseTo(recorded.crossingShiftHours[index]!, 6);
          }
        }
      }
      expect(result.coarseSignals).toHaveLength(saved.signalCount);
      expect(result.coarseSignals.length).toBeGreaterThan(0);
      // Complete Signal objects, including IDs, targets, weights, windows and evidence.
      // This reference natal chart happens not to respond to the missed gate 39.
      expect(result.fineSignals).toEqual(result.coarseSignals);
    });
  }

  for (const node of ['true', 'mean'] as const) {
    test(`${node} node known non-convergence: real synthetic gate-55 natal loses two production signals at 15 days`, () => {
      const chart = chartFor(node, '1990-02-22');
      expect(chart.gates.map(g => g.gate)).toContain(55);
      expect(chart.gates.map(g => g.gate)).not.toContain(39);
      expect(chart.channels.map(channel => channel.id)).not.toContain('39-55');
      const result = compareSampling(chart, YEAR_2026);
      const jupiter = result.planets.find(planet => planet.planet === 'jupiter')!;
      expect(jupiter.coarseGates).toEqual([4, 7, 29, 31, 33, 53, 56, 62]);
      expect(jupiter.fineGates).toEqual([4, 7, 29, 31, 33, 39, 53, 56, 62]);
      expect(jupiter.coarseCrossings).toHaveLength(8);
      expect(jupiter.fineCrossings).toHaveLength(10);
      expect(result.coarseOnlySignals).toEqual([]);
      expect(result.fineOnlySignals.map(signal => ({ target: signal.target, domain: signal.domain, trait: signal.trait, intensity: signal.intensity, valence: signal.valence }))).toEqual([
        { target: 'transit:jupiter:g39:complete:39-55:solarPlexus', domain: 'relationship', trait: 'change', intensity: 0.15, valence: 0 },
        { target: 'transit:jupiter:g39:complete:39-55:root', domain: 'self', trait: 'pressure', intensity: 0.15, valence: 0 },
      ]);
      expect(result.fineSignals.filter(signal => !result.fineOnlySignals.includes(signal))).toEqual(result.coarseSignals);
      expect(result.fineSignals.length).toBe(result.coarseSignals.length + 2);
    });
  }

  test('the missed Jupiter gate-39 visit is real; root-solved entry and exit differ from linear estimates', () => {
    const entry = jupiterBoundaryRoot('2026-03-01', '2026-03-11');
    const exit = jupiterBoundaryRoot('2026-03-11', '2026-03-21');
    expect(entry.bracketSeconds).toBeLessThanOrEqual(1);
    expect(exit.bracketSeconds).toBeLessThanOrEqual(1);
    for (const [crossing, before, after] of [[entry, 53, 39], [exit, 39, 53]] as const) {
      expect(longitudeToActivation(longitudesAt(crossing.jd - 1 / 1440).jupiter).gate).toBe(before);
      expect(longitudeToActivation(longitudesAt(crossing.jd + 1 / 1440).jupiter).gate).toBe(after);
    }
    // Independently refined reference roots (sub-millisecond brackets), checked
    // against the one-second numerical stopping bound above.
    expect(Math.abs(entry.jd - 2461105.8515970474) * 86400).toBeLessThanOrEqual(1);
    expect(Math.abs(exit.jd - 2461115.455133223) * 86400).toBeLessThanOrEqual(1);
    const comparison = compareSampling(chartFor('true', '1990-02-22'), YEAR_2026);
    const jupiter = comparison.planets.find(planet => planet.planet === 'jupiter')!;
    const estimatedEntry = jupiter.fineCrossings.find(c => c.from === 53 && c.to === 39)!;
    const estimatedExit = jupiter.fineCrossings.find(c => c.from === 39 && c.to === 53)!;
    expect((estimatedEntry.jd - entry.jd) * 24).toBeCloseTo(30.424812242388725, 3);
    expect((estimatedExit.jd - exit.jd) * 24).toBeCloseTo(-38.36269208416343, 3);
    // Current estimates are over a day wrong; do not label this precision PASS.
    expect(Math.abs(estimatedEntry.jd - entry.jd)).toBeGreaterThan(1);
    expect(Math.abs(estimatedExit.jd - exit.jd)).toBeGreaterThan(1);
  });
});
