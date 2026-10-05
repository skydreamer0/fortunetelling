import { describe, expect, test } from 'bun:test';
import {
  buildVersionInfo,
  canonicalStringify,
  chartFingerprint,
  createProfileFile,
  parseProfileFile,
  serializeProfileFile,
  type BirthProfile,
} from '../src/index';

const profile: BirthProfile = {
  date: '1990-05-17',
  time: '08:30',
  timeAccuracy: 'exact',
  gender: 'female',
  name: '王小明',
  birthplace: { label: 'Tainan, Taiwan', lat: 22.9999, lng: 120.2269, timezone: 'Asia/Taipei' },
};

describe('canonicalStringify', () => {
  test('sorts keys at every depth and drops generatedAt', () => {
    const a = canonicalStringify({ b: 1, a: { d: 2, c: 3 }, generatedAt: 'x' });
    const b = canonicalStringify({ a: { c: 3, d: 2, generatedAt: 'y' }, b: 1 });
    expect(a).toBe('{"a":{"c":3,"d":2},"b":1}');
    expect(a).toBe(b);
  });
  test('drops undefined, normalises -0, keeps array order', () => {
    expect(canonicalStringify({ a: undefined, b: -0, c: [3, 1, 2] })).toBe('{"b":0,"c":[3,1,2]}');
  });
  test('extra omit keys', () => {
    expect(canonicalStringify({ a: 1, ms: 5 }, { omit: ['ms'] })).toBe('{"a":1}');
  });
  test('rejects non-finite numbers and non-JSON values', () => {
    expect(() => canonicalStringify({ a: NaN })).toThrow();
    expect(() => canonicalStringify({ a: () => 1 })).toThrow();
    expect(() => canonicalStringify({ a: new Date(0) })).toThrow();
  });
});

describe('chartFingerprint', () => {
  test('ignores name and place label', () => {
    const renamed = { ...profile, name: '別名', birthplace: { ...profile.birthplace, label: '台南' } };
    expect(chartFingerprint(renamed)).toBe(chartFingerprint(profile));
  });
  test('ignores float noise below ~11 m', () => {
    const noisy = { ...profile, birthplace: { ...profile.birthplace, lat: 22.99990001 } };
    expect(chartFingerprint(noisy)).toBe(chartFingerprint(profile));
  });
  test.each([
    ['time', { time: '08:31' }],
    ['date', { date: '1990-05-18' }],
    ['gender', { gender: 'male' as const }],
    ['timeAccuracy', { timeAccuracy: 'approx15m' as const }],
  ])('changes when %s changes', (_label, patch) => {
    expect(chartFingerprint({ ...profile, ...patch })).not.toBe(chartFingerprint(profile));
  });
  test('changes when the place changes', () => {
    const moved = { ...profile, birthplace: { ...profile.birthplace, lng: 121.5 } };
    expect(chartFingerprint(moved)).not.toBe(chartFingerprint(profile));
  });
  test('has the cf1- prefix', () => {
    expect(chartFingerprint(profile)).toMatch(/^cf1-[0-9a-f]{16}$/);
  });
});

describe('profile file', () => {
  test('create → serialize → parse round-trips byte-for-byte', () => {
    const file = createProfileFile('sky', profile);
    const text = serializeProfileFile(file);
    const parsed = parseProfileFile(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.warnings).toEqual([]);
    expect(serializeProfileFile(parsed.file)).toBe(text);
    expect(parsed.file.profileId).toBe('sky');
  });
  test('profileId is independent of the chart: same id, edited time → new fingerprint', () => {
    const a = createProfileFile('sky', profile);
    const b = createProfileFile('sky', { ...profile, time: '09:00' });
    expect(a.profileId).toBe(b.profileId);
    expect(a.chartFingerprint).not.toBe(b.chartFingerprint);
  });
  test.each(['Sky', '', 'a b', '中文', 'x'.repeat(33), '-a'])('rejects profileId %p', id => {
    expect(() => createProfileFile(id, profile)).toThrow();
  });
  test('rejects an invalid profile', () => {
    expect(() => createProfileFile('sky', { ...profile, date: '1990-02-30' })).toThrow();
  });
  test('missing fingerprint is computed with a warning', () => {
    const { chartFingerprint: _omit, ...rest } = createProfileFile('sky', profile);
    const parsed = parseProfileFile(rest);
    expect(parsed.ok && parsed.warnings.length).toBe(1);
    expect(parsed.ok && parsed.file.chartFingerprint).toBe(chartFingerprint(profile));
  });
  test('stale fingerprint (hand-edited time) is recomputed with a warning', () => {
    const file = createProfileFile('sky', profile);
    const edited = { ...file, profile: { ...file.profile, time: '10:00' } };
    const parsed = parseProfileFile(JSON.stringify(edited));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.warnings[0]).toContain('did not match');
    expect(parsed.file.chartFingerprint).toBe(chartFingerprint({ ...profile, time: '10:00' }));
  });
  test('rejects bad JSON, wrong format, future schema, bad profile', () => {
    const file = createProfileFile('sky', profile);
    expect(parseProfileFile('{nope').ok).toBe(false);
    expect(parseProfileFile({ ...file, format: 'other' }).ok).toBe(false);
    expect(parseProfileFile({ ...file, schemaVersion: 2 }).ok).toBe(false);
    expect(parseProfileFile({ ...file, profile: { ...file.profile, gender: 'x' } }).ok).toBe(false);
    expect(parseProfileFile(null).ok).toBe(false);
  });
});

describe('buildVersionInfo', () => {
  test('carries asOf, versions and marks only Jyotish experimental (Human Design passed M5-03)', () => {
    const v = buildVersionInfo({ asOf: '2026-09-30' });
    expect(v.asOf).toBe('2026-09-30');
    expect(v.profileSchemaVersion).toBe(1);
    expect(v.experimentalSystems).toEqual(['jyotish']);
    expect(v.calculators.bazi).toBeTruthy();
    expect(Object.values(v.catalogs).every(n => n > 0)).toBe(true);
    expect(v.ephemeris).toBe('not_initialized');
  });
  test('is deterministic and needs a valid asOf', () => {
    expect(canonicalStringify(buildVersionInfo({ asOf: '2026-09-30' }))).toBe(canonicalStringify(buildVersionInfo({ asOf: '2026-09-30' })));
    expect(() => buildVersionInfo({ asOf: '2026/09/30' })).toThrow();
  });
  test('asOf may be null for time-independent answers', () => {
    expect(buildVersionInfo({ asOf: null }).asOf).toBeNull();
  });
});
