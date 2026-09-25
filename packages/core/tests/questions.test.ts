import { describe, expect, test } from 'bun:test';
import baziRuleCatalog from '../src/rules/bazi/catalog.json';
import ziweiRuleCatalog from '../src/rules/ziwei/catalog.json';
import jyotishRuleCatalog from '../src/calculators/jyotish/catalog.json';
import humanDesignRuleCatalog from '../src/calculators/humanDesign/catalog.json';
import {
  QUESTION_CATALOG,
  answerQuestion,
  monthWindows,
  validateQuestionRequest,
  type QuestionRequest,
  type SignalProvider,
} from '../src/questions/index';
import {
  DOMAINS,
  SYSTEM_IDS,
  TRAITS,
  createSignal,
  type CreateSignalParams,
  type Signal,
  type SignalWindow,
} from '../src/signals/index';
import { baziCalculator, toBaziRuleChart } from '../src/calculators/bazi/calculator';
import { solarYearOfAsOf } from '../src/calculators/bazi/pillars';
import { evaluateBaziRules } from '../src/rules/bazi/evaluate';
import { evaluateZiweiRules } from '../src/rules/ziwei/index';
import { lunarNewYear, toZiweiRuleChart, ziweiCalculator } from '../src/calculators/ziwei/index';
import { cityToBirthplace, findCity, type BirthProfile } from '../src/profile/index';
import { createTimeContext } from '../src/time/index';

const RULE_IDS: Record<string, Set<string>> = {
  bazi: new Set(baziRuleCatalog.rules.map((r: { id: string }) => r.id)),
  ziwei: new Set(ziweiRuleCatalog.rules.map((r: { id: string }) => r.id)),
  jyotish: new Set(jyotishRuleCatalog.rules.map((r: { id: string }) => r.id)),
  humanDesign: new Set(humanDesignRuleCatalog.rules.map((r: { id: string }) => r.id)),
};

// ─── catalog integrity ────────────────────────────────────────────────────────

