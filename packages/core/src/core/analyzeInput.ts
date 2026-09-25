/**
 * @fileoverview Raw `analyze()` input → legacy {@link BirthData} + V2
 * {@link BirthProfile} + analysis conventions (Report v4, D-032).
 *
 * The v3 raw input (`year/month/day/hour/minute/timeKnown/gender/name/
 * longitude/latitude`) keeps working unchanged. v4 adds optional fields:
 *
 * - `birthplace` `{ label, lat, lng, timezone }` (IANA zone), or
 * - `cityId` — any key `findCity()` accepts (id, 中文名, English name);
 * - `timeAccuracy` — 'exact' | 'approx15m' | 'approx1h' | 'unknown';
 * - `ziHourConvention` — 'late' (default; 子正換日, 晚子 stays on the day) or
 *   'early' (子初換日). The Ziwei spellings 'splitMidnight' / 'nextDayAt23'
 *   are accepted as aliases;
 * - `useTrueSolarTime` — default true.
 *
 * Birthplace resolution order: `birthplace` → `cityId` → legacy
 * `longitude`/`latitude` (read with timezone Asia/Taipei, the v3 contract that
 * the hour/minute are Taiwan civil time) → {@link DEFAULT_BIRTHPLACE} (Taipei).
 *
 * @module core/analyzeInput
 */

import { BirthData } from './models/BirthData.js';
import { DEFAULT_BIRTHPLACE, cityToBirthplace, findCity } from '../profile/cities';
import { TIME_ACCURACIES, validateBirthProfile } from '../profile/validate';
import type { Birthplace, BirthProfile, TimeAccuracy } from '../profile/types';
import type { ZiHourConvention } from '../calculators/bazi/pillars';
import type { ZiweiZiHourConvention } from '../calculators/ziwei/types';

/** Timezone assumed for legacy `longitude`/`latitude` input (v3 contract: Taiwan civil time). */
export const LEGACY_INPUT_TIMEZONE = 'Asia/Taipei';

/** Where the birthplace of a report came from. */
export type BirthplaceSource = 'birthplace' | 'cityId' | 'legacyCoordinates' | 'default';

export interface AnalysisTimeOptions {
  useTrueSolarTime: boolean;
  /** 八字 naming; ziwei uses {@link toZiweiZiConvention}. */
  ziHourConvention: ZiHourConvention;
}

export interface ResolvedAnalyzeInput {
  birth: BirthData;
  profile: BirthProfile;
  options: AnalysisTimeOptions;
  birthplaceSource: BirthplaceSource;
}

/** BirthData constructor defaults: a BirthData instance carrying them has no explicit coordinates. */
const BIRTHDATA_DEFAULT_COORDS = Object.freeze({ longitude: 121.5, latitude: 25.05 });

const ZI_ALIASES: Readonly<Record<string, ZiHourConvention>> = Object.freeze({
  late: 'late',
  early: 'early',
  splitMidnight: 'late',
  nextDayAt23: 'early',
});

export function toZiweiZiConvention(c: ZiHourConvention): ZiweiZiHourConvention {
  return c === 'early' ? 'nextDayAt23' : 'splitMidnight';
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function resolveBirthplace(raw: Record<string, unknown>, isInstance: boolean): { birthplace: Birthplace; source: BirthplaceSource } {
  if (raw.birthplace !== undefined && raw.birthplace !== null) {
    const bp = raw.birthplace as Birthplace;
    return { birthplace: { label: bp.label, lat: bp.lat, lng: bp.lng, timezone: bp.timezone }, source: 'birthplace' };
  }
  if (raw.cityId !== undefined && raw.cityId !== null) {
    const city = findCity(String(raw.cityId));
    if (!city) throw new Error(`Unknown cityId: ${JSON.stringify(raw.cityId)}`);
    return { birthplace: cityToBirthplace(city), source: 'cityId' };
  }
  const lng = raw.longitude;
  const lat = raw.latitude;
  const hasLegacy = isInstance
    ? lng !== BIRTHDATA_DEFAULT_COORDS.longitude || lat !== BIRTHDATA_DEFAULT_COORDS.latitude
    : lng !== undefined || lat !== undefined;
  if (hasLegacy) {
    const useLng = isNum(lng) ? lng : DEFAULT_BIRTHPLACE.lng;
    const useLat = isNum(lat) ? lat : DEFAULT_BIRTHPLACE.lat;
    return {
      birthplace: {
        label: `${useLat.toFixed(4)}, ${useLng.toFixed(4)}`,
        lat: useLat,
        lng: useLng,
        timezone: LEGACY_INPUT_TIMEZONE,
      },
      source: 'legacyCoordinates',
    };
  }
  return { birthplace: { ...DEFAULT_BIRTHPLACE }, source: 'default' };
}

/**
 * Normalise and validate the raw input. Throws (fail fast, like v3) on any
 * invalid field; BirthData's own messages are kept for the v3 fields.
 */
export function resolveAnalyzeInput(input: unknown): ResolvedAnalyzeInput {
  const isInstance = input instanceof BirthData;
  const raw = (input ?? {}) as Record<string, unknown>;

  const { birthplace, source } = resolveBirthplace(isInstance ? (input as BirthData).toJSON() as unknown as Record<string, unknown> : raw, isInstance);

  // Legacy BirthData (engines' input). Coordinates follow the resolved birthplace.
  const birth = isInstance
    ? new BirthData({ ...(input as BirthData).toJSON(), longitude: birthplace.lng, latitude: birthplace.lat })
    : new BirthData({ ...(raw as any), longitude: birthplace.lng, latitude: birthplace.lat });
  birth.validate();

  // v4 options (a BirthData instance carries none → defaults).
  const opts = isInstance ? {} : raw;
  const useTrueSolarTime = opts.useTrueSolarTime ?? true;
  if (typeof useTrueSolarTime !== 'boolean') throw new Error('Invalid useTrueSolarTime: must be a boolean.');
  const ziRaw = opts.ziHourConvention ?? 'late';
  const ziHourConvention = ZI_ALIASES[String(ziRaw)];
  if (!ziHourConvention || typeof ziRaw !== 'string') {
    throw new Error(`Invalid ziHourConvention: ${JSON.stringify(ziRaw)}. Use 'late' or 'early'.`);
  }

  const time = birth.timeKnown ? `${pad(birth.hour)}:${pad(birth.minute)}` : null;
  let timeAccuracy = opts.timeAccuracy as TimeAccuracy | undefined;
  if (timeAccuracy !== undefined && !TIME_ACCURACIES.includes(timeAccuracy)) {
    throw new Error(`Invalid timeAccuracy: ${JSON.stringify(timeAccuracy)}. Use one of ${TIME_ACCURACIES.join(', ')}.`);
  }
  if (timeAccuracy === undefined || time === null) timeAccuracy = time === null ? 'unknown' : 'exact';
  if (timeAccuracy === 'unknown' && time !== null) {
    throw new Error("Invalid timeAccuracy: 'unknown' requires timeKnown: false.");
  }

  const draft: BirthProfile = {
    date: `${pad(birth.year, 4)}-${pad(birth.month)}-${pad(birth.day)}`,
    time,
    timeAccuracy,
    gender: birth.gender as BirthProfile['gender'],
    birthplace,
  };
  if (birth.name) draft.name = birth.name;
  const checked = validateBirthProfile(draft);
  if (checked.ok === false) throw new Error(`Invalid birth input: ${checked.errors.join('; ')}`);

  return { birth, profile: checked.profile, options: { useTrueSolarTime, ziHourConvention }, birthplaceSource: source };
}
