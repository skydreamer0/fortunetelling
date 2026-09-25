import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { LunarUtil } from 'lunar-javascript';
import { baziCalculator, toBaziRuleChart } from '../src/calculators/bazi/calculator';
import type { BaziRuleChart } from '../src/rules/bazi/chart';
import {
  BAZI_TENGOD_CATALOG,
  BAZI_TENGOD_RULES,
  LIU_YUE_COMPONENT_ID,
  evaluateBaziTenGodRules,
} from '../src/rules/bazi/evaluateTenGods';
import { BRANCHES, STEMS, STEM_ELEMENT, BRANCH_ELEMENT, type Branch, type Stem } from '../src/rules/bazi/relations';
import { activationOf, caikuOf, taohuaOf, yimaOf } from '../src/rules/bazi/shensha';
import {
  GROUP_MEMBERS,
  HIDDEN_STEMS,
  TEN_GODS,
  TEN_GOD_GROUPS,
  TEN_GOD_GROUP_OF,
  branchMainTenGod,
  branchTenGods,
  isYangStem,
  tenGodGroupOf,
  tenGodOf,
} from '../src/rules/bazi/tenGods';
import { DOMAINS, GRAINS, TRAITS, type Signal, type SignalWindow } from '../src/signals/types';
import { createTimeContext } from '../src/time/index';

const TAINAN = { label: 'Tainan, Taiwan', lat: 22.9922, lng: 120.1848, timezone: 'Asia/Taipei' };

// ─── 十神表 ───────────────────────────────────────────────────────────────────

/** Standard 十神 table: row = day master, columns = 甲乙丙丁戊己庚辛壬癸. */
const TABLE: Record<Stem, string> = {
  甲: '比肩 劫財 食神 傷官 偏財 正財 七殺 正官 偏印 正印',
  乙: '劫財 比肩 傷官 食神 正財 偏財 正官 七殺 正印 偏印',
  丙: '偏印 正印 比肩 劫財 食神 傷官 偏財 正財 七殺 正官',
  丁: '正印 偏印 劫財 比肩 傷官 食神 正財 偏財 正官 七殺',
  戊: '七殺 正官 偏印 正印 比肩 劫財 食神 傷官 偏財 正財',
  己: '正官 七殺 正印 偏印 劫財 比肩 傷官 食神 正財 偏財',
  庚: '偏財 正財 七殺 正官 偏印 正印 比肩 劫財 食神 傷官',
  辛: '正財 偏財 正官 七殺 正印 偏印 劫財 比肩 傷官 食神',
  壬: '食神 傷官 偏財 正財 七殺 正官 偏印 正印 比肩 劫財',
  癸: '傷官 食神 正財 偏財 正官 七殺 正印 偏印 劫財 比肩',
};

describe('十神', () => {
  test('all 10×10 stems match the standard table', () => {
    for (const dm of STEMS) {
      const row = TABLE[dm].split(' ');
      STEMS.forEach((s, i) => expect(`${dm}${s}:${tenGodOf(dm, s)}`).toBe(`${dm}${s}:${row[i]}`));
    }
  });

  test('structural properties', () => {
    for (const dm of STEMS) {
      expect(tenGodOf(dm, dm)).toBe('比肩');
      const seen = STEMS.map((s) => tenGodOf(dm, s));
      // every day master sees each of the ten gods exactly once
      expect([...seen].sort()).toEqual([...TEN_GODS].sort());
      for (const s of STEMS) {
        const g = tenGodOf(dm, s);
        const same = isYangStem(dm) === isYangStem(s);
        // first member of each pair ⇔ same polarity
        expect(GROUP_MEMBERS[TEN_GOD_GROUP_OF[g]][0] === g).toBe(same);
        if (STEM_ELEMENT[dm] === STEM_ELEMENT[s]) expect(tenGodGroupOf(dm, s)).toBe('比劫');
        // reciprocity: X is 我生 for Y ⇔ Y is 生我 for X; 我剋 ⇔ 剋我
        const back = tenGodGroupOf(s, dm);
        const pairs: Record<string, string> = { 比劫: '比劫', 食傷: '印星', 印星: '食傷', 財星: '官殺', 官殺: '財星' };
        expect(back).toBe(pairs[tenGodGroupOf(dm, s)] as any);
      }
    }
    expect(TEN_GOD_GROUPS.flatMap((g) => GROUP_MEMBERS[g])).toEqual([...TEN_GODS]);
  });

  test('hidden stems match lunar-javascript ZHI_HIDE_GAN; main qi shares the branch element', () => {
    for (const b of BRANCHES) {
      expect([...HIDDEN_STEMS[b]]).toEqual(LunarUtil.ZHI_HIDE_GAN[b]);
      expect(STEM_ELEMENT[HIDDEN_STEMS[b][0]]).toBe(BRANCH_ELEMENT[b]);
    }
    expect(branchTenGods('戊', '午')).toEqual([
      { stem: '丁', role: 'main', tenGod: '正印', group: '印星' },
      { stem: '己', role: 'middle', tenGod: '劫財', group: '比劫' },
    ]);
    expect(branchMainTenGod('戊', '申')).toBe('食神');
    expect(() => tenGodOf('X' as Stem, '甲')).toThrow();
  });
});

