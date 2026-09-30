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
export const PROFILE_SCHEMA_VERSION = 1 as const;
export const PROFILE_FILE_EXTENSION = '.fortune.json';

/** Lowercase letters, digits, `-` and `_`; 1–32 chars; starts with a letter or digit. */
export const PROFILE_ID_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export type ProfileFileV1 = {
  format: typeof PROFILE_FILE_FORMAT;
  schemaVersion: typeof PROFILE_SCHEMA_VERSION;
  profileId: string;
  chartFingerprint: string;
  profile: BirthProfile;
};

export type ParseProfileFileResult =
  | { ok: true; file: ProfileFileV1; warnings: string[] }
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
    schemaVersion: PROFILE_SCHEMA_VERSION,
    profileId,
    chartFingerprint: chartFingerprint(checked.profile),
    profile: checked.profile,
  };
}

/** Canonical text of a profile file (what the web downloads and the MCP reads). */
export function serializeProfileFile(file: ProfileFileV1): string {
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
  if (obj.schemaVersion !== PROFILE_SCHEMA_VERSION) {
    errors.push(`unsupported schemaVersion ${JSON.stringify(obj.schemaVersion)} (this build reads ${PROFILE_SCHEMA_VERSION})`);
  }
  if (!isValidProfileId(obj.profileId)) errors.push(`profileId must match ${PROFILE_ID_RE}`);
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
  return {
    ok: true,
    warnings,
    file: {
      format: PROFILE_FILE_FORMAT,
      schemaVersion: PROFILE_SCHEMA_VERSION,
      profileId: obj.profileId as string,
      chartFingerprint: fingerprint,
      profile: checked.profile,
    },
  };
}
