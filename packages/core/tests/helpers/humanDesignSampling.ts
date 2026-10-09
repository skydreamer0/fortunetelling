/** Test-only diagnostics. Crossing times are shortest-arc linear interpolations, not ephemeris root solves. */
import type { HumanDesignChart } from '../../src/calculators/humanDesign/calculator';
import { HD_PLANETS, type HdPlanet } from '../../src/calculators/humanDesign/humanDesign';
import { GATE_ARC_DEG, GATE_ORDER, MANDALA_START_DEG } from '../../src/calculators/humanDesign/mandala';
import { evaluateHumanDesignRules, gatesAlong, HUMAN_DESIGN_CATALOG, humanDesignTransitRuleForSampling, sampleHumanDesignTransitWindow } from '../../src/calculators/humanDesign/rules';
import type { SignalWindow } from '../../src/signals/types';

export type SamplingWindow = SignalWindow & { grain: 'year' | 'month' };
export interface Crossing { from: number; to: number; jd: number }
const norm = (n: number) => ((n % 360) + 360) % 360;
const gate = (index: number) => GATE_ORDER[((index % 64) + 64) % 64]!;

export function interpolatedCrossings(jds: readonly number[], lons: readonly number[]): Crossing[] {
  const out: Crossing[] = [];
  for (let i = 1; i < jds.length; i++) {
    const a = norm(lons[i - 1]! - MANDALA_START_DEG);
    const delta = norm(lons[i]! - lons[i - 1]! + 180) - 180;
    const first = Math.floor(a / GATE_ARC_DEG);
    const last = Math.floor((a + delta) / GATE_ARC_DEG);
    const direction = last >= first ? 1 : -1;
    for (let k = first; k !== last; k += direction) {
      const boundary = (direction > 0 ? k + 1 : k) * GATE_ARC_DEG;
      out.push({ from: gate(k), to: gate(k + direction), jd: jds[i - 1]! + (boundary - a) / delta * (jds[i]! - jds[i - 1]!) });
    }
  }
  return out;
}

export function compareSampling(chart: HumanDesignChart, window: SamplingWindow) {
  const entry = HUMAN_DESIGN_CATALOG.rules.find(rule => rule.id === 'humanDesign.transit.gates')!;
  const step = entry.params.sampleDays[window.grain] as number;
  const bodies = HD_PLANETS.filter(planet => entry.params.planets[window.grain][planet] !== undefined);
  const coarse = sampleHumanDesignTransitWindow(window, chart.node, step);
  const fine = sampleHumanDesignTransitWindow(window, chart.node, step / 2);
  const planets = bodies.map((planet: HdPlanet) => {
    const a = coarse.samples.map(sample => sample[planet]);
    const b = fine.samples.map(sample => sample[planet]);
    const coarseGates = gatesAlong(a);
    const fineGates = gatesAlong(b);
    const coarseCrossings = interpolatedCrossings(coarse.jds, a);
    const fineCrossings = interpolatedCrossings(fine.jds, b);
    const sequence = (crossings: Crossing[]) => crossings.map(crossing => `${crossing.from}>${crossing.to}`);
    const sameCrossingSequence = JSON.stringify(sequence(coarseCrossings)) === JSON.stringify(sequence(fineCrossings));
    return {
      planet, coarseGates, fineGates,
      coarseCrossings, fineCrossings,
      sameCrossingSequence,
      maxCrossingShiftHours: sameCrossingSequence ? Math.max(0, ...coarseCrossings.map((crossing, i) => Math.abs(crossing.jd - fineCrossings[i]!.jd) * 24)) : null,
    };
  });
  const coarseSignals = evaluateHumanDesignRules(chart, window);
  const fineSignals = evaluateHumanDesignRules(chart, window, { rules: [humanDesignTransitRuleForSampling(window.grain, step / 2)] });
  const coarseIds = new Set(coarseSignals.map(signal => signal.id));
  const fineIds = new Set(fineSignals.map(signal => signal.id));
  return {
    window, node: chart.node, stepDays: [step, step / 2], sampleCounts: [coarse.jds.length, fine.jds.length], planets,
    coarseSignals, fineSignals,
    coarseOnlySignals: coarseSignals.filter(signal => !fineIds.has(signal.id)),
    fineOnlySignals: fineSignals.filter(signal => !coarseIds.has(signal.id)),
  };
}
