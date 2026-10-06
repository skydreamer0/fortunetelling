import { describe, expect, test } from 'bun:test';
import { aggregateSignals, createSignal, type Signal, type SystemId } from '../src/signals/index';
import { buildConsensus } from '../src/consensus/buildConsensus';
import { restrictTimeline, restrictTimelineCell } from '../src/timeline/buildTimeline';
import { answerQuestion } from '../src/questions/engine';

const window = { grain: 'month', start: '2026-07-01', end: '2026-07-31' } as const;
function input(valences: number[], systems: SystemId[] = ['bazi', 'ziwei', 'numerology'], intensity = 0.8): Signal[] {
  return systems.map((system, i) => createSignal({
    system, ruleId: `${system}.synthetic`, ruleVersion: 1, target: `case-${i}`,
    domain: 'career', trait: 'opportunity', intensity, valence: valences[i], window,
  }));
}
const aggregate = (signals: Signal[], options: any = {}): any => aggregateSignals(signals, options)[0];
const fixtureTimeline = (signals: Signal[], options: any = {}): any => {
  const yearWindow = { grain: 'year', start: '2026-01-01', end: '2026-12-31' } as const;
  const yearSignals = signals.map(signal => createSignal({ ...signal, window: yearWindow }));
  const value = aggregate(yearSignals, options);
  const cell = {
    ...value,
    perSystem: Object.fromEntries(Object.entries(value.perSystem).map(([key, raw]: [string, any]) => [key, {
      ...raw, score: Math.round(raw.score * 1e4) / 1e4, valence: Math.round(raw.valence * 1e4) / 1e4,
    }])),
    band: '高', topSignals: yearSignals,
  };
  return {
    schemaVersion: 2, asOf: '2026-07-11', systems: [...new Set(signals.map(signal => signal.system))],
    skippedSystems: [], conventions: {}, bandCuts: [35, 55, 75],
    thresholds: { theta: options.consensusThreshold ?? 0.5, tau: options.conflictThreshold ?? 0.2 },
    systemWeights: Object.fromEntries(signals.map(signal => [signal.system, options.systemWeights?.[signal.system] ?? 1])),
    years: [{ window: yearWindow, domains: [cell] }], months: [],
  };
};

async function evidenceModule() {
  const path = '../src/signals/directionalEvidence';
  return await import(path);
}

