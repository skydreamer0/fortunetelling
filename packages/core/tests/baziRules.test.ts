import { describe, expect, test } from 'bun:test';
import {
  BRANCHES,
  BRANCH_BREAKS,
  BRANCH_CLASHES,
  BRANCH_HARMONIES,
  BRANCH_HARMS,
  STEMS,
  STEM_COMBINATIONS,
  branchHarmony,
  branchesBreak,
  branchesClash,
  branchesHarm,
  findBranchBreaks,
  findBranchClashes,
  findBranchDirectionals,
  findBranchHarmonies,
  findBranchHarms,
  findBranchPunishments,
  findBranchTrines,
  findStemCombines,
  findStemControls,
  findStemProductions,
  parseGanZhi,
  stemCombine,
  stemControls,
  stemProduces,
  stemsClash,
  type Branch,
  type Placed,
  type Stem,
} from '../src/rules/bazi/relations';
import { fromBaziComponents, type BaziRuleChart } from '../src/rules/bazi/chart';
import { BAZI_CATALOG, BAZI_RULES } from '../src/rules/bazi/rules';
import { evaluateBaziRules } from '../src/rules/bazi/evaluate';
import { createSignal } from '../src/signals/createSignal';
import { signalId } from '../src/signals/signalId';
import { DOMAINS, GRAINS, TRAITS, type Signal, type SignalWindow } from '../src/signals/types';
import { createEngines } from '../src/index.js';
import { BirthData } from '../src/core/models/BirthData.js';

const b = (...chars: Branch[]): Placed<Branch>[] => chars.map((char, i) => ({ key: `p${i}`, char }));
const s = (...chars: Stem[]): Placed<Stem>[] => chars.map((char, i) => ({ key: `p${i}`, char }));

const YEAR_2026: SignalWindow = { grain: 'year', start: '2026-01-01', end: '2026-12-31' };
const NATAL_W: SignalWindow = { grain: 'natal', start: '1991-10-05', end: '1991-10-05' };

function chartOf(partial: Partial<BaziRuleChart> & { pillars: BaziRuleChart['pillars'] }): BaziRuleChart {
  return { luckCycles: [], ...partial };
}

/** Count of unordered branch pairs matching a predicate. */
function countBranchPairs(pred: (a: Branch, b: Branch) => boolean): number {
  let n = 0;
  for (let i = 0; i < BRANCHES.length; i++) {
    for (let j = i + 1; j < BRANCHES.length; j++) if (pred(BRANCHES[i], BRANCHES[j])) n++;
  }
  return n;
}

// ─── relation tables ─────────────────────────────────────────────────────────

describe('天干五合', () => {
  const expected: [Stem, Stem, string][] = [['甲', '己', '土'], ['乙', '庚', '金'], ['丙', '辛', '水'], ['丁', '壬', '木'], ['戊', '癸', '火']];
  for (const [a, c, el] of expected) {
    test(`${a}${c} 合${el}`, () => {
      expect(stemCombine(a, c)).toBe(el as any);
      expect(stemCombine(c, a)).toBe(el as any);
      const hits = findStemCombines(s(c, a));
      expect(hits).toHaveLength(1);
      expect(hits[0].element).toBe(el as any);
      expect(hits[0].members.map((m) => m.char)).toEqual([a, c]);
    });
  }
  test('negative: 甲乙, 甲庚, 甲甲 do not combine; exactly 5 pairs exist', () => {
    expect(stemCombine('甲', '乙')).toBeNull();
    expect(stemCombine('甲', '庚')).toBeNull();
    expect(findStemCombines(s('甲', '甲'))).toEqual([]);
    let n = 0;
    for (const x of STEMS) for (const y of STEMS) if (x < y && stemCombine(x, y)) n++;
    expect(n).toBe(5);
    expect(STEM_COMBINATIONS).toHaveLength(5);
  });
});

