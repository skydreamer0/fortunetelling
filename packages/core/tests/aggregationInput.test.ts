import { describe, expect, test } from 'bun:test';
import { aggregateSignals, createSignal, type CreateSignalParams, type Signal } from '../src/signals/index';

const window = { grain: 'year', start: '2026-01-01', end: '2026-12-31' } as const;
function signal(target: string, options: Partial<CreateSignalParams> = {}): Signal {
  return createSignal({
    system: 'bazi', ruleId: 'bazi.synthetic', ruleVersion: 1, target,
    domain: 'career', trait: 'change', intensity: 0.5, valence: 0, window,
    ...options,
  });
}

describe('#43 aggregation input guards', () => {
  test('identical ids are counted once, including distinct objects and reordered keys', () => {
    const one = signal('same', { valence: 0.8 });
    const reordered = Object.fromEntries(Object.entries(structuredClone(one)).reverse()) as unknown as Signal;
    const expected = aggregateSignals([one]);
    expect(aggregateSignals([one, one, structuredClone(one), reordered])).toEqual(expected);
    expect(expected[0].perSystem.bazi!.score).toBe(0.5);
    expect(expected[0].perSystem.bazi!.signalIds).toEqual([one.id]);
  });

  test('duplicate placement and input ordering do not affect any aggregate field', () => {
    const a = signal('a', { intensity: 0.4, valence: 0.8 });
    const b = signal('b', { system: 'ziwei', intensity: 0.7, valence: -0.6 });
    const c = signal('c', { domain: 'wealth', intensity: 0.9 });
    const expected = aggregateSignals([a, b, c]);
    for (const input of [[a, b, a, c, b], [c, b, b, a, a], [a, a, b, b, c, c]]) {
      expect(aggregateSignals(input)).toEqual(expected);
    }
  });

  test('distinct ids retain the existing noisy-OR and intensity-weighted valence', () => {
    const [result] = aggregateSignals([
      signal('first', { intensity: 0.5, valence: 1 }),
      signal('second', { intensity: 0.5, valence: -1 }),
    ]);
    expect(result.perSystem.bazi!.score).toBe(0.75);
    expect(result.perSystem.bazi!.valence).toBe(0);
    expect(result.score).toBe(75);
  });

  test('the same id with contradictory payload is rejected in either order', () => {
    const first = signal('collision', { valence: 0.6 });
    const changes: Partial<Signal>[] = [
      { intensity: 0.75 }, { valence: -0.6 }, { system: 'ziwei' }, { domain: 'wealth' },
      { trait: 'risk' }, { ruleId: 'different-rule' }, { ruleVersion: 2 }, { target: 'different-target' },
      { window: { ...window, start: '2026-02-01' } },
      { evidence: { ...first.evidence, text: 'different evidence' } },
    ];
    for (const change of changes) {
      const other = { ...first, ...change };
      expect(() => aggregateSignals([first, other])).toThrow('conflicting signals with id');
      expect(() => aggregateSignals([other, first])).toThrow('conflicting signals with id');
    }
  });

  test('zero weights preserve diagnostics but contribute no vote or conflict', () => {
    const input = [
      signal('positive', { system: 'bazi', intensity: 0.8, valence: 1 }),
      signal('negative', { system: 'ziwei', intensity: 0.8, valence: -1 }),
      signal('neutral', { system: 'numerology', intensity: 0.8, valence: 0 }),
    ];
    const [result] = aggregateSignals(input, { systemWeights: { bazi: 0, ziwei: 0, numerology: 0 } });
    expect(result.score).toBe(0);
    expect(result.consensus).toBe(0);
    expect(result.highConsensus).toBe(false);
    expect(result.conflict).toBeNull();
    expect(Object.keys(result.perSystem)).toEqual(['bazi', 'ziwei', 'numerology']);
    expect(result.perSystem.bazi!.score).toBeCloseTo(0.8, 12);
  });

  test('a zero-weight positive or negative system is absent from conflict sides', () => {
    const a = signal('positive-a', { system: 'bazi', intensity: 0.8, valence: 1 });
    const b = signal('negative', { system: 'ziwei', intensity: 0.8, valence: -1 });
    const c = signal('positive-c', { system: 'numerology', intensity: 0.8, valence: 1 });
    const [withoutA] = aggregateSignals([a, b, c], { systemWeights: { bazi: 0 } });
    expect(withoutA.activityAgreement).toBe(2);
    expect(withoutA.consensus).toBe(1);
    expect(withoutA.conflict).toEqual({ positive: [c.id], negative: [b.id] });
    const [withoutB] = aggregateSignals([a, b, c], { systemWeights: { ziwei: 0 } });
    expect(withoutB.consensus).toBe(2);
    expect(withoutB.conflict).toBeNull();
  });

  test('finite positive weights preserve the existing weighted mean and vote threshold', () => {
    const a = signal('weighted-a', { intensity: 0.8 });
    const b = signal('weighted-b', { system: 'ziwei', intensity: 0.2 });
    const [result] = aggregateSignals([a, b], { systemWeights: { bazi: 3 }, consensusThreshold: 0.5 });
    expect(result.score).toBeCloseTo(65, 12);
    expect(result.activityAgreement).toBe(1);
    expect(result.consensus).toBe(0);
    expect(aggregateSignals([a, b], { systemWeights: { bazi: undefined } })).toEqual(aggregateSignals([a, b]));
  });

  test('every supplied invalid weight is rejected, even with empty input or an absent system', () => {
    for (const weight of [-1, Number.NaN, Infinity, -Infinity, '1', null]) {
      const options = { systemWeights: { jyotish: weight } } as any;
      expect(() => aggregateSignals([], options)).toThrow(/weight/);
      expect(() => aggregateSignals([signal('valid')], options)).toThrow(/weight/);
    }
  });

  test('inherited or non-record weight containers cannot bypass entry validation', () => {
    const inherited = Object.create({ bazi: -1 });
    for (const systemWeights of [inherited, [], new Map(), null]) {
      expect(() => aggregateSignals([signal('valid')], { systemWeights } as any)).toThrow(/systemWeights/);
    }
    expect(() => aggregateSignals([], { systemWeights: { unknown: 1 } } as any)).toThrow(/unknown system/);
    expect(aggregateSignals([], { systemWeights: Object.assign(Object.create(null), { bazi: 0 }) })).toEqual([]);
  });

  test('both thresholds reject non-finite, out-of-range and non-number values before grouping', () => {
    for (const value of [Number.NaN, Infinity, -Infinity, -0.001, 1.001, '0.5', null]) {
      for (const key of ['consensusThreshold', 'conflictThreshold']) {
        expect(() => aggregateSignals([], { [key]: value } as any)).toThrow(/Threshold/);
        expect(() => aggregateSignals([signal('valid')], { [key]: value } as any)).toThrow(/Threshold/);
      }
    }
  });

  test('threshold boundaries zero and one remain valid', () => {
    const a = signal('boundary-positive', { intensity: 1, valence: 1 });
    const b = signal('boundary-negative', { system: 'ziwei', intensity: 1, valence: -1 });
    const [zero] = aggregateSignals([a, b], { consensusThreshold: 0, conflictThreshold: 0 });
    expect(zero.activityAgreement).toBe(2);
    expect(zero.consensus).toBe(1);
    expect(zero.conflict).not.toBeNull();
    const [one] = aggregateSignals([a, b], { consensusThreshold: 1, conflictThreshold: 1 });
    expect(one.activityAgreement).toBe(2);
    expect(one.consensus).toBe(0);
    expect(one.conflict).toBeNull();
  });

  test('validation and de-duplication never mutate caller arrays, signals or weights', () => {
    const a = signal('immutable', { valence: 0.8 });
    const input = [a, structuredClone(a)];
    const weights = { bazi: 1 };
    const before = structuredClone({ input, weights });
    aggregateSignals(input, { systemWeights: weights });
    expect({ input, weights }).toEqual(before);
  });
});
