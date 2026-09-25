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
  | 'time_unknown';

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
  | { code: 'time_unknown'; detail: string };

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
