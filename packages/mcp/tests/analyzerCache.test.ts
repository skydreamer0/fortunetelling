import { describe, expect, spyOn, test } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalStringify, createProfileFile, type ProfileFileV1 } from '@fortune/core';
import { Analyzer, type Analysis } from '../src/compute';
import { ProfileStore } from '../src/store';
import { makeFixture, SAMPLE_PROFILE } from './helpers';

const ASOF = '2026-09-30';
const PROFILE = { ...SAMPLE_PROFILE, name: 'ALICE',
  birthplace: { ...SAMPLE_PROFILE.birthplace, label: 'Synthetic birthplace' } };

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

type Compute = (file: ProfileFileV1, warnings: string[], asOf: string) => Promise<Analysis>;
/** Only fault/scheduling tests intercept this method; result/freshness tests use real calculations. */
const internal = (analyzer: Analyzer) => analyzer as unknown as { compute: Compute };

/** Observe actual disk reads without replacing their values or failures. */
function observeReads(store: ProfileStore) {
  const get = store.get.bind(store);
  let completed = 0;
  const waiters: { count: number; resolve: () => void }[] = [];
  const spy = spyOn(store, 'get').mockImplementation(async id => {
    const value = await get(id);
    completed++;
    for (const waiter of waiters) if (completed >= waiter.count) waiter.resolve();
    return value;
  });
  return {
    spy,
    async through(count: number) {
      if (completed < count) await new Promise<void>(resolve => waiters.push({ count, resolve }));
      // Let the Analyzer continuation consume the just-completed store read.
      await Promise.resolve();
    },
  };
}

function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reverseKeys(child)]));
  }
  return value;
}

