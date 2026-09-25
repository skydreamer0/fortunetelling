import { describe, expect, test } from 'bun:test';
import type { BirthProfile } from '../src/profile/index';
import { DOMAINS, type Domain, type SystemId } from '../src/signals/types';
import { createTimeContext } from '../src/time/index';
import { buildTimeline } from '../src/timeline/index';
import {
  BACKTEST_METHOD,
  INSUFFICIENT_SAMPLE,
  SUFFICIENT_SAMPLE,
  binomialUpperTail,
  buildBacktestTimeline,
  mulberry32,
  proposeWeights,
  runBacktest,
  suggestedDomains,
  validateLifeEvent,
  type BacktestDomainScores,
  type BacktestResult,
  type BacktestTimeline,
  type LifeEvent,
} from '../src/backtest/index';

// ─── synthetic timelines ───────────────────────────────────────────────────

type CellFn = (domain: Domain, index: number) => Partial<BacktestDomainScores>;

function synthTimeline(nYears: number, fn: CellFn, opts: { fromYear?: number; systems?: SystemId[]; ruleIds?: string[] } = {}): BacktestTimeline {
  const fromYear = opts.fromYear ?? 1900;
  return {
    schemaVersion: 1,
    asOf: `${fromYear + nYears - 1}-12-31`,
    fromYear,
    toYear: fromYear + nYears - 1,
    systems: opts.systems ?? ['bazi', 'ziwei'],
    skippedSystems: [],
    systemWeights: { bazi: 1, ziwei: 1 },
    ruleIds: opts.ruleIds ?? [],
    cells: Array.from({ length: nYears }, (_, i) => ({
      year: fromYear + i,
      domains: Object.fromEntries(
        DOMAINS.map((d) => {
          const x = fn(d, i);
          return [d, { score: x.score ?? 0, perSystem: x.perSystem ?? {}, perRule: x.perRule ?? {} }];
        }),
      ) as Record<Domain, BacktestDomainScores>,
    })),
  };
}

const ev = (id: string, year: number, domains: Domain[], extra: Partial<LifeEvent> = {}): LifeEvent => ({
  id,
  date: `${year}-06`,
  category: 'other',
  domains,
  confidence: 'certain',
  ...extra,
});

/** Career scores 1..20 in order (year 1900 → 1, 1919 → 20). */
const ramp = synthTimeline(20, (d, i) => (d === 'career' ? { score: i + 1, perSystem: { bazi: i + 1 } } : {}));

// ─── life events ────────────────────────────────────────────────────────────

describe('life events', () => {
  test('validation accepts YYYY-MM and YYYY-MM-DD, normalises domains, rejects junk', () => {
    const ok = validateLifeEvent({ id: 'a', date: '2018-06', category: 'education', domains: ['movement', 'learning', 'career'], confidence: 'approx', description: '  畢業  ' });
    expect(ok.ok).toBe(true);
    expect(ok.value!.domains).toEqual(['career', 'movement', 'learning']);
    expect(ok.value!.description).toBe('畢業');
    expect(validateLifeEvent({ id: 'b', date: '2024-02-29', category: 'other', domains: ['self'], confidence: 'certain' }).ok).toBe(true);
    for (const bad of [
      { id: 'c', date: '2023-02-29', category: 'other', domains: ['self'], confidence: 'certain' },
      { id: 'c', date: '2023-13', category: 'other', domains: ['self'], confidence: 'certain' },
      { id: 'c', date: '2023', category: 'other', domains: ['self'], confidence: 'certain' },
      { id: 'c', date: '2023-01', category: 'nope', domains: ['self'], confidence: 'certain' },
      { id: 'c', date: '2023-01', category: 'other', domains: [], confidence: 'certain' },
      { id: 'c', date: '2023-01', category: 'other', domains: ['money'], confidence: 'certain' },
      { id: 'c', date: '2023-01', category: 'other', domains: ['self', 'self'], confidence: 'certain' },
      { id: 'c', date: '2023-01', category: 'other', domains: ['self'], confidence: 'maybe' },
      { id: '', date: '2023-01', category: 'other', domains: ['self'], confidence: 'certain' },
      null,
      [],
    ]) {
      expect(validateLifeEvent(bad).ok).toBe(false);
    }
  });

  test('suggested domains come from the question catalog (highest weight) or fixed mappings', () => {
    expect(suggestedDomains('job_change')).toEqual(['career']);
    expect(suggestedDomains('relocation')).toEqual(['movement']);
    expect(suggestedDomains('education')).toEqual(['learning']);
    expect(suggestedDomains('health_event')).toEqual(['health']);
    expect(suggestedDomains('other')).toEqual([]);
  });
});

