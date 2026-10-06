/**
 * @fileoverview BirthProfile 輸入合理性檢查（非阻擋式）。
 *
 * 與 `validateBirthProfile` 的分工：validate 只擋「格式不合法」（回 errors、會丟錯）；
 * 這裡檢查「格式合法但疑似填錯」的輸入，只回警告，不丟錯、不改變任何計算。
 * 參考 librejyotish（主動檢驗時區與座標不符）與 ziwei-mcp（衝突時不猜、回報候選）的做法：
 * 指出可能的修正方向，而不是默默產生錯誤結果。
 *
 * 刻意不寫進 `TimeContext.flags`：flags 屬於 TimeContext 的 canonical 輸出，會進入 Report golden 與
 * export golden，新增旗標會改變既有位元；因此以獨立函式匯出，由呼叫端（MCP／網頁／AI 層）決定是否使用。
 * Pure：除可選的 `today` 外不讀時鐘，不做 IO。
 * @module profile/plausibility
 */

import { zoneInfoAt } from '../time/zone';
import { canonicalZoneName } from '../time/tzdb';
import { CITIES } from './cities';
import { SUPPORTED_YEAR_RANGE } from './validate';

export type PlausibilityCode =
  | 'plausibility:timezone_longitude_mismatch'
  | 'plausibility:latitude_out_of_range'
  | 'plausibility:longitude_out_of_range'
  | 'plausibility:lat_lng_swapped'
  | 'plausibility:coordinates_null_island'
  | 'plausibility:date_out_of_supported_range'
  | 'plausibility:date_in_future'
  | 'plausibility:time_accuracy_contradiction'
  | 'plausibility:time_midnight_placeholder';

export type PlausibilityWarning = { code: PlausibilityCode; message: string; hint: string };

export type PlausibilityOptions = {
  /** 今天的日期 'YYYY-MM-DD'（測試用）；預設取系統時鐘的 UTC 日期。 */
  today?: string;
};

/**
 * 時區標準偏移與出生地經度平太陽時之差的警告門檻（分鐘）。
 *
 * 量測依據：cities 表 56 個城市在 1900／1950／1990／2024 年的差距最大為吉隆坡 73 分鐘
 * （其次新加坡 65、巴黎 51）；真實存在的「政治性偏離」案例：冰島 ~88、西班牙加利西亞 ~97、
 * 阿拉斯加西部（Nome）~122、中國烏魯木齊 ~130、喀什 ~173、中國最西端（73.5°E 用 +8）~186。
 * 取 210 分鐘（3.5 小時）：高於所有已知合法案例並留餘裕，同時仍能抓出「經緯度是台北、時區卻是紐約」
 * 這類相差數小時的錯誤。代價：差 1–3 小時的誤填（例如日本座標配台北時區）抓不到，這是為了不誤報中國西部。
 */
export const TIMEZONE_LONGITUDE_MISMATCH_MINUTES = 210;

/** 對調判斷：座標落在城市表內某城市此距離（公里）內，視為「落在該城市附近」。 */
export const NEAR_CITY_KM = 100;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(a)));
}

function nearestCity(lat: number, lng: number): { nameEn: string; nameZh: string; km: number } | null {
  let best: { nameEn: string; nameZh: string; km: number } | null = null;
  for (const c of CITIES) {
    const km = haversineKm(lat, lng, c.lat, c.lng);
    if (!best || km < best.km) best = { nameEn: c.nameEn, nameZh: c.nameZh, km };
  }
  return best;
}

/** 把分鐘差正規化到 (-720, 720]，處理跨換日線（例如 Pacific/Kiritimati +14 配西經）。 */
function wrapMinutes(m: number): number {
  const r = ((m % 1440) + 1440) % 1440;
  return r > 720 ? r - 1440 : r;
}

/**
 * 檢查疑似填錯的出生資料。輸入可為未驗證的任意值（會防禦性讀取）；不丟錯，無問題回 `[]`。
 * 結果順序固定（date → time → 座標 → 時區），同一輸入同一結果。
 */
