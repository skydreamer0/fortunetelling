/**
 * @fileoverview 內建時區資料庫的查詢入口（純函式、無 IO，可在瀏覽器、Node、Bun 執行）。
 *
 * 為什麼不用執行環境的 `Intl`：各環境內建的 ICU／tz 版本不同（例如 Bun 1.3 的 ICU 73 與
 * Node 22 的 ICU 78／tz 2026a 在 55 個時區、包含 2022–2025 年的資料上不一致），而且都不含
 * backzone，1970 年前被合併的時區（冰島、挪威、荷蘭…）會套上別國的歷史。固定一份資料才能
 * 讓同一輸入在所有環境得到相同結果（D-014）。
 * @module time/tzdb
 */

import { TZDB_LINKS, TZDB_VERSION, TZDB_ZONES } from './data';
import { decodeZone, zoneTypeAtSec, type DecodedZone, type ZoneType } from './format';

export { TZDB_VERSION };
export type { ZoneType };

const cache = new Map<string, DecodedZone>();
let lowerIndex: Map<string, string> | null = null;

/** 名稱 → 正式時區名（大小寫不敏感，與 `Intl` 相同）；不在資料庫內回傳 null。 */
export function canonicalZoneName(name: string): string | null {
  if (Object.prototype.hasOwnProperty.call(TZDB_ZONES, name)) return name;
  if (Object.prototype.hasOwnProperty.call(TZDB_LINKS, name)) return TZDB_LINKS[name];
  if (!lowerIndex) {
    lowerIndex = new Map();
    for (const k of Object.keys(TZDB_ZONES)) lowerIndex.set(k.toLowerCase(), k);
    for (const [k, v] of Object.entries(TZDB_LINKS)) lowerIndex.set(k.toLowerCase(), v);
  }
  return lowerIndex.get(name.toLowerCase()) ?? null;
}

function zone(name: string): DecodedZone | null {
  const canonical = canonicalZoneName(name);
  if (!canonical) return null;
  let z = cache.get(canonical);
  if (!z) {
    z = decodeZone(TZDB_ZONES[canonical]);
    cache.set(canonical, z);
  }
  return z;
}

export type ZoneLookup = ZoneType & {
  /** 這段資料來自 tz 的 backzone（主資料庫已合併、tz 官方認為可信度較低的 1970 年前歷史）。 */
  fromBackzone: boolean;
};

/** 某瞬間（UTC 毫秒）在時區的期間型別；時區不在資料庫內回傳 null。 */
export function lookupZone(name: string, utcMs: number): ZoneLookup | null {
  const z = zone(name);
  if (!z) return null;
  const sec = Math.floor(utcMs / 1000);
  const t = zoneTypeAtSec(z, sec);
  return { ...t, fromBackzone: z.backzoneUntil !== null && sec < z.backzoneUntil };
}

/** 資料庫內所有時區與別名（測試用）。 */
export function allZoneNames(): string[] {
  return [...Object.keys(TZDB_ZONES), ...Object.keys(TZDB_LINKS)].sort();
}