describe('天干生剋／相沖', () => {
  test('相剋 follows 五行 and is directed', () => {
    expect(stemControls('甲', '戊')).toBe(true);
    expect(stemControls('戊', '甲')).toBe(false);
    expect(stemControls('庚', '乙')).toBe(true);
    expect(stemControls('甲', '乙')).toBe(false);
    const hits = findStemControls(s('戊', '甲'));
    expect(hits).toHaveLength(1);
    expect(hits[0].members.map((m) => m.char)).toEqual(['甲', '戊']);
    expect(findStemControls(s('甲', '丙'))).toEqual([]);
  });
  test('相生 follows 五行 and is directed', () => {
    expect(stemProduces('甲', '丙')).toBe(true);
    expect(stemProduces('丙', '甲')).toBe(false);
    expect(stemProduces('壬', '乙')).toBe(true);
    const hits = findStemProductions(s('丁', '乙'));
    expect(hits[0].members.map((m) => m.char)).toEqual(['乙', '丁']);
    expect(findStemProductions(s('甲', '庚'))).toEqual([]);
  });
  test('天干四沖; 戊己 have no clash', () => {
    for (const [x, y] of [['甲', '庚'], ['乙', '辛'], ['丙', '壬'], ['丁', '癸']] as [Stem, Stem][]) {
      expect(stemsClash(x, y)).toBe(true);
      expect(stemsClash(y, x)).toBe(true);
    }
    for (const x of STEMS) {
      expect(stemsClash('戊', x)).toBe(false);
      expect(stemsClash('己', x)).toBe(false);
    }
  });
});

describe('地支六合', () => {
  for (const e of BRANCH_HARMONIES) {
    test(`${e.pair.join('')} 合${e.element}`, () => {
      expect(branchHarmony(e.pair[0], e.pair[1])).toBe(e.element as any);
      expect(findBranchHarmonies(b(e.pair[1], e.pair[0]))[0].element).toBe(e.element as any);
    });
  }
  test('negative & count', () => {
    expect(branchHarmony('子', '寅')).toBeNull();
    expect(findBranchHarmonies(b('子', '午'))).toEqual([]);
    expect(countBranchPairs((x, y) => branchHarmony(x, y) !== null)).toBe(6);
  });
});

describe('地支六沖', () => {
  const pairs: [Branch, Branch][] = [['子', '午'], ['丑', '未'], ['寅', '申'], ['卯', '酉'], ['辰', '戌'], ['巳', '亥']];
  for (const [x, y] of pairs) {
    test(`${x}${y} 沖`, () => {
      expect(branchesClash(x, y)).toBe(true);
      expect(branchesClash(y, x)).toBe(true);
      expect(findBranchClashes(b(y, x))).toHaveLength(1);
    });
  }
  test('negative: only those 6 pairs clash', () => {
    expect(branchesClash('子', '丑')).toBe(false);
    expect(branchesClash('子', '子')).toBe(false);
    expect(countBranchPairs(branchesClash)).toBe(6);
    expect(BRANCH_CLASHES).toHaveLength(6);
  });
});

describe('地支三合', () => {
  test('full trines are complete with element', () => {
    for (const [set, el] of [[['申', '子', '辰'], '水'], [['亥', '卯', '未'], '木'], [['寅', '午', '戌'], '火'], [['巳', '酉', '丑'], '金']] as [Branch[], string][]) {
      const hits = findBranchTrines(b(set[2], set[0], set[1]));
      expect(hits).toHaveLength(1); // halves subsumed
      expect(hits[0].complete).toBe(true);
      expect(hits[0].element).toBe(el as any);
      expect(hits[0].members.map((m) => m.char)).toEqual(set);
    }
  });
  test('半合 flagged incomplete; 拱合 (no 旺支) not counted', () => {
    const half = findBranchTrines(b('申', '子'));
    expect(half).toHaveLength(1);
    expect(half[0].complete).toBe(false);
    expect(half[0].label).toBe('半合水局');
    expect(findBranchTrines(b('子', '辰'))[0].complete).toBe(false);
    expect(findBranchTrines(b('申', '辰'))).toEqual([]);
    expect(findBranchTrines(b('子', '午'))).toEqual([]);
  });
});