export function checkBirthProfilePlausibility(input: unknown, options: PlausibilityOptions = {}): PlausibilityWarning[] {
  const out: PlausibilityWarning[] = [];
  if (input === null || typeof input !== 'object') return out;
  const raw = input as Record<string, unknown>;
  const bp = raw.birthplace !== null && typeof raw.birthplace === 'object' ? (raw.birthplace as Record<string, unknown>) : {};

  // ── date ──────────────────────────────────────────────────────────────────
  let dateParts: [number, number, number] | null = null;
  if (typeof raw.date === 'string') {
    const m = DATE_RE.exec(raw.date);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const d = Number(m[3]);
      if (y < SUPPORTED_YEAR_RANGE.min || y > SUPPORTED_YEAR_RANGE.max) {
        out.push({
          code: 'plausibility:date_out_of_supported_range',
          message: `出生年份 ${y} 超出支援範圍 ${SUPPORTED_YEAR_RANGE.min}–${SUPPORTED_YEAR_RANGE.max}`,
          hint: '請確認年份是否多打或少打一位；超出範圍的節氣與 ΔT 不做外推',
        });
      } else {
        dateParts = [y, mo, d];
        const today = options.today ?? new Date().toISOString().slice(0, 10);
        const t = DATE_RE.exec(today);
        if (t) {
          // 容許 1 天：出生地可能比 UTC 日期早（最多 UTC+14）。
          const limit = Date.UTC(Number(t[1]), Number(t[2]) - 1, Number(t[3])) + DAY_MS;
          if (Date.UTC(y, mo - 1, d) > limit) {
            out.push({
              code: 'plausibility:date_in_future',
              message: `出生日期 ${raw.date} 在今天（${today}）之後`,
              hint: '請確認年份是否填錯（例如西元年與民國年混用）；若是預產期，結果僅供參考',
            });
          }
        }
      }
    }
  }

  // ── time / accuracy ───────────────────────────────────────────────────────
  const time = raw.time === undefined ? null : raw.time;
  const acc = raw.timeAccuracy;
  if (acc !== undefined) {
    if (time === null && acc !== 'unknown') {
      out.push({
        code: 'plausibility:time_accuracy_contradiction',
        message: `未提供出生時間，但 timeAccuracy 是 '${String(acc)}'`,
        hint: "時間未知請把 timeAccuracy 設為 'unknown'；若其實知道時間請補上 time",
      });
    } else if (time !== null && acc === 'unknown') {
      out.push({
        code: 'plausibility:time_accuracy_contradiction',
        message: "已提供出生時間，但 timeAccuracy 是 'unknown'",
        hint: "請改成 'exact'、'approx15m' 或 'approx1h'，或把 time 設為 null",
      });
    }
  }
  if (time === '00:00' && (acc === undefined || acc === 'exact')) {
    out.push({
      code: 'plausibility:time_midnight_placeholder',
      message: '出生時間為 00:00 且標示精確，可能是表單預設值而非真實時間',
      hint: '00:00 剛好在子時與換日交界；若不確定時間請設為 null（unknown），確定是午夜則可忽略此提醒',
    });
  }

  // ── coordinates ───────────────────────────────────────────────────────────
  const lat = bp.lat;
  const lng = bp.lng;
  const latOk = isNum(lat) && Math.abs(lat) <= 90;
  const lngOk = isNum(lng) && Math.abs(lng) <= 180;
  if (isNum(lat) && !latOk) {
    const swappable = isNum(lng) && Math.abs(lng) <= 90 && Math.abs(lat) <= 180;
    out.push({
      code: 'plausibility:latitude_out_of_range',
      message: `緯度 ${lat} 超出 [-90, 90]`,
      hint: swappable ? `緯度與經度可能填反了：請試試 lat=${lng}、lng=${lat}` : '緯度必須在 -90 到 90 之間（北為正）；請確認出生地經緯度',
    });
  }
  if (isNum(lng) && !lngOk) {
    out.push({
      code: 'plausibility:longitude_out_of_range',
      message: `經度 ${lng} 超出 [-180, 180]`,
      hint: '經度必須在 -180 到 180 之間（東為正）；請確認出生地經緯度',
    });
  }
  if (latOk && lngOk) {
    if (lat === 0 && lng === 0) {
      out.push({
        code: 'plausibility:coordinates_null_island',
        message: '座標為 (0, 0)（幾內亞灣外海），通常是未填寫的預設值',
        hint: '請確認出生地經緯度，或改用城市表選擇出生地',
      });
    } else if (Math.abs(lng) <= 90) {
      // 對調後落在城市附近、而原座標不在任何城市附近 → 疑似對調。
      const here = nearestCity(lat, lng);
      const swapped = nearestCity(lng, lat);
      if (swapped && swapped.km <= NEAR_CITY_KM && (!here || here.km > NEAR_CITY_KM)) {
        out.push({
          code: 'plausibility:lat_lng_swapped',
          message: `緯度與經度對調後落在 ${swapped.nameZh}（${swapped.nameEn}）附近（約 ${Math.round(swapped.km)} 公里）`,
          hint: `緯度與經度可能填反了：請試試 lat=${lng}、lng=${lat}`,
        });
      }
    }
  }

  // ── timezone vs longitude ────────────────────────────────────────────────
  const tz = bp.timezone;
  if (dateParts && lngOk && typeof tz === 'string' && canonicalZoneName(tz) !== null) {
    const [y, mo, d] = dateParts;
    const lon = lng as number;
    try {
      // 取出生日當地正午附近的瞬間（以經度估算），看當時的「標準偏移」（不含夏令，避免 +1h 誤報）。
      const utcMs = Date.UTC(y, mo - 1, d, 12) - lon * 240_000;
      const info = zoneInfoAt(tz, utcMs, { lmtLongitude: lon });
      if (!info.lmtReplaced) {
        const diffMin = wrapMinutes(info.stdOffsetSeconds / 60 - lon * 4);
        if (Math.abs(diffMin) > TIMEZONE_LONGITUDE_MISMATCH_MINUTES) {
          const stdH = info.stdOffsetSeconds / 3600;
          out.push({
            code: 'plausibility:timezone_longitude_mismatch',
            message: `時區 ${tz}（當時標準偏移 UTC${stdH >= 0 ? '+' : ''}${stdH}）與經度 ${lon} 的地方平時相差約 ${Math.round(Math.abs(diffMin))} 分鐘（門檻 ${TIMEZONE_LONGITUDE_MISMATCH_MINUTES}）`,
            hint: '請確認出生地經緯度或時區是否填錯；時區錯誤會讓時柱、命宮與節氣前後判定整體偏移',
          });
        }
      }
    } catch {
      // 時區資料查不到時不報（validate 會處理無效時區）。
    }
  }
  return out;
}
