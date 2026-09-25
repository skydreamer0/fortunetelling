import { test, expect, describe } from 'bun:test';
import {
  kinFromDate, toneOf, sealOf, kinOf, wavespellOf, castleOf, oracleOf,
  analogSeal, antipodeSeal, occultSeal,
} from '../src/calculators/tzolkin/tzolkin';
import { DreamspellEngine } from '../src/engines/DreamspellEngine';
import { BirthData } from '../src/core/models/BirthData';
import { analyze } from '../src/index';

const ALL_KINS = Array.from({ length: 260 }, (_, i) => i + 1);

function engineRun(year: number, month: number, day: number) {
  const birth = new BirthData({ year, month, day, hour: 12, minute: 0, gender: 'male' });
  return new DreamspellEngine().run(birth);
}

const comp = (result: any, id: string) => result.components.find((c: any) => c.id === id);

describe('kin/tone/seal parity with DreamspellEngine', () => {
  const dates: Array<[number, number, number]> = [
    [1987, 7, 26], [1939, 1, 24], [1995, 7, 16], [2000, 2, 28], [2000, 2, 29],
    [2000, 3, 1], [1900, 3, 1], [2024, 2, 29], [1970, 1, 1], [2026, 9, 25], [1901, 1, 1], [2100, 12, 31],
  ];
  for (const [y, m, d] of dates) {
    test(`${y}-${m}-${d}`, () => {
      const r = engineRun(y, m, d);
      expect(r.errors).toEqual([]);
      const kin = kinFromDate({ year: y, month: m, day: d });
      expect(kin).toBe(comp(r, 'kin').value.kin);
      expect(toneOf(kin)).toBe(comp(r, 'tone').value.number);
      expect(sealOf(kin)).toBe(comp(r, 'seal').value.number);
    });
  }

  test('anchors: 1987-07-26 = Kin 34, 1939-01-24 = Kin 11, leap day shares 28 Feb', () => {
    expect(kinFromDate({ year: 1987, month: 7, day: 26 })).toBe(34);
    expect(kinFromDate({ year: 1939, month: 1, day: 24 })).toBe(11);
    expect(kinFromDate({ year: 2024, month: 2, day: 29 })).toBe(kinFromDate({ year: 2024, month: 2, day: 28 }));
  });
});

describe('kinOf (CRT) is the inverse of toneOf/sealOf', () => {
  test('all 260 kins', () => {
    for (const k of ALL_KINS) expect(kinOf(toneOf(k), sealOf(k))).toBe(k);
  });
});

describe('oracle invariants', () => {
  test('occult kin = 261 − kin for all 260 kins (and tones sum 14, seals sum 21)', () => {
    for (const k of ALL_KINS) {
      const o = oracleOf(k);
      expect(o.occult.kin).toBe(261 - k);
      expect(o.occult.tone + o.destiny.tone).toBe(14);
      expect(o.occult.seal + o.destiny.seal).toBe(21);
    }
  });

  test('analog / antipode / occult are involutions', () => {
    for (const k of ALL_KINS) {
      const o = oracleOf(k);
      expect(oracleOf(o.analog.kin).analog.kin).toBe(k);
      expect(oracleOf(o.antipode.kin).antipode.kin).toBe(k);
      expect(oracleOf(o.occult.kin).occult.kin).toBe(k);
    }
    for (let s = 1; s <= 20; s++) {
      expect(analogSeal(analogSeal(s))).toBe(s);
      expect(antipodeSeal(antipodeSeal(s))).toBe(s);
      expect(occultSeal(occultSeal(s))).toBe(s);
    }
  });

  test('analog, antipode, guide share destiny tone; guide shares destiny colour', () => {
    for (const k of ALL_KINS) {
      const o = oracleOf(k);
      expect(o.analog.tone).toBe(o.destiny.tone);
      expect(o.antipode.tone).toBe(o.destiny.tone);
      expect(o.guide.tone).toBe(o.destiny.tone);
      expect(o.guide.seal % 4).toBe(o.destiny.seal % 4);
      if ([1, 6, 11].includes(o.destiny.tone)) expect(o.guide.kin).toBe(k);
    }
  });

  test('published guide spot checks', () => {
    expect(oracleOf(2).guide).toEqual({ kin: 54, seal: 14, tone: 2 }); // White Lunar Wizard
    expect(oracleOf(3).guide.seal).toBe(7); // Blue Hand
    expect(oracleOf(4).guide.seal).toBe(20); // Yellow Sun
    expect(oracleOf(5).guide.seal).toBe(13); // Red Skywalker
    expect(oracleOf(11).guide.kin).toBe(11); // self-guided
  });

  test('golden: Kin 1 Red Magnetic Dragon', () => {
    expect(oracleOf(1)).toEqual({
      destiny: { kin: 1, seal: 1, tone: 1 },
      guide: { kin: 1, seal: 1, tone: 1 },
      analog: { kin: 118, seal: 18, tone: 1 }, // White Magnetic Mirror
      antipode: { kin: 131, seal: 11, tone: 1 }, // Blue Magnetic Monkey
      occult: { kin: 260, seal: 20, tone: 13 }, // Yellow Cosmic Sun
    });
  });

  test('golden: 1987-07-26 → Kin 34 White Galactic Wizard', () => {
    const kin = kinFromDate({ year: 1987, month: 7, day: 26 });
    expect(oracleOf(kin)).toEqual({
      destiny: { kin: 34, seal: 14, tone: 8 },
      guide: { kin: 138, seal: 18, tone: 8 }, // White Galactic Mirror (tone 8 → +4)
      analog: { kin: 125, seal: 5, tone: 8 }, // Red Galactic Serpent
      antipode: { kin: 164, seal: 4, tone: 8 }, // Yellow Galactic Seed
      occult: { kin: 227, seal: 7, tone: 6 }, // Blue Rhythmic Hand
    });
  });

  test('golden: 1995-07-16 → Kin 84 Yellow Rhythmic Seed', () => {
    // Independent derivation: 26 Jul advances 105 Kin/yr (365 mod 260, leap day
    // skipped) → 1995-07-26 = 34 + 8·105 ≡ 94; ten days earlier = Kin 84.
    const kin = kinFromDate({ year: 1995, month: 7, day: 16 });
    expect(kin).toBe(84);
    expect(oracleOf(kin)).toEqual({
      destiny: { kin: 84, seal: 4, tone: 6 },
      guide: { kin: 84, seal: 4, tone: 6 }, // tone 6 → self-guided
      analog: { kin: 175, seal: 15, tone: 6 }, // Blue Rhythmic Eagle
      antipode: { kin: 214, seal: 14, tone: 6 }, // White Rhythmic Wizard
      occult: { kin: 177, seal: 17, tone: 8 }, // Red Galactic Earth
    });
  });
});