describe('question catalog integrity', () => {
  const cats = QUESTION_CATALOG.categories;

  test('versioned and contains the required categories', () => {
    expect(Number.isInteger(QUESTION_CATALOG.version)).toBe(true);
    expect(Number.isInteger(QUESTION_CATALOG.schemaVersion)).toBe(true);
    const ids = cats.map((c) => c.id);
    for (const id of [
      'vehicle_purchase', 'job_change', 'relationship_timing', 'startup_timing',
      'property_purchase', 'relocation', 'study_exam', 'investment',
    ]) expect(ids).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('required domain sets per spec', () => {
    const doms = (id: string) => cats.find((c) => c.id === id)!.domains.map((d) => d.domain).sort();
    expect(doms('vehicle_purchase')).toEqual(['contract', 'movement', 'property', 'wealth']);
    expect(doms('job_change')).toEqual(['career', 'contract', 'movement']);
    expect(doms('relationship_timing')).toEqual(['relationship', 'self']);
    expect(doms('startup_timing')).toEqual(['career', 'contract', 'self', 'wealth']);
    expect(doms('property_purchase')).toEqual(['contract', 'family', 'property', 'wealth']);
    expect(doms('relocation')).toEqual(['family', 'movement', 'property']);
    expect(doms('study_exam')).toEqual(['career', 'learning']);
    expect(doms('investment')).toEqual(['contract', 'wealth']);
  });

  for (const c of QUESTION_CATALOG.categories) {
    test(`${c.id}: domains, traits, ruleIds, weights, examples`, () => {
      expect(Number.isInteger(c.version) && c.version >= 1).toBe(true);
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.examples.length).toBeGreaterThan(0);
      for (const e of c.examples) expect(e.trim().length).toBeGreaterThan(0);

      expect(c.domains.length).toBeGreaterThan(0);
      const seen = new Set<string>();
      for (const d of c.domains) {
        expect(DOMAINS as readonly string[]).toContain(d.domain);
        expect(seen.has(d.domain)).toBe(false);
        seen.add(d.domain);
        expect(Number.isFinite(d.weight) && d.weight > 0).toBe(true);
      }
      expect(c.domains.reduce((a, d) => a + d.weight, 0)).toBeGreaterThan(0);

      const { supportive, risky } = c.traitPreferences;
      expect(supportive.length).toBeGreaterThan(0);
      expect(risky.length).toBeGreaterThan(0);
      for (const t of [...supportive, ...risky]) expect(TRAITS as readonly string[]).toContain(t);
      for (const t of supportive) expect(risky as string[]).not.toContain(t);

      for (const [system, ids] of Object.entries(c.ruleIds)) {
        expect(SYSTEM_IDS as readonly string[]).toContain(system);
        const known = RULE_IDS[system];
        expect(known).toBeDefined();
        for (const id of ids!) expect(known.has(id)).toBe(true);
      }

      expect(c.defaultGrain).toBe('month');
      expect(Number.isInteger(c.minMonths) && c.minMonths >= 1).toBe(true);
      expect(c.maxMonths).toBeLessThanOrEqual(36);
      expect(c.minMonths).toBeLessThanOrEqual(c.maxMonths);
    });
  }

  test('no qualitative 吉/凶 wording anywhere in the catalog (D-028)', () => {
    const text = JSON.stringify(QUESTION_CATALOG);
    for (const w of ['吉', '凶', '好運', '壞運']) expect(text).not.toContain(w);
  });

  test('scoring coefficients are finite, non-negative data', () => {
    for (const v of Object.values(QUESTION_CATALOG.scoring)) expect(Number.isFinite(v) && v >= 0).toBe(true);
  });
});

// ─── validation ───────────────────────────────────────────────────────────────

describe('validateQuestionRequest', () => {
  const ok = { category: 'vehicle_purchase', range: { start: '2026-10', end: '2027-12' } };

  test('accepts a valid request', () => {
    const v = validateQuestionRequest(ok);
    expect(v).toEqual({ ok: true, value: ok, unsupported: false, errors: [] });
  });

  test.each([
    ['2026-1', '2026-12'],
    ['2026-13', '2026-12'],
    ['2026-00', '2026-12'],
    ['2026/01', '2026-12'],
    ['2026-01-01', '2026-12'],
    ['26-01', '2026-12'],
    ['2026-01', ''],
  ])('rejects bad formats %s..%s', (start, end) => {
    const v = validateQuestionRequest({ category: 'vehicle_purchase', range: { start, end } });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.unsupported).toBe(false);
  });

  test('rejects non-objects, missing fields, extra keys and non-string category', () => {
    for (const bad of [
      null, 'vehicle_purchase', [], {},
      { category: 'vehicle_purchase' },
      { category: 'vehicle_purchase', range: ['2026-01', '2026-12'] },
      { category: 42, range: ok.range },
      { category: '', range: ok.range },
      { ...ok, extra: 1 },
      { ...ok, range: { ...ok.range, grain: 'month' } },
    ]) {
      const v = validateQuestionRequest(bad);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.unsupported).toBe(false);
    }
  });

  test('rejects a reversed range', () => {
    const v = validateQuestionRequest({ category: 'vehicle_purchase', range: { start: '2027-02', end: '2027-01' } });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors.join()).toContain('after');
  });

  test('36 months accepted, 37 rejected; a single month accepted', () => {
    expect(validateQuestionRequest({ category: 'investment', range: { start: '2026-01', end: '2028-12' } }).ok).toBe(true);
    const v = validateQuestionRequest({ category: 'investment', range: { start: '2026-01', end: '2029-01' } });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors.join()).toContain('at most 36');
    expect(validateQuestionRequest({ category: 'investment', range: { start: '2026-05', end: '2026-05' } }).ok).toBe(true);
  });

  test('unknown category → unsupported', () => {
    const v = validateQuestionRequest({ category: 'lottery_numbers', range: ok.range });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.unsupported).toBe(true);
  });

  test('answerQuestion: unknown category → unsupported answer with no ranking; other invalid input throws', () => {
    const provider: SignalProvider = () => {
      throw new Error('provider must not be called');
    };
    const a = answerQuestion({ category: 'lottery_numbers', range: ok.range }, provider);
    expect(a.unsupported).toBe(true);
    expect(a.ranking).toEqual([]);
    expect(a.top).toEqual([]);
    expect(a.category).toBe('lottery_numbers');
    expect(a.catalogVersion).toBe(QUESTION_CATALOG.version);
    expect(() => answerQuestion({ category: 'vehicle_purchase', range: { start: '2027-01', end: '2026-01' } }, provider)).toThrow();
  });
});

