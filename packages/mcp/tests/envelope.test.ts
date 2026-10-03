import { describe, expect, test } from 'bun:test';
import { buildVersionInfo } from '@fortune/core';
import { hashVersions, ok } from '../src/envelope';

describe('versions slimming', () => {
  test('hash ignores asOf (already in the envelope) but tracks the rest', () => {
    const a = hashVersions(buildVersionInfo({ asOf: '2026-01-01', ephemeris: 'moshier' }));
    const b = hashVersions(buildVersionInfo({ asOf: '2030-06-30', ephemeris: 'moshier' }));
    const c = hashVersions(buildVersionInfo({ asOf: '2026-01-01', ephemeris: 'not_initialized' }));
    expect(a).toMatch(/^[0-9a-f]{12}$/);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
  test('ok() sends only versionsHash unless includeVersions', () => {
    const slim = ok({ asOf: '2026-01-01', data: {} });
    expect(slim.versions).toBeUndefined();
    const full = ok({ asOf: '2026-01-01', data: {}, includeVersions: true });
    expect(full.versions?.coreVersion).toBeTruthy();
    expect(full.versionsHash).toBe(slim.versionsHash);
  });
});
