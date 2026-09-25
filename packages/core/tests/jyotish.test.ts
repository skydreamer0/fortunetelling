import { beforeAll, describe, expect, test } from 'bun:test';
import { EPHEMERIS_MOSHIER_WARNING, initEphemeris, planetPositions } from '../src/calculators/astro/index';
import {
  DASHA_ORDER,
  DASHA_YEARS,
  GRAHAS,
  JYOTISH_CATALOG,
  JYOTISH_RULES,
  NAKSHATRA_SPAN,
  PADA_SPAN,
  VIMSHOTTARI_TOTAL_YEARS,
  buildJyotishChart,
  dashaAt,
  dasamsaSign,
  dignityOf,
  evaluateJyotishRules,
  houseFrom,
  housesRuledBy,
  jyotishCalculator,
  nakshatraOf,
  navamsaSign,
  sadeSatiPhase,
  siderealGrahas,
  signOf,
  transitSnapshot,
  vimshottari,
  type JyotishChart,
} from '../src/calculators/jyotish/index';
import { DOMAINS, TRAITS } from '../src/signals/types';
import { createTimeContext } from '../src/time/index';
import type { BirthProfile } from '../src/profile/index';

const J2000 = 2451545.0;
const DAY = 1;
const YEAR = 365.25 * DAY;

const TAINAN: BirthProfile = {
  date: '1995-07-16',
  time: '22:00',
  timeAccuracy: 'exact',
  gender: 'male',
  birthplace: { label: 'Tainan, Taiwan', lat: 22.99, lng: 120.18, timezone: 'Asia/Taipei' },
};
const ASOF = '2026-09-25';

beforeAll(async () => {
  await initEphemeris();
});

describe('sidereal positions', () => {
  test('Lahiri Sun at J2000 ≈ 256.52° (280.37 − 23.85) → Dhanu, Purva Ashadha', () => {
    const sun = siderealGrahas(J2000).sun;
    expect(Math.abs(sun.longitude - 256.52)).toBeLessThan(0.01);
    expect(signOf(sun.longitude)).toBe(9);
    const nak = nakshatraOf(sun.longitude);
    expect(nak.number).toBe(20);
    expect(nak.name).toBe('Purva Ashadha');
    expect(nak.lord).toBe('venus');
  });

  test('mean vs true node option; Ketu = Rahu + 180°', () => {
    const mean = siderealGrahas(J2000, { node: 'mean' });
    const tru = siderealGrahas(J2000, { node: 'true' });
    expect(mean.rahu.longitude).not.toBe(tru.rahu.longitude);
    expect(Math.abs(mean.rahu.longitude - tru.rahu.longitude)).toBeLessThan(2.5); // true node oscillates ±~1.5°
    for (const g of [mean, tru]) expect((g.ketu.longitude - g.rahu.longitude + 360) % 360).toBeCloseTo(180, 9);
  });

  test('ayanamsa option shifts every graha by the same amount', () => {
    const l = siderealGrahas(J2000, { ayanamsa: 'lahiri' });
    const k = siderealGrahas(J2000, { ayanamsa: 'krishnamurti' });
    const d = l.sun.longitude - k.sun.longitude;
    expect(Math.abs(d)).toBeGreaterThan(0.05);
    expect(Math.abs(d)).toBeLessThan(0.2);
    expect(l.saturn.longitude - k.saturn.longitude).toBeCloseTo(d, 6);
  });
});

