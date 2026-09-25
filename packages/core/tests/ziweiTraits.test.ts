import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BirthData } from '../src/core/models/BirthData.js';
import { brightnessScore, ZiweiEngine } from '../src/engines/ZiweiEngine.js';
import { DOMAINS, GRAINS, TRAITS, signalId, type Signal, type SignalWindow } from '../src/signals/index';
import traitsJson from '../src/traits/ziwei.json';
import modifiersJson from '../src/traits/ziweiModifiers.json';
import {
  ZIWEI_CATALOG,
  ZIWEI_MODIFIERS,
  ZIWEI_RULES,
  ZIWEI_TRAITS,
  evaluateZiweiRules,
  fromZiweiComponents,
  palaceDomains,
  parseLunarYear,
  yearOfGanZhi,
  type ZiweiRuleChart,
} from '../src/rules/ziwei/index';

const MAIN_STARS = ['紫微', '天機', '太陽', '武曲', '天同', '廉貞', '天府', '太陰', '貪狼', '巨門', '天相', '天梁', '七殺', '破軍'];
const AUX_STARS = ['左輔', '右弼', '文昌', '文曲', '天魁', '天鉞'];
const SHA_STARS = ['擎羊', '陀羅', '火星', '鈴星', '地空', '地劫'];
const PALACES = ['命宮', '兄弟', '夫妻', '子女', '財帛', '疾厄', '遷移', '僕役', '官祿', '田宅', '福德', '父母'];

const NATAL: SignalWindow = { grain: 'natal', start: '1991-10-05', end: '1991-10-05' };
const DECADE: SignalWindow = { grain: 'decade', start: '2026-01-01', end: '2035-12-31' };
const YEAR: SignalWindow = { grain: 'year', start: '2026-01-01', end: '2026-12-31' };

