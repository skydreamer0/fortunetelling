import { beforeAll, describe, expect, test } from 'bun:test';
import { initEphemeris, sunLongitude } from '../src/calculators/astro/index';
import {
  CENTERS,
  CENTER_GATES,
  CHANNELS,
  EPHEMERIS_NOT_INITIALISED_WARNING,
  GATE_CENTER,
  GATE_ORDER,
  HD_PLANETS,
  HUMAN_DESIGN_CATALOG,
  LINE_ARC_DEG,
  NEAR_PROFILE_LINE_WARNING,
  computeHumanDesign,
  crossAngle,
  deriveStructure,
  distanceToLineBoundary,
  evaluateHumanDesignRules,
  gateStartLongitude,
  humanDesignCalculator,
  longitudeToActivation,
  type Line,
} from '../src/calculators/humanDesign/index';
import type { BirthProfile } from '../src/profile/index';
import { DOMAINS, TRAITS } from '../src/signals/types';
import { createTimeContext } from '../src/time/index';

const TAINAN = { label: 'Tainan, Taiwan', lat: 22.9922, lng: 120.1848, timezone: 'Asia/Taipei' };
const PROFILE: BirthProfile = {
  date: '1995-07-16',
  time: '22:00',
  timeAccuracy: 'exact',
  gender: 'male',
  birthplace: TAINAN,
};
const sep = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
const NATAL = { grain: 'natal', start: '1995-07-16', end: '1995-07-16' } as const;

beforeAll(async () => {
  await initEphemeris();
});

describe('mandala', () => {
  test('64 gates are a permutation of 1..64', () => {
    expect(GATE_ORDER.length).toBe(64);
    expect([...GATE_ORDER].sort((a, b) => a - b)).toEqual(Array.from({ length: 64 }, (_, i) => i + 1));
  });

  test('wheel starts with Gate 41 at 302° (2°00′ Aquarius)', () => {
    expect(gateStartLongitude(41)).toBe(302);
    expect(longitudeToActivation(302)).toMatchObject({ gate: 41, line: 1, color: 1, tone: 1, base: 1 });
    expect(longitudeToActivation(301.999).gate).toBe(60);
  });

  test('0° Aries lies in Gate 25 (28°15′ Pisces – 3°52′30″ Aries), line 2', () => {
    expect(gateStartLongitude(25)).toBeCloseTo(358.25, 10);
    const a = longitudeToActivation(0);
    expect(a.gate).toBe(25);
    // 0° − 358.25° = 1.75° into the gate → line floor(1.75/0.9375)+1 = 2
    expect(a.line).toBe(2);
    expect(longitudeToActivation(3.874).gate).toBe(25);
    expect(longitudeToActivation(3.876).gate).toBe(17);
  });

  test('Gate 1 at 13°15′ Scorpio, Gate 2 at 13°15′ Taurus', () => {
    expect(gateStartLongitude(1)).toBeCloseTo(223.25, 10);
    expect(gateStartLongitude(2)).toBeCloseTo(43.25, 10);
  });

  test('right-angle cross opposite pairs are 180° apart', () => {
    for (const [a, b] of [[1, 2], [13, 7], [25, 46], [10, 15], [37, 40], [9, 16], [24, 44], [19, 33], [62, 61], [42, 32]]) {
      expect(sep(gateStartLongitude(a!), gateStartLongitude(b!))).toBeCloseTo(180, 9);
    }
  });

  test('line / color / tone / base arithmetic', () => {
    expect(LINE_ARC_DEG).toBe(0.9375);
    const start = gateStartLongitude(1);
    for (let l = 0; l < 6; l++) {
      const a = longitudeToActivation(start + l * LINE_ARC_DEG + 1e-9);
      expect(a.gate).toBe(1);
      expect(a.line).toBe((l + 1) as Line);
      expect(a.color).toBe(1);
    }
    const last = longitudeToActivation(start + 5.625 - 1e-9);
    expect(last).toMatchObject({ gate: 1, line: 6, color: 6, tone: 6, base: 5 });
    expect(longitudeToActivation(start + 5.625).gate).toBe(43);
    expect(longitudeToActivation(-1).gate).toBe(longitudeToActivation(359).gate);
    expect(() => longitudeToActivation(NaN)).toThrow();
  });

  test('distanceToLineBoundary', () => {
    expect(distanceToLineBoundary(302)).toBe(0);
    expect(distanceToLineBoundary(302 + LINE_ARC_DEG / 2)).toBeCloseTo(LINE_ARC_DEG / 2, 12);
    expect(distanceToLineBoundary(302.01)).toBeCloseTo(0.01, 12);
  });
});