// ─── hit definition & baseline ─────────────────────────────────────────────

describe('runBacktest: pre-registered hit definition', () => {
  test('hit = score > 0 and fewer than 25% of own cells score strictly higher', () => {
    // 20 cells → top set = the 5 highest (scores 16..20). 1915 = 16 (4 higher) hit; 1914 = 15 (5 higher) miss.
    const r = runBacktest([ev('hit', 1915, ['career']), ev('miss', 1914, ['career'])], ramp, { seed: 1, validationFraction: 0 });
    const byId = Object.fromEntries(r.trials.map((t) => [t.eventId, t]));
    expect(byId.hit.hit).toBe(true);
    expect(byId.hit.higherShare).toBe(0.2);
    expect(byId.miss.hit).toBe(false);
    expect(r.byDomain[0].all.hits).toBe(1);
    expect(r.byDomain[0].all.baseline).toBe(0.25);
    expect(r.byDomain[0].all.lift).toBe(2);
    expect(r.bySystem.find((g) => g.key === 'bazi')!.all.hits).toBe(1);
  });

  test('zero scores never hit; boundary ties all count as top; uncovered systems are not misses', () => {
    const tied = synthTimeline(8, (d, i) => (d === 'wealth' ? { score: i < 4 ? 0 : 50 } : {}));
    const r = runBacktest([ev('z', 1900, ['wealth']), ev('t', 1905, ['wealth'])], tied, { seed: 's', validationFraction: 0 });
    expect(r.trials.map((t) => [t.eventId, t.hit])).toEqual([['t', true], ['z', false]]);
    expect(r.byDomain[0].all.baseline).toBe(0.5); // ties inflate the empirical baseline — reported, not hidden
    const sys = r.bySystem.find((g) => g.key === 'ziwei')!;
    expect(sys.all.n).toBe(0);
    expect(sys.uncovered).toBe(2);
  });

  test('baseline ≈ 0.25 on synthetic timelines (empirical exact, random-window within noise)', () => {
    const rand = mulberry32(42);
    const tl = synthTimeline(40, () => ({ score: Math.round(rand() * 1000) / 10 + 0.1 }));
    // Every (year, domain) pair exactly once → the "events" are a uniform sample of windows.
    const events = Array.from({ length: 400 }, (_, i) => ev(`e${String(i).padStart(3, '0')}`, 1900 + (i % 40), [DOMAINS[Math.floor(i / 40)]]));
    const r = runBacktest(events, tl, { seed: 7, randomDraws: 500 });
    for (const g of r.byDomain) expect(g.all.baseline).toBeCloseTo(0.25, 2);
    expect(r.overall.all.baseline).toBeCloseTo(0.25, 2);
    expect(Math.abs(r.overall.all.randomBaseline! - 0.25)).toBeLessThan(0.02);
    // Events that are just every window once → hit rate = baseline, lift = 1.
    expect(r.overall.all.hitRate).toBe(0.25);
    expect(r.overall.all.lift).toBe(1);
  });

  test('sample threshold: n < 30 → 樣本不足 (no p-value); n ≥ 30 → 可評估', () => {
    const mk = (k: number) => Array.from({ length: k }, (_, i) => ev(`e${i}`, 1900 + (i % 20), ['career']));
    const small = runBacktest(mk(29), ramp, { seed: 1, validationFraction: 0 });
    expect(small.byDomain[0].all.n).toBe(29);
    expect(small.byDomain[0].all.status).toBe(INSUFFICIENT_SAMPLE);
    expect(small.byDomain[0].all.pValue).toBeNull();
    const big = runBacktest(mk(30), ramp, { seed: 1, validationFraction: 0 });
    expect(big.byDomain[0].all.status).toBe(SUFFICIENT_SAMPLE);
    expect(big.byDomain[0].all.pValue).not.toBeNull();
    // validation subset of the same 30 is < 30 → still 樣本不足
    const split = runBacktest(mk(30), ramp, { seed: 1 });
    expect(split.byDomain[0].validation.n).toBe(9);
    expect(split.byDomain[0].validation.status).toBe(INSUFFICIENT_SAMPLE);
  });

  test('events out of range, invalid or duplicated are excluded with a reason', () => {
    const r = runBacktest(
      [ev('a', 1905, ['career']), ev('a', 1906, ['career']), ev('b', 1850, ['career']), { ...ev('c', 1905, ['career']), date: 'x' }],
      ramp,
      { seed: 1 },
    );
    expect(r.events.used).toBe(1);
    expect(r.events.excluded.map((x) => x.reason).sort()).toEqual(['duplicate_id', 'invalid', 'out_of_range']);
  });

  test('binomial upper tail sanity', () => {
    expect(binomialUpperTail(10, 0, 0.25)).toBe(1);
    expect(binomialUpperTail(1, 1, 0.25)).toBeCloseTo(0.25, 10);
    expect(binomialUpperTail(4, 4, 0.5)).toBeCloseTo(1 / 16, 10);
  });
});

