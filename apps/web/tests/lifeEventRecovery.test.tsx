import { expect, test } from 'vitest';
import { createLifeEventStore, LIFE_EVENTS_STORE_KEY } from '../src/lib/lifeEvents';
const event = { id: 'synthetic', date: '2026-06', category: 'other' as const, domains: ['career' as const], confidence: 'certain' as const };
for (const raw of ['{broken', JSON.stringify({ version: 99, profiles: { synthetic: { events: [], future: 'preserve' } } })]) {
  test(`blocked read preserves opaque original bytes: ${raw}`, () => {
    let value = raw;
    let writes = 0;
    const store = createLifeEventStore({ getItem: () => value, setItem: (_k, v) => { writes++; value = v; }, removeItem: () => { writes++; value = ''; } });
    expect(store.upsert('synthetic', event)).toBe(false);
    expect(value).toBe(raw);
    expect(writes).toBe(0);
  });
}
test('transient read failure must not turn existing data into empty replacement', () => {
  let writes = 0;
  const store = createLifeEventStore({ getItem: () => { throw Error('synthetic denied read'); }, setItem: () => { writes++; }, removeItem: () => { writes++; } });
  expect(store.upsert('synthetic', event)).toBe(false);
  expect(writes).toBe(0);
});

import { createLifeEventSession } from '../src/lib/lifeEventSession';
function fixture() {
  let denied = false;
  let readsDenied = false;
  const values = new Map<string, string>();
  const storage = { getItem: (k: string) => { if (readsDenied) throw Error('denied'); return values.get(k) ?? null; },
    setItem: (k: string, v: string) => { if (denied) throw Error('quota'); values.set(k, v); },
    removeItem: (k: string) => { if (denied) throw Error('quota'); values.delete(k); } };
  const store = createLifeEventStore(storage);
  return { store, values, storage, deny: (v: boolean) => { denied = v; }, denyRead: (v: boolean) => { readsDenied = v; } };
}
test('all pending additions and edits survive failure then retry/reload; profiles stay isolated', () => {
  const f = fixture(); f.store.upsert('p', event); f.store.upsert('other', { ...event, description: 'other' });
  const session = createLifeEventSession(f.store, 'p'); f.deny(true);
  expect(session.submit({ ...event, description: 'edited' })).toBe('pending');
  expect(session.submit({ ...event, id: 'new-a' })).toBe('pending');
  expect(session.submit({ ...event, id: 'new-b' })).toBe('pending');
  expect(session.list()).toHaveLength(3); expect(session.pendingIds()).toHaveLength(3);
  expect(session.remove('new-a')).toBe(true); expect(session.list()).toHaveLength(2);
  expect(session.remove(event.id)).toBe(false); expect(session.list()).toHaveLength(2);
  f.deny(false);
  expect(session.submit({ ...event, id: 'recovery-submit' })).toBe('saved');
  expect(session.pendingIds()).toEqual([]);
  const reloaded = createLifeEventStore(f.storage);
  expect(reloaded.list('p').map(e => e.id)).toEqual(['new-b', 'recovery-submit', 'synthetic']);
  expect(reloaded.list('p').find(e => e.id === event.id)?.description).toBe('edited');
  expect(reloaded.list('other')[0].description).toBe('other');
});
test('clear failure discards only unsaved additions; retry flushes pending existing edit', () => {
  const f = fixture(); f.store.upsert('p', event); const session = createLifeEventSession(f.store, 'p');
  f.deny(true); session.submit({ ...event, description: 'edit' }); session.submit({ ...event, id: 'new' });
  expect(session.clear()).toBe(false); expect(session.list().map(e => e.id)).toEqual(['synthetic']);
  f.deny(false); expect(session.retry()).toBe(true);
  expect(f.store.list('p')[0].description).toBe('edit'); expect(session.clear()).toBe(true);
  expect(f.store.list('p')).toEqual([]);
});
test('unknown envelope and read failure block every implicit mutation; pending addition remains discardable', () => {
  const f = fixture(); const raw = JSON.stringify({ version: 99, profiles: { p: { events: [event] } } });
  f.values.set(LIFE_EVENTS_STORE_KEY, raw);
  expect(f.store.isReadable()).toBe(false);
  for (const action of [() => f.store.replace('p', []), () => f.store.remove('p', 'synthetic'), () => f.store.clearProfile('p'), () => f.store.migrate('p', 'q')]) expect(action()).toBe(false);
  const session = createLifeEventSession(f.store, 'p'); expect(session.submit(event)).toBe('pending');
  expect(session.remove(event.id)).toBe(true); expect(session.list()).toEqual([]);
  expect(f.values.get(LIFE_EVENTS_STORE_KEY)).toBe(raw);
  f.values.delete(LIFE_EVENTS_STORE_KEY); f.denyRead(true);
  expect(f.store.upsertMany('p', [event])).toBe(false); expect(f.values.size).toBe(0);
});
test('read-modify-write reads once and retains opaque unrelated profile/root metadata', () => {
  const f = fixture(); const future = { ...event, schemaVersion: 99, opaque: ['keep'] };
  f.values.set(LIFE_EVENTS_STORE_KEY, JSON.stringify({ version: 1, root: 'keep', profiles: { q: { events: [future], meta: 'keep' } } }));
  expect(f.store.upsertMany('p', [event])).toBe(true);
  expect(JSON.parse(f.values.get(LIFE_EVENTS_STORE_KEY)!).profiles.q).toEqual({ events: [future], meta: 'keep' });
  expect(JSON.parse(f.values.get(LIFE_EVENTS_STORE_KEY)!).root).toBe('keep');
});

test('batch uses one read and does not lose stored events when a later read would fail', () => {
  let reads = 0;
  let value = JSON.stringify({ version: 1, profiles: { p: { events: [event] } } });
  const store = createLifeEventStore({ getItem: () => { if (++reads > 1) throw Error('later read denied'); return value; }, setItem: (_k,v) => { value = v; }, removeItem: () => { throw Error('unexpected remove'); } });
  expect(store.upsertMany('p', [{ ...event, id: 'second' }])).toBe(true);
  expect(reads).toBe(1);
  expect(JSON.parse(value).profiles.p.events).toHaveLength(2);
});
test('pending capacity rejects excess without truncating accepted pending or stored records', () => {
  const f = fixture(); const session = createLifeEventSession(f.store, 'p'); f.deny(true);
  for (let i = 0; i < 200; i++) expect(session.submit({ ...event, id: `e-${i}` })).toBe('pending');
  expect(session.submit({ ...event, id: 'overflow' })).toBe('full');
  expect(session.list()).toHaveLength(200); expect(session.pendingIds()).toHaveLength(200);
  f.deny(false); expect(session.retry()).toBe(true); expect(f.store.list('p')).toHaveLength(200);
});