describe('地支三會', () => {
  test('positive: all four directional sets', () => {
    for (const set of [['寅', '卯', '辰'], ['巳', '午', '未'], ['申', '酉', '戌'], ['亥', '子', '丑']] as Branch[][]) {
      const hits = findBranchDirectionals(b(...set));
      expect(hits).toHaveLength(1);
      expect(hits[0].complete).toBe(true);
    }
  });
  test('negative: two of three does not form 三會', () => {
    expect(findBranchDirectionals(b('寅', '卯'))).toEqual([]);
    expect(findBranchDirectionals(b('寅', '卯', '巳'))).toEqual([]);
  });
});

describe('地支刑', () => {
  test('三刑 full sets', () => {
    for (const set of [['寅', '巳', '申'], ['丑', '戌', '未']] as Branch[][]) {
      const hits = findBranchPunishments(b(...set));
      expect(hits).toHaveLength(1);
      expect(hits[0].complete).toBe(true);
      expect(hits[0].members).toHaveLength(3);
    }
  });
  test('三刑 partial (two of three) is flagged incomplete', () => {
    const hits = findBranchPunishments(b('寅', '巳'));
    expect(hits).toHaveLength(1);
    expect(hits[0].complete).toBe(false);
    expect(findBranchPunishments(b('丑', '未'))[0].complete).toBe(false);
  });
  test('子卯相刑', () => {
    const hits = findBranchPunishments(b('卯', '子'));
    expect(hits).toHaveLength(1);
    expect(hits[0].variant).toBe('mutual');
    expect(hits[0].complete).toBe(true);
  });
  test('自刑 needs two same branches of 辰午酉亥', () => {
    for (const x of ['辰', '午', '酉', '亥'] as Branch[]) {
      const hits = findBranchPunishments(b(x, x));
      expect(hits).toHaveLength(1);
      expect(hits[0].variant).toBe('self');
      expect(findBranchPunishments(b(x))).toEqual([]);
    }
    expect(findBranchPunishments(b('子', '子'))).toEqual([]);
    expect(findBranchPunishments(b('寅', '寅'))).toEqual([]);
  });
  test('negative', () => {
    expect(findBranchPunishments(b('子', '午'))).toEqual([]);
  });
});

describe('地支害／破', () => {
  test('六害 all six and only six', () => {
    for (const e of BRANCH_HARMS) {
      expect(branchesHarm(e.pair[1], e.pair[0])).toBe(true);
      expect(findBranchHarms(b(...e.pair))).toHaveLength(1);
    }
    expect(branchesHarm('子', '丑')).toBe(false);
    expect(countBranchPairs(branchesHarm)).toBe(6);
  });
  test('六破 all six and only six', () => {
    for (const e of BRANCH_BREAKS) {
      expect(branchesBreak(e.pair[1], e.pair[0])).toBe(true);
      expect(findBranchBreaks(b(...e.pair))).toHaveLength(1);
    }
    expect(branchesBreak('子', '午')).toBe(false);
    expect(countBranchPairs(branchesBreak)).toBe(6);
  });
});

describe('parseGanZhi', () => {
  test('valid / invalid', () => {
    expect(parseGanZhi('甲子')).toEqual({ stem: '甲', branch: '子' });
    expect(() => parseGanZhi('甲丑')).toThrow(/60 甲子/);
    expect(() => parseGanZhi('甲')).toThrow();
    expect(() => parseGanZhi('子甲')).toThrow();
  });
  test('finders reject duplicate position keys', () => {
    expect(() => findBranchClashes([{ key: 'a', char: '子' }, { key: 'a', char: '午' }])).toThrow(/duplicate/);
  });
});