describe('nakshatra / pada arithmetic', () => {
  test('13°20′ spans, 3°20′ padas', () => {
    expect(NAKSHATRA_SPAN).toBeCloseTo(40 / 3, 12);
    expect(PADA_SPAN).toBeCloseTo(10 / 3, 12);
    expect(nakshatraOf(0)).toMatchObject({ number: 1, name: 'Ashwini', pada: 1, lord: 'ketu' });
    expect(nakshatraOf(10 / 3 - 1e-9)).toMatchObject({ number: 1, pada: 1 });
    expect(nakshatraOf(10 / 3)).toMatchObject({ number: 1, pada: 2 });
    expect(nakshatraOf(40 / 3 - 1e-9)).toMatchObject({ number: 1, pada: 4 });
    expect(nakshatraOf(40 / 3)).toMatchObject({ number: 2, name: 'Bharani', pada: 1 });
    expect(nakshatraOf(20)).toMatchObject({ number: 2, pada: 3 }); // exact boundary, no FP slip
    expect(nakshatraOf(359.9999)).toMatchObject({ number: 27, name: 'Revati', pada: 4, lord: 'mercury' });
    expect(nakshatraOf(360)).toMatchObject({ number: 1, pada: 1 });
    expect(nakshatraOf(26 + 40 / 60)).toMatchObject({ number: 3, name: 'Krittika', pada: 1 }); // 26°40′
  });

  test('fraction traversed', () => {
    expect(nakshatraOf(20).fraction).toBeCloseTo(0.5, 12);
    expect(nakshatraOf(0).fraction).toBe(0);
  });

  test('nakshatra lords cycle through the Vimshottari order', () => {
    for (let i = 0; i < 27; i++) expect(nakshatraOf(i * NAKSHATRA_SPAN + 1).lord).toBe(DASHA_ORDER[i % 9]);
  });
});

describe('divisional charts', () => {
  test('navamsa (D9) examples', () => {
    expect(navamsaSign(0)).toBe(1); // 0° Aries → Aries
    expect(navamsaSign(10 / 3)).toBe(2); // 3°20′ Aries → Taurus
    expect(navamsaSign(29.99)).toBe(9); // last navamsa of Aries → Sagittarius
    expect(navamsaSign(30)).toBe(10); // 0° Taurus (fixed: from 9th) → Capricorn
    expect(navamsaSign(60)).toBe(7); // 0° Gemini (dual: from 5th) → Libra
    expect(navamsaSign(90)).toBe(4); // 0° Cancer (movable) → Cancer
    expect(navamsaSign(120)).toBe(1); // 0° Leo (fixed) → Aries
    expect(navamsaSign(359.99)).toBe(12); // end of Pisces → Pisces
  });

  test('navamsa modality rule ≡ continuous count from Aries', () => {
    for (let lon = 0.01; lon < 360; lon += 0.77) {
      expect(navamsaSign(lon)).toBe((Math.floor(lon / (10 / 3)) % 12) + 1);
    }
  });

  test('dasamsa (D10): odd from itself, even from the 9th', () => {
    expect(dasamsaSign(0)).toBe(1);
    expect(dasamsaSign(3)).toBe(2);
    expect(dasamsaSign(29.9)).toBe(10);
    expect(dasamsaSign(30)).toBe(10); // Taurus → 9th = Capricorn
    expect(dasamsaSign(59.9)).toBe(7); // Capricorn + 9 → Libra
    expect(dasamsaSign(60)).toBe(3); // Gemini (odd) → Gemini
  });
});

describe('dignity (BPHS tables)', () => {
  test('exaltation / debilitation / moolatrikona / own', () => {
    expect(dignityOf('sun', 10)).toBe('exalted');
    expect(dignityOf('sun', 190)).toBe('debilitated');
    expect(dignityOf('sun', 125)).toBe('moolatrikona');
    expect(dignityOf('sun', 145)).toBe('own');
    expect(dignityOf('moon', 31)).toBe('exalted'); // Taurus 1°
    expect(dignityOf('moon', 40)).toBe('moolatrikona'); // Taurus 10°
    expect(dignityOf('moon', 100)).toBe('own');
    expect(dignityOf('mercury', 160)).toBe('exalted'); // Virgo 10°
    expect(dignityOf('mercury', 167)).toBe('moolatrikona'); // Virgo 17°
    expect(dignityOf('mercury', 175)).toBe('own'); // Virgo 25°
    expect(dignityOf('mercury', 340)).toBe('debilitated');
    expect(dignityOf('saturn', 200)).toBe('exalted');
    expect(dignityOf('saturn', 305)).toBe('moolatrikona');
    expect(dignityOf('saturn', 325)).toBe('own');
    expect(dignityOf('mars', 5)).toBe('moolatrikona');
    expect(dignityOf('mars', 20)).toBe('own');
    expect(dignityOf('venus', 30)).toBe('own');
    expect(dignityOf('jupiter', 60)).toBe('neutral');
    expect(dignityOf('rahu', 40)).toBe('exalted');
    expect(dignityOf('ketu', 40)).toBe('debilitated');
  });

  test('house rulership (traditional, whole sign)', () => {
    expect(housesRuledBy('saturn', 11)).toEqual([1, 12]); // Aquarius lagna
    expect(housesRuledBy('rahu', 11)).toEqual([]);
    expect(houseFrom(11, 12)).toBe(2);
    expect(houseFrom(11, 10)).toBe(12);
  });
});