describe('monthWindows', () => {
  test('first/last day, leap years, year boundary', () => {
    const w = monthWindows({ start: '2027-12', end: '2028-03' });
    expect(w).toEqual([
      { grain: 'month', start: '2027-12-01', end: '2027-12-31' },
      { grain: 'month', start: '2028-01-01', end: '2028-01-31' },
      { grain: 'month', start: '2028-02-01', end: '2028-02-29' },
      { grain: 'month', start: '2028-03-01', end: '2028-03-31' },
    ]);
    expect(monthWindows({ start: '2100-02', end: '2100-02' })[0].end).toBe('2100-02-28');
    expect(monthWindows({ start: '2000-02', end: '2000-02' })[0].end).toBe('2000-02-29');
  });
});

// ─── engine with a fake provider ──────────────────────────────────────────────

function sig(window: SignalWindow, over: Partial<CreateSignalParams>): Signal {
  return createSignal({
    system: 'bazi',
    ruleId: 'test.rule',
    ruleVersion: 1,
    domain: 'wealth',
    trait: 'opportunity',
    intensity: 0.5,
    valence: 0.3,
    window,
    target: 't',
    ...over,
  });
}

/** Provider from a table 'YYYY-MM' → signal params (window filled in). */
function fakeProvider(table: Record<string, Partial<CreateSignalParams>[]>): SignalProvider {
  return (w) => (table[w.start.slice(0, 7)] ?? []).map((p, i) => sig(w, { target: `t${i}`, ...p }));
}

const RANGE = { start: '2027-01', end: '2027-06' };
const vp = (range = RANGE): QuestionRequest => ({ category: 'vehicle_purchase', range });

