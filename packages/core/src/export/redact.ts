/**
 * @fileoverview 去識別化的單一來源（ROADMAP M2-01／M2-03、D-029）。
 *
 * 匯出的 `share-redacted` 與日後 `packages/ai` 的 `buildInterpretationPayload` 共用這裡的函式，
 * 不各寫一套。純函式：不讀時鐘、不做 IO。
 *
 * 規則：
 * - 姓名一律移除。
 * - 出生地「標籤」（例：台南）移除；計算所需的經緯度與時區保留（`dropCoordinates` 時連經緯度也移除）。
 * - 其餘資料裡若殘留姓名或地名字串，以固定佔位符取代（最長者優先，避免半截殘留）。
 *
 * @module export/redact
 */

import type { BirthProfile } from '../profile/types';

/** 取代姓名的佔位符。 */
export const REDACTED_NAME = '[name]';
/** 取代出生地標籤的佔位符。 */
export const REDACTED_PLACE = '[place]';

/** 至少幾個字才視為敏感字串（避免單字誤傷一般用語）。 */
const MIN_SENSITIVE_LENGTH = 2;

export type SensitiveStrings = {
  /** 姓名（已 trim）；沒有則為 null。 */
  name: string | null;
  /** 出生地標籤（已 trim）；沒有則為 null。 */
  place: string | null;
};

export type RedactedBirthplace = {
  lat?: number;
  lng?: number;
  timezone: string;
};

/** 去識別化後的 profile：沒有 `name`，`birthplace` 沒有 `label`。 */
export type RedactedProfile = Omit<BirthProfile, 'name' | 'birthplace'> & {
  birthplace: RedactedBirthplace;
};

export type RedactOptions = {
  /** 連經緯度一起移除，只留時區（預設 false：保留，因為重算命盤需要）。 */
  dropCoordinates?: boolean;
};

const clean = (s: unknown): string | null =>
  typeof s === 'string' && s.trim().length >= MIN_SENSITIVE_LENGTH ? s.trim() : null;

/** 從 profile 取出必須被抹除的字串。 */
export function sensitiveStringsOf(
  profile: { name?: string; birthplace?: { label?: string } | null },
): SensitiveStrings {
  return { name: clean(profile.name), place: clean(profile.birthplace?.label) };
}

/** 移除姓名與出生地標籤的 profile（欄位與型別穩定）。 */
export function redactProfile(profile: BirthProfile, options: RedactOptions = {}): RedactedProfile {
  const { name: _name, birthplace, ...rest } = profile;
  return {
    ...rest,
    birthplace: options.dropCoordinates
      ? { timezone: birthplace.timezone }
      : { lat: birthplace.lat, lng: birthplace.lng, timezone: birthplace.timezone },
  };
}

/** 逐字串取代：先換較長者，避免「地名包含姓名」時殘留半截。 */
export function scrubString(text: string, secrets: SensitiveStrings): string {
  const pairs: [string, string][] = [];
  if (secrets.name) pairs.push([secrets.name, REDACTED_NAME]);
  if (secrets.place) pairs.push([secrets.place, REDACTED_PLACE]);
  pairs.sort((a, b) => b[0].length - a[0].length);
  let out = text;
  for (const [needle, replacement] of pairs) {
    if (out.includes(needle)) out = out.split(needle).join(replacement);
  }
  return out;
}

/** 遞迴走訪純資料，所有字串值都套用 {@link scrubString}。不改動輸入。 */
export function scrubDeep<T>(value: T, secrets: SensitiveStrings): T {
  if (!secrets.name && !secrets.place) return value;
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return scrubString(v, secrets);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, walk(x)]));
    }
    return v;
  };
  return walk(value) as T;
}
