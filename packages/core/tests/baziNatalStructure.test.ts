import { afterEach, describe, expect, test, vi } from 'vitest';
// Native ESM namespaces are immutable; auto-spies preserve real implementations.
vi.mock('../src/calculators/bazi/pillars', { spy: true });
import { LunarUtil } from 'lunar-javascript';
import { createBaziNatalBasisProvider } from '../src/calculators/bazi/natalBasis';
import * as pillarsModule from '../src/calculators/bazi/pillars';
import { resolveCalculationSpec } from '../src/core/calculationSpec';
import { createTimeContext } from '../src/time/createTimeContext';
import type { AnalyzeInput } from '../src/core/analyze';
import { canonicalStringify } from '../src/portable/canonical';
import { BRANCHES, STEMS, STEM_ELEMENT, BRANCH_ELEMENT, type Element } from '../src/rules/bazi/relations';
import { buildBaziNatalStructure, type BaziPillarStrings } from '../src/rules/bazi/structure';
import * as publicCore from '../src/index';

const originalPillars = await vi.importActual<typeof import('../src/calculators/bazi/pillars')>('../src/calculators/bazi/pillars');

// Expected 透干／通根 values below are hand-written from the standard textbook
// hidden-stem table (子癸；丑己癸辛；卯乙；午丁己；酉辛), chosen to avoid branches whose
// 中氣／餘氣 order differs between sources (寅巳申). External-source citation for
// these fixtures is still pending (#64 acceptance item 4); they are not program output.

const restorers: Array<{ mockRestore(): void }> = [];
afterEach(() => { for (const spy of restorers.splice(0)) spy.mockRestore(); });

function elementCounts(p: BaziPillarStrings): Record<Element, number> {
  const out: Record<Element, number> = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  for (const gz of Object.values(p)) {
    out[STEM_ELEMENT[gz[0] as (typeof STEMS)[number]]]++;
    out[BRANCH_ELEMENT[gz[1] as (typeof BRANCHES)[number]]]++;
  }
  return out;
}

const CHART_A: BaziPillarStrings = { year: '甲子', month: '乙卯', day: '丙午', hour: '丁酉' };
const CHART_B: BaziPillarStrings = { year: '乙卯', month: '甲子', day: '丁酉', hour: '丙午' };
const GUARD: BaziPillarStrings = { year: '甲子', month: '己丑', day: '丙午', hour: '辛卯' };