describe('#44 directional agreement at raw aggregation boundary', () => {
  test('three active positive/negative/neutral systems are activity agreement only', () => {
    const result = aggregate(input([1, -1, 0]));
    expect(result.highConsensus).toBe(false);
    expect(result.activityAgreement).toBe(3);
    expect(result.consensus).toBe(1);
    expect(result.highConsensus).toBe(false);
    expect(result.conflict).not.toBeNull();
  });

  test('three eligible systems must agree on one actual direction', async () => {
    const { directionalVotes } = await evidenceModule();
    for (const direction of [1, -1]) {
      const result = aggregate(input([direction, direction, direction]));
      expect(result.activityAgreement).toBe(3);
      expect(result.consensus).toBe(3);
      expect(result.highConsensus).toBe(true);
      const votes = directionalVotes(result.directionalEvidence);
      expect(votes[direction === 1 ? 'positive' : 'negative'].systems).toEqual(['bazi', 'ziwei', 'numerology']);
      expect(votes[direction === 1 ? 'negative' : 'positive'].systems).toEqual([]);
    }
  });

  test('neutral Human Design, experimental Jyotish and zero weight cannot supply a third directional vote', () => {
    const hd = aggregate(input([1, 1, 0], ['bazi', 'ziwei', 'humanDesign']));
    const exp = aggregate(input([1, 1, 1], ['bazi', 'ziwei', 'jyotish']));
    const zero = aggregate(input([1, 1, 1]), { systemWeights: { numerology: 0 } });
    for (const result of [hd, exp, zero]) {
      expect(result.consensus).toBe(2);
      expect(result.highConsensus).toBe(false);
    }
    expect(hd.activityAgreement).toBe(3);
    expect(exp.activityAgreement).toBe(3);
    expect(zero.activityAgreement).toBe(2);
  });

  test('experimental systems remain visible as activity and conflict evidence', () => {
    const signals = input([1, 1, 1, -1], ['bazi', 'ziwei', 'numerology', 'jyotish']);
    const result = aggregate(signals);
    expect(result.highConsensus).toBe(true);
    expect(result.activityAgreement).toBe(4);
    expect(result.conflict.negative).toContain(signals[3].id);
    expect(result.perSystem.jyotish).toBeDefined();
  });

  test('opposing three-system sides are both retained instead of presenting unanimity', async () => {
    const { directionalVotes } = await evidenceModule();
    const signals = input([1, 1, 1, -1, -1, -1], ['bazi', 'ziwei', 'numerology', 'tzolkin', 'mingGua', 'humanDesign']);
    const result = aggregate(signals);
    const votes = directionalVotes(result.directionalEvidence);
    expect(result.highConsensus).toBe(true);
    expect(votes.positive.systems).toHaveLength(3);
    expect(votes.negative.systems).toHaveLength(3);
    expect(result.conflict).not.toBeNull();
    const summary = buildConsensus(fixtureTimeline(signals)) as any;
    expect(summary.headlines.agreements.map((item: any) => item.direction).sort()).toEqual(['negative', 'positive']);
  });

  test('raw score below theta stays below after the displayed score rounds up', async () => {
    const { directionalVotes } = await evidenceModule();
    for (const strength of [0.49996, 0.50004]) {
      const signals = input([1, 1, 1], undefined, strength);
      const timeline = fixtureTimeline(signals);
      expect(timeline.years[0].domains[0].perSystem.bazi.score).toBe(0.5);
      const votes = directionalVotes(timeline.years[0].domains[0].directionalEvidence);
      expect(votes.positive.systems.length).toBe(strength < 0.5 ? 0 : 3);
      expect(buildConsensus(timeline).headlines.agreements.length).toBe(strength < 0.5 ? 0 : 1);
    }
  });

  test('raw valence exactly at tau is neutral but values just beyond are directional', () => {
    for (const valence of [0.2, -0.2, 0.20004, -0.20004]) {
      const result = aggregate(input([valence, valence, valence], undefined, 1));
      expect(result.highConsensus).toBe(Math.abs(valence) > 0.2);
      expect(result.consensus).toBe(Math.abs(valence) > 0.2 ? 3 : 0);
    }
  });

  test('custom theta/tau remain the source of truth through restricted cells and consensus', () => {
    const signals = input([0.6, 0.6, 0.6], undefined, 0.7);
    const timeline = fixtureTimeline(signals, { consensusThreshold: 0.8, conflictThreshold: 0.7 });
    const restricted = restrictTimeline(timeline, ['bazi', 'ziwei', 'numerology']) as any;
    expect(restricted.thresholds).toEqual({ theta: 0.8, tau: 0.7 });
    expect(restricted.years[0].domains[0].highConsensus).toBe(false);
    expect((buildConsensus(restricted) as any).thresholds).toEqual(restricted.thresholds);
    expect(buildConsensus(restricted).headlines.agreements).toEqual([]);
    expect(() => buildConsensus(restricted, { consensusThreshold: 0.5 })).toThrow(/threshold/i);
    expect(() => restrictTimelineCell(timeline.years[0], ['bazi'], timeline, { conflictThreshold: 0.2 })).toThrow(/threshold/i);
  });

  test('an old timeline cannot be reinterpreted as a directional high-consensus claim', () => {
    const timeline = fixtureTimeline(input([1, 1, 1]));
    timeline.schemaVersion = 1;
    delete timeline.thresholds;
    for (const cell of timeline.years) for (const domain of cell.domains) {
      delete domain.directionalEvidence;
      delete domain.activityAgreement;
      domain.consensus = 3;
      domain.highConsensus = true;
    }
    expect(buildConsensus(timeline).headlines.agreements).toEqual([]);
  });

  test('stale proof cannot revive a system removed from the timeline or cell', () => {
    const timeline = fixtureTimeline(input([1, 1, 1]));
    timeline.systems = ['bazi', 'ziwei'];
    delete timeline.systemWeights.numerology;
    delete timeline.years[0].domains[0].perSystem.numerology;
    expect(buildConsensus(timeline).headlines.agreements).toEqual([]);
  });

  test('Question Engine carries per-domain raw evidence for its evaluated window', () => {
    const request = { category: 'job_change', range: { start: '2026-07', end: '2026-07' } };
    const mixed = answerQuestion(request, () => input([1, -1, 0])) as any;
    const same = answerQuestion(request, () => input([1, 1, 1])) as any;
    expect(mixed.top[0].activityAgreement).toBe(3);
    expect(mixed.top[0].highConsensus).toBe(false);
    expect(same.top[0].highConsensus).toBe(true);
    const domain = same.top[0].domainScores.find((item: any) => item.domain === 'career');
    expect(domain.directionalEvidence.window).toEqual(window);
    expect(domain.directionalEvidence.thresholds).toEqual({ theta: 0.5, tau: 0.2 });
  });
});