function runEngine() {
  const birth = new BirthData({ year: 1991, month: 10, day: 5, hour: 14, gender: 'female' });
  return new ZiweiEngine({ asOf: '2026-07-11' }).run(birth) as any;
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

// ─── JSON schema ─────────────────────────────────────────────────────────

describe('traits/ziwei.json schema', () => {
  const names = ZIWEI_TRAITS.stars.map((s) => s.name);

  test('versioned', () => {
    expect(traitsJson.version).toBe(1);
    expect(modifiersJson.version).toBe(1);
  });

  test('all 14 main stars, 六輔佐, 六煞, 祿存, 天馬 present exactly once', () => {
    for (const n of [...MAIN_STARS, ...AUX_STARS, ...SHA_STARS, '祿存', '天馬']) expect(names).toContain(n);
    expect(new Set(names).size).toBe(names.length);
    expect(names.length).toBe(28);
    for (const n of MAIN_STARS) expect(ZIWEI_TRAITS.stars.find((s) => s.name === n)!.group).toBe('major');
    for (const n of SHA_STARS) expect(ZIWEI_TRAITS.stars.find((s) => s.name === n)!.group).toBe('sha');
    expect(ZIWEI_MODIFIERS.shaSamePalace.stars.slice().sort()).toEqual(SHA_STARS.slice().sort());
  });

  test('ids, trait keys ⊂ TRAITS, values in [0,1], notes present', () => {
    for (const s of ZIWEI_TRAITS.stars) {
      expect(s.id).toBe(`ziwei.star.${s.name}`);
      const keys = Object.keys(s.traits);
      expect(keys.length).toBeGreaterThan(0);
      for (const k of keys) {
        expect(TRAITS as readonly string[]).toContain(k);
        const v = (s.traits as Record<string, number>)[k];
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      expect(typeof s.notes).toBe('string');
      expect(s.notes.length).toBeGreaterThan(0);
    }
  });

  test('七殺 matches the §5.1 reference vector', () => {
    expect(ZIWEI_TRAITS.stars.find((s) => s.name === '七殺')!.traits).toEqual({
      change: 0.8, leadership: 0.7, risk: 0.65, independence: 0.8,
    });
  });
});

describe('traits/ziweiModifiers.json schema', () => {
  test('every palace maps to valid DOMAINS with factor in (0,1]', () => {
    for (const p of PALACES) {
      const pds = palaceDomains(p);
      expect(pds.length).toBeGreaterThan(0);
      for (const pd of pds) {
        expect(DOMAINS as readonly string[]).toContain(pd.domain);
        expect(pd.factor).toBeGreaterThan(0);
        expect(pd.factor).toBeLessThanOrEqual(1);
      }
    }
    // aliases resolve too
    expect(palaceDomains('交友')).toEqual(palaceDomains('僕役'));
    expect(palaceDomains('事業')).toEqual(palaceDomains('官祿'));
    expect(() => palaceDomains('不存在')).toThrow();
  });

  test('traitValence covers exactly TRAITS within [-1,1]; labels cover DOMAINS/TRAITS', () => {
    const tv = ZIWEI_MODIFIERS.traitValence as Record<string, number>;
    expect(Object.keys(tv).sort()).toEqual([...TRAITS].sort());
    for (const v of Object.values(tv)) expect(Math.abs(v)).toBeLessThanOrEqual(1);
    for (const d of DOMAINS) expect(typeof ZIWEI_MODIFIERS.labels.domains[d]).toBe('string');
    for (const t of TRAITS) expect(typeof ZIWEI_MODIFIERS.labels.traits[t]).toBe('string');
  });

  test('四化 modifiers: 祿權科忌 with 忌 shifting valence negative', () => {
    expect(Object.keys(ZIWEI_MODIFIERS.mutagen).sort()).toEqual(['忌', '權', '祿', '科'].sort());
    expect(ZIWEI_MODIFIERS.mutagen['忌'].valenceShift).toBeLessThan(0);
    expect(ZIWEI_MODIFIERS.mutagen['祿'].valenceShift).toBeGreaterThan(0);
  });

  test('三方四正: 本宮 1.0, 對宮/三合 0.5', () => {
    expect(ZIWEI_MODIFIERS.sanfang).toEqual({ self: 1.0, opposite: 0.5, trine: 0.5 });
  });

  test('brightness factors come from the engine (D-005: no second table)', () => {
    expect(ZIWEI_MODIFIERS.brightness.source).toBe('component.brightnessScore');
    expect(JSON.stringify(modifiersJson)).not.toMatch(/"廟"\s*:/);
  });
});

describe('rules/ziwei/catalog.json', () => {
  test('ids unique; active rules implemented; pending rules flagged for V1-05', () => {
    const ids = ZIWEI_CATALOG.rules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    const active = ZIWEI_CATALOG.rules.filter((r) => r.status === 'active').map((r) => r.id).sort();
    expect(ZIWEI_RULES.map((r) => r.id).sort()).toEqual(active);
    for (const id of [
      'ziwei.natal.star_traits', 'ziwei.decade.mutagen', 'ziwei.decade.palace_overlay',
      'ziwei.sanfang.sha', 'ziwei.star.tianma', 'ziwei.star.lucun',
    ]) expect(active).toContain(id);
    for (const r of ZIWEI_CATALOG.rules) {
      expect(['active', 'pending_v1_05']).toContain(r.status);
      expect(GRAINS as readonly string[]).toContain(r.scope);
      expect(r.description.length).toBeGreaterThan(0);
      expect(r.source.length).toBeGreaterThan(0);
    }
    const pending = ZIWEI_CATALOG.rules.filter((r) => r.status === 'pending_v1_05').map((r) => r.id);
    expect(pending).toContain('ziwei.month.mutagen');
    expect(pending).toContain('ziwei.month.palace_overlay');
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────

describe('chart helpers', () => {
  test('parseLunarYear / yearOfGanZhi', () => {
    expect(parseLunarYear('一九九一年八月廿八')).toBe(1991);
    expect(parseLunarYear('二〇〇〇年正月初一')).toBe(2000);
    expect(parseLunarYear(undefined)).toBeNull();
    expect(yearOfGanZhi('丙', '午', 2026)).toBe(2026);
    expect(yearOfGanZhi('乙', '巳', 2026)).toBe(2025);
    expect(yearOfGanZhi('甲', '丑', 2026)).toBeNull();
  });

  test('throws when the engine produced no palaces (unknown birth time)', () => {
    const birth = new BirthData({ year: 1991, month: 10, day: 5, hour: 12, gender: 'female', timeKnown: false });
    const r = new ZiweiEngine({ asOf: '2026-07-11' }).run(birth) as any;
    expect(() => fromZiweiComponents(r.components)).toThrow();
  });
});

// ─── Modifier math ───────────────────────────────────────────────────────

describe('modifier math', () => {
  const base = runEngine();

  /** Set 七殺 (palace_7) brightness/mutagen in a cloned component list. */
  function chartWith(brightness: string, mutagen: string | null): ZiweiRuleChart {
    const comps = clone(base.components);
    const p7 = comps.find((c: any) => c.id === 'palace_7');
    const star = p7.value.majorStars.find((s: any) => s.name === '七殺');
    star.brightness = brightness;
    star.brightnessScore = brightnessScore(brightness);
    star.mutagen = mutagen;
    return fromZiweiComponents(comps);
  }

  const qiSha = (chart: ZiweiRuleChart, trait: string) =>
    evaluateZiweiRules(chart, NATAL, { ruleIds: ['ziwei.natal.star_traits'] }).find(
      (s) => s.target === 'natal:palace_7:七殺' && s.trait === trait,
    )!;

  test('廟 vs 陷: intensity ratio equals the brightness factor ratio', () => {
    const miao = qiSha(chartWith('廟', null), 'change');
    const xian = qiSha(chartWith('陷', null), 'change');
    const fMiao = miao.evidence.modifiers.find((m) => m.id === 'brightness.廟')!.factor;
    const fXian = xian.evidence.modifiers.find((m) => m.id === 'brightness.陷')!.factor;
    expect(fMiao).toBe(brightnessScore('廟'));
    expect(fXian).toBe(brightnessScore('陷'));
    expect(miao.intensity / xian.intensity).toBeCloseTo(fMiao / fXian, 5);
    // identical id: brightness is a modifier, not part of the identity
    expect(miao.id).toBe(xian.id);
  });

  test('intensity = base × Π modifier factors', () => {
    const s = qiSha(chartWith('旺', '權'), 'leadership');
    const prod = s.evidence.modifiers.reduce((a, m) => a * m.factor, 0.7);
    expect(s.intensity).toBeCloseTo(prod, 6);
  });

  test('化忌 shifts valence negative and is listed in evidence.modifiers', () => {
    const plain = qiSha(chartWith('廟', null), 'change');
    const ji = qiSha(chartWith('廟', '忌'), 'change');
    expect(ji.valence).toBeLessThan(plain.valence);
    expect(ji.valence).toBeCloseTo(plain.valence + ZIWEI_MODIFIERS.mutagen['忌'].valenceShift, 6);
    const mod = ji.evidence.modifiers.find((m) => m.id === 'mutagen.natal.忌');
    expect(mod).toBeDefined();
    expect(mod!.factor).toBe(ZIWEI_MODIFIERS.mutagen['忌'].factor);
    expect(plain.evidence.modifiers.some((m) => m.id.startsWith('mutagen.'))).toBe(false);
  });

  test('煞曜同宮 modifier applies and is recorded', () => {
    const comps = clone(base.components);
    const p7 = comps.find((c: any) => c.id === 'palace_7');
    p7.value.minorStars.push({ name: '擎羊', type: 'tough', brightness: '', brightnessScore: null, mutagen: null });
    const withSha = qiSha(fromZiweiComponents(comps), 'change');
    const without = qiSha(fromZiweiComponents(base.components), 'change');
    const mod = withSha.evidence.modifiers.find((m) => m.id === 'sha_same_palace.1')!;
    expect(mod.factor).toBe(ZIWEI_MODIFIERS.shaSamePalace.factorPerStar);
    expect(withSha.intensity).toBeCloseTo(without.intensity * mod.factor, 6);
    expect(withSha.valence).toBeLessThan(without.valence);
  });

  test('palace factor recorded for every natal star-trait signal', () => {
    const chart = fromZiweiComponents(base.components);
    for (const s of evaluateZiweiRules(chart, NATAL, { ruleIds: ['ziwei.natal.star_traits'] })) {
      expect(s.evidence.modifiers.some((m) => m.id.startsWith('palace.'))).toBe(true);
    }
  });
});

// ─── Real chart ──────────────────────────────────────────────────────────

describe('real chart 1991-10-05 14:00 female, asOf 2026-07-11', () => {
  const result = runEngine();
  const componentIds = new Set<string>(result.components.map((c: any) => c.id));
  const chart = fromZiweiComponents(result.components);

  const all = (c: ZiweiRuleChart): Signal[] => [
    ...evaluateZiweiRules(c, NATAL),
    ...evaluateZiweiRules(c, DECADE),
    ...evaluateZiweiRules(c, YEAR),
  ];
  const signals = all(chart);

  test('chart structure', () => {
    expect(chart.palaces).toHaveLength(12);
    expect(chart.birthLunarYear).toBe(1991);
    expect(chart.decades).toHaveLength(12);
    const current = chart.decades.find((d) => d.componentId === 'daXian_4')!;
    expect(current.start).toBe('2023-01-01');
    expect(current.end).toBe('2032-12-31');
    expect(chart.yearly?.start).toBe('2026-01-01');
  });

  test('every active rule fires at least once', () => {
    const fired = new Set(signals.map((s) => s.ruleId));
    for (const r of ZIWEI_RULES) expect(fired.has(r.id)).toBe(true);
  });

  test('all signals valid: ids recompute, ranges hold, enums closed', () => {
    const ids = new Set<string>();
    for (const s of signals) {
      expect(s.system).toBe('ziwei');
      expect(DOMAINS as readonly string[]).toContain(s.domain);
      expect(TRAITS as readonly string[]).toContain(s.trait);
      expect(s.intensity).toBeGreaterThanOrEqual(0);
      expect(s.intensity).toBeLessThanOrEqual(1);
      expect(s.valence).toBeGreaterThanOrEqual(-1);
      expect(s.valence).toBeLessThanOrEqual(1);
      expect(s.id).toBe(
        signalId({ system: s.system, ruleId: s.ruleId, ruleVersion: s.ruleVersion, window: s.window, target: s.target, domain: s.domain, trait: s.trait }),
      );
      expect(s.evidence.text.length).toBeGreaterThan(0);
      expect(ids.has(s.id)).toBe(false);
      ids.add(s.id);
    }
  });

  test('componentIds reference real ZiweiEngine components', () => {
    for (const s of signals) {
      expect(s.evidence.componentIds.length).toBeGreaterThan(0);
      for (const id of s.evidence.componentIds) expect(componentIds.has(id)).toBe(true);
    }
  });

  test('tianma → movement, lucun → wealth', () => {
    const tm = signals.find((s) => s.ruleId === 'ziwei.star.tianma')!;
    expect(tm.domain).toBe('movement');
    expect(tm.evidence.componentIds).toContain('palace_3');
    const lc = signals.find((s) => s.ruleId === 'ziwei.star.lucun')!;
    expect(lc.domain).toBe('wealth');
    expect(lc.evidence.componentIds).toContain('palace_7');
  });

  test('decade mutagen: 癸 大限 (daXian_4) 化忌 貪狼 lands in 田宅 → property pressure', () => {
    const s = signals.find((x) => x.target === 'daXian_4:忌:貪狼')!;
    expect(s.domain).toBe('property');
    expect(s.trait).toBe('pressure');
    expect(s.valence).toBeLessThan(0);
    expect(s.evidence.componentIds).toEqual(['daXian_4', 'palace_3', 'mainStar_貪狼']);
  });

  test('decade window only includes overlapping 大限', () => {
    const decadeIds = new Set(
      evaluateZiweiRules(chart, DECADE).flatMap((s) => s.evidence.componentIds.filter((c) => c.startsWith('daXian_'))),
    );
    expect([...decadeIds].sort()).toEqual(['daXian_4', 'daXian_5']);
  });

  test('scopes option runs decade rules into a year window', () => {
    const sigs = evaluateZiweiRules(chart, YEAR, { scopes: ['decade'] });
    const ds = new Set(sigs.flatMap((s) => s.evidence.componentIds.filter((c) => c.startsWith('daXian_'))));
    expect([...ds]).toEqual(['daXian_4']);
    for (const s of sigs) expect(s.window).toEqual(YEAR);
  });

  test('deterministic across engine runs and evaluations', () => {
    const again = all(fromZiweiComponents(runEngine().components));
    expect(JSON.stringify(again)).toBe(JSON.stringify(signals));
    for (const w of [NATAL, DECADE, YEAR]) {
      const ids = evaluateZiweiRules(chart, w).map((s) => s.id);
      expect(ids).toEqual([...ids].sort());
    }
  });
});

// ─── Neutral wording (D-028) ─────────────────────────────────────────────

describe('no qualitative judgments (D-028)', () => {
  // Decision: nothing under rules/ziwei (code AND catalog data) may contain these
  // characters; trait-table notes describe conventions neutrally and are held to
  // the same list (the traditional 六吉 group is therefore labelled 輔佐類).
  const BANNED = ['壞', '凶', '兇', '吉'];
  const dir = join(import.meta.dir, '../src/rules/ziwei');

  test('rules/ziwei sources contain no qualitative strings', () => {
    const files = readdirSync(dir);
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const text = readFileSync(join(dir, f), 'utf8');
      for (const w of BANNED) expect({ file: f, has: text.includes(w) }).toEqual({ file: f, has: false });
    }
  });

  test('trait-table notes and emitted evidence text are neutral', () => {
    for (const s of ZIWEI_TRAITS.stars) for (const w of BANNED) expect(s.notes.includes(w)).toBe(false);
    const chart = fromZiweiComponents(runEngine().components);
    for (const s of [...evaluateZiweiRules(chart, NATAL), ...evaluateZiweiRules(chart, DECADE)]) {
      for (const w of BANNED) {
        expect(s.evidence.text.includes(w)).toBe(false);
        for (const m of s.evidence.modifiers) expect(m.reason.includes(w)).toBe(false);
      }
    }
  });
});
