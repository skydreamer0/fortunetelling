/**
 * @fileoverview IANA 時區換算。
 *
 * 資料來源：內建時區資料庫（`tzdb/`，IANA tz 2026e 的 rearguard＋backzone，由官方原始資料編譯，
 * 不是手寫的 DST 表；D-026）。不使用執行環境的 `Intl`／ICU 資料，因為各環境版本不同、且不含
 * backzone，會讓同一輸入在 Bun、Node、瀏覽器得到不同結果（D-014）。只有時區名稱不在內建資料庫時
 * 才退回 `Intl`，並以 `source: 'intl'` 標示。
 *
 * 地方平時（LMT）：tz 對「尚未實施標準時間」的年代只給時區代表城市的地方平時（例如 1893 年前的
 * Europe/Berlin 一律是柏林的 +0:53:28）。呼叫端提供出生地經度（`lmtLongitude`）時，這段期間改用
 * 出生地的地方平時（經度 × 4 分鐘），並以 `lmtReplaced` 標示。
 *
 * 「naive ms」＝把牆鐘讀數當成 UTC 的毫秒數（Date.UTC(y, m-1, d, h, mi, s)），只是方便做牆鐘
 * 算術的純量，不是瞬間。
 * @module time/zone
 */

import { lookupZone, TZDB_VERSION } from './tzdb/index';

const DAY_MS = 86_400_000;

export { TZDB_VERSION };

export type ZoneOptions = {
  /** 出生地經度（東經為正）。提供時，tz 的地方平時（LMT）期間改用此經度的地方平時。 */
  lmtLongitude?: number;
};

export type ZoneInfo = {
  /** 實際採用的 UTC 偏移（秒，東為正）。 */
  offsetSeconds: number;
  /** 當時的標準（非夏令）偏移（秒）。 */
  stdOffsetSeconds: number;
  isDst: boolean;
  /** tz 資料在此瞬間是地方平時（LMT），也就是當地尚未實施標準時間。 */
  isLmt: boolean;
  /** LMT 期間已改用出生地經度的地方平時。 */
  lmtReplaced: boolean;
  /** tz 資料本身給的偏移（秒）；`lmtReplaced` 時與 `offsetSeconds` 不同。 */
  tzdbOffsetSeconds: number;
  /** 資料來自 tz 的 backzone（1970 年前、tz 官方認為可信度較低的歷史）。 */
  fromBackzone: boolean;
  /** 'tzdb'＝內建資料庫；'intl'＝時區不在內建資料庫，退回執行環境的 Intl（不保證跨環境一致）。 */
  source: 'tzdb' | 'intl';
};

// ── Intl 後備（只用在內建資料庫沒有的時區名稱）──────────────────────────────
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      era: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

function intlOffsetSeconds(timeZone: string, flooredMs: number): number {
  const parts: Record<string, string> = {};
  for (const p of formatterFor(timeZone).formatToParts(new Date(flooredMs))) parts[p.type] = p.value;
  let year = Number(parts.year);
  if (parts.era === 'BC' || parts.era === 'B') year = 1 - year;
  const hour = Number(parts.hour) % 24; // guard against '24' in some ICU builds
  const d = new Date(0);
  d.setUTCFullYear(year, Number(parts.month) - 1, Number(parts.day));
  d.setUTCHours(hour, Number(parts.minute), Number(parts.second), 0);
  return (d.getTime() - flooredMs) / 1000;
}

/** 出生地經度的地方平時偏移（秒，取整秒，與 tz 的 LMT 精度相同）。 */
export function meanSolarOffsetSeconds(longitude: number): number {
  return Math.round(longitude * 240);
}

/** 某瞬間在時區的完整資訊。 */
export function zoneInfoAt(timeZone: string, utcMs: number, options: ZoneOptions = {}): ZoneInfo {
  const floored = Math.floor(utcMs / 1000) * 1000;
  const t = lookupZone(timeZone, floored);
  if (!t) {
    const off = intlOffsetSeconds(timeZone, floored);
    const y = new Date(floored).getUTCFullYear();
    const std = Math.min(intlOffsetSeconds(timeZone, Date.UTC(y, 0, 1, 12)), intlOffsetSeconds(timeZone, Date.UTC(y, 6, 1, 12)));
    return { offsetSeconds: off, stdOffsetSeconds: std, isDst: off > std, isLmt: false, lmtReplaced: false, tzdbOffsetSeconds: off, fromBackzone: false, source: 'intl' };
  }
  const lng = options.lmtLongitude;
  if (t.isLmt && typeof lng === 'number' && Number.isFinite(lng)) {
    const lmt = meanSolarOffsetSeconds(lng);
    return { offsetSeconds: lmt, stdOffsetSeconds: lmt, isDst: false, isLmt: true, lmtReplaced: true, tzdbOffsetSeconds: t.utoff, fromBackzone: t.fromBackzone, source: 'tzdb' };
  }
  return {
    offsetSeconds: t.utoff,
    stdOffsetSeconds: t.stdoff,
    isDst: t.isDst,
    isLmt: t.isLmt,
    lmtReplaced: false,
    tzdbOffsetSeconds: t.utoff,
    fromBackzone: t.fromBackzone,
    source: 'tzdb',
  };
}

