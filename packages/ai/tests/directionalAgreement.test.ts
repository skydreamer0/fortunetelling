import { describe, expect, test } from 'bun:test';
import { aggregateSignals, createSignal } from '../../core/src/signals/index';
import { buildInterpretationPayload } from '../src/payload';
import { checkAnswer } from '../src/checkAnswer';
import { validateSections } from '../src/validate';
import { checkPastedAnswer } from '../src/pasteCheck';

const window = { grain: 'year', start: '2026-01-01', end: '2026-12-31' } as const;
function fixture(valences = [1, 1, 1], options: any = {}) {
  const signals = (['bazi', 'ziwei', 'numerology'] as const).map((system, i) => createSignal({
    system, ruleId: `${system}.synthetic`, ruleVersion: 1, target: `${i}`, domain: 'career',
    trait: 'opportunity', intensity: 0.8, valence: valences[i], window,
  }));
  const agg: any = aggregateSignals(signals, options)[0];
  const timeline: any = {
    schemaVersion: 2, asOf: '2026-07-11', systems: signals.map(signal => signal.system), skippedSystems: [],
    conventions: {}, bandCuts: [35, 55, 75], systemWeights: { bazi: 1, ziwei: 1, numerology: 1, ...options.systemWeights },
    thresholds: { theta: options.consensusThreshold ?? 0.5, tau: options.conflictThreshold ?? 0.2 },
    years: [{ window, domains: [{ ...agg, band: '高', topSignals: signals }] }], months: [],
  };
  const report: any = { schemaVersion: 6, asOf: timeline.asOf, engines: [], signals, timeline };
  const built = buildInterpretationPayload(report, { budget: false });
  const text = `這段時期事業面有高共識${signals.map(signal => `〔${signal.id}〕`).join('')}。`;
  const lookup = (id: string) => signals.find(signal => signal.id.startsWith(id)) ?? null;
  const section = { heading: '這段時期', text: '事業面有高共識', citations: signals.map(signal => signal.id) };
  return { signals, agg, timeline, report, built, text, lookup, section };
}

describe('#44 all AI check paths use trusted same-direction evidence', () => {
  test('three known system names alone cannot authorize a high-consensus claim', () => {
    const f = fixture();
    expect(checkAnswer(f.text, { signalLookup: f.lookup }).issues.some(issue => issue.code === 'high_consensus_unsupported')).toBe(true);
  });

  test('mixed directions are rejected by checkAnswer, validateSections and paste-back', () => {
    const f = fixture([1, -1, 0]);
    const checked = checkAnswer(f.text, { signalLookup: f.lookup, directionalEvidence: [f.agg.directionalEvidence] } as any);
    expect(checked.issues.some(issue => issue.code === 'high_consensus_unsupported')).toBe(true);
    expect(validateSections([f.section], f.built).dropped.flatMap(item => item.reasons).some(reason => reason.code === 'high_consensus_unsupported')).toBe(true);
    expect(checkPastedAnswer(f.built, f.text).paragraphs.flatMap(item => item.flags).some(flag => flag.code === 'high_consensus_unsupported')).toBe(true);
  });

  test('a genuine eligible side remains usable through all three validators', () => {
    const f = fixture();
    expect(checkAnswer(f.text, { signalLookup: f.lookup, directionalEvidence: [f.agg.directionalEvidence] } as any).ok).toBe(true);
    expect(validateSections([f.section], f.built).kept).toHaveLength(1);
    expect(checkPastedAnswer(f.built, f.text).ok).toBe(true);
  });

  test('the payload carries raw thresholds/provenance and distinguishes shared attention', () => {
    const f = fixture([1, -1, 0], { consensusThreshold: 0.7, conflictThreshold: 0.3 });
    const timeline = f.built.payload.timeline as any;
    expect(timeline.thresholds).toEqual({ theta: 0.7, tau: 0.3 });
    expect(timeline.years[0].domains[0].activityAgreement).toBe(3);
    expect(timeline.years[0].domains[0].highConsensus).toBe(false);
    expect(timeline.years[0].domains[0].directionalEvidence).toEqual(f.agg.directionalEvidence);
  });

  test('short ids keep proof references resolvable and validators still work', () => {
    const f = fixture();
    const built = buildInterpretationPayload(f.report, { budget: false, shortIds: true });
    const ids = built.payload.signals.map(signal => signal.id);
    const proof = (built.payload.timeline as any).years[0].domains[0].directionalEvidence;
    expect(Object.values(proof.perSystem).flatMap((value: any) => value.signalIds).sort()).toEqual([...ids].sort());
    const section = { ...f.section, citations: ids };
    expect(validateSections([section], built).kept).toHaveLength(1);
    expect(checkPastedAnswer(built, `事業面有高共識${ids.map(id => `〔${id}〕`).join('')}`).ok).toBe(true);
  });

  test('legacy report flags without provenance are not promoted to new high-consensus claims', () => {
    const f = fixture();
    f.report.schemaVersion = 5;
    f.timeline.schemaVersion = 1;
    delete f.timeline.thresholds;
    delete f.timeline.years[0].domains[0].directionalEvidence;
    const built = buildInterpretationPayload(f.report, { budget: false });
    expect(built.payload.timeline!.years[0].domains[0].highConsensus).toBe(false);
    expect(validateSections([f.section], built).kept).toEqual([]);
  });

  test('truncation never leaves a proof claiming references to omitted signals', () => {
    const f = fixture();
    const built = buildInterpretationPayload(f.report, { maxChars: 300 });
    const kept = new Set(built.payload.signals.map(signal => signal.id));
    for (const domain of built.payload.timeline!.years[0].domains as any[]) {
      const proof = domain.directionalEvidence;
      if (proof) for (const system of Object.values(proof.perSystem) as any[]) {
        expect(system.signalIds.every((id: string) => kept.has(id))).toBe(true);
      }
      if (kept.size < 3) expect(domain.highConsensus).toBe(false);
    }
  });

  test('honest negative wording is not misread as a positive consensus claim', () => {
    const f = fixture([1, -1, 0]);
    const section = { ...f.section, text: '這些系統只有共同關注，並沒有高共識。' };
    expect(validateSections([section], f.built).kept).toHaveLength(1);
    expect(checkPastedAnswer(f.built, `沒有高共識${f.signals.map(signal => `〔${signal.id}〕`).join('')}`).ok).toBe(true);
  });
});
