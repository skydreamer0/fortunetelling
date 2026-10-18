/**
 * @fileoverview `.fortune.json` profile file (ROADMAP M0.5-01/03, D-037).
 *
 * - `profileId`: user-chosen stable slug ("who this person is"). Not a content hash.
 * - `chartFingerprint`: hash of the canonical birth fields ("which chart"). Name and place
 *   label are excluded: renaming a person does not change the chart.
 * The file carries no timestamps, so its canonical JSON is deterministic.
 * @module portable/profileFile
 */

import type { BirthProfile } from '../profile/types';
import { validateBirthProfile } from '../profile/validate';
import { fnv1a64Hex } from '../signals/signalId';
import { canonicalStringify } from './canonical';

export const PROFILE_FILE_FORMAT = 'fortune.profile' as const;
export const PROFILE_SCHEMA_VERSION = 2 as const;
export const PROFILE_FILE_EXTENSION = '.fortune.json';

/** Lowercase letters, digits, `-` and `_`; 1–32 chars; starts with a letter or digit. */
export const PROFILE_ID_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export type ProfileFileV1 = {
  format: typeof PROFILE_FILE_FORMAT;
  schemaVersion: 1;
  profileId: string;
  chartFingerprint: string;
  profile: BirthProfile;
};

/** Version 2 records the two supported portable time choices explicitly. */
export type ProfileCalculationSettings = Readonly<{
  useTrueSolarTime: boolean;
  ziHourConvention: 'late' | 'early';
}>;
export type ProfileFileV2 = Omit<ProfileFileV1, 'schemaVersion'> & {
  schemaVersion: 2;
  settings: ProfileCalculationSettings;
};
export type ProfileFile = ProfileFileV1 | ProfileFileV2;
export const DEFAULT_PROFILE_SETTINGS: ProfileCalculationSettings = Object.freeze({
  useTrueSolarTime: true, ziHourConvention: 'late',
});

export function validateProfileSettings(value: unknown): ProfileCalculationSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) ||
      !Object.hasOwn(value, 'useTrueSolarTime') || !Object.hasOwn(value, 'ziHourConvention') ||
      Reflect.ownKeys(value).some(key => key !== 'useTrueSolarTime' && key !== 'ziHourConvention')) {
    throw new Error('settings must contain exactly useTrueSolarTime and ziHourConvention');
  }
  const clock = Object.getOwnPropertyDescriptor(value, 'useTrueSolarTime')!;
  const convention = Object.getOwnPropertyDescriptor(value, 'ziHourConvention')!;
  if (!('value' in clock) || !('value' in convention)) throw new Error('settings must be plain data, not accessors');
  const useTrueSolarTime: unknown = clock.value;
  const ziHourConvention: unknown = convention.value;
  if (typeof useTrueSolarTime !== 'boolean' || (ziHourConvention !== 'late' && ziHourConvention !== 'early')) {
    throw new Error("settings require boolean useTrueSolarTime and ziHourConvention 'late' or 'early'");
  }
  return Object.freeze({ useTrueSolarTime, ziHourConvention });
}

/** v1 remains readable without rewriting it; the provenance is explicit to consumers. */
export function profileSettings(file: ProfileFile) {
  if (file.schemaVersion !== 1 && file.schemaVersion !== 2) throw new Error('Unsupported profile schemaVersion');
  return Object.freeze({
    source: file.schemaVersion === 1 ? 'profile-v1-defaults' as const : 'profile-v2-explicit' as const,
    settings: file.schemaVersion === 1 ? DEFAULT_PROFILE_SETTINGS : validateProfileSettings(file.settings),
  });
}

export function createProfileFileV2(profileId: string, profile: unknown, settings: ProfileCalculationSettings): ProfileFileV2 {
  return { ...createProfileFile(profileId, profile), schemaVersion: 2, settings: validateProfileSettings(settings) };
}

/** Explicit migration, never an in-place rewrite or historical snapshot migration. */
export function migrateProfileFile(file: ProfileFile): ProfileFileV2 {
  const parsed = parseProfileFile(file);
  if (!parsed.ok) throw new Error(`invalid profile: ${parsed.errors.join('; ')}`);
  return createProfileFileV2(parsed.file.profileId, parsed.file.profile, profileSettings(parsed.file).settings);
}

export type ParseProfileFileResult =
  | { ok: true; file: ProfileFile; warnings: string[] }
  | { ok: false; errors: string[] };

export function isValidProfileId(id: unknown): id is string {
  return typeof id === 'string' && PROFILE_ID_RE.test(id);
}

/** Round to ~11 m so float noise from a form or a copy never changes the fingerprint. */
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** Fingerprint of the chart-defining fields (`cf1-` + 16 hex). Name and label excluded. */
export function chartFingerprint(profile: BirthProfile): string {
  const payload = {
    date: profile.date,
    time: profile.time,
    timeAccuracy: profile.timeAccuracy,
    gender: profile.gender,
    lat: round4(profile.birthplace.lat),
    lng: round4(profile.birthplace.lng),
    timezone: profile.birthplace.timezone,
  };
  return `cf1-${fnv1a64Hex(canonicalStringify(payload))}`;
}