// ─── golden rule cases ───────────────────────────────────────────────────────

const byRule = (sigs: Signal[], id: string) => sigs.filter((x) => x.ruleId === id);

describe('golden: 伏吟／反吟／歲運並臨', () => {
  const base = { year: '庚辰', month: '戊子', day: '丙午', hour: '甲子' };

  test('伏吟: 流年 == 日柱', () => {
    const chart = chartOf({ pillars: base, annual: { year: 2026, ganZhi: '丙午' } });
    const sigs = byRule(evaluateBaziRules(chart, YEAR_2026), 'bazi.pillar.fuyin');
    expect(sigs.length).toBeGreaterThan(0);
    expect(new Set(sigs.map((x) => x.target))).toEqual(new Set(['year×natal.day']));
    expect(sigs[0].evidence.text).toBe('流年丙午 與 日柱丙午 伏吟');
    expect(sigs[0].evidence.componentIds).toEqual(['liuNian', 'natal']);
    expect(new Set(sigs.map((x) => x.domain))).toEqual(new Set(['self', 'relationship']));
  });

  test('伏吟 negative: same branch only', () => {
    const chart = chartOf({ pillars: base, annual: { year: 2014, ganZhi: '甲午' } });
    expect(byRule(evaluateBaziRules(chart, { grain: 'year', start: '2014-01-01', end: '2014-12-31' }), 'bazi.pillar.fuyin')).toEqual([]);
  });

  test('伏吟 in decade scope: 大運 == 月柱', () => {
    const chart = chartOf({ pillars: base, luckCycles: [{ index: 3, ganZhi: '戊子', start: '2020-01-01', end: '2029-12-31' }] });
    const sigs = byRule(evaluateBaziRules(chart, { grain: 'decade', start: '2020-01-01', end: '2029-12-31' }), 'bazi.pillar.fuyin');
    expect(sigs.map((x) => x.target)).toContain('decade×natal.month');
    expect(sigs[0].evidence.componentIds).toEqual(['daYun_3', 'natal']);
  });

  test('反吟: 天沖地沖 with 日柱', () => {
    const chart = chartOf({ pillars: { year: '己丑', month: '丙寅', day: '甲子', hour: '乙亥' }, annual: { year: 2026, ganZhi: '庚午' } });
    const sigs = evaluateBaziRules(chart, YEAR_2026);
    const fan = byRule(sigs, 'bazi.pillar.fanyin');
    expect(new Set(fan.map((x) => x.target))).toEqual(new Set(['year×natal.day']));
    expect(fan[0].evidence.text).toBe('流年庚午 與 日柱甲子 反吟');
    const clash = byRule(sigs, 'bazi.branch.clash');
    expect(clash.find((x) => x.target === 'year×natal.day')?.evidence.text).toBe('流年午 與 日支子 六沖');
  });

  test('反吟 negative: branch clash without stem clash (戊 has no stem clash)', () => {
    const chart = chartOf({ pillars: { year: '己丑', month: '丙寅', day: '戊子', hour: '乙亥' }, annual: { year: 2026, ganZhi: '壬午' } });
    const sigs = evaluateBaziRules(chart, YEAR_2026);
    expect(byRule(sigs, 'bazi.pillar.fanyin')).toEqual([]);
    expect(byRule(sigs, 'bazi.branch.clash').map((x) => x.target)).toContain('year×natal.day');
  });

  test('原局反吟 in natal scope', () => {
    const chart = chartOf({ pillars: { year: '甲子', month: '庚午', day: '丙寅', hour: null } });
    const fan = byRule(evaluateBaziRules(chart, NATAL_W), 'bazi.pillar.fanyin');
    expect(new Set(fan.map((x) => x.target))).toEqual(new Set(['natal.year×natal.month']));
  });

  test('歲運並臨: 流年 == 當行大運', () => {
    const chart = chartOf({
      pillars: base,
      annual: { year: 2026, ganZhi: '丙午' },
      luckCycles: [
        { index: 2, ganZhi: '乙巳', start: '2012-01-01', end: '2021-12-31' },
        { index: 3, ganZhi: '丙午', start: '2022-01-01', end: '2031-12-31' },
      ],
    });
    const sigs = byRule(evaluateBaziRules(chart, YEAR_2026), 'bazi.suiyun.binglin');
    expect(sigs.length).toBeGreaterThan(0);
    expect(new Set(sigs.map((x) => x.target))).toEqual(new Set(['year×decade']));
    expect(sigs.every((x) => x.domain === 'self')).toBe(true);
    expect(sigs[0].evidence.text).toBe('流年丙午 與 大運丙午 歲運並臨');
    expect(sigs[0].evidence.componentIds).toEqual(['liuNian', 'daYun_3']);
  });

  test('歲運並臨 negative: different luck cycle is current', () => {
    const chart = chartOf({
      pillars: base,
      annual: { year: 2026, ganZhi: '丙午' },
      luckCycles: [{ index: 3, ganZhi: '丁未', start: '2022-01-01', end: '2031-12-31' }],
    });
    expect(byRule(evaluateBaziRules(chart, YEAR_2026), 'bazi.suiyun.binglin')).toEqual([]);
    // not evaluated outside year scope
    expect(BAZI_RULES.filter((r) => r.id === 'bazi.suiyun.binglin').map((r) => r.scope)).toEqual(['year']);
  });

  test('annual outside the window yields nothing', () => {
    const chart = chartOf({ pillars: base, annual: { year: 2025, ganZhi: '乙巳' } });
    expect(evaluateBaziRules(chart, YEAR_2026)).toEqual([]);
  });

  test('三合 across 流年 + 原局 (full) and partial modifier', () => {
    const chart = chartOf({ pillars: { year: '甲申', month: '丙子', day: '戊寅', hour: null }, annual: { year: 2024, ganZhi: '甲辰' } });
    const w: SignalWindow = { grain: 'year', start: '2024-01-01', end: '2024-12-31' };
    const trine = byRule(evaluateBaziRules(chart, w), 'bazi.branch.trine');
    expect(new Set(trine.map((x) => x.target))).toEqual(new Set(['year×natal.year+natal.month']));
    expect(trine.every((x) => x.evidence.modifiers.length === 0)).toBe(true);
    expect(trine[0].evidence.text).toBe('流年辰、年支申、月支子 三合水局');

    const half = byRule(evaluateBaziRules(chartOf({ pillars: { year: '甲申', month: null, day: null, hour: null }, annual: { year: 2024, ganZhi: '甲辰' } }), w), 'bazi.branch.trine');
    expect(half).toEqual([]); // 申辰 拱合 not counted
    const half2 = byRule(evaluateBaziRules(chartOf({ pillars: { year: '丙子', month: null, day: null, hour: null }, annual: { year: 2024, ganZhi: '甲辰' } }), w), 'bazi.branch.trine');
    expect(half2.length).toBeGreaterThan(0);
    expect(half2[0].evidence.modifiers.map((m) => m.id)).toEqual(['bazi.branch.trine.partial']);
    const catalogConnection = BAZI_CATALOG.rules.find((r) => r.id === 'bazi.branch.trine')!.emits.find((e) => e.position === 'natal.year.branch' && e.trait === 'connection')!;
    expect(half2.find((x) => x.trait === 'connection')!.intensity).toBeCloseTo(catalogConnection.intensity * 0.6, 10);
  });

  test('month scope uses monthly entries overlapping the window', () => {
    const chart = chartOf({
      pillars: base,
      monthly: [
        { start: '2026-07-07', end: '2026-08-06', ganZhi: '乙未' },
        { start: '2026-06-05', end: '2026-07-06', ganZhi: '甲午' },
      ],
    });
    const sigs = evaluateBaziRules(chart, { grain: 'month', start: '2026-06-05', end: '2026-07-06' });
    const clash = byRule(sigs, 'bazi.branch.clash');
    expect(new Set(clash.map((x) => x.target))).toEqual(new Set(['month×natal.month', 'month×natal.hour']));
    expect(clash[0].evidence.text.startsWith('流月午')).toBe(true);
    expect(evaluateBaziRules(chart, { grain: 'month', start: '2027-01-01', end: '2027-01-31' })).toEqual([]);
  });
});