describe('bodygraph data', () => {
  test('9 centers; 64 gates each in exactly one center', () => {
    expect(CENTERS.length).toBe(9);
    const all = Object.values(CENTER_GATES).flat();
    expect(all.length).toBe(64);
    expect(new Set(all).size).toBe(64);
    for (let g = 1; g <= 64; g++) expect(GATE_CENTER[g]).toBeDefined();
    expect(Object.fromEntries(CENTERS.map((c) => [c, CENTER_GATES[c].length]))).toEqual({
      head: 3, ajna: 6, throat: 11, g: 8, heart: 4, sacral: 9, solarPlexus: 7, spleen: 7, root: 9,
    });
  });

  test('36 unique channels; gates belong to the two (different) centers; every gate is in a channel', () => {
    expect(CHANNELS.length).toBe(36);
    expect(new Set(CHANNELS.map((c) => c.id)).size).toBe(36);
    for (const ch of CHANNELS) {
      expect(ch.centers[0]).toBe(GATE_CENTER[ch.gates[0]]!);
      expect(ch.centers[1]).toBe(GATE_CENTER[ch.gates[1]]!);
      expect(ch.centers[0]).not.toBe(ch.centers[1]);
    }
    const inChannels = new Set(CHANNELS.flatMap((c) => [...c.gates]));
    expect(inChannels.size).toBe(64);
    // Gates shared by several channels: the integration gates 10/20/34/57.
    const count = (g: number) => CHANNELS.filter((c) => c.gates.includes(g)).length;
    expect([10, 20, 34, 57].map(count)).toEqual([3, 3, 3, 3]);
  });
});

describe('type / authority / definition (hand-built gate sets)', () => {
  test('nothing defined → Reflector / lunar / none', () => {
    const s = deriveStructure([1, 64, 5], [22]); // no complete channel
    expect(s.channels).toEqual([]);
    expect(s).toMatchObject({ type: 'reflector', authority: 'lunar', definition: 'none', definedCenters: [] });
  });

  test('sacral + solar plexus (59-6), no motor–throat → Generator / emotional', () => {
    const s = deriveStructure([59], [6]);
    expect(s.channels.map((c) => [c.id, c.activation])).toEqual([['6-59', 'mixed']]);
    expect(s).toMatchObject({ type: 'generator', authority: 'emotional', definition: 'single' });
  });

  test('sacral–throat 34-20 → Manifesting Generator / sacral', () => {
    const s = deriveStructure([34, 20]);
    expect(s.channels[0]!.activation).toBe('personality');
    expect(s).toMatchObject({ type: 'manifestingGenerator', authority: 'sacral', motorsToThroat: ['sacral'] });
  });

  test('heart–throat 21-45, no sacral → Manifestor / ego manifested', () => {
    const s = deriveStructure([], [21, 45]);
    expect(s.channels[0]!.activation).toBe('design');
    expect(s).toMatchObject({ type: 'manifestor', authority: 'egoManifested' });
  });

  test('root → throat through SP (19-49 + 12-22 path): Manifestor / emotional', () => {
    const s = deriveStructure([19, 49, 12, 22]);
    expect(s.type).toBe('manifestor');
    expect(s.authority).toBe('emotional');
    expect(s.motorsToThroat).toEqual(['solarPlexus', 'root']);
  });

  test('sacral defined and motor reaches throat via G (5-15 + 7-31) → MG', () => {
    expect(deriveStructure([5, 15, 7, 31]).type).toBe('manifestingGenerator');
    // Sacral–G only (no throat) stays Generator.
    expect(deriveStructure([5, 15]).type).toBe('generator');
  });

  test('projector authorities', () => {
    expect(deriveStructure([18, 58])).toMatchObject({ type: 'projector', authority: 'splenic' });
    expect(deriveStructure([25, 51])).toMatchObject({ type: 'projector', authority: 'egoProjected' });
    expect(deriveStructure([1, 8])).toMatchObject({ type: 'projector', authority: 'selfProjected' });
    expect(deriveStructure([64, 47, 17, 62])).toMatchObject({ type: 'projector', authority: 'mental', definition: 'single' });
  });

  test('definition counts connected components', () => {
    expect(deriveStructure([64, 47, 18, 58]).definition).toBe('split');
    expect(deriveStructure([64, 47, 18, 58, 25, 51]).definition).toBe('tripleSplit');
    // Ajna–Throat, Heart–Spleen, SP–Root, Sacral–G: four separate islands.
    expect(deriveStructure([43, 23, 26, 44, 19, 49, 5, 15]).definition).toBe('quadrupleSplit');
    // Bridging gate joins islands.
    expect(deriveStructure([64, 47, 17, 62, 20, 34]).definition).toBe('single');
  });

  test('cross angle from profile', () => {
    const cases: [Line, Line, string][] = [
      [1, 3, 'rightAngle'], [1, 4, 'rightAngle'], [2, 4, 'rightAngle'], [2, 5, 'rightAngle'], [3, 5, 'rightAngle'],
      [3, 6, 'rightAngle'], [4, 6, 'rightAngle'], [4, 1, 'juxtaposition'], [5, 1, 'leftAngle'], [5, 2, 'leftAngle'],
      [6, 2, 'leftAngle'], [6, 3, 'leftAngle'],
    ];
    for (const [p, d, angle] of cases) expect(crossAngle(p, d)).toBe(angle as any);
  });
});

