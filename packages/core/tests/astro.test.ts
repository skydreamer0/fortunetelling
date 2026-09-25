import { test, expect, describe, beforeAll } from 'bun:test';
import {
  initEphemeris,
  isEphemerisReady,
  ephemerisInfo,
  planetPositions,
  ascendantAndHouses,
  ayanamsaValue,
  findJdWhenSunLongitude,
  sunLongitude,
  humanDesignDesignJd,
  norm360,
  BODIES,
} from '../src/calculators/astro/index';
import { julianDayFromUnixMs } from '../src/time/astro';
import { solarTermsAround } from '../src/time/solarTerms';

const jdOf = (iso: string) => julianDayFromUnixMs(Date.parse(iso));
const pos = (jd: number, body: string, opts = {}) => planetPositions(jd, opts).find((p) => p.body === body)!;
/** Smallest angular separation, degrees. */
const sep = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

beforeAll(async () => {
  await initEphemeris();
});

describe('init', () => {
  test('ready, idempotent, Moshier mode', async () => {
    expect(isEphemerisReady()).toBe(true);
    await Promise.all([initEphemeris(), initEphemeris()]);
    const info = ephemerisInfo();
    expect(info.mode).toBe('moshier');
    expect(info.version).toMatch(/^2\.10/);
  });
});

describe('Sun', () => {
  test('J2000.0 apparent tropical longitude', () => {
    // 280.46° is the Sun's *mean* longitude L0 at J2000 (Meeus eq. 25.2,
    // 280.46646°). The true apparent longitude, which Swiss Ephemeris returns,
    // is L0 + equation of centre (≈ −0.083°) − aberration (0.0057°) + Δψ
    // (≈ −0.0039°) ≈ 280.369° (Astronomical Almanac 2000, Jan 1.5).
    const sun = sunLongitude(2451545.0);
    expect(Math.abs(sun - 280.369)).toBeLessThan(0.01);
    expect(Math.abs(sun - 280.46646)).toBeGreaterThan(0.08); // documents the mean/true gap
  });

  test('Sun reaches 315° (立春) at 2026-02-03T20:02Z ±2 min, matching time/solarTerms', () => {
    const jd = findJdWhenSunLongitude(315, jdOf('2026-02-04T00:00:00Z'));
    const utcMs = (jd - 2440587.5) * 86_400_000;
    expect(Math.abs(utcMs - Date.parse('2026-02-03T20:02:00Z'))).toBeLessThan(2 * 60_000);
    const lichun = solarTermsAround(Date.UTC(2026, 1, 4)).find(
      (t) => t.name === '立春' && t.utcMs > Date.UTC(2026, 0, 1),
    )!;
    expect(Math.abs(utcMs - lichun.utcMs)).toBeLessThan(2 * 60_000);
  });

  test('cross-check: 冬至 1999 (270°) = 1999-12-22T07:44Z (USNO) ±2 min', () => {
    const jd = findJdWhenSunLongitude(270, jdOf('1999-12-20T00:00:00Z'));
    const utcMs = (jd - 2440587.5) * 86_400_000;
    expect(Math.abs(utcMs - Date.parse('1999-12-22T07:44:00Z'))).toBeLessThan(2 * 60_000);
  });
});

describe('ayanamsa', () => {
  test('Lahiri ≈ 23.85° around 2000', () => {
    expect(Math.abs(ayanamsaValue(2451545.0, 'lahiri') - 23.85)).toBeLessThan(0.02);
  });

  test('Raman < Lahiri < Krishnamurti ordering and ~50″/yr precession', () => {
    const jd = 2451545.0;
    const l = ayanamsaValue(jd, 'lahiri');
    expect(ayanamsaValue(jd, 'raman')).toBeLessThan(l);
    expect(ayanamsaValue(jd, 'krishnamurti')).toBeLessThan(l); // KP ≈ Lahiri − 6′
    expect(Math.abs(ayanamsaValue(jd, 'krishnamurti') - l)).toBeLessThan(0.2);
    const perYear = ayanamsaValue(jd + 36525, 'lahiri') - ayanamsaValue(jd, 'lahiri');
    expect(perYear / 100).toBeGreaterThan(0.0135);
    expect(perYear / 100).toBeLessThan(0.0145);
  });

  test('sidereal longitude = tropical − ayanamsa', () => {
    const jd = jdOf('1990-05-15T14:30:00Z');
    const trop = planetPositions(jd);
    const sid = planetPositions(jd, { sidereal: { ayanamsa: 'lahiri' } });
    const ay = ayanamsaValue(jd, 'lahiri');
    for (let i = 0; i < trop.length; i++) {
      expect(sep(sid[i].longitude, norm360(trop[i].longitude - ay))).toBeLessThan(1e-6);
    }
  });
});