// ─── real engine output ──────────────────────────────────────────────────────

describe('real BaZiEngine output: 1991-10-05 14:00 female, asOf 2026-07-11', () => {
  const engine = createEngines({ asOf: '2026-07-11' }).find((e: any) => e.id === 'bazi');
  const result = engine.run(new BirthData({ year: 1991, month: 10, day: 5, hour: 14, minute: 0, gender: 'female' }));
  const componentIds = new Set(result.components.map((c: any) => c.id));
  const chart = fromBaziComponents(result);

  test('adapter builds the chart', () => {
    expect(chart.pillars).toEqual({ year: '辛未', month: '丁酉', day: '戊申', hour: '己未' });
    expect(chart.luckCycles).toHaveLength(10);
    expect(chart.luckCycles[3]).toEqual({ index: 4, ganZhi: '辛丑', start: '2022-01-01', end: '2031-12-31', componentId: 'daYun_4' });
    expect(chart.annual).toEqual({ year: 2026, ganZhi: '丙午', componentId: 'liuNian' });
  });

  const windows: SignalWindow[] = [
    NATAL_W,
    { grain: 'decade', start: '2022-01-01', end: '2031-12-31' },
    YEAR_2026,
    { grain: 'month', start: '2026-07-01', end: '2026-07-31' },
  ];
  for (const w of windows) {
    test(`${w.grain}: every signal validates and componentIds exist`, () => {
      const sigs = evaluateBaziRules(chart, w);
      if (w.grain !== 'month') expect(sigs.length).toBeGreaterThan(0);
      for (const sig of sigs) {
        const again = createSignal({
          system: sig.system, ruleId: sig.ruleId, ruleVersion: sig.ruleVersion, domain: sig.domain, trait: sig.trait,
          intensity: sig.intensity, valence: sig.valence, window: sig.window, target: sig.target, evidence: sig.evidence,
        });
        expect(again).toEqual(sig);
        expect(sig.id).toBe(signalId({ ...sig }));
        expect(sig.evidence.componentIds.length).toBeGreaterThan(0);
        for (const id of sig.evidence.componentIds) expect(componentIds.has(id)).toBe(true);
        expect(sig.evidence.text.length).toBeGreaterThan(0);
      }
      expect(new Set(sigs.map((x) => x.id)).size).toBe(sigs.length);
    });
  }

  test('known hits for this chart', () => {
    const dec = evaluateBaziRules(chart, windows[1]);
    expect(dec.some((x) => x.ruleId === 'bazi.branch.clash' && x.target === 'decade×natal.year')).toBe(true); // 丑未沖
    const yr = evaluateBaziRules(chart, YEAR_2026);
    expect(yr.some((x) => x.ruleId === 'bazi.stem.combine' && x.target === 'year×natal.year')).toBe(true); // 丙辛合
    expect(yr.some((x) => x.ruleId === 'bazi.branch.harm' && x.target === 'year×decade')).toBe(true); // 午丑害
  });

  test('unknown-time result (no components) yields no signals', () => {
    const empty = fromBaziComponents([]);
    for (const w of windows) expect(evaluateBaziRules(empty, w)).toEqual([]);
  });

  test('determinism: same input twice, luck-cycle order irrelevant', () => {
    for (const w of windows) {
      const a = JSON.stringify(evaluateBaziRules(chart, w));
      const b2 = JSON.stringify(evaluateBaziRules(fromBaziComponents(result), w));
      const shuffled = { ...chart, luckCycles: [...chart.luckCycles].reverse() };
      const c = JSON.stringify(evaluateBaziRules(shuffled, w));
      const reordered = fromBaziComponents([...result.components].reverse());
      const d = JSON.stringify(evaluateBaziRules(reordered, w));
      expect(b2).toBe(a);
      expect(c).toBe(a);
      expect(d).toBe(a);
    }
  });
});