/** Wall-clock reading (as naive ms) of an instant in a zone. Second precision. */
export function wallNaiveMsAt(timeZone: string, utcMs: number, options: ZoneOptions = {}): number {
  const floored = Math.floor(utcMs / 1000) * 1000;
  return floored + zoneInfoAt(timeZone, floored, options).offsetSeconds * 1000;
}

/** UTC offset (minutes, east positive) in effect at an instant. */
export function offsetMinutesAt(timeZone: string, utcMs: number, options: ZoneOptions = {}): number {
  return zoneInfoAt(timeZone, utcMs, options).offsetSeconds / 60;
}

/**
 * Standard (non-DST) offset for a year: the smaller of the offsets on
 * Jan 1 and Jul 1 (works for both hemispheres). Caveat: in a year where a zone
 * permanently changed its standard offset this heuristic can misclassify —
 * `createTimeContext` therefore uses the tz data's own standard offset in such years.
 */
export function standardOffsetMinutes(timeZone: string, year: number, options: ZoneOptions = {}): number {
  const jan = Date.UTC(year, 0, 1, 12);
  const jul = Date.UTC(year, 6, 1, 12);
  return Math.min(offsetMinutesAt(timeZone, jan, options), offsetMinutesAt(timeZone, jul, options));
}

export type WallResolution =
  | { kind: 'normal'; utcMs: number; offsetMinutes: number }
  | {
      kind: 'gap';
      /** Wall time shifted forward by the gap, interpreted with the pre-transition offset. */
      utcMs: number;
      offsetMinutes: number;
      gapMinutes: number;
    }
  | {
      kind: 'overlap';
      utcMs: number;
      offsetMinutes: number;
      chosen: 'earlier' | 'later';
      candidates: { utcMs: number; offsetMinutes: number }[];
    };

/**
 * Resolve a local wall time to an instant.
 *
 * Candidate offsets are those in effect 24 h before/after the wall time and at
 * the naive instant; a candidate is valid when the offset at `wall − offset`
 * equals itself. 0 valid → DST gap (shift forward by the gap length);
 * 2 valid → overlap (choose `prefer`, default earlier instant).
 */
export function resolveWallTime(
  timeZone: string,
  wallNaiveMs: number,
  prefer: 'earlier' | 'later' = 'earlier',
  options: ZoneOptions = {},
): WallResolution {
  const off = (ms: number) => offsetMinutesAt(timeZone, ms, options);
  // 偏移都是整秒；地方平時的分鐘數可能是循環小數，換回毫秒時取整避免浮點誤差。
  const shift = (ms: number, minutes: number) => ms - Math.round(minutes * 60) * 1000;
  const before = off(wallNaiveMs - DAY_MS);
  const after = off(wallNaiveMs + DAY_MS);
  const probe = off(wallNaiveMs);
  const offsets = [...new Set([before, probe, after])];

  const valid: { utcMs: number; offsetMinutes: number }[] = [];
  for (const o of offsets) {
    const utcMs = shift(wallNaiveMs, o);
    if (off(utcMs) === o && !valid.some((v) => v.utcMs === utcMs)) {
      valid.push({ utcMs, offsetMinutes: o });
    }
  }
  valid.sort((a, b) => a.utcMs - b.utcMs);

  if (valid.length === 1) return { kind: 'normal', ...valid[0] };
  if (valid.length >= 2) {
    const pick = prefer === 'earlier' ? valid[0] : valid[valid.length - 1];
    return { kind: 'overlap', ...pick, chosen: prefer, candidates: valid };
  }
  // Gap: interpret with the pre-transition offset, which lands after the jump.
  const utcMs = shift(wallNaiveMs, before);
  const offsetMinutes = off(utcMs);
  return { kind: 'gap', utcMs, offsetMinutes, gapMinutes: offsetMinutes - before };
}
