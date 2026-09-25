import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_BAND_CUTS,
  DOMAINS,
  TRAITS,
  aggregateSignals,
  canonicalJson,
  createSignal,
  signalId,
  toBand,
  type CreateSignalParams,
  type Signal,
  type SignalWindow,
  type SystemId,
} from '../src/signals/index';

const Y2026: SignalWindow = { grain: 'year', start: '2026-01-01', end: '2026-12-31' };
const Y2027: SignalWindow = { grain: 'year', start: '2027-01-01', end: '2027-12-31' };

let seq = 0;
function sig(over: Partial<CreateSignalParams> = {}): Signal {
  return createSignal({
    system: 'bazi',
    ruleId: 'bazi.test',
    ruleVersion: 1,
    domain: 'career',
    trait: 'change',
    intensity: 0.5,
    valence: 0,
    window: Y2026,
    target: `t${seq++}`,
    ...over,
  });
}

describe('closed enumerations', () => {
  test('domains and traits', () => {
    expect(DOMAINS.length).toBe(10);
    expect(TRAITS).toContain('conflict');
    expect(TRAITS.length).toBe(13);
  });
});

describe('signalId', () => {
  const base = {
    system: 'bazi' as SystemId,
    ruleId: 'bazi.branch.clash',
    ruleVersion: 1,
    window: Y2026,
    target: 'natal.day×year',
    domain: 'career' as const,
    trait: 'change' as const,
  };

  test('stable and prefixed', () => {
    const id = signalId(base);
    expect(id).toMatch(/^sig_[0-9a-f]{16}$/);
    expect(signalId({ ...base })).toBe(id);
  });

  test('id is recomputable from a stored signal', () => {
    const sig = createSignal({ ...base, intensity: 0.6, valence: -0.3 });
    expect(sig.target).toBe(base.target);
    const { system, ruleId, ruleVersion, window, target, domain, trait } = sig;
    expect(signalId({ system, ruleId, ruleVersion, window, target, domain, trait })).toBe(sig.id);
    expect(createSignal({ ...base, target: undefined, intensity: 0.6, valence: 0 }).target).toBeNull();
  });

  test('key order irrelevant', () => {
    const reordered = {
      trait: base.trait,
      window: { end: Y2026.end, start: Y2026.start, grain: Y2026.grain },
      domain: base.domain,
      target: base.target,
      ruleVersion: base.ruleVersion,
      ruleId: base.ruleId,
      system: base.system,
    };
    expect(signalId(reordered)).toBe(signalId(base));
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  test('sensitive to every input', () => {
    const id = signalId(base);
    expect(signalId({ ...base, ruleVersion: 2 })).not.toBe(id);
    expect(signalId({ ...base, system: 'ziwei' })).not.toBe(id);
    expect(signalId({ ...base, ruleId: 'bazi.branch.combine' })).not.toBe(id);
    expect(signalId({ ...base, window: Y2027 })).not.toBe(id);
    expect(signalId({ ...base, window: { ...Y2026, grain: 'month' } })).not.toBe(id);
    expect(signalId({ ...base, target: 'other' })).not.toBe(id);
    expect(signalId({ ...base, domain: 'wealth' })).not.toBe(id);
    expect(signalId({ ...base, trait: 'risk' })).not.toBe(id);
  });

  test('undefined target == null target', () => {
    expect(signalId({ ...base, target: undefined })).toBe(signalId({ ...base, target: null }));
  });

  test('createSignal id equals signalId', () => {
    const s = createSignal({ ...base, intensity: 0.3, valence: -0.2 });
    expect(s.id).toBe(signalId(base));
    expect(s.evidence).toEqual({ componentIds: [], text: '', modifiers: [] });
  });
});

describe('createSignal validation', () => {
  const bad = (over: Record<string, unknown>) => () => sig(over as Partial<CreateSignalParams>);
  test('rejects invalid members and ranges', () => {
    expect(bad({ domain: 'love' })).toThrow(/domain/);
    expect(bad({ trait: 'luck' })).toThrow(/trait/);
    expect(bad({ system: 'tarot' })).toThrow(/system/);
    expect(bad({ intensity: 1.01 })).toThrow(/intensity/);
    expect(bad({ intensity: -0.01 })).toThrow(/intensity/);
    expect(bad({ intensity: Number.NaN })).toThrow(/intensity/);
    expect(bad({ valence: 1.5 })).toThrow(/valence/);
    expect(bad({ valence: -1.01 })).toThrow(/valence/);
    expect(bad({ ruleId: '' })).toThrow(/ruleId/);
    expect(bad({ ruleVersion: 1.5 })).toThrow(/ruleVersion/);
    expect(bad({ window: { grain: 'week', start: 'a', end: 'b' } })).toThrow(/grain/);
    expect(bad({ window: { grain: 'year', start: '2027', end: '2026' } })).toThrow(/after/);
    expect(bad({ evidence: { modifiers: [{ id: 'm', factor: Infinity, reason: 'x' }] } })).toThrow(/modifier/);
  });
  test('accepts boundaries', () => {
    expect(() => sig({ intensity: 0, valence: -1 })).not.toThrow();
    expect(() => sig({ intensity: 1, valence: 1 })).not.toThrow();
  });
});

describe('aggregateSignals', () => {
  test('empty input → []', () => {
    expect(aggregateSignals([])).toEqual([]);
  });

  test('noisy-OR within a system: 0.5, 0.5 → 0.75', () => {
    const [agg] = aggregateSignals([sig({ intensity: 0.5 }), sig({ intensity: 0.5 })]);
    expect(agg.perSystem.bazi!.score).toBeCloseTo(0.75, 12);
    expect(agg.perSystem.bazi!.signalIds.length).toBe(2);
    expect(agg.score).toBeCloseTo(75, 10);
  });

  test('many rules in one system do not dominate other systems', () => {
    const many = Array.from({ length: 10 }, () => sig({ system: 'bazi', intensity: 0.3 }));
    const one = sig({ system: 'ziwei', intensity: 0.3 });
    const [agg] = aggregateSignals([...many, one]);
    const baziScore = 1 - 0.7 ** 10;
    expect(agg.perSystem.bazi!.score).toBeCloseTo(baziScore, 12);
    expect(agg.perSystem.bazi!.score).toBeLessThanOrEqual(1);
    // equal weights: ziwei still counts as half the cross-system score
    expect(agg.score).toBeCloseTo(((baziScore + 0.3) / 2) * 100, 10);
  });

  test('weighted cross-system score', () => {
    const input = [sig({ system: 'bazi', intensity: 0.8 }), sig({ system: 'ziwei', intensity: 0.2 })];
    const [eq] = aggregateSignals(input);
    expect(eq.score).toBeCloseTo(50, 10);
    const [w] = aggregateSignals(input, { systemWeights: { bazi: 3 } });
    expect(w.score).toBeCloseTo(((3 * 0.8 + 1 * 0.2) / 4) * 100, 10);
    const [zero] = aggregateSignals(input, { systemWeights: { bazi: 0, ziwei: 0 } });
    expect(zero.score).toBe(0);
  });

  test('intensity-weighted valence per system', () => {
    const [agg] = aggregateSignals([sig({ intensity: 0.6, valence: 1 }), sig({ intensity: 0.2, valence: -1 })]);
    expect(agg.perSystem.bazi!.valence).toBeCloseTo((0.6 - 0.2) / 0.8, 12);
  });

  test('consensus count and highConsensus', () => {
    const two = [sig({ system: 'bazi', intensity: 0.5 }), sig({ system: 'ziwei', intensity: 0.6 }), sig({ system: 'numerology', intensity: 0.49 })];
    const [a] = aggregateSignals(two);
    expect(a.consensus).toBe(2);
    expect(a.highConsensus).toBe(false);
    const three = [...two, sig({ system: 'tzolkin', intensity: 0.9 })];
    const [b] = aggregateSignals(three);
    expect(b.consensus).toBe(3);
    expect(b.highConsensus).toBe(true);
    const [c] = aggregateSignals(three, { consensusThreshold: 0.95 });
    expect(c.consensus).toBe(0);
  });

  test('conflict: 2 positive + 1 negative systems', () => {
    const p1 = sig({ system: 'bazi', valence: 0.8 });
    const p1neg = sig({ system: 'bazi', valence: -0.1, intensity: 0.1 }); // net bazi still positive
    const p2 = sig({ system: 'ziwei', valence: 0.5 });
    const n1 = sig({ system: 'numerology', valence: -0.6 });
    const [agg] = aggregateSignals([n1, p2, p1neg, p1]);
    expect(agg.conflict).not.toBeNull();
    expect(agg.conflict!.positive).toEqual([p1.id, p2.id].sort());
    expect(agg.conflict!.negative).toEqual([n1.id]);
    // not averaged away: score still reflects intensity regardless of sign
    expect(agg.score).toBeGreaterThan(0);
  });

  test('no conflict when all same sign or within τ', () => {
    const [same] = aggregateSignals([
      sig({ system: 'bazi', valence: 0.8 }),
      sig({ system: 'ziwei', valence: 0.5 }),
      sig({ system: 'numerology', valence: 0.3 }),
    ]);
    expect(same.conflict).toBeNull();
    const [weak] = aggregateSignals([sig({ system: 'bazi', valence: 0.8 }), sig({ system: 'ziwei', valence: -0.2 })]);
    expect(weak.conflict).toBeNull(); // -0.2 is not < -τ
    const [neg] = aggregateSignals([sig({ system: 'bazi', valence: -0.8 }), sig({ system: 'ziwei', valence: -0.5 })]);
    expect(neg.conflict).toBeNull();
  });

  test('deterministic ordering and input-order independence', () => {
    const input = [
      sig({ domain: 'health', window: Y2026 }),
      sig({ domain: 'self', window: Y2027 }),
      sig({ domain: 'career', window: Y2027, system: 'ziwei' }),
      sig({ domain: 'self', window: Y2026 }),
      sig({ domain: 'career', window: Y2026, intensity: 0.3 }),
      sig({ domain: 'career', window: Y2026, intensity: 0.7, system: 'jyotish' }),
    ];
    const out = aggregateSignals(input);
    expect(out.map((a) => `${a.domain}@${a.window.start}`)).toEqual([
      'self@2026-01-01',
      'self@2027-01-01',
      'career@2026-01-01',
      'career@2027-01-01',
      'health@2026-01-01',
    ]);
    const reversed = aggregateSignals([...input].reverse());
    expect(JSON.stringify(reversed)).toBe(JSON.stringify(out));
    expect(Object.keys(out[2].perSystem)).toEqual(['bazi', 'jyotish']);
  });
});

describe('bands', () => {
  test('default cuts are inclusive lower bounds', () => {
    expect(DEFAULT_BAND_CUTS).toEqual([35, 55, 75]);
    expect(toBand(0)).toBe('低');
    expect(toBand(34.9)).toBe('低');
    expect(toBand(35)).toBe('中');
    expect(toBand(54.9)).toBe('中');
    expect(toBand(55)).toBe('中高');
    expect(toBand(74.9)).toBe('中高');
    expect(toBand(75)).toBe('高');
    expect(toBand(100)).toBe('高');
  });
  test('overridable cuts and validation', () => {
    expect(toBand(40, [20, 40, 60])).toBe('中高');
    expect(() => toBand(Number.NaN)).toThrow();
    expect(() => toBand(50, [60, 40, 80])).toThrow(/ascending/);
  });
});
