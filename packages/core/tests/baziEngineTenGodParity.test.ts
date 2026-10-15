import { expect, test } from 'vitest';
import { LunarUtil } from 'lunar-javascript';
import type { FiveElement } from '../src/calculators/bazi/calculator';
import type { Component } from '../src/core/models/SystemResult';
import {
  buildBaziNatalComponents,
  type BaziConvention,
  type BaziPillars,
} from '../src/engines/BaZiEngine';
import type { BaziNatalComponent } from '../src/engines/baziTypes';
import { BRANCHES, STEMS } from '../src/rules/bazi/relations';
import { tenGodOf } from '../src/rules/bazi/tenGods';

// Frozen natal-component implementation from master 15e4919b204180f6a99e053796a5e74080539429.
// This is a regression oracle, not a second production implementation.
// Keep its tables, branch order and serialization independent from the shared helper.
const STEM_ELEMENTS: Readonly<Record<string, FiveElement>> = Object.freeze({
  甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水',
});

const YANG_STEMS = new Set(['甲', '丙', '戊', '庚', '壬']);

const ELEMENT_PRODUCES: Readonly<Record<string, string>> = Object.freeze({ 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' });
const ELEMENT_CONTROLS: Readonly<Record<string, string>> = Object.freeze({ 木: '土', 火: '金', 土: '水', 金: '木', 水: '火' });

const TEN_GODS = Object.freeze(['比肩', '劫財', '食神', '傷官', '偏財', '正財', '七殺', '正官', '偏印', '正印']);

/** Whether a ten-god group shows in a visible stem, only in hidden stems, or not at all. */
type TenGodPresence = '顯' | '隱' | '無';

const TEN_GOD_GROUPS = Object.freeze([
  Object.freeze({ group: '官殺', context: '規範與權威', tenGods: Object.freeze(['正官', '七殺']) }),
  Object.freeze({ group: '財星', context: '資源與交換', tenGods: Object.freeze(['正財', '偏財']) }),
  Object.freeze({ group: '食傷', context: '表達與產出', tenGods: Object.freeze(['食神', '傷官']) }),
  Object.freeze({ group: '印星', context: '學習與支持', tenGods: Object.freeze(['正印', '偏印']) }),
  Object.freeze({ group: '比劫', context: '同儕與競合', tenGods: Object.freeze(['比肩', '劫財']) }),
]);

const TAIPEI_CONVENTION = Object.freeze({
  calendar: 'gregorian',
  timezone: 'Asia/Taipei',
  dayBoundary: 'lunar-javascript sect=2',
  trueSolarTime: false,
  library: 'lunar-javascript@1.7.7',
});

function legacyTenGodFor(dayStem: string, stem: string): string {
  const dayElement = STEM_ELEMENTS[dayStem];
  const targetElement = STEM_ELEMENTS[stem];
  if (!dayElement || !targetElement) {
    throw new Error(`Unsupported heavenly stem: ${stem}`);
  }

  const samePolarity = YANG_STEMS.has(dayStem) === YANG_STEMS.has(stem);
  if (targetElement === dayElement) return samePolarity ? '比肩' : '劫財';
  if (ELEMENT_PRODUCES[dayElement] === targetElement) return samePolarity ? '食神' : '傷官';
  if (ELEMENT_PRODUCES[targetElement] === dayElement) return samePolarity ? '偏印' : '正印';
  if (ELEMENT_CONTROLS[dayElement] === targetElement) return samePolarity ? '偏財' : '正財';
  if (ELEMENT_CONTROLS[targetElement] === dayElement) return samePolarity ? '七殺' : '正官';

  throw new Error(`Cannot derive ten god for ${dayStem}/${stem}`);
}

const ELEMENTS_LIMITATION = '此為五行出現次數，不代表旺衰、月令、藏干權重或真太陽時校正。';

function legacyBuildBaziNatalComponents(
  pillars: BaziPillars,
  { convention = TAIPEI_CONVENTION, elementsLimitation = ELEMENTS_LIMITATION }: { convention?: BaziConvention; elementsLimitation?: string } = {},
): Component[] {
  const all = [pillars.year, pillars.month, pillars.day, pillars.time];
  const dayStem = pillars.day[0]!;
  const visibleStems = all.map(gz => gz[0]!);
  const contextVisibleStems = [pillars.year[0]!, pillars.month[0]!, pillars.time[0]!];
  const hiddenStems: string[] = all.flatMap(gz => LunarUtil.ZHI_HIDE_GAN[gz[1]!]);
  const allStems = [...visibleStems, ...hiddenStems];
  const elementCounts: Record<FiveElement, number> = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  const tenGodCounts = Object.fromEntries(TEN_GODS.map(name => [name, 0]));

  for (const stem of allStems) {
    elementCounts[STEM_ELEMENTS[stem]!]! += 1;
    tenGodCounts[legacyTenGodFor(dayStem, stem)]! += 1;
  }

  const visibleTenGods = contextVisibleStems.map(stem => legacyTenGodFor(dayStem, stem));
  const hiddenTenGods = hiddenStems.map(stem => legacyTenGodFor(dayStem, stem));
  const contextGroups = TEN_GOD_GROUPS.map(definition => {
    const breakdown = Object.fromEntries(definition.tenGods.map(name => [
      name,
      visibleTenGods.filter(tenGod => tenGod === name).length
        + hiddenTenGods.filter(tenGod => tenGod === name).length,
    ]));
    const visibleCount = visibleTenGods.filter(tenGod => definition.tenGods.includes(tenGod)).length;
    const hiddenCount = hiddenTenGods.filter(tenGod => definition.tenGods.includes(tenGod)).length;

    return {
      group: definition.group,
      context: definition.context,
      tenGods: [...definition.tenGods],
      breakdown,
      observedTenGods: definition.tenGods.filter(name => breakdown[name]! > 0),
      visibleCount,
      hiddenCount,
      count: visibleCount + hiddenCount,
      presence: (visibleCount > 0 ? '顯' : (hiddenCount > 0 ? '隱' : '無')) as TenGodPresence,
    };
  });
  const tenGodsContextTotal = contextGroups.reduce((sum, group) => sum + group.count, 0);
  const tenGodsContextGroups = contextGroups.map(group => ({
    ...group,
    share: tenGodsContextTotal > 0 ? group.count / tenGodsContextTotal : 0,
  }));

  return [
    {
      id: 'natal',
      name: '四柱',
      category: 'natal',
      value: { ...pillars, convention },
      meta: { convention },
    },
    {
      id: 'day_master',
      name: '日主',
      category: 'dayMaster',
      value: {
        stem: dayStem,
        element: STEM_ELEMENTS[dayStem],
        yinYang: YANG_STEMS.has(dayStem) ? '陽' : '陰',
      },
    },
    {
      id: 'elements',
      name: '五行出現次數',
      category: 'elements',
      value: {
        counts: elementCounts,
        total: allStems.length,
        includesHiddenStems: true,
        includesDayMaster: true,
        metric: 'occurrence-count',
        limitation: elementsLimitation,
      },
    },
    {
      id: 'ten_gods',
      name: '十神統計',
      category: 'tenGods',
      value: {
        counts: tenGodCounts,
        total: allStems.length,
        includesDayMaster: true,
      },
    },
    {
      id: 'tenGodsContext',
      name: '十神關係角色',
      category: 'tenGodsContext',
      value: {
        groups: tenGodsContextGroups,
        total: tenGodsContextTotal,
        includesHiddenStems: true,
        includesDayMaster: false,
        metric: 'occurrence-share',
        presenceConvention: 'visible-hidden-absent',
      },
    },
  ] satisfies BaziNatalComponent[];
}


test('shared tenGodOf preserves all 10 × 10 engine stem relations', () => {
  let checked = 0;
  for (const dayStem of STEMS) {
    for (const stem of STEMS) {
      expect(legacyTenGodFor(dayStem, stem)).toBe(tenGodOf(dayStem, stem));
      checked++;
    }
  }
  expect(checked).toBe(100);
});

test('all five natal components retain serialized values and ordering across 2,400 pillar cases', () => {
  const ganZhi = Array.from({ length: 60 }, (_, i) => STEMS[i % 10] + BRANCHES[i % 12]);
  let checked = 0;
  for (let i = 0; i < STEMS.length; i++) {
    for (const position of ['year', 'month', 'day', 'time'] as const) {
      for (const pillar of ganZhi) {
        const pillars: BaziPillars = {
          year: '甲子', month: '乙丑', day: ganZhi[i], time: '丙寅', [position]: pillar,
        };
        const before = JSON.stringify(pillars);
        expect(JSON.stringify(buildBaziNatalComponents(pillars)))
          .toBe(JSON.stringify(legacyBuildBaziNatalComponents(pillars)));
        expect(JSON.stringify(pillars)).toBe(before);
        checked++;
      }
    }
  }
  expect(checked).toBe(2400);
});

test('existing golden, civil and true-solar boundary pillars preserve defaults and explicit options', () => {
  const fixtures: BaziPillars[] = [
    { year: '丙寅', month: '癸巳', day: '癸酉', time: '丙辰' },
    { year: '乙亥', month: '癸未', day: '戊申', time: '癸亥' },
    { year: '丙午', month: '庚寅', day: '庚申', time: '壬午' },
    { year: '丙午', month: '庚寅', day: '庚申', time: '癸未' },
  ];
  const options = {
    convention: {
      calendar: 'gregorian', timezone: 'Asia/Taipei', dayBoundary: 'late',
      trueSolarTime: true, library: 'lunar-javascript@1.7.7',
    },
    elementsLimitation: 'Existing explicit limitation.',
  };
  for (const pillars of fixtures) {
    const before = JSON.stringify({ pillars, options });
    expect(JSON.stringify(buildBaziNatalComponents(pillars)))
      .toBe(JSON.stringify(legacyBuildBaziNatalComponents(pillars)));
    expect(JSON.stringify(buildBaziNatalComponents(pillars, options)))
      .toBe(JSON.stringify(legacyBuildBaziNatalComponents(pillars, options)));
    expect(JSON.stringify({ pillars, options })).toBe(before);
  }
});

test('public string-pillar malformed inputs retain legacy output or exact errors', () => {
  const capture = (calculate: typeof buildBaziNatalComponents, pillars: BaziPillars) => {
    try { return { value: JSON.stringify(calculate(pillars)) }; }
    catch (error) {
      if (!(error instanceof Error)) throw error;
      return { error: { name: error.name, message: error.message } };
    }
  };
  let checked = 0;
  for (const position of ['year', 'month', 'day', 'time'] as const) {
    for (const malformed of ['X子', 'X', '', '甲', '甲X', 'X丑', '子甲', '甲子extra', '乙子', '𠀀子']) {
      const pillars: BaziPillars = {
        year: '甲子', month: '乙丑', day: '丙寅', time: '丁卯', [position]: malformed,
      };
      const before = JSON.stringify(pillars);
      expect(capture(buildBaziNatalComponents, pillars))
        .toEqual(capture(legacyBuildBaziNatalComponents, pillars));
      expect(JSON.stringify(pillars)).toBe(before);
      checked++;
    }
  }
  const unknown = { year: 'X', month: 'X', day: 'X', time: 'X' };
  expect(capture(buildBaziNatalComponents, unknown))
    .toEqual(capture(legacyBuildBaziNatalComponents, unknown));
  expect(checked).toBe(40);
});
