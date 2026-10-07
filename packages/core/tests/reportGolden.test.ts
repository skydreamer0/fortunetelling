import evidenceDelta from './fixtures/reportGolden.v0.6.1.delta.json';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GOLDEN_PATH, buildGolden } from './fixtures/reportGolden';
import delta from './fixtures/reportGolden.v0.5.1.delta.json';
import replayDelta from './fixtures/reportGolden.v0.5.2.delta.json';
import specDelta from './fixtures/reportGolden.v0.5.3.delta.json';
import agreementDelta from './fixtures/reportGolden.v0.6.0.delta.json';

// Preserve the original V1-16 golden; apply only reviewed literal versioned deltas.
// No value in the expected result is derived from the current implementation.
test('analyze()/analyzeCompatibility() JSON matches the preserved golden plus explicit versioned deltas', async () => {
  const original = await Bun.file(GOLDEN_PATH).text();
  assert.equal(new Bun.CryptoHasher('sha256').update(original).digest('hex'),
    '07ca1cd3b22f6699115c14d0dfb0a6c78742b445dac6efb4dba6c8ae2ca3b29f', 'Preserve the original v0.5.0 report fixture');
  const recorded = JSON.parse(original) as Record<string, unknown>;
  for (const change of [...delta.changes, ...replayDelta.changes, ...specDelta.changes, ...agreementDelta.changes, ...evidenceDelta.changes]) {
    let parent = recorded;
    for (const key of change.path.slice(0, -1)) {
      const child = parent[key];
      assert.ok(child !== null && typeof child === 'object' && !Array.isArray(child), `Missing golden path ${change.path.join('.')}`);
      parent = child as Record<string, unknown>;
    }
    const key = change.path.at(-1)!;
    assert.deepEqual(parent[key], change.before, `Original golden changed at ${change.path.join('.')}`);
    parent[key] = structuredClone(change.after);
  }
  const expected = `${JSON.stringify(recorded, null, 1)}\n`;
  const actual = buildGolden();
  if (actual !== expected) {
    // Name the first differing case/section before failing on the full text.
    const e = JSON.parse(expected) as Record<string, Record<string, unknown>>;
    const a = JSON.parse(actual) as Record<string, Record<string, unknown>>;
    // List every changed section before the first assertion aborts. This makes
    // intentional versioned fixture deltas reviewable without rerecording all reports.
    for (const [id, oldReport] of Object.entries(e.reports ?? {})) {
      const next = a.reports?.[id] as Record<string, unknown>;
      for (const [section, before] of Object.entries(oldReport as Record<string, unknown>)) {
        const after = next?.[section];
        if (JSON.stringify(before) !== JSON.stringify(after)) {
          console.log('REPORT_GOLDEN_DELTA', JSON.stringify({ id, section,
            actual: section === 'timeContext'
              ? (after as { conventions: unknown }).conventions : after }));
        }
      }
    }
    for (const group of Object.keys(e)) {
      const eg = e[group];
      const ag = a[group];
      if (eg && typeof eg === 'object') {
        for (const id of Object.keys(eg)) {
          assert.deepEqual(ag?.[id], eg[id], `${group}.${id} differs from the golden`);
        }
      }
    }
  }
  assert.equal(actual, expected);
});