describe('answerQuestion (fake provider)', () => {
  test('month with strong supportive wealth+contract signals ranks first', () => {
    const provider = fakeProvider({
      '2027-02': [{ domain: 'wealth', trait: 'change', intensity: 0.3, valence: 0 }],
      '2027-04': [
        { domain: 'wealth', trait: 'opportunity', intensity: 0.8 },
        { domain: 'contract', trait: 'support', intensity: 0.7, system: 'ziwei', ruleId: 'ziwei.month.mutagen' },
        { domain: 'wealth', trait: 'stability', intensity: 0.6, system: 'jyotish', ruleId: 'jyotish.transit.slow' },
      ],
      '2027-05': [{ domain: 'movement', trait: 'growth', intensity: 0.4 }],
    });
    const a = answerQuestion(vp(), provider);
    expect(a.unsupported).toBeUndefined();
    expect(a.ranking.length).toBe(6);
    expect(a.ranking[0].window).toEqual({ grain: 'month', start: '2027-04-01', end: '2027-04-30' });
    expect(a.ranking[0].rank).toBe(1);
    expect(a.ranking[0].score).toBeGreaterThan(a.ranking[1].score);
    expect(a.ranking[0].supportSignals.length).toBe(3);
    for (const r of a.ranking) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
      expect(r.domainScores.map((d) => d.domain)).toEqual(['wealth', 'contract', 'movement', 'property']);
    }
  });

  test('formula: single supportive signal counts fully, neutral half, risky zero', () => {
    const w = (d: string) => ({ domain: 'wealth' as const, intensity: 0.6, trait: d as any });
    const a = answerQuestion(
      { category: 'investment', range: { start: '2027-01', end: '2027-03' } },
      fakeProvider({ '2027-01': [w('opportunity')], '2027-02': [w('change')], '2027-03': [w('risk')] }),
    );
    const byMonth = Object.fromEntries(a.ranking.map((r) => [r.window.start.slice(0, 7), r]));
    // investment weights: wealth 3, contract 2 → wealth share 3/5.
    expect(byMonth['2027-01'].domainScores[0].score).toBeCloseTo(60, 6);
    expect(byMonth['2027-01'].score).toBeCloseTo(36, 4);
    expect(byMonth['2027-02'].domainScores[0].score).toBeCloseTo(30, 6);
    expect(byMonth['2027-03'].domainScores[0].score).toBeCloseTo(0, 6);
    expect(byMonth['2027-03'].riskSignals.length).toBe(1);
  });

  test('relationship-only signals do not affect vehicle_purchase', () => {
    const base = { '2027-03': [{ domain: 'wealth' as const, intensity: 0.5 }] };
    const withRel = {
      ...base,
      '2027-01': [{ domain: 'relationship' as const, trait: 'connection' as const, intensity: 0.9 }],
      '2027-03': [...base['2027-03'], { domain: 'relationship' as const, trait: 'support' as const, intensity: 0.9 }],
    };
    const a = answerQuestion(vp(), fakeProvider(base));
    const b = answerQuestion(vp(), fakeProvider(withRel));
    expect(b.ranking.map((r) => [r.window.start, r.score])).toEqual(a.ranking.map((r) => [r.window.start, r.score]));
    const jan = b.ranking.find((r) => r.window.start === '2027-01-01')!;
    expect(jan.score).toBe(0);
    expect(jan.signalIds).toEqual([]);
  });

  test('risky traits lower the score', () => {
    const good = [{ domain: 'wealth' as const, trait: 'opportunity' as const, intensity: 0.7 }];
    const a = answerQuestion(vp(), fakeProvider({ '2027-01': good }));
    const b = answerQuestion(
      vp(),
      fakeProvider({ '2027-01': [...good, { domain: 'wealth', trait: 'risk', intensity: 0.7, valence: -0.4 }] }),
    );
    const sa = a.ranking.find((r) => r.window.start === '2027-01-01')!;
    const sb = b.ranking.find((r) => r.window.start === '2027-01-01')!;
    expect(sb.score).toBeLessThan(sa.score);
    expect(sb.riskSignals.map((s) => s.trait)).toEqual(['risk']);
  });

  test('conflict flagged (not cancelled) when systems disagree', () => {
    const a = answerQuestion(
      vp(),
      fakeProvider({
        '2027-02': [
          { system: 'bazi', domain: 'contract', trait: 'support', intensity: 0.6, valence: 0.6 },
          { system: 'ziwei', ruleId: 'ziwei.month.mutagen', domain: 'contract', trait: 'pressure', intensity: 0.6, valence: -0.6 },
        ],
      }),
    );
    const feb = a.ranking.find((r) => r.window.start === '2027-02-01')!;
    expect(feb.conflict).not.toBeNull();
    expect(feb.conflict!.length).toBe(1);
    expect(feb.conflict![0].domain).toBe('contract');
    expect(feb.conflict![0].positive.length).toBe(1);
    expect(feb.conflict![0].negative.length).toBe(1);
    expect(feb.supportSignals.length).toBe(1);
    expect(feb.riskSignals.length).toBe(1);
    const others = a.ranking.filter((r) => r.window.start !== '2027-02-01');
    for (const r of others) expect(r.conflict).toBeNull();
  });

  test('ruleIds subset: ziwei rules outside the vehicle_purchase list are ignored', () => {
    const a = answerQuestion(
      vp(),
      fakeProvider({
        '2027-01': [{ system: 'ziwei', ruleId: 'ziwei.natal.star_traits', domain: 'wealth', intensity: 0.9 }],
        '2027-02': [{ system: 'ziwei', ruleId: 'ziwei.star.lucun', domain: 'wealth', intensity: 0.9 }],
      }),
    );
    expect(a.ranking.find((r) => r.window.start === '2027-01-01')!.score).toBe(0);
    expect(a.ranking[0].window.start).toBe('2027-02-01');
  });

  test('deterministic ordering, tie-break by earlier window, input-order independent', () => {
    const same = [{ domain: 'wealth' as const, intensity: 0.5 }];
    const table = { '2027-05': same, '2027-02': same, '2027-04': [{ domain: 'wealth' as const, intensity: 0.2 }] };
    const a = answerQuestion(vp(), fakeProvider(table));
    expect(a.ranking.map((r) => r.window.start.slice(0, 7))).toEqual([
      '2027-02', '2027-05', '2027-04', '2027-01', '2027-03', '2027-06',
    ]);
    expect(a.ranking.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6]);
    const reversed: SignalProvider = (w) => fakeProvider(table)(w).reverse();
    expect(JSON.stringify(answerQuestion(vp(), reversed))).toBe(JSON.stringify(a));
    expect(JSON.stringify(answerQuestion(vp(), fakeProvider(table)))).toBe(JSON.stringify(a));
  });

  test('top has ≤ 3 entries, each with source signal ids', () => {
    const a = answerQuestion(
      vp(),
      fakeProvider({
        '2027-01': [{ domain: 'wealth', intensity: 0.4 }],
        '2027-03': [{ domain: 'contract', trait: 'support', intensity: 0.6 }],
        '2027-06': [{ domain: 'property', trait: 'stability', intensity: 0.5 }],
        '2027-05': [{ domain: 'movement', trait: 'growth', intensity: 0.3 }],
      }),
    );
    expect(a.top.length).toBe(3);
    expect(a.top).toEqual(a.ranking.slice(0, 3));
    for (const t of a.top) {
      expect(t.signalIds.length).toBeGreaterThan(0);
      for (const s of t.supportSignals) expect(t.signalIds).toContain(s.id);
      expect(t.band).toBeDefined();
    }
    const one = answerQuestion(vp({ start: '2027-01', end: '2027-02' }), fakeProvider({}));
    expect(one.top.length).toBe(2);
  });

  test('duplicate ids are de-duplicated; conflicting duplicates throw', () => {
    const w = monthWindows({ start: '2027-01', end: '2027-01' })[0];
    const s = sig(w, {});
    const a = answerQuestion(vp({ start: '2027-01', end: '2027-01' }), () => [s, s]);
    expect(a.ranking[0].signalIds).toEqual([s.id]);
    expect(() =>
      answerQuestion(vp({ start: '2027-01', end: '2027-01' }), () => [s, { ...s, intensity: 0.9 }]),
    ).toThrow();
  });
});