describe('#44 trustworthy citation evidence', () => {
  test('non-enumerable entries and changing getters cannot evade the validated own-data snapshot', async () => {
    const { directionalVotes, supportsHighConsensusCitations } = await evidenceModule();
    const signals = input([1, 1, 1]);
    const base = aggregate(signals).directionalEvidence;
    const hidden = { ...base, perSystem: {} };
    for (const system of ['bazi', 'ziwei', 'numerology']) Object.defineProperty(hidden.perSystem, system, {
      enumerable: false, value: { score: 1, valence: 1, weight: 1, signalIds: ['sig_aaaaaaaaaaaaaaaa'] },
    });
    expect(directionalVotes(hidden)?.positive.systems).toEqual([]);
    expect(supportsHighConsensusCitations([hidden], signals)).toBe(false);
    let reads = 0;
    const drifting = structuredClone(base);
    const ids = drifting.perSystem.bazi.signalIds;
    Object.defineProperty(drifting.perSystem.bazi, 'signalIds', { enumerable: true, get: () => ++reads === 1 ? ids : [] });
    expect(supportsHighConsensusCitations([drifting], signals)).toBe(true);
    expect(reads).toBe(1);
  });
  test('proof requires three cited systems on the same side in one domain/window', async () => {
    const { supportsHighConsensusCitations } = await evidenceModule();
    const signals = input([1, 1, 1]);
    const proof = aggregate(signals).directionalEvidence;
    expect(supportsHighConsensusCitations([proof], signals)).toBe(true);
    expect(supportsHighConsensusCitations([proof], signals.slice(0, 2))).toBe(false);
    expect(supportsHighConsensusCitations([], signals)).toBe(false);
    expect(supportsHighConsensusCitations([aggregate(input([1, -1, 0])).directionalEvidence], signals)).toBe(false);
    const other = signals.map(signal => ({ ...signal, window: { ...window, start: '2027-07-01', end: '2027-07-31' } }));
    expect(supportsHighConsensusCitations([proof], other)).toBe(false);
    expect(supportsHighConsensusCitations([proof], signals.map(signal => ({ ...signal, domain: 'wealth' })))).toBe(false);
  });

  test('citations cannot promote below-threshold systems by recalculating only a chosen subset', async () => {
    const { supportsHighConsensusCitations } = await evidenceModule();
    const signals = input([1, 1, 1], undefined, 0.49);
    expect(supportsHighConsensusCitations([aggregate(signals).directionalEvidence], signals)).toBe(false);
    const proof = aggregate(input([1, 1, 1])).directionalEvidence;
    expect(supportsHighConsensusCitations([proof], signals.map(signal => ({ ...signal, id: 'sig_ffffffffffffffff' })))).toBe(false);
  });

  test('malformed evidence is rejected conservatively', async () => {
    const { directionalVotes, supportsHighConsensusCitations } = await evidenceModule();
    const signals = input([1, 1, 1]);
    const base = aggregate(signals).directionalEvidence;
    const changes = [
      (proof: any) => { proof.thresholds.theta = Number.NaN; },
      (proof: any) => { proof.thresholds.tau = -1; },
      (proof: any) => { proof.perSystem.unknown = proof.perSystem.bazi; },
      (proof: any) => { proof.perSystem.bazi.weight = Infinity; },
      (proof: any) => { proof.perSystem.bazi.signalIds = []; },
      (proof: any) => { proof.perSystem.ziwei.signalIds = [...proof.perSystem.bazi.signalIds]; },
      (proof: any) => { proof.policy = 'legacy'; },
    ];
    for (const change of changes) {
      const proof = structuredClone(base); change(proof);
      expect(directionalVotes(proof)).toBeNull();
      expect(supportsHighConsensusCitations([proof], signals)).toBe(false);
    }
  });
});
