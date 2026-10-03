/**
 * @fileoverview TimeContext types (ARCHITECTURE-V2 §3.2, §3.3).
 *
 * ISO string conventions used throughout:
 * - `local.iso`      — civil wall time WITH offset:  'YYYY-MM-DDTHH:mm:ss+09:00'
 * - `*.utcIso`/`utc.iso` — instant in UTC:           'YYYY-MM-DDTHH:mm:ssZ'
 * - `solar.lmtIso` / `solar.trueSolarIso` — "wall-clock" style WITHOUT zone:
 *   'YYYY-MM-DDTHH:mm:ss'. They are clock readings of a local sundial-like
 *   time scale, not instants; never parse them with `new Date()` (which would
 *   apply the host zone). All are rounded to whole seconds.
 * @module time/types
 */

import type { BirthProfile } from '../profile/types';

export type TimeFlagCode =
  | 'dst_applied'
  | 'dst_gap'
  | 'dst_overlap'
  | 'near_shichen_boundary'
  | 'near_jie_boundary'
  | 'zi_hour_convention'
  | 'time_unknown'
  | 'historical_zone_uncertain';

/**
 * 歷史時區不確定的原因：
 * - `pre_standard_time_lmt`：當地尚未實施標準時間；tz 只有時區代表城市的地方平時，已改用出生地經度的地方平時。
 * - `backzone`：1970 年前的資料取自 tz 的 backzone（主資料庫已合併、tz 官方標示「範圍外且常有錯誤」）。
 * - `longitude_offset_mismatch`：1970 年前，該時區的標準偏移與出生地平太陽時相差超過 90 分鐘，
 *   這個 IANA 時區可能不代表出生地當時的法定時間。
 * - `zone_not_bundled`：時區名稱不在內建資料庫，退回執行環境的 Intl（不保證跨環境一致）。
 */
export type HistoricalZoneReason = 'pre_standard_time_lmt' | 'backzone' | 'longitude_offset_mismatch' | 'zone_not_bundled';

/** Which clock a boundary check was evaluated on. */
export type TimeBasis = 'trueSolar' | 'civil';

export type ShichenBoundaryHit = {
  basis: TimeBasis;
  /** Nearest odd-hour boundary on that clock, 'HH:00'. */
  boundary: string;
  /** Signed minutes from the boundary (positive = after the boundary). */
  minutesFromBoundary: number;
};

export type SolarTermRef = {
  /** lunar-javascript name (simplified Chinese, e.g. '惊蛰') — use this to join with the library. */
  name: string;
  /** Traditional-Chinese display name (e.g. '驚蟄'). */
  nameHant: string;
  kind: 'jie' | 'qi';
  /** Exact instant of the term in UTC, whole seconds. */
  utcIso: string;
};

/**
 * Flags are objects with a stable `code`; each code appears at most once per
 * TimeContext, in a fixed order (see `FLAG_ORDER`). `detail` is a short
 * English/Chinese human-readable note; `data` is machine-readable.
 */
export type TimeFlag =
  | {
      code: 'dst_applied';
      detail: string;
      data: { utcOffsetMinutes: number; standardOffsetMinutes: number };
    }
  | {
      code: 'dst_gap';
      detail: string;
      data: {
        requestedLocal: string;
        resolvedLocal: string;
        gapMinutes: number;
        requiresConfirmation: true;
      };
    }
  | {
      code: 'dst_overlap';
      detail: string;
      data: {
        requestedLocal: string;
        chosen: 'earlier' | 'later';
        candidates: { utcIso: string; utcOffsetMinutes: number }[];
        requiresConfirmation: true;
      };
    }
  | {
      code: 'near_shichen_boundary';
      detail: string;
      data: { toleranceMinutes: number; hits: ShichenBoundaryHit[] };
    }
  | {
      code: 'near_jie_boundary';
      detail: string;
      data:
        | {
            basis: 'instant';
            term: SolarTermRef;
            /** Signed minutes birth − term (negative = born before the term). */
            minutesFromTerm: number;
            toleranceMinutes: number;
          }
        | {
            /** time unknown: a Jie falls within the local civil birth day. */
            basis: 'date';
            term: SolarTermRef;
          };
    }
  | {
      code: 'zi_hour_convention';
      detail: string;
      data: { bases: TimeBasis[] };
    }
  | { code: 'time_unknown'; detail: string }
  | {
      code: 'historical_zone_uncertain';
      detail: string;
      data: {
        reasons: HistoricalZoneReason[];
        /** 內建 tz 資料版本（例如 '2026e'）。 */
        tzdbVersion: string;
        /** 實際採用的 UTC 偏移（分鐘）。 */
        utcOffsetMinutes: number;
        /** tz 資料本身的偏移（分鐘）；LMT 已改用出生地時與上者不同。 */
        tzdataOffsetMinutes: number;
        /** 出生地經度對應的平太陽時偏移（經度 × 4 分鐘）。 */
        meanSolarOffsetMinutes: number;
        /** 時間未知時以當地 12:00 判斷。 */
        basis: 'birth' | 'local_noon';
        requiresConfirmation: true;
      };
    };

export type LunarDate = {
  /** Lunar year number (changes at 春節, NOT 立春). */
  year: number;
  /** Lunar month 1–12 (always positive; see isLeap). */
  month: number;
  day: number;
  isLeap: boolean;
  /** 年干支 by lunar new year (not 立春 — BaZi must use solarTerms). */
  yearGanZhi: string;
  monthInChinese: string;
  dayInChinese: string;
  /** 生肖 by lunar new year. */
  zodiac: string;
};

export type SolarTerms = {
  /** Which instant prev/next are relative to: the birth instant, or local 12:00 when time is unknown. */
  reference: 'birth' | 'local_noon';
  referenceUtcIso: string;
  prevJie: SolarTermRef;
  nextJie: SolarTermRef;
  prevQi: SolarTermRef;
  nextQi: SolarTermRef;
};

export type TimeContext = {
  profile: BirthProfile;
  /** null when time is unknown. */
  local: { iso: string; utcOffsetMinutes: number; dst: boolean } | null;
  /** null when time is unknown. */
  utc: { iso: string } | null;
  /** null when time is unknown. */
  jd: { ut: number; tt: number; deltaTSeconds: number } | null;
  /** null when time is unknown. */
  solar: { lmtIso: string; trueSolarIso: string; equationOfTimeMinutes: number } | null;
  /** Always present: computed from the local civil date. */
  lunar: LunarDate;
  /** Always present. */
  solarTerms: SolarTerms;
  flags: TimeFlag[];
};

export type TimeContextOptions = {
  /** How to resolve an ambiguous (repeated) wall time. Default 'earlier' (the pre-transition offset). */
  dstOverlap?: 'earlier' | 'later';
};
