import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeCompatibility, COMPATIBILITY_SCHEMA_VERSION, VERSION } from '../src/index';
import type { AnalyzeInput } from '../src/core/analyze';

const FIRST: AnalyzeInput = { year: 1991, month: 10, day: 5, hour: 14, gender: 'female', name: 'A' };
const SECOND: AnalyzeInput = { year: 1986, month: 5, day: 29, hour: 8, gender: 'male', name: 'B' };

test('雙人合盤回傳五行、生命靈數與命卦三組比較', () => {
  const result = analyzeCompatibility(FIRST, SECOND, { asOf: '2026-07-18' });
  assert.equal(result.version, VERSION);
  assert.equal(result.schemaVersion, COMPATIBILITY_SCHEMA_VERSION);
  assert.equal(result.people.length, 2);
  assert.equal(result.elements.axes.length, 5);
  assert.equal(result.numerology.available, true);
  assert.equal(result.minggua.available, true);
  assert.ok(result.narrative.limitations.length >= 3);
});

test('五行互補與摩擦軸可依公開公式重算', () => {
  const { elements } = analyzeCompatibility(FIRST, SECOND, { asOf: '2026-07-18' });
  for (const axis of elements.axes) {
    const expectedComplement = Math.max(0, Math.min(100, Math.round((100 - Math.abs(axis.combinedShare - 20) * 5) * 10) / 10));
    const expectedFriction = Math.max(0, Math.min(100, Math.round(Math.max(0, axis.combinedShare - 20) * 5 * 10) / 10));
    // combinedShare itself is rounded for display, so allow one decimal of propagation.
    assert.ok(Math.abs(axis.complement - expectedComplement) <= 0.3, axis.label);
    assert.ok(Math.abs(axis.friction - expectedFriction) <= 0.3, axis.label);
  }
  assert.match(elements.formula!.complement, /20/);
  assert.match(elements.formula!.friction, /max/);
});

test('任一方時辰不確定時只停用五行合盤，其餘比較仍可用', () => {
  const result = analyzeCompatibility({ ...FIRST, timeKnown: false }, SECOND, { asOf: '2026-07-18' });
  assert.equal(result.elements.available, false);
  assert.deepEqual(result.elements.axes, []);
  assert.equal(result.numerology.available, true);
  assert.equal(result.minggua.available, true);
  assert.match(result.narrative.strength, /資料不足/);
});