// ─── split & determinism ───────────────────────────────────────────────────

describe('runBacktest: deterministic split by seed', () => {
  const events = Array.from({ length: 20 }, (_, i) => ev(`e${String(i).padStart(2, '0')}`, 1900 + i, ['career']));

  test('same seed → identical result; input order does not matter; validation = round(N × 0.3)', () => {
    const a = runBacktest(events, ramp, { seed: 123 });
    const b = runBacktest([...events].reverse(), ramp, { seed: 123 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.split.validationIds).toHaveLength(6);
    expect(a.split.trainIds).toHaveLength(14);
    expect(new Set([...a.split.trainIds, ...a.split.validationIds]).size).toBe(20);
    expect(a.trials.every((t) => (t.split === 'validation') === a.split.validationIds.includes(t.eventId))).toBe(true);
  });

  test('different seeds give different splits; an event never straddles both sets', () => {
    const splits = new Set([1, 2, 3, 4, 5].map((s) => runBacktest(events, ramp, { seed: s }).split.validationIds.join(',')));
    expect(splits.size).toBeGreaterThan(1);
    const multi = runBacktest([ev('m', 1901, ['career', 'wealth', 'self'])], ramp, { seed: 9, validationFraction: 1 });
    expect(new Set(multi.trials.map((t) => t.split))).toEqual(new Set(['validation']));
  });

  test('inputs are not mutated', () => {
    const copy = JSON.stringify({ events, ramp });
    runBacktest(events, ramp, { seed: 1 });
    expect(JSON.stringify({ events, ramp })).toBe(copy);
  });
});

// ─── proposeWeights ────────────────────────────────────────────────────────

describe('proposeWeights', () => {
  test('refuses with small n (insufficient data), explains why, creates no version', () => {
    const r = runBacktest([ev('a', 1915, ['career']), ev('b', 1919, ['career'])], ramp, { seed: 1 });
    const p = proposeWeights(r);
    expect(p.ok).toBe(false);
    // core tsconfig is not strict → no discriminated-union narrowing; cast explicitly.
    const fail = p as Extract<typeof p, { ok: false }>;
    expect(fail.status).toBe('insufficient_data');
    expect(fail.required).toBe(30);
    expect(fail.message).toContain('樣本不足');
    expect((p as { proposal?: unknown }).proposal).toBeUndefined();
  });
});

// ─── planted rule scenario ─────────────────────────────────────────────────

describe('synthetic scenario: a planted rule that truly predicts events', () => {
  const N = 100;
  const rand = mulberry32(2024);
  const planted = new Set<number>();
  while (planted.size < 25) planted.add(Math.floor(rand() * N));
  const noise = Array.from({ length: N }, () => Math.round(rand() * 900) / 10 + 1);
  const tl = synthTimeline(
    N,
    (d, i) => {
      if (d !== 'career') return {};
      const p = planted.has(i) ? 80 : 0;
      return { score: Math.max(p, noise[i] / 2), perSystem: { bazi: p, ziwei: noise[i] }, perRule: { 'test.planted': p, 'test.noise': noise[i] } };
    },
    { ruleIds: ['test.noise', 'test.planted'] },
  );
  const plantedYears = [...planted].sort((a, b) => a - b);
  const events: LifeEvent[] = Array.from({ length: 150 }, (_, i) => {
    const idx = rand() < 0.85 ? plantedYears[Math.floor(rand() * plantedYears.length)] : Math.floor(rand() * N);
    return ev(`ev${String(i).padStart(3, '0')}`, 1900 + idx, ['career']);
  });
  const result: BacktestResult = runBacktest(events, tl, { seed: 'planted' });
  const rule = (id: string) => result.byRule.find((g) => g.key === id)!;

  test('validation set is large enough and evaluated separately', () => {
    expect(result.split.validationIds).toHaveLength(45);
    expect(rule('test.planted').validation.status).toBe(SUFFICIENT_SAMPLE);
    expect(rule('test.planted').train.n + rule('test.planted').validation.n).toBe(150);
  });

  test('planted rule shows lift > 1 on validation (significant); noise rule does not', () => {
    const v = rule('test.planted').validation;
    expect(v.baseline).toBe(0.25);
    expect(v.lift!).toBeGreaterThan(2);
    expect(v.pValue!).toBeLessThan(0.001);
    const noiseV = rule('test.noise').validation;
    expect(noiseV.lift!).toBeLessThan(1.6);
    expect(noiseV.pValue!).toBeGreaterThan(0.01);
  });

  test('proposeWeights returns a NEW frozen version from validation metrics only, never mutating the base', () => {
    const base = { version: 3, systemWeights: { bazi: 1, ziwei: 1 } };
    const baseCopy = JSON.stringify(base);
    const p = proposeWeights(result, base);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(JSON.stringify(base)).toBe(baseCopy);
    expect(p.proposal.version).toBe(4);
    expect(p.proposal.parentVersion).toBe(3);
    expect(Object.isFrozen(p.proposal)).toBe(true);
    expect(Object.isFrozen(p.proposal.systemWeights)).toBe(true);
    expect(p.proposal.systemWeights.bazi!).toBeGreaterThan(1);
    expect(p.proposal.systemWeights.bazi!).toBeLessThanOrEqual(2);
    expect(p.proposal.ruleWeightMultipliers['test.planted']).toBeGreaterThan(1);
    for (const c of p.proposal.changes) expect(c.validation.n).toBeGreaterThanOrEqual(BACKTEST_METHOD.minSample);
    expect(p.proposal.basedOn.validationEvents).toBe(45);
    // deterministic
    expect(JSON.stringify(proposeWeights(result, base))).toBe(JSON.stringify(p));
  });
});

// ─── buildTimeline fromYear option & real-profile demo ─────────────────────

const TAINAN = { label: 'Tainan, Taiwan', lat: 22.9922, lng: 120.1848, timezone: 'Asia/Taipei' };
const PROFILE: BirthProfile = { date: '1995-07-16', time: '22:00', timeAccuracy: 'exact', gender: 'male', birthplace: TAINAN };
const ASOF = '2026-09-25';
const SYNC: SystemId[] = ['bazi', 'ziwei', 'numerology'];
const ctx = createTimeContext(PROFILE);

describe('buildTimeline fromYear / topSignalsPerDomain (additive options)', () => {
  test('defaults unchanged; a 2026 cell is identical whether built from 2026 or from 2018', () => {
    const def = buildTimeline(ctx, { asOf: ASOF, systems: SYNC });
    expect(def.years[0].window.start).toBe('2026-01-01');
    expect(def.months[0].window.start).toBe('2026-01-01');
    const early = buildTimeline(ctx, { asOf: ASOF, systems: SYNC, fromYear: 2018, years: 9 });
    expect(early.years.map((c) => c.window.start.slice(0, 4))).toEqual(['2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026']);
    expect(early.months[0].window.start).toBe('2026-01-01');
    const strip = (c: typeof def.years[0]) => c.domains.map((d) => [d.domain, d.score, d.perSystem]);
    expect(strip(early.years[8])).toEqual(strip(def.years[0]));
    const all = buildTimeline(ctx, { asOf: ASOF, systems: SYNC, topSignalsPerDomain: Infinity, includeMonths: false });
    for (const [i, cell] of all.years.entries()) {
      for (const [j, d] of cell.domains.entries()) {
        const ids = new Set(Object.values(d.perSystem).flatMap((p) => p!.signalIds));
        expect(d.topSignals.length).toBe(ids.size);
        expect(d.score).toBe(def.years[i].domains[j].score);
      }
    }
    expect(() => buildTimeline(ctx, { asOf: ASOF, topSignalsPerDomain: -1 })).toThrow();
  });
});

/** The user's own events (V4-03 example). */
const MY_EVENTS: LifeEvent[] = [
  { id: '2018-grad', date: '2018-06', category: 'education', domains: ['career', 'movement', 'learning'], description: '畢業／北上／醫院藥局', confidence: 'approx' },
  { id: '2022-chemo', date: '2022-06', category: 'job_change', domains: ['career'], description: '化療藥局', confidence: 'approx' },
  { id: '2024-quit', date: '2024-06', category: 'job_change', domains: ['career', 'contract'], description: '離職', confidence: 'approx' },
  { id: '2025-pharma', date: '2025-06', category: 'job_change', domains: ['career', 'contract'], description: '藥廠', confidence: 'approx' },
  { id: '2026-tainan', date: '2026-06', category: 'relocation', domains: ['career', 'movement'], description: '回台南／KAM', confidence: 'approx' },
];

function hitTable(r: BacktestResult): string {
  const fmt = (x: number | null) => (x === null ? '—' : x.toFixed(2));
  const rows = [...r.byDomain, ...r.bySystem].map((g) =>
    [`${g.kind}:${g.key}`.padEnd(18), String(g.all.n).padStart(3), String(g.all.hits).padStart(4), fmt(g.all.hitRate).padStart(6), fmt(g.all.baseline).padStart(6), fmt(g.all.randomBaseline).padStart(6), fmt(g.all.lift).padStart(6), `  val n=${g.validation.n}`, `  ${g.all.status}`].join(' '),
  );
  const trials = r.trials.map((t) => `  ${t.eventId.padEnd(12)} ${t.domain.padEnd(9)} ${t.year} score=${String(t.score).padStart(5)} higherShare=${t.higherShare.toFixed(2)} ${t.hit ? 'HIT' : '-'} (${t.split})`);
  return ['group               n hits   rate  base   rand   lift', ...rows, 'trials:', ...trials].join('\n');
}

describe('demo: 1995-07-16 22:00 male Tainan, own life events (sync systems)', () => {
  const tl = buildBacktestTimeline(ctx, { asOf: ASOF, systems: SYNC });
  const r = runBacktest(MY_EVENTS, tl, { seed: 'demo-v4' });

  test('timeline spans birth+15 … asOf year; every event is in range', () => {
    expect(tl.fromYear).toBe(2010);
    expect(tl.toYear).toBe(2026);
    expect(tl.cells).toHaveLength(17);
    expect(tl.ruleIds.length).toBeGreaterThan(0);
    expect(r.events.used).toBe(5);
    expect(r.trials).toHaveLength(10);
  });

  test('every group is 樣本不足 and no weights are proposed (expected with 5 events)', () => {
    console.log(`\n[V4 backtest demo] ${tl.fromYear}–${tl.toYear}, systems=${tl.systems.join(',')}, seed=${r.seed}\n${hitTable(r)}\n${r.disclaimer}`);
    for (const g of [r.overall, ...r.byDomain, ...r.bySystem, ...r.byRule]) {
      expect(g.all.status).toBe(INSUFFICIENT_SAMPLE);
      expect(g.validation.status).toBe(INSUFFICIENT_SAMPLE);
      expect(g.all.pValue).toBeNull();
    }
    for (const g of r.byDomain) expect(g.all.baseline!).toBeGreaterThan(0.1);
    const p = proposeWeights(r);
    expect(p.ok).toBe(false);
    expect(JSON.stringify(runBacktest(MY_EVENTS, tl, { seed: 'demo-v4' }))).toBe(JSON.stringify(r));
  });
});
