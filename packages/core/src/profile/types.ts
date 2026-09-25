/**
 * @fileoverview BirthProfile — the single user-input contract for all
 * calculators (ARCHITECTURE-V2 §3.1). Only `createTimeContext()` may turn it
 * into instants; calculators never read it directly for time math (D-026).
 * @module profile/types
 */

/** 出生時間精度。`unknown` 必須搭配 `time === null`。 */
export type TimeAccuracy = 'exact' | 'approx15m' | 'approx1h' | 'unknown';

export type Gender = 'male' | 'female';

export type Birthplace = {
  /** 顯示用標籤，例如 'Tainan, Taiwan'。 */
  label: string;
  /** 緯度（度，北為正）。 */
  lat: number;
  /** 經度（度，東為正）。 */
  lng: number;
  /** IANA 時區名稱，例如 'Asia/Taipei'（不得存固定 offset）。 */
  timezone: string;
};

export type BirthProfile = {
  /** 'YYYY-MM-DD'，出生地當地民用曆。 */
  date: string;
  /** 'HH:mm'（24 小時制）；null = 時間未知。 */
  time: string | null;
  timeAccuracy: TimeAccuracy;
  gender: Gender;
  name?: string;
  birthplace: Birthplace;
};

export type ValidationResult =
  | { ok: true; profile: BirthProfile }
  | { ok: false; errors: string[] };
