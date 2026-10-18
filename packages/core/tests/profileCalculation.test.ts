import * as pillars from '../src/calculators/bazi/pillars';
import { describe, expect, test, vi } from 'vitest';
import {
  analyze, analyzeProfileFile, createProfileCalculation, createProfileFile, createProfileFileV2,
  migrateProfileFile, parseProfileFile, profileAnalyzeInput, profileSettings, serializeProfileFile,
  type BirthProfile,
} from '../src/index';

const profile: BirthProfile = {
  date: '1990-05-17', time: '23:10', timeAccuracy: 'exact', gender: 'female', name: 'ALICE',
  birthplace: { label: 'Synthetic cross-hour', lat: 23, lng: 113, timezone: 'Asia/Taipei' },
};
const asOf = '2026-01-01';
const settings = { useTrueSolarTime: false, ziHourConvention: 'early' as const };
const options = { asOf, years: 1, systems: ['bazi', 'ziwei', 'numerology'] as const };

describe('Profile v2 settings and owned sync snapshot', () => {
  test('v1 remains v1 on read/serialization, explicit migration records legacy defaults', () => {
    const legacy = createProfileFile('sky', profile);
    const bytes = serializeProfileFile(legacy);
    const parsed = parseProfileFile(bytes);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.errors.join(';'));
    expect(serializeProfileFile(parsed.file)).toBe(bytes);
    expect(parsed.warnings).toEqual([]);
    expect(profileSettings(parsed.file)).toEqual({ source: 'profile-v1-defaults', settings: { useTrueSolarTime: true, ziHourConvention: 'late' } });
    expect(migrateProfileFile(parsed.file)).toEqual({ ...legacy, schemaVersion: 2, settings: { useTrueSolarTime: true, ziHourConvention: 'late' } });
    expect(parsed.file.schemaVersion).toBe(1);
  });

  test('v2 is roundtrippable; missing, malformed and unrecognized choices fail closed', () => {
    const file = createProfileFileV2('sky', profile, settings);
    expect(parseProfileFile(serializeProfileFile(file))).toEqual({ ok: true, file, warnings: [] });
    for (const invalid of [undefined, null, [], {}, { ...settings, useTrueSolarTime: 'false' },
      { ...settings, ziHourConvention: 'nextDayAt23' }, { ...settings, ephemeris: 'guess' }]) {
      expect(parseProfileFile({ ...file, settings: invalid }).ok).toBe(false);
    }
    expect(parseProfileFile({ ...file, schemaVersion: 1 }).ok).toBe(false);
    expect(parseProfileFile({ ...file, schemaVersion: 3 }).ok).toBe(false);
    expect(() => migrateProfileFile({ ...file, schemaVersion: 3 } as never)).toThrow();
    let getterCalled = false;
    const accessor = { get useTrueSolarTime() { getterCalled = true; return false; }, ziHourConvention: 'early' };
    expect(parseProfileFile({ ...file, settings: accessor }).ok).toBe(false);
    expect(getterCalled).toBe(false);
  });

  test('new owned boundaries reject inherited/accessor data without invoking external getters', () => {
    const file = createProfileFileV2('sky', profile, settings);
    let reads = 0;
    const sources = [
      Object.create(file),
      { ...file, get profile() { reads++; return profile; } },
      { ...file, profile: Object.create(profile) },
      { ...file, profile: { ...profile, get name() { reads++; return 'BOB'; } } },
      { ...file, profile: { ...profile, birthplace: Object.create(profile.birthplace) } },
      { ...file, profile: { ...profile, birthplace: { ...profile.birthplace, get lng() { reads++; return 120; } } } },
    ];
    for (const source of sources) {
      expect(() => createProfileCalculation(source)).toThrow();
      expect(() => analyzeProfileFile(source, asOf)).toThrow();
      expect(() => profileAnalyzeInput(source)).toThrow();
    }
    expect(reads).toBe(0);
    // The new strict ownership contract does not silently rewrite legacy parser compatibility.
    expect(parseProfileFile(Object.create(file)).ok).toBe(true);
  });

  test('each supported setting changes the complete sync identity; alias labels and asOf do not', () => {
    const sessions = [true, false].flatMap(useTrueSolarTime => (['late', 'early'] as const).map(ziHourConvention =>
      createProfileCalculation(createProfileFileV2('sky', profile, { useTrueSolarTime, ziHourConvention }))));
    expect(new Set(sessions.map(s => s.calculation.snapshotId)).size).toBe(4);
    expect(new Set(sessions.map(s => s.calculation.specHash)).size).toBe(4);
    const same = createProfileCalculation(createProfileFileV2('another', { ...profile, birthplace: { ...profile.birthplace, label: 'Other label' } }, settings));
    expect(same.snapshot).toEqual(sessions[3].snapshot);
    expect(same.calculation.scope).toBe('analyze-sync-natal');
    expect(same.calculation.excludedSystems).toEqual(['jyotish', 'humanDesign']);
    expect(same.timeline({ ...options, asOf: '2027-01-01' })).not.toEqual(same.timeline(options));
    expect(same.snapshot).toEqual(sessions[3].snapshot);
  });

  test('serialized current snapshot reload replays charts/timeline/backtest and rejects tampering', () => {
    const file = createProfileFileV2('sky', profile, settings);
    const first = createProfileCalculation(file);
    const persisted = JSON.parse(JSON.stringify(first.snapshot));
    const replay = createProfileCalculation(file, persisted);
    expect(replay.snapshot).toEqual(first.snapshot);
    expect(replay.charts(asOf)).toEqual(first.charts(asOf));
    expect(replay.timeline(options)).toEqual(first.timeline(options));
    expect(replay.backtest({ asOf, fromYear: 2025, toYear: 2026, systems: ['bazi'] }).calculation.snapshotId).toBe(first.calculation.snapshotId);
    persisted.identity.input.name = 'BOB';
    expect(() => createProfileCalculation(file, persisted)).toThrow();
    expect(() => createProfileCalculation(createProfileFileV2('sky', profile, { ...settings, useTrueSolarTime: true }), first.snapshot)).toThrow();
  });

  test('caller edits cannot change the owned context/settings or smuggle projection overrides', () => {
    const file = createProfileFileV2('sky', profile, settings);
    const session = createProfileCalculation(file);
    const before = session.timeline(options);
    file.profile.birthplace.lng = 120;
    session.context().profile.name = 'BOB';
    expect(session.timeline(options)).toEqual(before);
    expect(() => session.timeline({ ...options, ...settings } as never)).toThrow('override');
    expect(Object.isFrozen(session.snapshot)).toBe(true);
    expect(Object.isFrozen(session.calculation.settings)).toBe(true);
  });

  test('profile report envelope retains complete ordinary Report7 output and uses the same snapshot', () => {
    const file = createProfileFileV2('sky', profile, settings);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
    let actual: ReturnType<typeof analyzeProfileFile>;
    try {
      const expected = analyze(profileAnalyzeInput(file), { asOf });
      actual = analyzeProfileFile(file, asOf);
      expect(actual.report).toEqual(expected);
    } finally { clock.mockRestore(); vi.useRealTimers(); }
    expect(actual.report.schemaVersion).toBe(7);
    expect(actual.calculation.snapshotId).toBe(actual.snapshot.snapshotId);
    const projected = createProfileCalculation(file).timeline({ asOf, systems: ['bazi', 'ziwei', 'numerology'] });
    expect(actual.report.timeline.years).toEqual(projected.years);
    expect(actual.report.timeline.months).toEqual(projected.months);
  });

  test('one owned natal basis serves charts, multiple years and backtest chunks', () => {
    const compute = vi.spyOn(pillars, 'computePillars');
    const luck = vi.spyOn(pillars, 'luckCycles');
    try {
      const session = createProfileCalculation(createProfileFileV2('sky', profile, settings));
      session.charts(asOf);
      session.charts('2027-01-01');
      session.timeline(options);
      session.timeline({ ...options, asOf: '2027-01-01' });
      session.backtest({ asOf, fromYear: 2025, toYear: 2027, systems: ['bazi'] });
      expect(compute).toHaveBeenCalledTimes(1);
      expect(luck).toHaveBeenCalledTimes(1);
    } finally { compute.mockRestore(); luck.mockRestore(); }
  });

  test('unknown birth time is preserved, with explicit skipped natal systems', () => {
    const session = createProfileCalculation(createProfileFileV2('sky', { ...profile, time: null, timeAccuracy: 'unknown' }, settings));
    expect(session.snapshot.natal.bazi).toEqual({ status: 'skipped', reason: 'time_unknown' });
    expect(session.snapshot.natal.ziwei).toEqual({ status: 'skipped', reason: 'time_unknown' });
    expect(session.timeline(options).systems).toEqual(['numerology']);
  });
});
