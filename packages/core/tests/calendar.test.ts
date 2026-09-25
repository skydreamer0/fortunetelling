import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyze,
  lunarToSolarDate,
  parseIsoDate,
  solarToLunarDate,
} from '../src/index';

test('國曆與農曆輸入可往返同一個日期', () => {
  const solar = lunarToSolarDate({ year: 1991, month: 8, day: 28, isLeap: false });
  assert.deepEqual(solar, { year: 1991, month: 10, day: 5, iso: '1991-10-05' });
  assert.deepEqual(solarToLunarDate(solar), { year: 1991, month: 8, day: 28, isLeap: false });
  assert.deepEqual(parseIsoDate('1991-10-05'), { year: 1991, month: 10, day: 5 });
});

test('不存在的國曆與農曆日期會被拒絕', () => {
  assert.throws(() => parseIsoDate('2026-02-30'));
  assert.throws(() => lunarToSolarDate({ year: 2026, month: 2, day: 30 }));
  assert.throws(() => lunarToSolarDate({ year: 2026, month: 8, day: 1, isLeap: true }));
});

test('時辰不確定時只略過依賴時辰的八字與紫微', () => {
  const report = analyze({
    year: 1991, month: 10, day: 5, hour: 12, timeKnown: false, gender: 'female', name: 'Test',
  }, { asOf: '2026-07-11' });
  const byId = Object.fromEntries(report.engines.map(engine => [engine.engineId, engine]));

  assert.equal(report.input.timeKnown, false);
  for (const engineId of ['bazi', 'ziwei']) {
    assert.equal(byId[engineId].components.length, 0);
    assert.equal(byId[engineId].errors.length, 0);
    assert.equal(byId[engineId].meta.unavailableReason, 'unknown-time');
  }
  for (const engineId of ['numerology', 'minggua', 'dreamspell']) {
    assert.ok(byId[engineId].components.length > 0, `${engineId} 應保留輸出`);
  }
});