// ─── 神煞表 ───────────────────────────────────────────────────────────────────

describe('神煞 lookup tables', () => {
  const YIMA: Record<Branch, Branch> = {
    申: '寅', 子: '寅', 辰: '寅', 寅: '申', 午: '申', 戌: '申', 巳: '亥', 酉: '亥', 丑: '亥', 亥: '巳', 卯: '巳', 未: '巳',
  };
  const TAOHUA: Record<Branch, Branch> = {
    申: '酉', 子: '酉', 辰: '酉', 寅: '卯', 午: '卯', 戌: '卯', 巳: '午', 酉: '午', 丑: '午', 亥: '子', 卯: '子', 未: '子',
  };
  const CAIKU: Record<Stem, Branch> = {
    甲: '辰', 乙: '辰', 丙: '丑', 丁: '丑', 戊: '辰', 己: '辰', 庚: '未', 辛: '未', 壬: '戌', 癸: '戌',
  };

  test('驛馬 / 桃花 for all 12 branches', () => {
    for (const b of BRANCHES) {
      expect(yimaOf(b)).toBe(YIMA[b]);
      expect(taohuaOf(b)).toBe(TAOHUA[b]);
    }
  });

  test('財庫 for all 10 day masters', () => {
    for (const s of STEMS) expect(caikuOf(s)).toBe(CAIKU[s]);
  });

  test('activation precedence (丑未 both clash and punish → clash first)', () => {
    const all = ['clash', 'appear', 'punish', 'combine'] as const;
    expect(activationOf('未', '丑', all)).toBe('clash');
    expect(activationOf('戌', '丑', all)).toBe('punish');
    expect(activationOf('子', '丑', all)).toBe('combine');
    expect(activationOf('辰', '辰', all)).toBe('appear');
    expect(activationOf('午', '辰', all)).toBeNull();
    expect(activationOf('未', '丑', ['punish'])).toBe('punish');
  });
});

// ─── 1995-07-16 22:00 male Tainan (乙亥 癸未 戊申 癸亥, day master 戊) ─────────────

const result = baziCalculator.calculate(
  createTimeContext({ date: '1995-07-16', time: '22:00', timeAccuracy: 'exact', gender: 'male', birthplace: TAINAN }),
  { asOf: '2026-07-11' },
);

function chartFor(year: number): BaziRuleChart {
  return toBaziRuleChart(result, { year });
}

/** A year window strictly inside the 流年 (after 立春). */
function yearWindow(year: number): SignalWindow {
  return { grain: 'year', start: `${year}-03-01`, end: `${year}-12-31` };
}

function targets(sigs: Signal[]): string[] {
  return [...new Set(sigs.map((s) => `${s.ruleId} ${s.target}`))];
}

function domains(sigs: Signal[]): Set<string> {
  return new Set(sigs.map((s) => s.domain));
}