describe('Analyzer loaded-source cache identity (real ProfileStore files)', () => {
  test('name-only overwrite with identical cf1 returns current source and matches a fresh Analyzer', async () => {
    const fx = await makeFixture({ sky: PROFILE });
    try {
      const before = await fx.ctx.analyzer.get('sky', ASOF);
      const changed = createProfileFile('sky', { ...PROFILE, name: 'BOB' });
      expect(changed.chartFingerprint).toBe(before.file.chartFingerprint);
      await fx.store.put(changed, { overwrite: true });
      const current = await fx.ctx.analyzer.get('sky', ASOF);
      const fresh = await new Analyzer(fx.store).get('sky', ASOF);
      expect(current).not.toBe(before);
      expect(current.file).toEqual(fresh.file);
      expect(current.ctx).toEqual(fresh.ctx);
      expect(current.ctx.profile.name).toBe('BOB');
      expect(current.timeline).toEqual(fresh.timeline);
      expect(current.consensus).toEqual(fresh.consensus);
      expect(before.ctx.profile.name).toBe('ALICE');
    } finally { await fx.cleanup(); }
  }, 60_000);

  test('coordinates inside the same rounded cf1 cell retain exact current coordinates and TimeContext', async () => {
    const first = { ...PROFILE, birthplace: { ...PROFILE.birthplace, lat: 22.999901, lng: 120.226901 } };
    const changes = [
      { ...PROFILE, birthplace: { ...PROFILE.birthplace, lat: 22.999909, lng: 120.226901 } },
      { ...PROFILE, birthplace: { ...PROFILE.birthplace, lat: 22.999909, lng: 120.226909 } },
    ];
    const fx = await makeFixture({ sky: first });
    try {
      let before = await fx.ctx.analyzer.get('sky', ASOF);
      for (const profile of changes) {
        const changed = createProfileFile('sky', profile);
        expect(changed.chartFingerprint).toBe(before.file.chartFingerprint);
        await fx.store.put(changed, { overwrite: true });
        const current = await fx.ctx.analyzer.get('sky', ASOF);
        const fresh = await new Analyzer(fx.store).get('sky', ASOF);
        expect(current).not.toBe(before);
        expect(current.ctx).toEqual(fresh.ctx);
        expect(current.ctx.profile.birthplace.lat).toBe(profile.birthplace.lat);
        expect(current.ctx.profile.birthplace.lng).toBe(profile.birthplace.lng);
        before = current;
      }
    } finally { await fx.cleanup(); }
  }, 60_000);

  test('label-only overwrite updates Analysis file metadata even though cf1 is unchanged', async () => {
    const fx = await makeFixture({ sky: PROFILE });
    try {
      const before = await fx.ctx.analyzer.get('sky', ASOF);
      await fx.store.put(createProfileFile('sky', { ...PROFILE,
        birthplace: { ...PROFILE.birthplace, label: 'Renamed synthetic birthplace' },
      }), { overwrite: true });
      const current = await fx.ctx.analyzer.get('sky', ASOF);
      expect(current.file.chartFingerprint).toBe(before.file.chartFingerprint);
      expect(current).not.toBe(before);
      expect(current.file.profile.birthplace.label).toBe('Renamed synthetic birthplace');
      expect(current.ctx.profile.birthplace.label).toBe('Renamed synthetic birthplace');
    } finally { await fx.cleanup(); }
  }, 60_000);

  test('different fingerprint repair warnings and later repair never reuse stale warnings', async () => {
    const fx = await makeFixture({ sky: PROFILE });
    const file = createProfileFile('sky', PROFILE);
    const path = join(fx.dir, 'sky.fortune.json');
    try {
      await writeFile(path, JSON.stringify({ ...file, chartFingerprint: 'cf1-bad-a' }));
      const first = await fx.ctx.analyzer.get('sky', ASOF);
      expect(first.warnings).toHaveLength(1);
      await writeFile(path, JSON.stringify({ ...file, chartFingerprint: 'cf1-bad-b' }));
      const second = await fx.ctx.analyzer.get('sky', ASOF);
      expect(second.file).toEqual(first.file);
      expect(second).not.toBe(first);
      expect(second.warnings).toEqual((await fx.store.get('sky')).warnings);
      expect(second.warnings[0]).toContain('cf1-bad-b');
      await fx.store.put(file, { overwrite: true });
      const repaired = await fx.ctx.analyzer.get('sky', ASOF);
      expect(repaired.file).toEqual(first.file);
      expect(repaired).not.toBe(second);
      expect(repaired.warnings).toEqual([]);
      const { chartFingerprint: _fingerprint, ...missingFingerprint } = file;
      await writeFile(path, JSON.stringify(missingFingerprint));
      const missing = await fx.ctx.analyzer.get('sky', ASOF);
      expect(missing.file).toEqual(repaired.file);
      expect(missing).not.toBe(repaired);
      expect(missing.warnings[0]).toContain('missing');
      await fx.store.put(file, { overwrite: true });
      const clean = await fx.ctx.analyzer.get('sky', ASOF);
      expect(clean).not.toBe(missing);
      expect(clean.warnings).toEqual([]);
    } finally { await fx.cleanup(); }
  }, 60_000);

  test('JSON key order/whitespace changes reuse the same loaded-source result', async () => {
    const fx = await makeFixture({ sky: PROFILE });
    try {
      const before = await fx.ctx.analyzer.get('sky', ASOF);
      const file = createProfileFile('sky', PROFILE);
      await writeFile(join(fx.dir, 'sky.fortune.json'), JSON.stringify(reverseKeys(file), null, 4));
      const current = await fx.ctx.analyzer.get('sky', ASOF);
      expect(current).toBe(before);
      expect(canonicalStringify(current.file)).toBe(canonicalStringify(file));
    } finally { await fx.cleanup(); }
  }, 60_000);

  test('profileId and asOf remain isolated', async () => {
    const fx = await makeFixture({ sky: PROFILE, twin: PROFILE });
    try {
      const first = await fx.ctx.analyzer.get('sky', ASOF);
      const twin = await fx.ctx.analyzer.get('twin', ASOF);
      const next = await fx.ctx.analyzer.get('sky', '2027-09-30');
      expect(twin).not.toBe(first);
      expect(twin.file.profileId).toBe('twin');
      expect(next).not.toBe(first);
      expect(next.asOf).toBe('2027-09-30');
      expect(next.timeline.asOf).toBe('2027-09-30');
      expect(await fx.ctx.analyzer.get('sky', ASOF)).toBe(first);
    } finally { await fx.cleanup(); }
  }, 60_000);

  test('warm cache does not hide an invalid latest file; repairing identical source can reuse the valid result', async () => {
    const fx = await makeFixture({ sky: PROFILE });
    try {
      const before = await fx.ctx.analyzer.get('sky', ASOF);
      await writeFile(join(fx.dir, 'sky.fortune.json'), '{invalid json');
      await expect(fx.ctx.analyzer.get('sky', ASOF)).rejects.toThrow('invalid');
      await fx.store.put(createProfileFile('sky', PROFILE), { overwrite: true });
      expect(await fx.ctx.analyzer.get('sky', ASOF)).toBe(before);
    } finally { await fx.cleanup(); }
  }, 60_000);
});

