import { describe, expect, test } from 'bun:test';
import {
  CITIES,
  DEFAULT_BIRTHPLACE,
  TAIWAN_CITIES,
  findCity,
  isValidTimeZone,
  validateBirthProfile,
} from '../src/profile/index';

const base = {
  date: '1990-07-01',
  time: '12:00',
  timeAccuracy: 'exact',
  gender: 'female',
  birthplace: { label: 'Taipei, Taiwan', lat: 25.0375, lng: 121.5637, timezone: 'Asia/Taipei' },
};

describe('validateBirthProfile', () => {
  test('accepts a valid profile and returns a normalised copy', () => {
    const r = validateBirthProfile({ ...base, name: '王小明', extra: 1 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.profile).toEqual({ ...base, name: '王小明' } as any);
      expect((r.profile as any).extra).toBeUndefined();
    }
  });

  test('leap years: 2000-02-29 and 2024-02-29 valid; 1900-02-29 and 2023-02-29 invalid', () => {
    expect(validateBirthProfile({ ...base, date: '2000-02-29' }).ok).toBe(true);
    expect(validateBirthProfile({ ...base, date: '2024-02-29' }).ok).toBe(true);
    expect(validateBirthProfile({ ...base, date: '1900-02-29' }).ok).toBe(false);
    expect(validateBirthProfile({ ...base, date: '2023-02-29' }).ok).toBe(false);
    expect(validateBirthProfile({ ...base, date: '1990-04-31' }).ok).toBe(false);
    expect(validateBirthProfile({ ...base, date: '1990-13-01' }).ok).toBe(false);
    expect(validateBirthProfile({ ...base, date: '1990/07/01' }).ok).toBe(false);
  });

  test('time range', () => {
    expect(validateBirthProfile({ ...base, time: '00:00' }).ok).toBe(true);
    expect(validateBirthProfile({ ...base, time: '23:59' }).ok).toBe(true);
    expect(validateBirthProfile({ ...base, time: '24:00' }).ok).toBe(false);
    expect(validateBirthProfile({ ...base, time: '12:60' }).ok).toBe(false);
    expect(validateBirthProfile({ ...base, time: '9:05' }).ok).toBe(false);
  });

  test('time null ⇒ timeAccuracy unknown', () => {
    const missing = validateBirthProfile({ ...base, time: null, timeAccuracy: undefined });
    expect(missing.ok && missing.profile.timeAccuracy).toBe('unknown');
    expect(validateBirthProfile({ ...base, time: null, timeAccuracy: 'unknown' }).ok).toBe(true);
    expect(validateBirthProfile({ ...base, time: null, timeAccuracy: 'exact' }).ok).toBe(false);
    expect(validateBirthProfile({ ...base, timeAccuracy: 'unknown' }).ok).toBe(false);
    expect(validateBirthProfile({ ...base, timeAccuracy: 'roughly' }).ok).toBe(false);
  });

  test('lat/lng bounds, gender and timezone', () => {
    const bp = base.birthplace;
    expect(validateBirthProfile({ ...base, birthplace: { ...bp, lat: 90.1 } }).ok).toBe(false);
    expect(validateBirthProfile({ ...base, birthplace: { ...bp, lng: -180.5 } }).ok).toBe(false);
    expect(validateBirthProfile({ ...base, birthplace: { ...bp, lng: Number.NaN } }).ok).toBe(false);
    expect(validateBirthProfile({ ...base, birthplace: { ...bp, timezone: 'Mars/Olympus' } }).ok).toBe(false);
    expect(validateBirthProfile({ ...base, birthplace: { ...bp, timezone: '+08:00' } }).ok).toBe(false);
    expect(validateBirthProfile({ ...base, birthplace: { ...bp, timezone: 'UTC+8' } }).ok).toBe(false);
    expect(validateBirthProfile({ ...base, gender: 'x' }).ok).toBe(false);
  });

  test('collects all errors', () => {
    const r = validateBirthProfile({ date: 'x', time: 'y', gender: 'z', birthplace: null });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.errors.length).toBeGreaterThanOrEqual(4);
    expect(validateBirthProfile(null).ok).toBe(false);
  });

  test('isValidTimeZone', () => {
    expect(isValidTimeZone('Asia/Taipei')).toBe(true);
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('Etc/GMT-8')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});

describe('cities', () => {
  test('22 Taiwan counties/cities, all Asia/Taipei and within Taiwan bounds', () => {
    expect(TAIWAN_CITIES.length).toBe(22);
    for (const c of TAIWAN_CITIES) {
      expect(c.timezone).toBe('Asia/Taipei');
      expect(c.lat).toBeGreaterThan(21.8);
      expect(c.lat).toBeLessThan(26.4);
      expect(c.lng).toBeGreaterThan(118.1);
      expect(c.lng).toBeLessThan(122.1);
    }
  });

  test('ids unique, zones valid, overseas ≥ 30', () => {
    expect(new Set(CITIES.map((c) => c.id)).size).toBe(CITIES.length);
    expect(CITIES.length - TAIWAN_CITIES.length).toBeGreaterThanOrEqual(30);
    for (const c of CITIES) expect(isValidTimeZone(c.timezone)).toBe(true);
  });

  test('findCity matches zh/en/id case-insensitively, with 臺/台 and 市/縣 folding', () => {
    expect(findCity('台南')?.id).toBe('tainan');
    expect(findCity('臺南市')?.id).toBe('tainan');
    expect(findCity('TAINAN')?.id).toBe('tainan');
    expect(findCity('new-york')?.id).toBe('new-york');
    expect(findCity('new york')?.timezone).toBe('America/New_York');
    expect(findCity('紐約')?.id).toBe('new-york');
    expect(findCity('宜蘭縣')?.id).toBe('yilan');
    expect(findCity('Macao')?.id).toBe('macau');
    expect(findCity('Atlantis')).toBeNull();
    expect(findCity('')).toBeNull();
  });

  test('default birthplace is Taipei', () => {
    expect(DEFAULT_BIRTHPLACE).toEqual({ label: 'Taipei, Taiwan', lat: 25.0375, lng: 121.5637, timezone: 'Asia/Taipei' });
    expect(validateBirthProfile({ ...base, birthplace: DEFAULT_BIRTHPLACE }).ok).toBe(true);
  });
});