describe('Moon', () => {
  test('Meeus Example 47.a: 1992-04-12 0h TT, apparent λ = 133.167265°, β = −3.229126°', () => {
    // 0h TT − ΔT (≈ 59 s in 1992) → UT
    const m = pos(2448724.5 - 59 / 86400, 'moon');
    expect(sep(m.longitude, 133.167265)).toBeLessThan(0.01);
    expect(Math.abs(m.latitude - -3.229126)).toBeLessThan(0.01);
    expect(Math.abs(m.distance * 149_597_870.7 - 368_409.7)).toBeLessThan(50); // km (Meeus uses a truncated ELP-2000 series)
  });

  test('new Moon of the 2024-04-08 total solar eclipse at 18:21 UT (NASA)', () => {
    const jd = jdOf('2024-04-08T18:21:00Z');
    expect(sep(pos(jd, 'moon').longitude, pos(jd, 'sun').longitude)).toBeLessThan(0.02);
    expect(Math.abs(pos(jd, 'moon').latitude)).toBeLessThan(0.5);
  });

  test('full Moon of the 2025-03-14 total lunar eclipse at 06:55 UT (NASA)', () => {
    const jd = jdOf('2025-03-14T06:55:00Z');
    expect(Math.abs(sep(pos(jd, 'moon').longitude, pos(jd, 'sun').longitude) - 180)).toBeLessThan(0.02);
  });
});

describe('planets', () => {
  const jd = jdOf('2024-04-10T00:00:00Z');

  test('all bodies present, longitudes normalised', () => {
    const ps = planetPositions(jd);
    expect(ps.map((p) => p.body)).toEqual([...BODIES]);
    for (const p of ps) {
      expect(p.longitude).toBeGreaterThanOrEqual(0);
      expect(p.longitude).toBeLessThan(360);
      expect(Number.isFinite(p.speed)).toBe(true);
    }
  });

  test('Rahu/Ketu exactly 180° apart (mean and true)', () => {
    for (const opts of [{}, { sidereal: { ayanamsa: 'lahiri' as const } }]) {
      const ps = planetPositions(jd, opts);
      const get = (b: string) => ps.find((p) => p.body === b)!;
      expect(Math.abs(sep(get('rahuMean').longitude, get('ketuMean').longitude) - 180)).toBeLessThan(1e-9);
      expect(Math.abs(sep(get('rahuTrue').longitude, get('ketuTrue').longitude) - 180)).toBeLessThan(1e-9);
      expect(sep(get('rahuMean').longitude, get('rahuTrue').longitude)).toBeLessThan(2.5);
    }
  });

  test('retrograde ⇔ negative speed; Mercury retrograde 2024-04-01..25; mean node always retrograde', () => {
    for (const d of ['2024-04-10', '1990-05-15', '2000-01-01', '2026-09-25']) {
      for (const p of planetPositions(jdOf(`${d}T00:00:00Z`))) {
        expect(p.retrograde).toBe(p.speed < 0);
        if (p.body === 'sun' || p.body === 'moon') expect(p.retrograde).toBe(false);
        if (p.body === 'rahuMean' || p.body === 'ketuMean') expect(p.retrograde).toBe(true);
      }
    }
    expect(pos(jd, 'mercury').retrograde).toBe(true);
    expect(pos(jdOf('2024-03-15T00:00:00Z'), 'mercury').retrograde).toBe(false);
  });
});

