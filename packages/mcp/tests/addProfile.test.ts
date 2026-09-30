import { describe, expect, test } from 'bun:test';
import { createProfileFile } from '@fortune/core';
import { buildProfileFromArgs } from '../src/cli/addProfile';

describe('add-profile args', () => {
  test('city + time', () => {
    const { profileId, profile } = buildProfileFromArgs(['sky', '--date', '1990-05-17', '--time', '08:30', '--gender', 'female', '--city', '台南', '--name', '王小明']);
    expect(profileId).toBe('sky');
    expect(profile.birthplace.timezone).toBe('Asia/Taipei');
    expect(profile.timeAccuracy).toBe('exact');
    expect(createProfileFile(profileId, profile).profileId).toBe('sky');
  });
  test('time unknown → accuracy unknown', () => {
    const { profile } = buildProfileFromArgs(['a', '--date', '1990-05-17', '--gender', 'male', '--city', '台北']);
    expect(profile.time).toBeNull();
    expect(profile.timeAccuracy).toBe('unknown');
  });
  test('custom place', () => {
    const { profile } = buildProfileFromArgs(['a', '--date', '1990-05-17', '--gender', 'male', '--lat', '35.68', '--lng', '139.69', '--tz', 'Asia/Tokyo', '--place', 'Tokyo']);
    expect(profile.birthplace).toEqual({ label: 'Tokyo', lat: 35.68, lng: 139.69, timezone: 'Asia/Tokyo' });
  });
  test('errors: no id, unknown city, no place', () => {
    expect(() => buildProfileFromArgs([])).toThrow();
    expect(() => buildProfileFromArgs(['a', '--city', 'Atlantis'])).toThrow(/unknown city/);
    expect(() => buildProfileFromArgs(['a', '--date', '1990-05-17'])).toThrow(/--city/);
  });
});