describe('bazi natal structure facts (#64, internal)', () => {
  test('contrast: same element counts, different 月令／透干／通根 give different structures', () => {
    expect(elementCounts(CHART_A)).toEqual(elementCounts(CHART_B));
    const a = buildBaziNatalStructure(CHART_A);
    const b = buildBaziNatalStructure(CHART_B);

    expect(a.monthBranch).toEqual({ branch: '卯', hiddenStems: [{ stem: '乙', role: 'main' }] });
    expect(b.monthBranch).toEqual({ branch: '子', hiddenStems: [{ stem: '癸', role: 'main' }] });

    expect(a.revealed).toEqual([
      { stem: '乙', stemPosition: 'month', branch: '卯', branchPosition: 'month', role: 'main' },
      { stem: '丁', stemPosition: 'hour', branch: '午', branchPosition: 'day', role: 'main' },
    ]);
    expect(b.revealed).toEqual([
      { stem: '乙', stemPosition: 'year', branch: '卯', branchPosition: 'year', role: 'main' },
      { stem: '丁', stemPosition: 'day', branch: '午', branchPosition: 'hour', role: 'main' },
    ]);

    const rootKey = (s: typeof a) => s.roots.map(r => `${r.stemPosition}:${r.stem}<-${r.branchPosition}:${r.branch}/${r.hiddenStem}/${r.role}`);
    expect(rootKey(a)).toEqual([
      'year:甲<-month:卯/乙/main',
      'month:乙<-month:卯/乙/main',
      'day:丙<-day:午/丁/main',
      'hour:丁<-day:午/丁/main',
    ]);
    expect(rootKey(b)).toEqual([
      'year:乙<-year:卯/乙/main',
      'month:甲<-year:卯/乙/main',
      'day:丁<-hour:午/丁/main',
      'hour:丙<-hour:午/丁/main',
    ]);
    expect(a.dayMaster).toBe('丙');
    expect(b.dayMaster).toBe('丁');
    expect(canonicalStringify(a)).not.toBe(canonicalStringify(b));
  });

  test('multi-source 透干 with 中氣／餘氣 roles, and roots carry no strength grading', () => {
    const s = buildBaziNatalStructure(GUARD);
    expect(s.monthBranch.hiddenStems).toEqual([
      { stem: '己', role: 'main' }, { stem: '癸', role: 'middle' }, { stem: '辛', role: 'residual' },
    ]);
    expect(s.revealed).toEqual([
      { stem: '己', stemPosition: 'month', branch: '丑', branchPosition: 'month', role: 'main' },
      { stem: '己', stemPosition: 'month', branch: '午', branchPosition: 'day', role: 'middle' },
      { stem: '辛', stemPosition: 'hour', branch: '丑', branchPosition: 'month', role: 'residual' },
    ]);
    // 甲 has a 木 root only in 卯 (hour); 丙 only in 午's 丁 (day).
    expect(s.roots.filter(r => r.stem === '甲').map(r => [r.branchPosition, r.hiddenStem, r.role])).toEqual([['hour', '乙', 'main']]);
    expect(s.roots.filter(r => r.stem === '丙').map(r => [r.branchPosition, r.hiddenStem, r.role])).toEqual([['day', '丁', 'main']]);
    for (const r of s.roots) {
      expect(Object.keys(r).sort()).toEqual(['branch', 'branchPosition', 'element', 'hiddenStem', 'role', 'stem', 'stemPosition']);
    }
    expect(s.adjacency).toEqual([
      { a: 'year', b: 'month', adjacent: true },
      { a: 'year', b: 'day', adjacent: false },
      { a: 'year', b: 'hour', adjacent: false },
      { a: 'month', b: 'day', adjacent: true },
      { a: 'month', b: 'hour', adjacent: false },
      { a: 'day', b: 'hour', adjacent: true },
    ]);
  });

  test('no-化 guard: 合 relations are never reported as transformed', () => {
    const s = buildBaziNatalStructure(GUARD);
    const combines = s.relations.filter(r => r.relation === 'stemCombine');
    // 甲己合, 丙辛合 (hand-checked).
    expect(combines.map(r => r.members.map(m => m.char).join(''))).toEqual(expect.arrayContaining(['甲己', '丙辛']));
    expect(s.relations.some(r => r.relation === 'branchHarmony')).toBe(true); // 子丑合
    expect(s.relations.length).toBeGreaterThan(0);
    for (const r of s.relations) {
      expect(r.transformation).toBe('not_evaluated');
      expect(Object.keys(r).filter(k => /transform|化/i.test(k))).toEqual(['transformation']);
    }
    expect(JSON.stringify(s)).not.toMatch(/"transformed"|"transformedElement"|"evaluated"/);
  });

  test('hidden stems match lunar-javascript LunarUtil.ZHI_HIDE_GAN (parity, not an independent source)', () => {
    for (const branch of BRANCHES) {
      const stem = STEMS[BRANCHES.indexOf(branch) % 2];
      const s = buildBaziNatalStructure({ year: '甲子', month: stem + branch, day: '甲子', hour: '甲子' });
      expect(s.monthBranch.hiddenStems.map(h => h.stem)).toEqual(LunarUtil.ZHI_HIDE_GAN[branch]);
    }
  });

  test('deterministic, frozen, and invalid pillars are rejected', () => {
    const first = buildBaziNatalStructure(CHART_A);
    const second = buildBaziNatalStructure({ ...CHART_A });
    expect(second).toEqual(first);
    expect(canonicalStringify(second)).toBe(canonicalStringify(first));
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.roots[0])).toBe(true);
    expect(() => buildBaziNatalStructure({ ...CHART_A, day: '甲丑' })).toThrow();
  });

  test('natalBasis exposes a lazy, memoised, non-enumerable structure; pillar failures are not cached', () => {
    const input: AnalyzeInput = {
      year: 1990, month: 5, day: 17, hour: 23, minute: 10, gender: 'female', name: 'ALICE',
      birthplace: { label: 'Synthetic birthplace', lat: 22.9999, lng: 119.2269, timezone: 'Asia/Taipei' },
    };
    const spec = resolveCalculationSpec(input);
    const ctx = createTimeContext(spec.profile, { dstOverlap: spec.spec.identity.settings.time.dstOverlap });
    const spy = vi.spyOn(pillarsModule, 'computePillars');
    restorers.push(spy);
    let attempts = 0;
    spy.mockImplementation((...args: Parameters<typeof originalPillars.computePillars>) => {
      if (++attempts === 1) throw new Error('synthetic pillars failure');
      return originalPillars.computePillars(...args);
    });

    const basis = createBaziNatalBasisProvider(ctx, spec.options)(ctx, spec.options);
    expect(attempts).toBe(0);
    expect(() => basis.structure).toThrow('synthetic pillars failure');
    const structure = basis.structure;
    expect(basis.structure).toBe(structure);
    expect(attempts).toBe(2);
    expect(structure).toEqual(buildBaziNatalStructure(basis.pillars.pillars));
    expect(Object.keys(basis)).toEqual(['pillars', 'luckCycles']);
    expect(JSON.stringify(basis)).not.toContain('natalStructure');
    expect(publicCore).not.toHaveProperty('buildBaziNatalStructure');
  });
});