// ─── integration smoke: real 八字 rule evaluator as provider ───────────────────

describe('integration: real 八字 rules, 1995-07-16 22:00 male Tainan', () => {
  const city = findCity('台南');
  const profile: BirthProfile = {
    date: '1995-07-16',
    time: '22:00',
    timeAccuracy: 'exact',
    gender: 'male',
    birthplace: cityToBirthplace(city!),
  };
  const result = baziCalculator.calculate(createTimeContext(profile), { asOf: '2026-09-25' });

  const chartCache = new Map<number, ReturnType<typeof toBaziRuleChart>>();
  const chartFor = (year: number) => {
    let c = chartCache.get(year);
    if (!c) chartCache.set(year, (c = toBaziRuleChart(result, { year })));
    return c;
  };
  /** 流月 of every solar year the calendar month touches, so 節 boundaries inside the month are seen. */
  const provider: SignalProvider = (w) => {
    const y1 = solarYearOfAsOf(w.start);
    const y2 = solarYearOfAsOf(w.end);
    const chart = chartFor(y1);
    const monthly = y2 === y1 ? chart.monthly : [...(chart.monthly ?? []), ...(chartFor(y2).monthly ?? [])];
    return evaluateBaziRules({ ...chart, monthly }, w);
  };

  const req: QuestionRequest = { category: 'vehicle_purchase', range: { start: '2026-10', end: '2027-12' } };

  test('15 ranked months, top 3 with valid source signals, deterministic', () => {
    expect(city).not.toBeNull();
    const a = answerQuestion(req, provider);
    expect(a.ranking.length).toBe(15);
    expect(a.top.length).toBe(3);
    expect(new Set(a.ranking.map((r) => r.window.start)).size).toBe(15);
    for (let i = 1; i < a.ranking.length; i++) {
      const p = a.ranking[i - 1];
      const r = a.ranking[i];
      expect(p.score > r.score || (p.score === r.score && p.window.start < r.window.start)).toBe(true);
    }
    const vpDomains = new Set(['wealth', 'contract', 'movement', 'property']);
    for (const r of a.ranking) {
      for (const s of [...r.supportSignals, ...r.riskSignals]) {
        expect(s.system).toBe('bazi');
        expect(RULE_IDS.bazi.has(s.ruleId)).toBe(true);
        expect(vpDomains.has(s.domain)).toBe(true);
        expect(s.window).toEqual(r.window);
        // round-trips through createSignal → same id (valid signal).
        const again = createSignal({ ...s, target: s.target, evidence: s.evidence });
        expect(again.id).toBe(s.id);
        expect(r.signalIds).toContain(s.id);
      }
    }
    expect(JSON.stringify(answerQuestion(req, provider))).toBe(JSON.stringify(a));

    // 八字 catalog positions only map to self/career/family/relationship/learning,
    // so a 八字-only provider cannot move vehicle_purchase domains (see next test).
    console.log('vehicle_purchase top 3 (八字 only):', summarize(a.top));
  });

  test('八字 + 紫微 month rules as provider: non-trivial ranking with sources', () => {
    // One 紫微 chart per lunar year (its monthlySequence = that lunar year's 流月).
    const ctx = createTimeContext(profile);
    const zwCache = new Map<number, ReturnType<typeof toZiweiRuleChart>>();
    const zwChart = (lunarYear: number) => {
      let c = zwCache.get(lunarYear);
      if (!c) {
        c = toZiweiRuleChart(ziweiCalculator.calculate(ctx, { asOf: lunarNewYear(lunarYear) }));
        zwCache.set(lunarYear, c);
      }
      return c;
    };
    const lunarYearOf = (ymd: string) => {
      const y = Number(ymd.slice(0, 4));
      return ymd >= lunarNewYear(y) ? y : y - 1;
    };
    const both: SignalProvider = (w) => {
      const years = [...new Set([lunarYearOf(w.start), lunarYearOf(w.end)])];
      const zw = new Map<string, Signal>();
      for (const y of years) for (const s of evaluateZiweiRules(zwChart(y), w)) if (!zw.has(s.id)) zw.set(s.id, s);
      return [...provider(w), ...zw.values()];
    };
    const a = answerQuestion(req, both);
    expect(a.ranking.length).toBe(15);
    expect(a.top.length).toBe(3);
    expect(a.top[0].score).toBeGreaterThan(0);
    for (const t of a.top) {
      expect(t.signalIds.length).toBeGreaterThan(0);
      for (const s of [...t.supportSignals, ...t.riskSignals]) {
        expect(['bazi', 'ziwei']).toContain(s.system);
        if (s.system === 'ziwei') {
          expect(QUESTION_CATALOG.categories.find((c) => c.id === 'vehicle_purchase')!.ruleIds.ziwei).toContain(s.ruleId);
        }
      }
    }
    expect(JSON.stringify(answerQuestion(req, both))).toBe(JSON.stringify(a));
    console.log('vehicle_purchase top 3 (八字+紫微):', summarize(a.top));
  }, 30000);
});

function summarize(top: ReturnType<typeof answerQuestion>['top']): string[] {
  return top.map(
    (t) =>
      `${t.window.start.slice(0, 7)} score=${t.score} band=${t.band} support=${t.supportSignals.length} risk=${t.riskSignals.length} signals=${t.signalIds.length} conflict=${t.conflict ? t.conflict.map((c) => c.domain).join('+') : 'none'} top=${t.supportSignals[0]?.id ?? '-'}`,
  );
}
