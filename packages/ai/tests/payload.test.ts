import { describe, expect, test } from 'bun:test';
import { buildInterpretationPayload, REDACTED } from '../src/payload';
import { loadQuestion, loadReport } from './helpers';

describe('buildInterpretationPayload — de-identification (D-029)', () => {
  test('no name, birthplace label, birth date/time or coordinates in the payload', () => {
    const report = loadReport();
    expect(report.input?.name).toBe('王小明');
    const { payloadJson, payload } = buildInterpretationPayload(report, { question: loadQuestion() });
    expect(payloadJson).not.toContain('王小明');
    expect(payloadJson).not.toContain('台北市大安區');
    expect(payloadJson).not.toContain('1991-10-05');
    expect(payloadJson).not.toContain('14:30');
    expect(/"(lat|lng|latitude|longitude|label)":/.test(payloadJson)).toBe(false);
    expect(payload.profile).toEqual({ gender: 'female', timeAccuracy: 'exact', timezone: 'Asia/Taipei' });
    expect(Object.keys(payload)).not.toContain('input');
  });

  test('name / label leaking into any string (e.g. evidence text) is redacted', () => {
    const report = loadReport();
    report.signals![0] = {
      ...report.signals![0],
      evidence: { ...report.signals![0].evidence, text: '王小明 出生於 台北市大安區' },
    };
    const { payloadJson } = buildInterpretationPayload(report, { maxChars: 10_000_000 });
    expect(payloadJson).not.toContain('王小明');
    expect(payloadJson).not.toContain('台北市大安區');
    expect(payloadJson).toContain(`${REDACTED} 出生於 ${REDACTED}`);
  });
});

describe('buildInterpretationPayload — determinism (D-014)', () => {
  test('same report → byte-identical payload, ignoring generatedAt / computedAt / durationMs', () => {
    const a = buildInterpretationPayload(loadReport(), { question: loadQuestion() });
    const r2 = loadReport();
    r2.generatedAt = '2099-01-01T00:00:00.000Z';
    for (const e of r2.engines ?? []) Object.assign(e, { computedAt: '2099-01-01T00:00:00Z', durationMs: 999 });
    // Shuffle input ordering: signals and engines.
    r2.signals = [...(r2.signals ?? [])].reverse();
    r2.engines = [...(r2.engines ?? [])].reverse();
    const b = buildInterpretationPayload(r2, { question: loadQuestion() });
    expect(b.payloadJson).toBe(a.payloadJson);
    expect(a.payloadJson).not.toContain('computedAt');
    expect(a.payloadJson).not.toContain('durationMs');
  });

  test('signals sorted by id; charts sorted by system', () => {
    const { payload } = buildInterpretationPayload(loadReport(), { maxChars: 10_000_000 });
    const ids = payload.signals.map((s) => s.id);
    expect(ids).toEqual([...ids].sort());
    const systems = payload.charts.map((c) => c.system);
    expect(systems).toEqual([...systems].sort());
    expect(systems).toContain('bazi');
    expect(systems).toContain('ziwei');
    // essential fields only
    expect(Object.keys(payload.signals[0]).sort()).toEqual(
      ['domain', 'evidence', 'id', 'intensity', 'ruleId', 'system', 'trait', 'valence', 'window'].sort(),
    );
    expect(Object.keys(payload.signals[0].evidence)).toEqual(['text']);
  });
});

describe('buildInterpretationPayload — size budget', () => {
  test('no truncation under a large budget', () => {
    const report = loadReport();
    const { payload } = buildInterpretationPayload(report, { maxChars: 10_000_000 });
    expect(payload.truncation.signalsDropped).toBe(0);
    expect(payload.truncation.signalsKept).toBe(report.signals!.length);
    expect(payload.truncation.droppedMaxIntensity).toBeNull();
  });

  test('drops lowest-intensity signals first and records it', () => {
    const report = loadReport();
    const maxChars = 60_000;
    const { payload, payloadJson, signalIds } = buildInterpretationPayload(report, { maxChars });
    const t = payload.truncation;
    expect(payloadJson.length).toBeLessThanOrEqual(maxChars);
    expect(t.signalsDropped).toBeGreaterThan(0);
    expect(t.signalsKept + t.signalsDropped).toBe(t.signalsTotal);
    expect(t.overBudget).toBe(false);
    const minKept = Math.min(...payload.signals.map((s) => s.intensity));
    expect(minKept).toBeGreaterThanOrEqual(t.droppedMaxIntensity!);
    // every referenced id is present
    for (const cell of [...payload.timeline!.years, ...payload.timeline!.months]) {
      for (const d of cell.domains) for (const id of d.topSignalIds) expect(signalIds.has(id)).toBe(true);
    }
  });

  test('question source signals are kept before others', () => {
    const q = loadQuestion();
    const { payload, signalIds } = buildInterpretationPayload(loadReport(), { question: q, maxChars: 70_000 });
    expect(payload.truncation.signalsDropped).toBeGreaterThan(0);
    for (const w of q.top) for (const s of [...w.supportSignals, ...w.riskSignals]) expect(signalIds.has(s.id)).toBe(true);
    expect(payload.question!.top[0].supportSignalIds.length).toBe(q.top[0].supportSignals.length);
  });

  test('overBudget flagged when even the base exceeds the budget', () => {
    const { payload } = buildInterpretationPayload(loadReport(), { maxChars: 1_000 });
    expect(payload.truncation.overBudget).toBe(true);
    expect(payload.signals).toHaveLength(0);
  });
});
