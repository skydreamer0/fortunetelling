import { describe, expect, test } from 'bun:test';
import {
  CITIES,
  checkBirthProfilePlausibility,
  cityToBirthplace,
  createTimeContext,
  TIMEZONE_LONGITUDE_MISMATCH_MINUTES,
  type BirthProfile,
} from '../src';

const TODAY = '2026-10-06';

function profile(over: Record<string, unknown> = {}, bp: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    date: '1990-06-15',
    time: '10:30',
    timeAccuracy: 'exact',
    gender: 'female',
    birthplace: { label: 'Taipei', lat: 25.0478, lng: 121.5319, timezone: 'Asia/Taipei', ...bp },
    ...over,
  };
}
const codes = (p: unknown) => checkBirthProfilePlausibility(p, { today: TODAY }).map((w) => w.code);

describe('時區與座標不符', () => {
  test('正例：台北座標配紐約時區', () => {
    const w = checkBirthProfilePlausibility(profile({}, { timezone: 'America/New_York' }), { today: TODAY });
    expect(w.map((x) => x.code)).toContain('plausibility:timezone_longitude_mismatch');
    expect(w[0]!.hint).toContain('經緯度或時區');
  });
  test('反例：台北座標配台北時區', () => {
    expect(codes(profile())).toEqual([]);
  });
  test('cities 表全部城市、多個年代皆不誤報', () => {
    for (const c of CITIES) {
      for (const date of ['1900-06-15', '1950-01-15', '1990-06-15', '2024-12-31']) {
        const p = { ...profile({ date }), birthplace: cityToBirthplace(c) };
        expect(codes(p)).toEqual([]);
      }
    }
  });
  test.each([
    ['中國烏魯木齊（用 +8）', 43.83, 87.62, 'Asia/Shanghai'],
    ['中國喀什（用 +8）', 39.47, 75.99, 'Asia/Shanghai'],
    ['中國最西端（73.5°E）', 39.0, 73.6, 'Asia/Shanghai'],
    ['烏魯木齊（Asia/Urumqi）', 43.83, 87.62, 'Asia/Urumqi'],
    ['西班牙加利西亞', 42.88, -8.54, 'Europe/Madrid'],
    ['阿拉斯加安克拉治', 61.22, -149.9, 'America/Anchorage'],
    ['阿拉斯加 Nome', 64.5, -165.4, 'America/Nome'],
    ['冰島雷克雅維克', 64.15, -21.94, 'Atlantic/Reykjavik'],
    ['紐西蘭查塔姆群島（+12:45）', -43.95, -176.55, 'Pacific/Chatham'],
    ['印度德里（+5:30）', 28.61, 77.21, 'Asia/Kolkata'],
    ['尼泊爾加德滿都（+5:45）', 27.72, 85.32, 'Asia/Kathmandu'],
    ['基里巴斯 Kiritimati（+14，跨換日線）', 1.87, -157.4, 'Pacific/Kiritimati'],
  ])('已知合法偏離不誤報：%s', (_n, lat, lng, timezone) => {
    expect(codes(profile({}, { lat, lng, timezone }))).not.toContain('plausibility:timezone_longitude_mismatch');
  });
  test('1900 年尚未實施標準時間（LMT 改用經度）不誤報', () => {
    expect(codes(profile({ date: '1880-01-01' }, { timezone: 'America/New_York' }))).not.toContain(
      'plausibility:timezone_longitude_mismatch',
    );
  });
  test('門檻常數與說明一致', () => {
    expect(TIMEZONE_LONGITUDE_MISMATCH_MINUTES).toBe(210);
  });
});

describe('緯度／經度範圍與對調', () => {
  test('正例：lat 超出 90，提示對調', () => {
    const w = checkBirthProfilePlausibility(profile({}, { lat: 121.5319, lng: 25.0478 }), { today: TODAY });
    expect(w.map((x) => x.code)).toContain('plausibility:latitude_out_of_range');
    expect(w.find((x) => x.code === 'plausibility:latitude_out_of_range')!.hint).toContain('lat=25.0478');
  });
  test('正例：經度超出 180', () => {
    expect(codes(profile({}, { lng: 200 }))).toContain('plausibility:longitude_out_of_range');
  });
  test('正例：兩者皆在範圍內但對調後落在城市附近（城市表中 |lng|<=90 的城市反寫後應被抓到）', () => {
    let caught = 0;
    for (const c of CITIES) {
      if (Math.abs(c.lng) > 90) continue; // 對調後 lat 超界，由 latitude_out_of_range 負責
      const p = profile({}, { lat: c.lng, lng: c.lat, timezone: c.timezone });
      if (codes(p).includes('plausibility:lat_lng_swapped')) caught++;
    }
    expect(caught).toBeGreaterThan(5);
  });
  test('反例：正確座標不報對調／範圍', () => {
    const c = codes(profile());
    expect(c).not.toContain('plausibility:lat_lng_swapped');
    expect(c).not.toContain('plausibility:latitude_out_of_range');
    expect(c).not.toContain('plausibility:longitude_out_of_range');
  });
  test('正例：(0,0) 提示未填寫；反例：非 0', () => {
    expect(codes(profile({}, { lat: 0, lng: 0, timezone: 'Africa/Abidjan' }))).toContain('plausibility:coordinates_null_island');
    expect(codes(profile())).not.toContain('plausibility:coordinates_null_island');
  });
});