describe('1995 Tainan profile', () => {
  test('chart sanity', () => {
    expect(result.chart.pillars).toEqual({ year: '乙亥', month: '癸未', day: '戊申', hour: '癸亥' });
    // 驛馬: 年支亥 (亥卯未) → 巳; 日支申 (申子辰) → 寅. 桃花: 亥 → 子; 申 → 酉. 財庫: 戊 (土) 剋水 → 水墓辰.
    expect([yimaOf('亥'), yimaOf('申'), taohuaOf('亥'), taohuaOf('申'), caikuOf('戊')]).toEqual(['巳', '寅', '子', '酉', '辰']);
  });

  test('2026 丙午: 丙 = 偏印, 午 本氣丁 = 正印 → 印星 (learning/property); 午 中氣己 = 劫財 at 0.5; 午 沖 桃花子', () => {
    const sigs = evaluateBaziTenGodRules(chartFor(2026), yearWindow(2026));
    expect(targets(sigs)).toEqual([
      'bazi.shensha.taohua year×natal.taohua@年支',
      'bazi.tengod.annual year.tengod.印星',
      'bazi.tengod.annual year.tengod.比劫',
    ]);
    const learning = sigs.find((s) => s.target === 'year.tengod.印星' && s.domain === 'learning' && s.trait === 'support')!;
    expect(learning.intensity).toBe(0.45);
    expect(learning.evidence.modifiers).toEqual([]);
    expect(learning.evidence.text).toBe('流年丙午（日主戊）印星：丙（天干）偏印、丁（午本氣）正印');
    expect(learning.evidence.componentIds).toEqual(['liuNian', 'natal']);
    expect(sigs.some((s) => s.target === 'year.tengod.印星' && s.domain === 'property')).toBe(true);
    // 比劫 only via the 中氣 → scaled by the hidden-stem weight and recorded as a modifier
    const bj = sigs.find((s) => s.target === 'year.tengod.比劫' && s.domain === 'wealth' && s.trait === 'pressure')!;
    expect(bj.intensity).toBeCloseTo(0.3 * 0.5, 10);
    expect(bj.evidence.modifiers.map((m) => m.id)).toEqual(['bazi.tengod.weight.middle']);
    // 午 沖 子 (年支亥 → 桃花子), 子 not in natal → clash × natalAbsent
    const th = sigs.find((s) => s.ruleId === 'bazi.shensha.taohua' && s.trait === 'connection')!;
    expect(th.domain).toBe('relationship');
    expect(th.intensity).toBeCloseTo(0.45 * 0.7 * 0.8, 10);
    expect(th.evidence.text).toBe('流年午 沖桃花子（桃花；由年支亥起）');
  });

  test('2027 丁未: 丁 = 正印; 未 本氣己 = 劫財, 中氣丁 = 正印, 餘氣乙 = 正官 (0.3) → reaches contract', () => {
    const sigs = evaluateBaziTenGodRules(chartFor(2027), yearWindow(2027));
    expect(targets(sigs)).toEqual([
      'bazi.tengod.annual year.tengod.印星',
      'bazi.tengod.annual year.tengod.官殺',
      'bazi.tengod.annual year.tengod.比劫',
    ]);
    const contract = sigs.find((s) => s.domain === 'contract')!;
    expect(contract.target).toBe('year.tengod.官殺');
    expect(contract.intensity).toBeCloseTo(0.3 * 0.3, 10);
    // 未 is neither 驛馬 (巳/寅), 桃花 (子/酉) nor related to 財庫辰; 未 does not clash 申 or 未
    expect(sigs.some((s) => s.ruleId.startsWith('bazi.shensha') || s.ruleId === 'bazi.clash.movement')).toBe(false);
  });

  test('2028 戊申: 戊 = 比肩; 申 本氣庚 = 食神, 中氣壬 = 偏財; 申 is not 驛馬 but 沖 驛馬寅 (from 日支申) → movement', () => {
    const sigs = evaluateBaziTenGodRules(chartFor(2028), yearWindow(2028));
    // 年支亥 → 驛馬巳 (申 neither is nor clashes 巳); 日支申 → 驛馬寅, and 申 沖 寅.
    expect(targets(sigs)).toEqual([
      'bazi.shensha.yima year×natal.yima@日支',
      'bazi.tengod.annual year.tengod.比劫',
      'bazi.tengod.annual year.tengod.財星',
      'bazi.tengod.annual year.tengod.食傷',
    ]);
    const mv = sigs.find((s) => s.domain === 'movement' && s.trait === 'change')!;
    expect(mv.intensity).toBeCloseTo(0.5 * 0.8 * 0.8, 10);
    expect(mv.evidence.modifiers.map((m) => m.id)).toEqual(['bazi.shensha.yima.clash', 'bazi.shensha.yima.natalAbsent']);
    const wealth = sigs.find((s) => s.target === 'year.tengod.財星' && s.domain === 'wealth' && s.trait === 'opportunity')!;
    expect(wealth.intensity).toBeCloseTo(0.5 * 0.5, 10);
    expect(domains(sigs).has('contract')).toBe(true);
  });

  test('2030 庚戌: 戌 沖 財庫辰 → wealth/property; 2033 癸丑 沖 月支未 and 2034 甲寅 沖 日支申 → 沖動', () => {
    const s30 = evaluateBaziTenGodRules(chartFor(2030), yearWindow(2030));
    const ck = s30.filter((s) => s.ruleId === 'bazi.shensha.caiku');
    expect(ck.map((s) => `${s.domain}/${s.trait}`)).toEqual(['wealth/change', 'wealth/opportunity', 'property/opportunity']);
    expect(ck[0].evidence.text).toBe('流年戌 沖財庫辰（財庫；日主戊，財星水）');
    expect(ck[1].intensity).toBeCloseTo(0.45 * 1 * 0.8, 10);

    const s33 = evaluateBaziTenGodRules(chartFor(2033), yearWindow(2033));
    expect(targets(s33.filter((s) => s.ruleId === 'bazi.clash.movement'))).toEqual(['bazi.clash.movement year×natal.month']);
    const s34 = evaluateBaziTenGodRules(chartFor(2034), yearWindow(2034));
    expect(targets(s34.filter((s) => s.ruleId === 'bazi.clash.movement' || s.ruleId === 'bazi.shensha.yima'))).toEqual([
      'bazi.clash.movement year×natal.day',
      'bazi.shensha.yima year×natal.yima@日支', // 寅 itself is the 驛馬 (appear)
    ]);
  });

  test('BaZi now reaches wealth / contract / movement / property in 2026–2035 (year scope alone)', () => {
    const reached = new Set<string>();
    for (let y = 2026; y <= 2035; y++) for (const d of domains(evaluateBaziTenGodRules(chartFor(y), yearWindow(y)))) reached.add(d);
    for (const d of ['wealth', 'contract', 'movement', 'property']) expect(reached.has(d)).toBe(true);
  });

  test('decade and month scopes: lower factors, real component ids, split keys when several periods overlap', () => {
    const rc = chartFor(2028);
    // 2028 window straddles 庚辰 (→2028-07-15) and 己卯 (2028-07-16→)
    const dec = evaluateBaziTenGodRules(rc, { grain: 'decade', start: '2028-01-01', end: '2028-12-31' }, { ruleIds: ['bazi.tengod.decade'] });
    expect(new Set(dec.map((s) => s.target!.split('.tengod')[0]))).toEqual(new Set(['decade@2018-07-16', 'decade@2028-07-16']));
    expect(new Set(dec.map((s) => s.evidence.componentIds[0]))).toEqual(new Set(['daYun_3', 'daYun_4']));
    for (const s of dec) expect(s.evidence.modifiers[0]).toEqual({ id: 'bazi.tengod.decade.scope.decade', factor: 0.6, reason: '大運強度係數' });

    const month = rc.monthly![6]; // 申月
    const mw: SignalWindow = { grain: 'month', start: month.start, end: month.start };
    const ms = evaluateBaziTenGodRules(rc, mw);
    expect(ms.length).toBeGreaterThan(0);
    for (const s of ms) {
      expect(s.window).toEqual(mw);
      expect(s.evidence.componentIds).toEqual([LIU_YUE_COMPONENT_ID, 'natal']);
      expect(s.evidence.modifiers[0].factor).toBe(0.7);
    }
    // month grain can also pull the enclosing 流年 / 大運 when asked
    const wide = evaluateBaziTenGodRules(rc, mw, { scopes: ['decade', 'year', 'month'] });
    expect(new Set(wide.map((s) => s.ruleId)).has('bazi.tengod.annual')).toBe(true);
    expect(wide.length).toBeGreaterThan(ms.length);
  });

  test('no day pillar → no ten-god / 財庫 signals; missing annual → no year signals', () => {
    const rc = chartFor(2026);
    const noDay = { ...rc, pillars: { ...rc.pillars, day: null } };
    const sigs = evaluateBaziTenGodRules(noDay, yearWindow(2026));
    expect(sigs.filter((s) => s.ruleId.startsWith('bazi.tengod') || s.ruleId === 'bazi.shensha.caiku')).toEqual([]);
    expect(evaluateBaziTenGodRules({ ...rc, annual: undefined }, yearWindow(2026))).toEqual([]);
  });
});

