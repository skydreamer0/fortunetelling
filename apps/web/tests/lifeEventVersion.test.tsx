import { expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LifeEvents } from '../src/components/report/LifeEvents';
import { analyze, type LifeEvent } from '../src/lib/core';
import { createLifeEventStore, LIFE_EVENTS_STORE_KEY, legacyProfileKeyOf, profileKeyOf } from '../src/lib/lifeEvents';

const event: LifeEvent = { id: 'v1', date: '2026-06', category: 'other', domains: ['career'], confidence: 'certain' };
const future = { ...event, id: 'future', schemaVersion: 2, labelStatus: 'unknown', opaque: { nested: ['keep', 2] } };
function setup(profiles: Record<string, unknown> = {}) {
  let writes = 0;
  const initial = JSON.stringify({ version: 1, profiles }, null, 2);
  const values = new Map([[LIFE_EVENTS_STORE_KEY, initial]]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { writes++; values.set(key, value); },
    removeItem: (key: string) => { writes++; values.delete(key); },
  };
  return { values, initial, storage, store: createLifeEventStore(storage), writes: () => writes };
}
for (const schemaVersion of [2, 0, 99, null, '1', undefined]) {
  test(`new unsupported version ${String(schemaVersion)} rejects upsert and replace without any write`, () => {
    const s = setup({ p: { events: [event] } });
    const unsupported = { ...future, schemaVersion };
    expect(s.store.upsert('p', unsupported)).toBe(false);
    expect(s.store.replace('p', [event, unsupported])).toBe(false);
    expect(s.values.get(LIFE_EVENTS_STORE_KEY)).toBe(s.initial);
    expect(s.writes()).toBe(0);
  });
}
for (const schemaVersion of [2, 0, 99, null, '1']) {
  test(`mixed stored version ${String(schemaVersion)} blocks implicit filtering writes byte-for-byte`, () => {
    const s = setup({ p: { events: [event, { ...future, schemaVersion }] }, q: { events: [{ ...event, id: 'q' }] } });
    expect(s.store.list('p')).toEqual([event]);
    expect(s.store.hasUnsupportedVersion('p')).toBe(true);
    expect(s.store.upsert('p', { ...event, id: 'new' })).toBe(false);
    expect(s.store.upsert('p', { ...event, id: future.id })).toBe(false);
    expect(s.store.replace('p', s.store.list('p'))).toBe(false);
    expect(s.store.replace('p', [])).toBe(false);
    expect(s.store.migrate('p', 'q')).toBe(false);
    expect(s.store.migrate('q', 'p')).toBe(false);
    expect(s.values.get(LIFE_EVENTS_STORE_KEY)).toBe(s.initial);
    expect(s.writes()).toBe(0);
    expect(createLifeEventStore(s.storage).hasUnsupportedVersion('p')).toBe(true);
  });
}
test('future record beyond v1 cap and duplicate id still blocks writes', () => {
  const events = [...Array.from({ length: 201 }, (_, i) => ({ ...event, id: `v1-${i}` })), { ...future, id: 'v1-0' }];
  const s = setup({ p: { events } });
  expect(s.store.list('p')).toHaveLength(200);
  expect(s.store.replace('p', s.store.list('p'))).toBe(false);
  expect(s.values.get(LIFE_EVENTS_STORE_KEY)).toBe(s.initial);
});
test('unrelated profile writes preserve opaque entries, without blocking supported profiles', () => {
  const s = setup({ p: { events: [future], custom: 'keep' } });
  expect(s.store.upsert('q', event)).toBe(true);
  expect(JSON.parse(s.values.get(LIFE_EVENTS_STORE_KEY)!).profiles.p).toEqual({ events: [future], custom: 'keep' });
});
test('explicit remove deletes only matching ids and leaves opaque survivors intact', () => {
  const s = setup({ p: { events: [event, future, null], custom: 'keep' }, q: { events: [event] } });
  expect(s.store.remove('p', event.id)).toBe(true);
  let saved = JSON.parse(s.values.get(LIFE_EVENTS_STORE_KEY)!);
  expect(saved.profiles.p).toEqual({ events: [future, null], custom: 'keep' });
  expect(saved.profiles.q.events).toEqual([event]);
  expect(s.store.remove('p', future.id)).toBe(true);
  saved = JSON.parse(s.values.get(LIFE_EVENTS_STORE_KEY)!);
  expect(saved.profiles.p.events).toEqual([null]);
});
test('explicit clearProfile and clearAll remain destructive even with unknown versions', () => {
  const s = setup({ p: { events: [event, future] }, q: { events: [future] } });
  expect(s.store.clearProfile('p')).toBe(true);
  expect(JSON.parse(s.values.get(LIFE_EVENTS_STORE_KEY)!).profiles).toEqual({ q: { events: [future] } });
  expect(s.store.clearAll()).toBe(true);
  expect(s.values.has(LIFE_EVENTS_STORE_KEY)).toBe(false);
});
test('numeric 1, legacy migration, replace, and corrupt/missing storage retain v1 behavior', () => {
  const s = setup({ old: { events: [{ ...event, schemaVersion: 1 }] } });
  expect(s.store.hasUnsupportedVersion('old')).toBe(false);
  expect(s.store.migrate('old', 'new')).toBe(true);
  expect(s.store.list('new')).toEqual([event]);
  expect(s.store.list('old')).toEqual([]);
  expect(s.store.replace('new', [])).toBe(true);
  expect(s.values.has(LIFE_EVENTS_STORE_KEY)).toBe(false);
  for (const raw of ['{broken', 'null', '{}', '{"version":1,"profiles":null}']) {
    s.values.set(LIFE_EVENTS_STORE_KEY, raw);
    expect(s.store.list('new')).toEqual([]);
    expect(s.store.hasUnsupportedVersion('new')).toBe(false);
    expect(s.store.upsert('new', event)).toBe(true);
    expect(s.store.list('new')).toEqual([event]);
  }
});
test('failed storage writes still return false, unsupported writes do not even invoke a throwing setter', () => {
  const s = setup({ p: { events: [event, future] } });
  let writes = 0;
  const store = createLifeEventStore({ ...s.storage, setItem: () => { writes++; throw new Error('quota'); }, removeItem: () => { writes++; throw new Error('quota'); } });
  expect(store.upsert('p', event)).toBe(false);
  expect(writes).toBe(0);
  expect(store.upsert('q', event)).toBe(false);
  expect(store.remove('p', event.id)).toBe(false);
  expect(store.clearProfile('p')).toBe(false);
  expect(store.clearAll()).toBe(false);
  expect(s.values.get(LIFE_EVENTS_STORE_KEY)).toBe(s.initial);
});
test('panel visibly warns for unsupported current or legacy-key records; rendering preserves raw data', () => {
  const report = analyze({ name: '', timeKnown: true, year: 1995, month: 7, day: 16, hour: 22, minute: 0, gender: 'male', calendarType: 'solar', cityId: 'tainan', timeAccuracy: 'exact' });
  for (const key of [profileKeyOf(report), legacyProfileKeyOf(report.input)]) {
    const s = setup({ [key]: { events: [event, future] } });
    const html = renderToStaticMarkup(<LifeEvents report={report} store={s.store} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('原始資料已保留');
    expect(html).toContain('不會顯示或納入回驗');
    expect(s.values.get(LIFE_EVENTS_STORE_KEY)).toBe(s.initial);
    expect(s.writes()).toBe(0);
  }
});
