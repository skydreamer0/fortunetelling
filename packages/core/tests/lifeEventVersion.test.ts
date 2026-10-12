import { expect, test } from 'bun:test';
import { validateLifeEvent, type LifeEvent } from '../src/backtest/lifeEvents';
import { runBacktest } from '../src/backtest/runBacktest';
import { DOMAINS } from '../src/signals/types';
import type { BacktestTimeline } from '../src/backtest/timeline';
import * as core from '../src/index';

const event: LifeEvent = { id: 'synthetic', date: '2026-06', category: 'other', domains: ['career'], confidence: 'certain' };
const timeline: BacktestTimeline = {
  schemaVersion: 1, asOf: '2026-12-31', fromYear: 2023, toYear: 2026,
  systems: ['bazi'], skippedSystems: [], systemWeights: { bazi: 1 }, ruleIds: [],
  cells: [2023, 2024, 2025, 2026].map(year => ({ year, domains: Object.fromEntries(DOMAINS.map(domain => [domain, {
    score: domain === 'career' && year === 2026 ? 100 : 0, perSystem: {}, perRule: {},
  }])) as BacktestTimeline['cells'][number]['domains'] })),
};
test('version rejection does not introduce a public runtime helper API', () => {
  expect('hasUnsupportedLifeEventVersion' in core).toBe(false);
  expect(core.validateLifeEvent({ ...event, schemaVersion: 2 }).ok).toBe(false);
});
for (const schemaVersion of [2, 0, 99, null, '1', undefined]) {
  test(`unsupported own schemaVersion ${String(schemaVersion)} is rejected, not scored, and not mutated`, () => {
    const input = Object.freeze({ ...event, schemaVersion, labelStatus: 'confirmed_negative' });
    const before = { ...input };
    const validation = validateLifeEvent(input);
    expect(validation.ok).toBe(false);
    expect(validation.errors.join(';')).toContain('schemaVersion');
    const result = runBacktest([input], timeline, { seed: 'guard', randomDraws: 0 });
    expect(result.events.used).toBe(0);
    expect(result.events.excluded).toHaveLength(1);
    expect(result.events.excluded[0].reason).toBe('invalid');
    expect(result.events.excluded[0].detail).toContain('schemaVersion');
    expect(result.overall.all.hits).toBe(0);
    expect(result.overall.all.n).toBe(0);
    expect(result).toEqual(runBacktest([input], timeline, { seed: 'guard', randomDraws: 0 }));
    expect(input).toEqual(before);
  });
}
test('versionless and explicit numeric 1 keep exactly the same v1 normalization and scores', () => {
  const numeric = { ...event, schemaVersion: 1 };
  expect(validateLifeEvent(numeric)).toEqual(validateLifeEvent(event));
  expect(validateLifeEvent(numeric)).toEqual({ ok: true, errors: [], value: event });
  expect(runBacktest([numeric], timeline, { seed: 'v1' })).toEqual(runBacktest([event], timeline, { seed: 'v1' }));
});
test('mixed v1/v2 counts only v1, including unknown annotations and same-id future entries', () => {
  const mixed = [
    { ...event, schemaVersion: 2, labelStatus: 'confirmed_negative' },
    { ...event, id: 'unknown', schemaVersion: 2, labelStatus: 'unknown' }, event,
  ];
  const result = runBacktest(mixed, timeline, { seed: 'mixed', randomDraws: 0 });
  expect(result.events.used).toBe(1);
  expect(result.events.excluded.map(x => x.reason)).toEqual(['invalid', 'invalid']);
  expect(result.overall.all.hits).toBe(1);
  expect(result.overall.all.n).toBe(1);
});