// ─── determinism / catalog ────────────────────────────────────────────────────

describe('determinism', () => {
  test('same input → deep-equal, sorted, unique ids', () => {
    for (let y = 2026; y <= 2030; y++) {
      const rc = chartFor(y);
      const w = yearWindow(y);
      const opts = { scopes: ['decade', 'year', 'month'] as const };
      const a = evaluateBaziTenGodRules(rc, w, opts);
      const b = evaluateBaziTenGodRules(structuredClone(rc), w, opts);
      expect(a).toEqual(b);
      expect(new Set(a.map((s) => s.id)).size).toBe(a.length);
      const key = (s: Signal) => [s.ruleId, s.target, String(DOMAINS.indexOf(s.domain)).padStart(2, '0'), String(TRAITS.indexOf(s.trait)).padStart(2, '0')].join('|');
      const keys = a.map(key);
      expect([...keys].sort()).toEqual(keys);
      for (const s of a) {
        expect(s.intensity).toBeGreaterThan(0);
        expect(s.intensity).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('tenGodCatalog.json consistency', () => {
  const cat = BAZI_TENGOD_CATALOG;
  const ids = cat.rules.map((r) => r.id);

  test('rule ids and scopes: code ↔ catalog', () => {
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      'bazi.tengod.annual', 'bazi.tengod.decade', 'bazi.tengod.monthly',
      'bazi.shensha.yima', 'bazi.shensha.taohua', 'bazi.shensha.caiku', 'bazi.clash.movement',
    ]);
    expect(BAZI_TENGOD_RULES.map((r) => `${r.id}@${r.scope}`).sort()).toEqual(
      cat.rules.flatMap((r) => r.scopes.map((s) => `${r.id}@${s}`)).sort(),
    );
    for (const r of BAZI_TENGOD_RULES) {
      expect(r.system).toBe('bazi');
      expect(r.version).toBe(1);
      expect(r.emits.length).toBeGreaterThan(0);
    }
  });

  test('entries complete; templates use valid domains / traits / ranges; factors in (0,1]', () => {
    const templates = [
      ...Object.values(cat.groupEmits).flat(),
      ...Object.values(cat.tenGodEmits).flat(),
      ...cat.rules.flatMap((r) => [...(r.emits ?? []), ...Object.values(r.positions ?? {}).flat()]),
    ];
    for (const t of templates) {
      expect(DOMAINS).toContain(t.domain);
      expect(TRAITS).toContain(t.trait);
      expect(t.intensity).toBeGreaterThan(0);
      expect(t.intensity).toBeLessThanOrEqual(1);
      expect(t.valence).toBeGreaterThanOrEqual(-1);
      expect(t.valence).toBeLessThanOrEqual(1);
    }
    expect(Object.keys(cat.groupEmits).sort()).toEqual([...TEN_GOD_GROUPS].sort());
    for (const g of Object.keys(cat.tenGodEmits)) expect(TEN_GODS).toContain(g as any);
    const factors = [cat.stemWeight, ...Object.values(cat.hiddenStemWeights)];
    for (const r of cat.rules) {
      for (const k of ['name', 'label', 'description', 'source'] as const) expect(r[k].length).toBeGreaterThan(0);
      for (const s of r.scopes) expect(GRAINS).toContain(s);
      expect(Object.keys(r.scopeFactors).sort()).toEqual([...r.scopes].sort());
      factors.push(...(Object.values(r.scopeFactors) as number[]));
      factors.push(...Object.values(r.activations ?? {}).map((a) => a!.factor));
      if (r.natalAbsent) factors.push(r.natalAbsent.factor);
      if (r.kind === 'yima' || r.kind === 'taohua') expect(r.bases).toEqual(['year', 'day']);
      if (r.kind === 'clashMovement') expect(Object.keys(r.positions!).sort()).toEqual(['natal.day.branch', 'natal.month.branch']);
    }
    for (const f of factors) {
      expect(f).toBeGreaterThan(0);
      expect(f).toBeLessThanOrEqual(1);
    }
    // the ten-god groups reach the domains the product plan lists
    const tgDomains = new Set(Object.values(cat.groupEmits).flat().map((t) => t.domain));
    for (const d of ['wealth', 'contract', 'property', 'career', 'learning', 'self']) expect(tgDomains.has(d as any)).toBe(true);
  });

  test('no qualitative 吉/凶/壞 wording in catalog, code or evidence (D-028)', () => {
    const banned = /[吉凶兇壞]/;
    expect(readFileSync(new URL('../src/rules/bazi/tenGodCatalog.json', import.meta.url), 'utf8')).not.toMatch(banned);
    for (const f of ['tenGods.ts', 'shensha.ts', 'evaluateTenGods.ts']) {
      expect(readFileSync(new URL(`../src/rules/bazi/${f}`, import.meta.url), 'utf8')).not.toMatch(banned);
    }
    for (let y = 2026; y <= 2035; y++) {
      for (const s of evaluateBaziTenGodRules(chartFor(y), yearWindow(y), { scopes: ['decade', 'year', 'month'] })) {
        expect(s.evidence.text).not.toMatch(banned);
        for (const m of s.evidence.modifiers) expect(m.reason).not.toMatch(banned);
      }
    }
  });
});