// ─── catalog ↔ code ──────────────────────────────────────────────────────────

describe('catalog.json consistency', () => {
  const catalogIds = BAZI_CATALOG.rules.map((r) => r.id);
  const codeIds = [...new Set(BAZI_RULES.map((r) => r.id))];

  test('rule ids match both ways, unique in catalog', () => {
    expect(new Set(catalogIds).size).toBe(catalogIds.length);
    expect([...codeIds].sort()).toEqual([...catalogIds].sort());
    for (const id of [
      'bazi.stem.combine', 'bazi.stem.control', 'bazi.stem.produce', 'bazi.branch.clash', 'bazi.branch.harmony',
      'bazi.branch.trine', 'bazi.branch.directional', 'bazi.branch.punishment', 'bazi.branch.harm',
      'bazi.branch.break', 'bazi.pillar.fuyin', 'bazi.pillar.fanyin', 'bazi.suiyun.binglin',
    ]) expect(catalogIds).toContain(id);
  });

  test('scopes: code rules are exactly catalog id × scope', () => {
    const fromCatalog = BAZI_CATALOG.rules.flatMap((r) => r.scopes.map((sc) => `${r.id}@${sc}`)).sort();
    expect(BAZI_RULES.map((r) => `${r.id}@${r.scope}`).sort()).toEqual(fromCatalog);
    for (const r of BAZI_RULES) {
      expect(GRAINS).toContain(r.scope);
      expect(r.system).toBe('bazi');
    }
  });

  test('entries are complete; emits use valid domains/traits/positions and ranges', () => {
    for (const r of BAZI_CATALOG.rules) {
      expect(r.version).toBe(1);
      for (const k of ['name', 'label', 'description', 'source'] as const) expect(r[k].length).toBeGreaterThan(0);
      expect(r.scopes.length).toBeGreaterThan(0);
      expect(r.emits.length).toBeGreaterThan(0);
      for (const e of r.emits) {
        expect(DOMAINS).toContain(e.domain);
        expect(TRAITS).toContain(e.trait);
        expect(e.intensity).toBeGreaterThanOrEqual(0);
        expect(e.intensity).toBeLessThanOrEqual(1);
        expect(e.valence).toBeGreaterThanOrEqual(-1);
        expect(e.valence).toBeLessThanOrEqual(1);
        const pd = BAZI_CATALOG.positionDomains[e.position];
        expect(pd).toBeDefined();
        expect(pd.map((x) => x.domain)).toContain(e.domain);
      }
      const partial = r.modifiers?.partial;
      if (partial) {
        expect(partial.factor).toBeGreaterThan(0);
        expect(partial.factor).toBeLessThanOrEqual(1);
      }
    }
    for (const list of Object.values(BAZI_CATALOG.positionDomains)) {
      for (const x of list) expect(DOMAINS).toContain(x.domain);
    }
  });

  test('Rule.emits mirror the catalog templates', () => {
    for (const rule of BAZI_RULES) {
      const entry = BAZI_CATALOG.rules.find((r) => r.id === rule.id)!;
      const keys = new Set(entry.emits.map((e) => `${e.domain}|${e.trait}`));
      expect(new Set(rule.emits.map((e) => `${e.domain}|${e.trait}`))).toEqual(keys);
      expect(rule.version).toBe(entry.version);
    }
  });
});
