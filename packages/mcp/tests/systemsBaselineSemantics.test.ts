import { describe, expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { classifySystemsBaselineChange, projectSystemsBaseline } from './systemsBaselineSemantics';
import provenance from './fixtures/systemsBaseline.provenance.json';
import baseline from './fixtures/systemsBaseline.json';
import agreementDelta from './fixtures/systemsBaseline.v0.6.0.delta.json';
import abstentionDelta from './fixtures/systemsBaseline.v0.7.0.delta.json';

// Synthetic contract examples only. These are not recovered historical MCP payloads.
const sample = () => ({
  asOf: '2026-09-30',
  versionsHash: 'synthetic-v1',
  caveats: [{ code: 'experimental:humanDesign', message: 'Synthetic old caveat' }],
  data: {
    score: 0.2,
    signalIds: ['sig_0000000000000001', 'sig_0000000000000002'],
    systemsUsed: ['bazi', 'humanDesign'],
    excludedSystems: ['jyotish'],
    experimentalIncluded: true,
    experimentalSensitivity: { changed: false, verifiedSystems: ['bazi'] },
    years: [{ year: 2027, score: 0.2 }],
    conventions: 'Synthetic data text',
  },
});

describe('MCP baseline attribution (synthetic controls, not historical replay)', () => {
  test('identity and object-key order do not create differences', () => {
    const before = sample();
    const after = { data: Object.fromEntries(Object.entries(before.data).reverse()), caveats: before.caveats, versionsHash: before.versionsHash, asOf: before.asOf };
    expect(classifySystemsBaselineChange(before, before).kind).toBe('unchanged');
    expect(classifySystemsBaselineChange(before, after)).toEqual({
      kind: 'unchanged', changed: { data: false, caveats: false, versions: false, envelope: false },
    });
  });

  test('caveat text, code, removal and addition are visible without changing data', () => {
    const before = sample();
    for (const caveats of [
      [{ ...before.caveats[0], message: 'New text' }],
      [{ ...before.caveats[0], code: 'scores_uncalibrated' }],
      [],
      [...before.caveats, { code: 'new_warning', message: 'Review me' }],
    ]) {
      expect(classifySystemsBaselineChange(before, { ...before, caveats })).toEqual({
        kind: 'caveats-only', changed: { data: false, caveats: true, versions: false, envelope: false },
      });
    }
  });

  test('version hash and optional full version block stay separate from data', () => {
    const before = sample();
    for (const after of [{ ...before, versionsHash: 'synthetic-v2' }, { ...before, versions: { core: 'example' } }]) {
      expect(classifySystemsBaselineChange(before, after)).toEqual({
        kind: 'versions-only', changed: { data: false, caveats: false, versions: true, envelope: false },
      });
    }
    expect(classifySystemsBaselineChange(before, { ...before, caveats: [], versionsHash: 'synthetic-v2' }).kind)
      .toBe('caveats-and-versions');
  });

  test('score, signal order, eligibility, sensitivity, year and in-data text changes are not stripped', () => {
    const before = sample();
    const changes = [
      { score: 0.3 },
      { signalIds: [...before.data.signalIds].reverse() },
      { systemsUsed: ['bazi'] },
      { excludedSystems: ['jyotish', 'humanDesign'] },
      { experimentalIncluded: false },
      { experimentalSensitivity: { changed: false, verifiedSystems: ['bazi', 'humanDesign'] } },
      { years: [{ year: 2027, score: 0.3 }] },
      { conventions: 'New data text' },
      { unknownFutureField: { message: 'Must remain visible' } },
      { caveats: ['A nested field named caveats is still data'] },
      { versionsHash: 'A nested field named versionsHash is still data' },
      { generatedAt: 'No recursive omit policy here' },
    ];
    for (const change of changes) {
      expect(classifySystemsBaselineChange(before, { ...before, data: { ...before.data, ...change } })).toEqual({
        kind: 'data-change', changed: { data: true, caveats: false, versions: false, envelope: false },
      });
    }
  });

  test('mixed data/caveat/version changes cannot be passed off as metadata-only', () => {
    const before = sample();
    const after = { ...before, caveats: [], versionsHash: 'synthetic-v2', data: { ...before.data, score: 0.3 } };
    expect(classifySystemsBaselineChange(before, after)).toEqual({
      kind: 'data-change', changed: { data: true, caveats: true, versions: true, envelope: false },
    });
  });

  test('asOf and unaccounted envelope fields are preserved in both directions', () => {
    const before = sample();
    for (const after of [{ ...before, asOf: '2026-10-01' }, { ...before, future: { score: 1 } }, { ...before, generatedAt: 'new' }]) {
      for (const [a, b] of [[before, after], [after, before]]) {
        expect(classifySystemsBaselineChange(a, b)).toEqual({
          kind: 'envelope-change', changed: { data: false, caveats: false, versions: false, envelope: true },
        });
      }
    }
    expect(classifySystemsBaselineChange(before, { ...before, future: 1, data: { ...before.data, score: 0.3 } }).changed)
      .toEqual({ data: true, caveats: false, versions: false, envelope: true });
  });

  test('projection does not mutate input and keeps all data fields', () => {
    const before = sample();
    const snapshot = JSON.stringify(before);
    const projected = projectSystemsBaseline(before);
    expect(projected.data).toEqual(before.data);
    expect(projected.caveats).toEqual(before.caveats);
    expect(projected.envelope).toEqual({ asOf: before.asOf });
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  test('error envelopes, hashes and malformed inputs cannot masquerade as payload evidence', () => {
    for (const value of [null, [], 'a'.repeat(64), { error: { code: 'failed' } }, {},
      { ...sample(), caveats: null }, { ...sample(), versionsHash: null },
      { ...sample(), asOf: undefined }, { ...sample(), error: { code: 'failed' } }]) {
      expect(() => projectSystemsBaseline(value)).toThrow();
    }
    const missingData: Record<string, unknown> = sample();
    delete missingData.data;
    expect(() => projectSystemsBaseline(missingData)).toThrow();
  });
});

describe('source-backed historical provenance (recorded digests, not payload replay)', () => {
  test('legacy baseline and both reviewed delta files remain byte-for-byte unchanged', () => {
    for (const file of provenance.preservedFiles) {
      const bytes = readFileSync(new URL(`./fixtures/${file.file}`, import.meta.url));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256);
    }
    const old = baseline as Record<string, string>;
    const first = agreementDelta.changes as Record<string, { before: string; after: string }>;
    const next = abstentionDelta.changes as Record<string, { before: string; after: string }>;
    expect(Object.keys(first).sort()).toEqual(Object.keys(old).filter(k => !k.startsWith('$')).sort());
    for (const [key, change] of Object.entries(first)) expect(change.before).toBe(old[key]);
    for (const [key, change] of Object.entries(next)) expect(change.before).toBe(first[key].after);
  });

  test('M5-03 preserves two recorded data digests but changes six envelope digests and eligibility source', () => {
    const transition = provenance.transitions[0];
    expect(transition.id).toBe('M5-03');
    expect(transition.sourceClassification).toBe('caveats-and-eligibility');
    expect(transition.entries).toHaveLength(8);
    expect(transition.entries.filter(e => e.before !== e.after)).toHaveLength(6);
    for (const entry of transition.entries) {
      expect(entry.before === entry.after).toBe(entry.beforeKey.startsWith('aq-detail|'));
    }
  });

  test('M5-04 records eight changed digests with source-backed natal-to-transit calculation changes', () => {
    const transition = provenance.transitions[1];
    expect(transition.id).toBe('M5-04');
    expect(transition.sourceClassification).toBe('calculation-data-change');
    expect(transition.entries).toHaveLength(8);
    expect(transition.entries.every(e => e.before !== e.after)).toBe(true);
  });

  test('format normalization changes three key scopes; five comparable digests stay unchanged', () => {
    const transition = provenance.transitions[2];
    expect(transition.sourceClassification).toBe('baseline-format-normalization');
    expect(transition.entries).toHaveLength(8);
    const rescopied = transition.entries.filter(e => e.beforeKey !== e.afterKey);
    expect(rescopied).toHaveLength(3);
    for (const entry of rescopied) expect(entry.afterKey).toBe(`${entry.beforeKey}|noYears`);
    for (const entry of transition.entries) {
      if (entry.beforeKey === entry.afterKey) expect(entry.after).toBe(entry.before);
      expect(entry.after).toBe((baseline as Record<string, string>)[entry.afterKey]);
    }
  });

  test('manifest does not claim replay; checkpoints chain by source blobs and literal digests', () => {
    expect(provenance.historicalReplay).toBe('NOT_RUN');
    expect(provenance.evidenceKind).toBe('source-and-recorded-digests');
    for (const [i, transition] of provenance.transitions.entries()) {
      expect(transition.commit).toMatch(/^[0-9a-f]{40}$/);
      expect(transition.parent).toMatch(/^[0-9a-f]{40}$/);
      expect(transition.beforeBlob).toMatch(/^[0-9a-f]{40}$/);
      expect(transition.afterBlob).toMatch(/^[0-9a-f]{40}$/);
      for (const entry of transition.entries) {
        expect(entry.before).toMatch(/^[0-9a-f]{64}$/);
        expect(entry.after).toMatch(/^[0-9a-f]{64}$/);
      }
      if (i === 0) continue;
      const previous = provenance.transitions[i - 1];
      expect(transition.beforeBlob).toBe(previous.afterBlob);
      for (const entry of transition.entries) {
        const previousEntry = previous.entries.find(e => e.afterKey === entry.beforeKey);
        if (typeof previousEntry?.after !== "string") {
          throw new Error(`Missing previous digest for ${entry.beforeKey}`);
        }
        expect(entry.before).toBe(previousEntry.after);
      }
    }
  });
});