/** Build a profile file from a validated profile. Throws on an invalid `profileId` or profile. */
export function createProfileFile(profileId: string, profile: unknown): ProfileFileV1 {
  if (!isValidProfileId(profileId)) {
    throw new Error(`profileId must match ${PROFILE_ID_RE} (got ${JSON.stringify(profileId)})`);
  }
  const checked = validateBirthProfile(profile);
  if (!checked.ok) throw new Error(`invalid profile: ${checked.errors.join('; ')}`);
  return {
    format: PROFILE_FILE_FORMAT,
    schemaVersion: 1,
    profileId,
    chartFingerprint: chartFingerprint(checked.profile),
    profile: checked.profile,
  };
}

/** Canonical text of a profile file (what the web downloads and the MCP reads). */
export function serializeProfileFile(file: ProfileFile): string {
  return `${canonicalStringify(file)}\n`;
}

/**
 * Parse a `.fortune.json` (JSON text or an already-parsed value).
 * A missing or stale `chartFingerprint` (e.g. a hand-edited time) is recomputed with a warning.
 */
export function parseProfileFile(input: unknown): ParseProfileFileResult {
  let raw: unknown = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch {
      return { ok: false, errors: ['not valid JSON'] };
    }
  }
  if (raw === null || typeof raw !== 'object') return { ok: false, errors: ['profile file must be an object'] };
  const obj = raw as Record<string, unknown>;

  const errors: string[] = [];
  if (obj.format !== PROFILE_FILE_FORMAT) errors.push(`format must be '${PROFILE_FILE_FORMAT}'`);
  if (obj.schemaVersion !== 1 && obj.schemaVersion !== 2) {
    errors.push(`unsupported schemaVersion ${JSON.stringify(obj.schemaVersion)} (this build reads ${PROFILE_SCHEMA_VERSION})`);
  }
  if (!isValidProfileId(obj.profileId)) errors.push(`profileId must match ${PROFILE_ID_RE}`);
  let settings: ProfileCalculationSettings | undefined;
  if (obj.schemaVersion === 2) {
    try { settings = validateProfileSettings(obj.settings); }
    catch (error) { errors.push(error instanceof Error ? error.message : 'invalid settings'); }
  } else if (Object.hasOwn(obj, 'settings')) {
    errors.push('Profile v1 cannot carry settings; use schemaVersion 2');
  }
  const checked = validateBirthProfile(obj.profile);
  if (!checked.ok) errors.push(...checked.errors.map(e => `profile: ${e}`));
  if (errors.length > 0 || !checked.ok) return { ok: false, errors };

  const warnings: string[] = [];
  const fingerprint = chartFingerprint(checked.profile);
  if (obj.chartFingerprint === undefined) {
    warnings.push('chartFingerprint missing; computed from profile');
  } else if (obj.chartFingerprint !== fingerprint) {
    warnings.push(`chartFingerprint did not match the profile (file ${JSON.stringify(obj.chartFingerprint)}); recomputed as ${fingerprint}`);
  }
  const common = {
    format: PROFILE_FILE_FORMAT,
    profileId: obj.profileId as string,
    chartFingerprint: fingerprint,
    profile: checked.profile,
  };
  const file: ProfileFile = obj.schemaVersion === 2 && settings
    ? { ...common, schemaVersion: 2, settings }
    : { ...common, schemaVersion: 1 };
  return { ok: true, warnings, file };
}

/** Internal ownership boundary for new calculation/export APIs, not a change to legacy parsing. */
export function ownProfileFile(value: unknown): ProfileFile {
  const ancestors = new Set<object>();
  function copy(item: unknown): unknown {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (typeof item !== 'object' || item === null) throw new Error('Profile calculation requires plain JSON data');
    if (ancestors.has(item)) throw new Error('Profile calculation rejects cyclic data');
    if (Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null && !Array.isArray(item)) {
      throw new Error('Profile calculation requires plain own data');
    }
    ancestors.add(item);
    const out: Record<string, unknown> | unknown[] = Array.isArray(item) ? [] : {};
    for (const key of Reflect.ownKeys(item)) {
      if (Array.isArray(item) && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
      if (typeof key !== 'string' || !descriptor.enumerable || !('value' in descriptor)) {
        throw new Error('Profile calculation rejects accessors and hidden data');
      }
      if (Array.isArray(item) && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= item.length)) {
        throw new Error('Profile calculation requires plain JSON arrays');
      }
      Object.defineProperty(out, key, { value: copy(descriptor.value), enumerable: true, writable: true, configurable: true });
    }
    if (Array.isArray(item) && Object.keys(out).length !== item.length) throw new Error('Profile calculation rejects sparse arrays');
    ancestors.delete(item);
    return out;
  }
  const parsed = parseProfileFile(copy(value));
  if (!parsed.ok) throw new Error(`invalid profile: ${parsed.errors.join('; ')}`);
  return parsed.file;
}
