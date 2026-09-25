import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReportStore, MAX_RECENT_QUERIES, REPORT_STORE_KEY } from '../src/ui/ReportStore.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key),
  };
}

const INPUT = { year: 1991, month: 10, day: 5, hour: 14, gender: 'female', name: '王小明' };

test('最近查詢會保存、去重並可清除', () => {
  const storage = memoryStorage();
  const store = createReportStore(storage);
  assert.equal(store.save(INPUT, { asOf: '2026-07-18' }), true);
  assert.equal(store.save(INPUT, { asOf: '2026-07-19' }), true);
  assert.equal(store.getRecent().length, 1);
  assert.equal(store.getLastInput().name, '王小明');
  assert.equal(store.clear(), true);
  assert.deepEqual(store.getRecent(), []);
});

test('最近查詢上限為八筆，且損壞資料安全降級', () => {
  const storage = memoryStorage();
  const store = createReportStore(storage);
  for (let index = 0; index < 12; index += 1) {
    store.save({ ...INPUT, name: `Person ${index}`, day: index + 1 });
  }
  assert.equal(store.getRecent().length, MAX_RECENT_QUERIES);
  assert.equal(store.getRecent()[0].input.name, 'Person 11');

  storage.setItem(REPORT_STORE_KEY, '{broken');
  assert.deepEqual(store.getRecent(), []);
});

test('雙人合盤輸入以獨立鍵保存，不混入單人最近查詢', () => {
  const storage = memoryStorage();
  const store = createReportStore(storage);
  const second = { ...INPUT, name: '李小華', year: 1986, month: 5, day: 29, gender: 'male' };
  assert.equal(store.saveCompatibility(INPUT, second), true);
  assert.deepEqual(store.getRecent(), []);
  assert.equal(store.getLastCompatibility().first.name, '王小明');
  assert.equal(store.getLastCompatibility().second.name, '李小華');
  store.clear();
  assert.equal(store.getLastCompatibility(), null);
});