describe('Vimshottari dasha', () => {
  const birth = 2450000.5;

  test('120 years; order Ketu → Mercury; balance from nakshatra fraction', () => {
    const v = vimshottari(0, birth); // Moon at 0° Ashwini
    expect(v.mahadashas.map((m) => m.lord)).toEqual([
      'ketu', 'venus', 'sun', 'moon', 'mars', 'rahu', 'jupiter', 'saturn', 'mercury',
    ]);
    expect(Object.values(DASHA_YEARS).reduce((a, b) => a + b, 0)).toBe(VIMSHOTTARI_TOTAL_YEARS);
    const total = (v.mahadashas[8].endJd - v.mahadashas[0].startJd) / YEAR;
    expect(total).toBeCloseTo(120, 9);
    expect(v.balanceYears).toBeCloseTo(7, 12);
    expect(v.mahadashas[0].startJd).toBeCloseTo(birth, 9);
    for (let i = 1; i < 9; i++) expect(v.mahadashas[i].startJd).toBe(v.mahadashas[i - 1].endJd);
  });

  test('first dasha balance ∝ remaining nakshatra fraction', () => {
    const lon = 3 * NAKSHATRA_SPAN + 0.25 * NAKSHATRA_SPAN; // Rohini, 1/4 traversed → Moon dasha
    const v = vimshottari(lon, birth);
    expect(v.moonNakshatraLord).toBe('moon');
    expect(v.elapsedFraction).toBeCloseTo(0.25, 9);
    expect(v.balanceYears).toBeCloseTo(7.5, 9);
    expect((v.mahadashas[0].endJd - birth) / YEAR).toBeCloseTo(7.5, 9);
    expect(v.mahadashas.map((m) => m.lord).slice(0, 3)).toEqual(['moon', 'mars', 'rahu']);
  });

  test('antardashas start with the maha lord and sum to the maha', () => {
    const v = vimshottari(123.4, birth);
    for (const m of v.mahadashas) {
      expect(m.antardashas[0].lord).toBe(m.lord);
      expect(m.antardashas[0].startJd).toBe(m.startJd);
      expect(m.antardashas[8].endJd).toBeCloseTo(m.endJd, 6);
      expect(m.antardashas.reduce((a, x) => a + x.years, 0)).toBeCloseTo(m.years, 12);
      const i = DASHA_ORDER.indexOf(m.lord);
      expect(m.antardashas.map((a) => a.lord)).toEqual(DASHA_ORDER.map((_, k) => DASHA_ORDER[(i + k) % 9]));
    }
    // Venus maha / Venus antar = 20 × 20 / 120 = 3y4m.
    const venus = v.mahadashas.find((m) => m.lord === 'venus')!;
    expect(venus.antardashas[0].years).toBeCloseTo(10 / 3, 12);
  });

  test('360-day year option and ISO dates', () => {
    const v = vimshottari(0, birth, { yearDays: 360 });
    expect(v.mahadashas[0].endJd - v.mahadashas[0].startJd).toBeCloseTo(7 * 360, 9);
    expect(vimshottari(0, 2451545.0).mahadashas[0].start).toBe('2000-01-01T12:00:00Z');
    expect(v.mahadashas[0].start).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  test('dashaAt handles the running period and cycles beyond 120 years', () => {
    const v = vimshottari(0, birth);
    expect(dashaAt(v, birth - 1)).toBeNull();
    expect(dashaAt(v, birth + 1)!.maha.lord).toBe('ketu');
    expect(dashaAt(v, birth + 1)!.antar.lord).toBe('ketu');
    const later = dashaAt(v, birth + 121 * YEAR)!;
    expect(later.maha.lord).toBe('ketu');
    expect(later.maha.index).toBe(9);
  });
});

describe('transits', () => {
  test('houses from Moon / Lagna and sade sati phases', () => {
    const snap = transitSnapshot(J2000, { moonSign: 1, lagnaSign: 5 });
    expect(snap.planets.map((p) => p.graha)).toEqual(['jupiter', 'saturn', 'rahu', 'ketu']);
    for (const p of snap.planets) {
      expect(p.houseFromMoon).toBe(houseFrom(1, p.sign));
      expect(p.houseFromLagna).toBe(houseFrom(5, p.sign));
    }
    expect(sadeSatiPhase(12)).toBe('rising');
    expect(sadeSatiPhase(1)).toBe('peak');
    expect(sadeSatiPhase(2)).toBe('setting');
    expect(sadeSatiPhase(3)).toBeNull();
    // Saturn at J2000 was in sidereal Aries (tropical ~10° Taurus − 23.85°).
    const saturn = snap.planets.find((p) => p.graha === 'saturn')!;
    expect(saturn.sign).toBe(1);
    expect(snap.sadeSati).toEqual({ active: true, phase: 'peak' });
  });
});

describe('calculator: 1995-07-16 22:00 Tainan', () => {
  const ctx = createTimeContext(TAINAN);
  // Computed in beforeAll: describe bodies run before the top-level initEphemeris().
  let result: ReturnType<typeof jyotishCalculator.calculate>;
  let chart: JyotishChart;
  beforeAll(() => {
    result = jyotishCalculator.calculate(ctx, { asOf: ASOF });
    chart = result.chart;
  });
  const g = (name: string) => chart.planets.find((p) => p.graha === name)!;

  test('contract', () => {
    expect(jyotishCalculator.id).toBe('jyotish');
    expect(jyotishCalculator.version).toBe('1.0.0');
    expect(jyotishCalculator.requires).toEqual({ time: true, location: true, name: false });
    expect(result.system).toBe('jyotish');
    expect(result.warnings).toContain(EPHEMERIS_MOSHIER_WARNING);
    expect(chart.timeKnown).toBe(true);
    expect(chart.planets.map((p) => p.graha)).toEqual([...GRAHAS]);
    expect(() => jyotishCalculator.calculate(ctx, {})).toThrow(/asOf/);
  });

  test('internal consistency', () => {
    const lagna = chart.lagna!;
    expect((g('ketu').longitude - g('rahu').longitude + 360) % 360).toBeCloseTo(180, 9);
    for (const p of chart.planets) {
      expect(p.sign).toBe(signOf(p.longitude));
      expect(p.house).toBe(houseFrom(lagna.sign, p.sign));
      expect(p.degree).toBeGreaterThanOrEqual(0);
      expect(p.degree).toBeLessThan(30);
      expect(p.dignity).toBe(dignityOf(p.graha, p.longitude));
      expect(chart.divisionalCharts!.D1.grahas[p.graha]).toBe(p.sign);
      expect(chart.divisionalCharts!.D9.grahas[p.graha]).toBe(navamsaSign(p.longitude));
    }
    expect(chart.houseLords).toHaveLength(12);
    expect(chart.houseLords[0].sign).toBe(lagna.sign);
    for (const h of chart.houseLords) expect(h.sign).toBe(((lagna.sign + h.house - 2) % 12) + 1);
    // Sidereal = tropical − ayanamsa.
    const trop = planetPositions(ctx.jd!.ut).find((p) => p.body === 'sun')!.longitude;
    expect(g('sun').longitude).toBeCloseTo((trop - chart.ayanamsaDegrees! + 360) % 360, 6);
    // Dasha from the Moon's nakshatra.
    expect(chart.dasha!.moonNakshatraLord).toBe(nakshatraOf(g('moon').longitude).lord);
    expect(chart.dasha!.mahadashas[0].startJd).toBeLessThanOrEqual(ctx.jd!.ut);
    expect(chart.dasha!.mahadashas[0].endJd).toBeGreaterThan(ctx.jd!.ut);
    // Current dasha / transits evaluated at asOf.
    expect(chart.current.asOf).toBe(ASOF);
    const cur = chart.current.dasha!;
    expect(cur.maha.start <= `${ASOF}T00:00:00Z` && cur.maha.end > `${ASOF}T00:00:00Z`).toBe(true);
    expect(cur.antar.mahaLord).toBe(cur.maha.lord);
    expect(chart.current.transits!.natalMoonSign).toBe(g('moon').sign);
  });

  test('astronomical plausibility (independent of any Jyotish software)', () => {
    // 1995-07-16 14:00 UT: tropical Sun ≈ 113.6° (Cancer 23.6°); Lahiri ayanamsa 1995 ≈ 23.80°.
    expect(chart.ayanamsaDegrees!).toBeGreaterThan(23.75);
    expect(chart.ayanamsaDegrees!).toBeLessThan(23.85);
    expect(Math.abs(g('sun').longitude - 89.78)).toBeLessThan(0.05);
    // Jupiter and Saturn were retrograde in mid-July 1995; Mercury direct (retro May 24–Jun 17).
    expect(g('jupiter').retrograde).toBe(true);
    expect(g('saturn').retrograde).toBe(true);
    expect(g('mercury').retrograde).toBe(false);
    expect(g('rahu').retrograde).toBe(true); // mean node is always retrograde
  });

  test('snapshot (Moshier ephemeris, Lahiri, mean node) — not externally verified', () => {
    // Values produced by this implementation; they match the astronomical checks
    // above but have NOT been cross-checked against a published Jyotish chart.
    // Tolerances allow the Moon's few-arcsecond Moshier error.
    const lagna = chart.lagna!;
    expect(lagna.sign).toBe(11); // Kumbha, ~28.36°
    expect(lagna.degree).toBeCloseTo(28.36, 1);
    expect(lagna.nakshatraName).toBe('Purva Bhadrapada');
    const summary = chart.planets.map((p) => [p.graha, p.sign, p.nakshatraName, p.pada, p.house, p.dignity]);
    expect(summary).toEqual([
      ['sun', 3, 'Punarvasu', 3, 5, 'neutral'],
      ['moon', 11, 'Purva Bhadrapada', 2, 1, 'neutral'],
      ['mars', 6, 'Uttara Phalguni', 3, 8, 'neutral'],
      ['mercury', 3, 'Ardra', 4, 5, 'own'],
      ['jupiter', 8, 'Anuradha', 3, 10, 'neutral'],
      ['venus', 3, 'Punarvasu', 1, 5, 'neutral'],
      ['saturn', 12, 'Purva Bhadrapada', 4, 2, 'neutral'],
      ['rahu', 7, 'Swati', 1, 9, 'neutral'],
      ['ketu', 1, 'Ashwini', 3, 3, 'neutral'],
    ]);
    expect(chart.dasha!.mahadashas.map((m) => m.lord)).toEqual([
      'jupiter', 'saturn', 'mercury', 'ketu', 'venus', 'sun', 'moon', 'mars', 'rahu',
    ]);
    expect(chart.dasha!.balanceYears).toBeCloseTo(9.45, 1);
    expect(chart.dasha!.mahadashas[1].start.slice(0, 7)).toBe('2004-12');
    expect(chart.current.dasha!.maha.lord).toBe('mercury');
    expect(chart.current.dasha!.antar.lord).toBe('ketu');
    expect(chart.current.transits!.sadeSati).toEqual({ active: true, phase: 'setting' });
    expect(chart.divisionalCharts!.D9.lagna).toBe(3);
    expect(chart.divisionalCharts!.D10.lagna).toBe(8);
  });

  test('components follow the id/name/category/value convention', () => {
    const ids = result.components.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of result.components) {
      expect(typeof c.id).toBe('string');
      expect(typeof c.name).toBe('string');
      expect(typeof c.category).toBe('string');
      expect(c.value).toBeDefined();
    }
    for (const id of ['lagna', 'graha_moon', 'house_1', 'varga_D9', 'mahadasha_0', 'current_dasha', 'transits']) {
      expect(ids).toContain(id);
    }
  });

  test('deterministic', () => {
    const again = jyotishCalculator.calculate(createTimeContext(TAINAN), { asOf: ASOF });
    expect(JSON.stringify(again)).toBe(JSON.stringify(result));
  });

  test('true node config changes Rahu only', () => {
    const t = buildJyotishChart(ctx, { asOf: ASOF, node: 'true' });
    expect(t.planets.find((p) => p.graha === 'rahu')!.longitude).not.toBe(g('rahu').longitude);
    expect(t.planets.find((p) => p.graha === 'moon')!.longitude).toBe(g('moon').longitude);
  });
});

describe('time unknown', () => {
  test('empty chart + time_unknown, no guessing', () => {
    const r = jyotishCalculator.calculate(createTimeContext({ ...TAINAN, time: null, timeAccuracy: 'unknown' }), {
      asOf: ASOF,
    });
    expect(r.warnings).toContain('time_unknown');
    expect(r.chart.timeKnown).toBe(false);
    expect(r.chart.lagna).toBeNull();
    expect(r.chart.planets).toEqual([]);
    expect(r.chart.houseLords).toEqual([]);
    expect(r.chart.dasha).toBeNull();
    expect(r.components).toEqual([]);
    expect(evaluateJyotishRules(r.chart, { grain: 'year', start: '2026-01-01', end: '2026-12-31' })).toEqual([]);
  });
});

describe('rules', () => {
  let chart: JyotishChart;
  beforeAll(() => {
    chart = buildJyotishChart(createTimeContext(TAINAN), { asOf: ASOF });
  });
  const yearWin = { grain: 'year' as const, start: '2026-01-01', end: '2026-12-31' };

  test('catalog: every rule has a matcher, scopes expand, no 吉/凶 strings', () => {
    const expected = JYOTISH_CATALOG.rules.reduce((a, r) => a + r.scopes.length, 0);
    expect(JYOTISH_RULES).toHaveLength(expected);
    const raw = JSON.stringify(JYOTISH_CATALOG);
    expect(raw).not.toMatch(/[吉凶]/);
    for (const [h, list] of Object.entries(JYOTISH_CATALOG.houseSignals)) {
      expect(Number(h)).toBeGreaterThanOrEqual(1);
      for (const t of list) {
        expect(DOMAINS).toContain(t.domain);
        expect(TRAITS).toContain(t.trait);
      }
    }
    // D-028 domain mapping for the key houses is data.
    const dom = (h: number) => JYOTISH_CATALOG.houseSignals[String(h)].map((t) => t.domain);
    expect(dom(2)).toContain('wealth');
    expect(dom(4)).toContain('property');
    expect(dom(7)).toContain('relationship');
    expect(dom(10)).toContain('career');
    expect(dom(11)).toContain('wealth');
  });

  test('year window: dasha lord houses, transits and sade sati', () => {
    const signals = evaluateJyotishRules(chart, yearWin);
    expect(signals.length).toBeGreaterThan(0);
    const ruleIds = new Set(signals.map((s) => s.ruleId));
    expect(ruleIds).toContain('jyotish.dasha.maha');
    expect(ruleIds).toContain('jyotish.dasha.antar');
    expect(ruleIds).toContain('jyotish.transit.sade_sati');
    expect(ruleIds).toContain('jyotish.transit.slow');
    for (const s of signals) {
      expect(s.system).toBe('jyotish');
      expect(s.intensity).toBeGreaterThanOrEqual(0);
      expect(s.intensity).toBeLessThanOrEqual(1);
      expect(s.window).toEqual(yearWin);
      expect(s.evidence.text).not.toMatch(/[吉凶]/);
      expect(s.evidence.componentIds.length).toBeGreaterThan(0);
    }
    // Mercury maha (Aquarius lagna): Mercury rules 5H and 8H, occupies 5H.
    const maha = signals.filter((s) => s.ruleId === 'jyotish.dasha.maha');
    expect(new Set(maha.map((s) => s.target))).toEqual(
      new Set(['maha:2:mercury:rules:H5', 'maha:2:mercury:rules:H8', 'maha:2:mercury:occupies:H5']),
    );
    const sade = signals.filter((s) => s.ruleId === 'jyotish.transit.sade_sati');
    expect(sade.every((s) => s.target === 'sade_sati:setting')).toBe(true);
  });

  test('decade window only runs decade-scoped rules', () => {
    const signals = evaluateJyotishRules(chart, { grain: 'decade', start: '2024-01-01', end: '2033-12-31' });
    expect(new Set(signals.map((s) => s.ruleId))).toEqual(new Set(['jyotish.dasha.maha']));
  });

  test('deterministic and unique ids', () => {
    const a = evaluateJyotishRules(chart, yearWin);
    const b = evaluateJyotishRules(buildJyotishChart(createTimeContext(TAINAN), { asOf: ASOF }), yearWin);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(new Set(a.map((s) => s.id)).size).toBe(a.length);
    const month = evaluateJyotishRules(chart, { grain: 'month', start: '2026-09-01', end: '2026-09-30' });
    expect(new Set(month.map((s) => s.ruleId)).has('jyotish.dasha.maha')).toBe(false);
    expect(month.some((s) => s.target === 'antar:2:mercury/ketu:occupies:H3')).toBe(true);
  });
});