describe('houses', () => {
  const jd = jdOf('1990-05-15T14:30:00Z');
  const [lat, lng] = [25.033, 121.565]; // Taipei

  test('whole sign cusps start at the ascendant sign; equal at the ascendant', () => {
    for (const sidereal of [undefined, { ayanamsa: 'lahiri' as const }]) {
      const ws = ascendantAndHouses(jd, lat, lng, 'whole_sign', sidereal);
      expect(ws.cusps).toHaveLength(12);
      expect(ws.cusps[0]).toBe(Math.floor(ws.ascendant / 30) * 30);
      const eq = ascendantAndHouses(jd, lat, lng, 'equal', sidereal);
      expect(eq.ascendant).toBeCloseTo(ws.ascendant, 12);
      expect(eq.cusps[0]).toBeCloseTo(eq.ascendant, 12);
      expect(sep(eq.cusps[3], eq.ascendant + 90)).toBeLessThan(1e-9);
    }
  });

  test('Placidus: cusp 1 = ascendant, cusp 10 = MC; sidereal shifts by the ayanamsa', () => {
    const t = ascendantAndHouses(jd, lat, lng, 'placidus');
    expect(sep(t.cusps[0], t.ascendant)).toBeLessThan(1e-9);
    expect(sep(t.cusps[9], t.mc)).toBeLessThan(1e-9);
    expect(t.ayanamsa).toBeNull();
    expect(t.warnings).toEqual([]);
    const s = ascendantAndHouses(jd, lat, lng, 'placidus', { ayanamsa: 'lahiri' });
    expect(sep(t.ascendant - s.ascendant, s.ayanamsa!)).toBeLessThan(1e-9);
    // Sidereal whole-sign lagna sign comes from the sidereal ascendant
    const ws = ascendantAndHouses(jd, lat, lng, 'whole_sign', { ayanamsa: 'lahiri' });
    expect(ws.cusps[0]).toBe(Math.floor(s.ascendant / 30) * 30);
  });

  test('Placidus inside the polar circle is flagged', () => {
    expect(ascendantAndHouses(jd, 70, 20, 'placidus').warnings).toContain('houses:placidus_polar_porphyry_fallback');
  });

  test('rejects out-of-range coordinates', () => {
    expect(() => ascendantAndHouses(jd, 95, 0, 'equal')).toThrow(RangeError);
    expect(() => ascendantAndHouses(jd, 0, 200, 'equal')).toThrow(RangeError);
  });
});

describe('Human Design design time', () => {
  for (const iso of ['1990-05-15T14:30:00Z', '1985-01-03T02:10:00Z', '2001-07-04T23:59:00Z']) {
    test(`birth ${iso}: Sun 88° earlier, ~88 days before`, () => {
      const birth = jdOf(iso);
      const design = humanDesignDesignJd(birth);
      const arc = norm360(sunLongitude(birth) - sunLongitude(design));
      expect(Math.abs(arc - 88)).toBeLessThan(1e-6);
      const days = birth - design;
      expect(days).toBeGreaterThan(85);
      expect(days).toBeLessThan(92);
      // Same answer through the generic solver
      expect(findJdWhenSunLongitude(sunLongitude(birth) - 88, birth - 89)).toBeCloseTo(design, 9);
    });
  }
});

describe('determinism', () => {
  test('identical outputs across repeated calls', () => {
    const jd = jdOf('1990-05-15T14:30:00Z');
    const run = () =>
      JSON.stringify({
        t: planetPositions(jd),
        s: planetPositions(jd, { sidereal: { ayanamsa: 'krishnamurti' } }),
        h: ascendantAndHouses(jd, 25.033, 121.565, 'placidus', { ayanamsa: 'raman' }),
        d: humanDesignDesignJd(jd),
        a: ayanamsaValue(jd, 'lahiri'),
      });
    const a = run();
    // interleave other sidereal modes to catch leaked global SE state
    planetPositions(jd, { sidereal: { ayanamsa: 'lahiri' } });
    expect(run()).toBe(a);
  });
});