describe('Analyzer in-flight ownership and retries', () => {
  test('identical source/asOf concurrent calls share one pending computation', async () => {
    const fx = await makeFixture({ sky: PROFILE });
    const target = internal(fx.ctx.analyzer);
    const compute = target.compute.bind(fx.ctx.analyzer);
    const gate = deferred<void>();
    const reads = observeReads(fx.store);
    const spy = spyOn(target, 'compute').mockImplementation(async (...args) => {
      await gate.promise;
      return compute(...args);
    });
    try {
      const calls = [fx.ctx.analyzer.get('sky', ASOF), fx.ctx.analyzer.get('sky', ASOF), fx.ctx.analyzer.get('sky', ASOF)];
      await reads.through(3);
      expect(spy).toHaveBeenCalledTimes(1);
      gate.resolve();
      const [a, b, c] = await Promise.all(calls);
      expect(a).toBe(b);
      expect(b).toBe(c);
      expect(await fx.ctx.analyzer.get('sky', ASOF)).toBe(a);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally { gate.resolve(); spy.mockRestore(); reads.spy.mockRestore(); await fx.cleanup(); }
  }, 60_000);

  test('failed current computation is evicted and a subsequent identical request retries', async () => {
    const fx = await makeFixture({ sky: PROFILE });
    const target = internal(fx.ctx.analyzer);
    const compute = target.compute.bind(fx.ctx.analyzer);
    const spy = spyOn(target, 'compute').mockImplementationOnce(() => Promise.reject(new Error('synthetic calculation failure')));
    try {
      await expect(fx.ctx.analyzer.get('sky', ASOF)).rejects.toThrow('synthetic calculation failure');
      spy.mockImplementation(compute);
      const retried = await fx.ctx.analyzer.get('sky', ASOF);
      expect(retried.ctx.profile.name).toBe('ALICE');
      expect(await fx.ctx.analyzer.get('sky', ASOF)).toBe(retried);
      expect(spy).toHaveBeenCalledTimes(2);
    } finally { spy.mockRestore(); await fx.cleanup(); }
  }, 60_000);

  test('late rejection of superseded A cannot remove newer A after A→B→A replacement', async () => {
    const fx = await makeFixture({ sky: PROFILE });
    const target = internal(fx.ctx.analyzer);
    const compute = target.compute.bind(fx.ctx.analyzer);
    const stale = deferred<Analysis>();
    const reads = observeReads(fx.store);
    let count = 0;
    const spy = spyOn(target, 'compute').mockImplementation((...args) => ++count === 1 ? stale.promise : compute(...args));
    const old = fx.ctx.analyzer.get('sky', ASOF);
    const oldOutcome = old.catch(error => error);
    let b: Promise<Analysis> | undefined;
    let current: Promise<Analysis> | undefined;
    try {
      await reads.through(1);
      await fx.store.put(createProfileFile('sky', { ...PROFILE, name: 'BOB' }), { overwrite: true });
      b = fx.ctx.analyzer.get('sky', ASOF);
      void b.catch(() => {}); // The deliberately broken baseline shares old's rejection.
      await reads.through(2);
      await fx.store.put(createProfileFile('sky', PROFILE), { overwrite: true });
      current = fx.ctx.analyzer.get('sky', ASOF);
      void current.catch(() => {});
      await reads.through(3);
      expect(spy).toHaveBeenCalledTimes(3);
      stale.reject(new Error('superseded synthetic failure'));
      expect((await oldOutcome).message).toBe('superseded synthetic failure');
      const [middle, latest] = await Promise.all([b, current]);
      expect(middle.ctx.profile.name).toBe('BOB');
      expect(latest.ctx.profile.name).toBe('ALICE');
      expect(await fx.ctx.analyzer.get('sky', ASOF)).toBe(latest);
      expect(spy).toHaveBeenCalledTimes(3);
    } finally {
      stale.reject(new Error('test cleanup'));
      await Promise.allSettled([old, ...(b ? [b] : []), ...(current ? [current] : [])]);
      spy.mockRestore(); reads.spy.mockRestore(); await fx.cleanup();
    }
  }, 60_000);
});
