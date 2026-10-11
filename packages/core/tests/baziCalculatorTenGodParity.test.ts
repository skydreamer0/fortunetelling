import { expect, test } from 'bun:test';
import { LunarUtil } from 'lunar-javascript';
import { pillarStats, type BaziDayMaster, type BaziPillars, type FiveElement } from '../src/calculators/bazi/calculator';
import { BRANCHES, STEMS } from '../src/rules/bazi/relations';
import { tenGodOf } from '../src/rules/bazi/tenGods';

// Frozen calculator implementation from master 898c8a24111c16d163c9fb8ffd2ba49369a9cf3d.
// This is a regression oracle, not a second production implementation.
// Keep its lookup tables and branch order independent from the shared rule helper.
const STEM_ELEMENTS: Readonly<Record<string, FiveElement>> = Object.freeze({
  甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水',
});
const YANG_STEMS = new Set(['甲', '丙', '戊', '庚', '壬']);
const PRODUCES: Readonly<Record<FiveElement, FiveElement>> = Object.freeze({ 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' });
const CONTROLS: Readonly<Record<FiveElement, FiveElement>> = Object.freeze({ 木: '土', 火: '金', 土: '水', 金: '木', 水: '火' });
const TEN_GODS = ['比肩', '劫財', '食神', '傷官', '偏財', '正財', '七殺', '正官', '偏印', '正印'] as const;

function legacyTenGodFor(dayStem: string, stem: string): string {
  const de = STEM_ELEMENTS[dayStem];
  const te = STEM_ELEMENTS[stem];
  const same = YANG_STEMS.has(dayStem) === YANG_STEMS.has(stem);
  if (te === de) return same ? '比肩' : '劫財';
  if (PRODUCES[de] === te) return same ? '食神' : '傷官';
  if (PRODUCES[te] === de) return same ? '偏印' : '正印';
  if (CONTROLS[de] === te) return same ? '偏財' : '正財';
  if (CONTROLS[te] === de) return same ? '七殺' : '正官';
  throw new Error(`Cannot derive ten god for ${dayStem}/${stem}`);
}

/** Day master, five-element and ten-god occurrence counts of a set of pillars (same method as BaZiEngine). */
function legacyPillarStats(p: BaziPillars): {
  dayMaster: BaziDayMaster;
  fiveElements: Record<FiveElement, number>;
  tenGods: Record<string, number>;
} {
  const all = [p.year, p.month, p.day, p.hour];
  const stems = [...all.map((gz) => gz[0]), ...all.flatMap((gz) => LunarUtil.ZHI_HIDE_GAN[gz[1]] as string[])];
  const dayStem = p.day[0];
  const fiveElements: Record<FiveElement, number> = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  const tenGods: Record<string, number> = Object.fromEntries(TEN_GODS.map((n) => [n, 0]));
  for (const s of stems) {
    fiveElements[STEM_ELEMENTS[s]] += 1;
    tenGods[legacyTenGodFor(dayStem, s)] += 1;
  }
  return {
    dayMaster: { stem: dayStem, element: STEM_ELEMENTS[dayStem], yinYang: YANG_STEMS.has(dayStem) ? '陽' : '陰' },
    fiveElements,
    tenGods,
  };
}


test('shared tenGodOf preserves all 10 × 10 calculator stem relations', () => {
  let checked = 0;
  for (const dayStem of STEMS) {
    for (const stem of STEMS) {
      expect(tenGodOf(dayStem, stem)).toBe(legacyTenGodFor(dayStem, stem));
      checked++;
    }
  }
  expect(checked).toBe(100);
});

test('pillarStats preserves serialized counts, day master and key ordering for all day stems and 60 pillars', () => {
  const ganZhi = Array.from({ length: 60 }, (_, i) => STEMS[i % 10] + BRANCHES[i % 12]);
  let checked = 0;
  for (let i = 0; i < STEMS.length; i++) {
    for (const position of ['year', 'month', 'day', 'hour'] as const) {
      for (const pillar of ganZhi) {
        const p: BaziPillars = { year: '甲子', month: '乙丑', day: ganZhi[i], hour: '丙寅', [position]: pillar };
        const before = JSON.stringify(p);
        expect(JSON.stringify(pillarStats(p))).toBe(JSON.stringify(legacyPillarStats(p)));
        expect(JSON.stringify(p)).toBe(before);
        checked++;
      }
    }
  }
  expect(checked).toBe(2400);
});

test('existing golden, civil and true-solar boundary pillars retain serialized stats', () => {
  const fixtures: BaziPillars[] = [
    { year: '丙寅', month: '癸巳', day: '癸酉', hour: '丙辰' },
    { year: '乙亥', month: '癸未', day: '戊申', hour: '癸亥' },
    { year: '丙午', month: '庚寅', day: '庚申', hour: '壬午' },
    { year: '丙午', month: '庚寅', day: '庚申', hour: '癸未' },
  ];
  for (const pillars of fixtures) {
    expect(JSON.stringify(pillarStats(pillars))).toBe(JSON.stringify(legacyPillarStats(pillars)));
  }
});

test('public string-pillar malformed inputs retain legacy output or exact error', () => {
  const capture = (calculate: typeof pillarStats, p: BaziPillars) => {
    try { return { value: JSON.stringify(calculate(p)) }; }
    catch (error) {
      if (!(error instanceof Error)) throw error;
      return { error: { name: error.name, message: error.message } };
    }
  };
  for (const position of ['year', 'month', 'day', 'hour'] as const) {
    for (const malformed of ['X子', 'X', '', '甲X', 'X丑', '甲子extra', '乙子']) {
      const pillars: BaziPillars = { year: '甲子', month: '乙丑', day: '丙寅', hour: '丁卯', [position]: malformed };
      expect(capture(pillarStats, pillars)).toEqual(capture(legacyPillarStats, pillars));
    }
  }
  // Even the old all-unknown-stems result is compatibility behavior, not validation.
  const unknown = { year: 'X', month: 'X', day: 'X', hour: 'X' };
  expect(capture(pillarStats, unknown)).toEqual(capture(legacyPillarStats, unknown));
});