describe('出生日期範圍', () => {
  test('正例：1700 年與 2300 年', () => {
    expect(codes(profile({ date: '1700-01-01' }))).toContain('plausibility:date_out_of_supported_range');
    expect(codes(profile({ date: '2300-01-01' }))).toContain('plausibility:date_out_of_supported_range');
  });
  test('反例：1800 與 2200 邊界在範圍內', () => {
    expect(codes(profile({ date: '1800-01-02' }))).not.toContain('plausibility:date_out_of_supported_range');
    expect(codes(profile({ date: '2200-12-31' }))).not.toContain('plausibility:date_out_of_supported_range');
  });
  test('正例：未來日期（今天之後）', () => {
    expect(codes(profile({ date: '2026-10-08' }))).toContain('plausibility:date_in_future');
    expect(codes(profile({ date: '2090-01-01' }))).toContain('plausibility:date_in_future');
  });
  test('反例：今天與明天（時區差容許）不算未來', () => {
    expect(codes(profile({ date: TODAY }))).not.toContain('plausibility:date_in_future');
    expect(codes(profile({ date: '2026-10-07' }))).not.toContain('plausibility:date_in_future');
    expect(codes(profile({ date: '2000-01-01' }))).not.toContain('plausibility:date_in_future');
  });
});

describe('時間精度與時間欄位', () => {
  test('正例：unknown 卻給了時間；有精度但 time 為 null', () => {
    expect(codes(profile({ timeAccuracy: 'unknown' }))).toContain('plausibility:time_accuracy_contradiction');
    expect(codes(profile({ time: null, timeAccuracy: 'exact' }))).toContain('plausibility:time_accuracy_contradiction');
  });
  test('反例：一致的組合', () => {
    expect(codes(profile({ time: null, timeAccuracy: 'unknown' }))).toEqual([]);
    expect(codes(profile({ timeAccuracy: 'approx1h' }))).toEqual([]);
  });
  test('正例：00:00 且 exact 疑似預設值；反例：approx1h 或其他時間', () => {
    expect(codes(profile({ time: '00:00' }))).toContain('plausibility:time_midnight_placeholder');
    expect(codes(profile({ time: '00:00', timeAccuracy: 'approx1h' }))).not.toContain('plausibility:time_midnight_placeholder');
    expect(codes(profile({ time: '00:01' }))).not.toContain('plausibility:time_midnight_placeholder');
  });
});

describe('健壯性與不影響既有輸出', () => {
  test('任意垃圾輸入不丟錯', () => {
    for (const v of [null, undefined, 42, 'x', [], {}, { birthplace: null }, { date: 5, birthplace: { lat: 'a' } }]) {
      expect(() => checkBirthProfilePlausibility(v)).not.toThrow();
    }
    expect(checkBirthProfilePlausibility(null)).toEqual([]);
  });
  test('每筆警告都有 code / message / hint，且 code 皆以 plausibility: 開頭（不與 flags 衝突）', () => {
    const w = checkBirthProfilePlausibility(profile({ date: '1700-01-01', timeAccuracy: 'unknown' }, { lat: 0, lng: 0 }), { today: TODAY });
    expect(w.length).toBeGreaterThan(0);
    for (const x of w) {
      expect(x.code.startsWith('plausibility:')).toBe(true);
      expect(x.message.length).toBeGreaterThan(0);
      expect(x.hint.length).toBeGreaterThan(0);
    }
  });
  test('不改動輸入，且 createTimeContext 輸出不含 plausibility 旗標', () => {
    const p = profile({}, { timezone: 'America/New_York' }) as unknown as BirthProfile;
    const snapshot = JSON.stringify(p);
    checkBirthProfilePlausibility(p, { today: TODAY });
    expect(JSON.stringify(p)).toBe(snapshot);
    const ctx = createTimeContext(p);
    expect(ctx.flags.some((f) => String(f.code).startsWith('plausibility:'))).toBe(false);
  });
});
