import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GOLDEN_PATH, buildGolden } from './fixtures/reportGolden';

// V1-16 behaviour parity: the golden was recorded with the pre-TypeScript core.
test('analyze()/analyzeCompatibility() JSON is byte-identical to the recorded golden', async () => {
  const expected = await Bun.file(GOLDEN_PATH).text();
  const actual = buildGolden();
  if (actual !== expected) {
    // Name the first differing case/section before failing on the full text.
    const e = JSON.parse(expected) as Record<string, Record<string, unknown>>;
    const a = JSON.parse(actual) as Record<string, Record<string, unknown>>;
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