describe('real chart: 1995-07-16 22:00 Tainan (UT 14:00)', () => {
  const ctx = createTimeContext(PROFILE);
  // Describe bodies run before beforeAll hooks: compute after initEphemeris().
  let r: ReturnType<typeof humanDesignCalculator.calculate>;
  let c: typeof r.chart;
  beforeAll(async () => {
    await initEphemeris();
    r = humanDesignCalculator.calculate(ctx);
    c = r.chart;
  });

  test('design moment: Sun exactly 88° earlier, 88–92 days before', () => {
    expect(c.birthJdUt).toBeCloseTo(2449915.083333, 5);
    const days = c.birthJdUt! - c.designJdUt!;
    expect(days).toBeGreaterThan(88);
    expect(days).toBeLessThan(92.5); // July births: Sun near aphelion, slow
    expect(sep(sunLongitude(c.birthJdUt!) - 88, sunLongitude(c.designJdUt!))).toBeLessThan(1e-7);
  });

  test('activation sets are internally consistent', () => {
    for (const side of [c.personality, c.design]) {
      expect(side.map((a) => a.planet)).toEqual([...HD_PLANETS]);
      const by = Object.fromEntries(side.map((a) => [a.planet, a]));
      expect(sep(by.earth!.longitude, by.sun!.longitude)).toBeCloseTo(180, 9);
      expect(sep(by.southNode!.longitude, by.northNode!.longitude)).toBeCloseTo(180, 9);
      for (const a of side) expect(longitudeToActivation(a.longitude)).toMatchObject({ gate: a.gate, line: a.line });
    }
    // Personality Sun ≈ 23°52′ Cancer → Gate 62 (20°45′–26°22′30″ Cancer).
    expect(c.personality[0]!.gate).toBe(62);
  });

  test('structure matches deriveStructure over the activated gates', () => {
    const s = deriveStructure(c.personality.map((a) => a.gate), c.design.map((a) => a.gate));
    expect(c.channels).toEqual(s.channels);
    expect(c.definedCenters).toEqual(s.definedCenters);
    expect(c.type).toBe(s.type);
    expect(c.authority).toBe(s.authority);
    for (const ch of c.channels) {
      for (const g of ch.gates) expect(c.gates.some((x) => x.gate === g)).toBe(true);
    }
    expect(c.definedCenters.length + c.undefinedCenters.length).toBe(9);
  });

  test('profile and cross derive from the Suns/Earths', () => {
    const [pSun, pEarth] = c.personality;
    const [dSun, dEarth] = c.design;
    expect(c.profile!.label).toBe(`${pSun!.line}/${dSun!.line}`);
    expect(c.incarnationCross).toMatchObject({
      personalitySun: pSun!.gate,
      personalityEarth: pEarth!.gate,
      designSun: dSun!.gate,
      designEarth: dEarth!.gate,
      angle: crossAngle(pSun!.line, dSun!.line),
    });
  });

  // UNVERIFIED snapshot: computed by this implementation (true node, Moshier);
  // not cross-checked against a published HD calculator.
  test('snapshot (unverified against external calculators)', () => {
    expect({
      type: c.type,
      authority: c.authority,
      profile: c.profile!.label,
      definition: c.definition,
      cross: c.incarnationCross!.label,
      angle: c.incarnationCross!.angle,
      centers: c.definedCenters,
      channels: c.channels.map((x) => x.id),
      p: c.personality.map((a) => `${a.gate}.${a.line}`),
      d: c.design.map((a) => `${a.gate}.${a.line}`),
    }).toEqual({
      type: 'generator',
      authority: 'sacral',
      profile: '4/6',
      definition: 'single',
      cross: '62/61 | 42/32',
      angle: 'rightAngle',
      centers: ['sacral', 'spleen', 'root'],
      channels: ['3-60', '27-50'],
      p: ['62.4', '61.4', '22.3', '50.6', '3.6', '39.2', '39.5', '6.5', '9.1', '36.3', '60.3', '61.4', '14.4'],
      d: ['42.6', '32.6', '28.1', '28.4', '27.4', '3.1', '22.6', '7.3', '5.4', '22.4', '60.5', '61.6', '14.6'],
    });
  });

  test('calculator contract and warnings', () => {
    expect(r.system).toBe('humanDesign');
    expect(r.version).toBe('1.0.0');
    expect(humanDesignCalculator.requires).toEqual({ time: true, location: false, name: false });
    expect(r.warnings).toContain('ephemeris:moshier_fallback');
    const near = [c.personality[0]!, c.design[0]!].some((s) => distanceToLineBoundary(s.longitude) < 0.02);
    expect(r.warnings.includes(NEAR_PROFILE_LINE_WARNING)).toBe(near);
    const ids = r.components.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('hd_type');
    expect(ids.filter((i) => i.startsWith('hd_center_')).length).toBe(9);
    expect(ids.filter((i) => i.startsWith('hd_personality_')).length).toBe(13);
  });

  test('mean node option only changes the nodes', () => {
    const m = humanDesignCalculator.calculate(ctx, { node: 'mean' }).chart;
    expect(m.node).toBe('mean');
    const nonNode = (xs: typeof c.personality) => xs.filter((a) => !a.planet.endsWith('Node'));
    expect(nonNode(m.personality)).toEqual(nonNode(c.personality));
    const nn = (xs: typeof c.personality) => xs.find((a) => a.planet === 'northNode')!.longitude;
    expect(sep(nn(m.personality), nn(c.personality))).toBeLessThan(2);
  });

  test('deterministic', () => {
    const again = humanDesignCalculator.calculate(createTimeContext(PROFILE));
    expect(JSON.stringify(again)).toBe(JSON.stringify(r));
    expect(computeHumanDesign(c.birthJdUt!)).toEqual(computeHumanDesign(c.birthJdUt!));
  });

  test('signals: data-driven, valid domains/traits, deterministic', () => {
    const sig = evaluateHumanDesignRules(c, NATAL);
    expect(sig.length).toBe(2 + 1 + 2 * c.channels.length); // type(2) + authority(1) + 2 per channel
    for (const s of sig) {
      expect(DOMAINS).toContain(s.domain);
      expect(TRAITS).toContain(s.trait);
      expect(s.system).toBe('humanDesign');
      expect(s.valence).toBe(0);
    }
    expect(evaluateHumanDesignRules(c, NATAL)).toEqual(sig);
    expect(evaluateHumanDesignRules(c, { grain: 'year', start: '2026-01-01', end: '2026-12-31' })).toEqual([]);
    expect(HUMAN_DESIGN_CATALOG.rules.find((x) => x.id === 'humanDesign.transit.gates')!.status).toBe('pending');
  });
});

describe('unknown time', () => {
  test('empty chart + time_unknown, no signals', () => {
    const ctx = createTimeContext({ ...PROFILE, time: null, timeAccuracy: 'unknown' });
    const r = humanDesignCalculator.calculate(ctx);
    expect(r.warnings).toContain('time_unknown');
    expect(r.warnings).not.toContain('ephemeris:moshier_fallback');
    expect(r.chart.type).toBeNull();
    expect(r.chart.personality).toEqual([]);
    expect(r.components).toEqual([]);
    expect(evaluateHumanDesignRules(r.chart, NATAL)).toEqual([]);
    expect(EPHEMERIS_NOT_INITIALISED_WARNING).toBe('ephemeris:not_initialised');
  });
});