describe('wavespell', () => {
  test('Kin 1, 13, 14, 260', () => {
    expect(wavespellOf(1)).toEqual({ number: 1, startKin: 1, seal: 1 }); // Red Dragon
    expect(wavespellOf(13)).toEqual({ number: 1, startKin: 1, seal: 1 });
    expect(wavespellOf(14)).toEqual({ number: 2, startKin: 14, seal: 14 }); // White Wizard
    expect(wavespellOf(260)).toEqual({ number: 20, startKin: 248, seal: 8 }); // Yellow Star
  });
});

describe('castle', () => {
  test('boundaries 1 / 52 / 53 / 260', () => {
    expect(castleOf(1)).toMatchObject({ number: 1, color: 'red', name: 'Red Eastern Castle of Turning', startKin: 1, endKin: 52 });
    expect(castleOf(52).number).toBe(1);
    expect(castleOf(53)).toMatchObject({ number: 2, color: 'white', name: 'White Northern Castle of Crossing', startKin: 53 });
    expect(castleOf(156).color).toBe('blue');
    expect(castleOf(157).color).toBe('yellow');
    expect(castleOf(209)).toMatchObject({ number: 5, color: 'green' });
    expect(castleOf(260)).toMatchObject({ number: 5, color: 'green', name: 'Green Central Castle of Enchantment', nameZh: '綠色中央魔法城堡', endKin: 260 });
  });

  test('rejects out-of-range kin', () => {
    expect(() => castleOf(0)).toThrow(RangeError);
    expect(() => oracleOf(261)).toThrow(RangeError);
  });
});

describe('DreamspellEngine integration', () => {
  test('existing components unchanged; new wavespell/castle/oracle appended', () => {
    const r = engineRun(1987, 7, 26);
    expect(r.components.map((c: any) => c.id)).toEqual(['kin', 'tone', 'seal', 'wavespell', 'castle', 'oracle']);
    expect(comp(r, 'kin').value).toEqual({ kin: 34, signature: '銀河星系巫師', color: '白' });
    expect(comp(r, 'wavespell').value).toEqual({ number: 3, startKin: 27, seal: 7, name: '藍手波符' });
    expect(comp(r, 'castle').value.number).toBe(1);
    expect(comp(r, 'oracle').value.guide).toEqual({ kin: 138, seal: 18, tone: 8, name: '白銀河星系鏡' });
    expect(comp(r, 'oracle').value.occult.name).toBe('藍韻律手');
  });

  test('analyze(): no unclassified components, no honesty violations', () => {
    for (const [year, month, day] of [[1987, 7, 26], [1995, 7, 16]]) {
      const report = analyze(
        { year, month, day, hour: 12, minute: 0, gender: 'female', longitude: 121.5, latitude: 25.03 },
        { asOf: '2026-01-01' },
      );
      expect(report.layers.unclassified).toEqual([]);
      const ds = report.layers.components.filter((c: any) => c.sourceSystem === 'dreamspell');
      expect(ds.map((c: any) => c.category).sort()).toEqual(['castle', 'kin', 'oracle', 'seal', 'tone', 'wavespell']);
      for (const c of ds) expect(c.layer).toBe('L0');
      expect(report.honesty.violations).toEqual([]);
    }
  });
});
