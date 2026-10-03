/**
 * 歷史時區／地方平時修正（time-fix-report.md）的案例測試：
 * Björk 1965、Oslo 1948、Ulm 1879／Einstein、Van Gogh 1853，以及現代資料不變的回歸測試。
 */
import { describe, expect, test } from 'bun:test';
import type { BirthProfile } from '../src/profile/index';
import { createTimeContext, type TimeContext } from '../src/time/index';
import modernGolden from './timeFix.modernGolden.json';

type Place = BirthProfile['birthplace'];
const place = (label: string, lat: number, lng: number, timezone: string): Place => ({ label, lat, lng, timezone });

function ctxOf(date: string, time: string | null, birthplace: Place): TimeContext {
  return createTimeContext({ date, time, timeAccuracy: time === null ? 'unknown' : 'exact', gender: 'male', birthplace });
}

const historical = (ctx: TimeContext) => {
  const f = ctx.flags.find((x) => x.code === 'historical_zone_uncertain');
  return f && f.code === 'historical_zone_uncertain' ? f : undefined;
};

/** 依 ADB 標示的 UTC 偏移換算的 UTC（ISO，到秒）。 */
function adbUtc(date: string, time: string, offsetSeconds: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return `${new Date(Date.UTC(y, m - 1, d, hh, mm) - offsetSeconds * 1000).toISOString().slice(0, 19)}Z`;
}

describe('Björk 1965（冰島 UTC−1，tz 主資料已併入 Africa/Abidjan）', () => {
  const REYKJAVIK = place('Reykjavík', 64.15, -21.85, 'Atlantic/Reykjavik');

  test('1965-11-21 08:10 → UTC−01:00，與 ADB 相同', () => {
    const ctx = ctxOf('1965-11-21', '08:10', REYKJAVIK);
    expect(ctx.local).toEqual({ iso: '1965-11-21T08:10:00-01:00', utcOffsetMinutes: -60, dst: false });
    expect(ctx.utc!.iso).toBe(adbUtc('1965-11-21', '08:10', -3600));
    expect(ctx.utc!.iso).toBe('1965-11-21T09:10:00Z');
  });

  test('標示 historical_zone_uncertain（backzone），不無聲猜測', () => {
    const f = historical(ctxOf('1965-11-21', '08:10', REYKJAVIK))!;
    expect(f.data.reasons).toEqual(['backzone']);
    expect(f.data.utcOffsetMinutes).toBe(-60);
    expect(f.data.basis).toBe('birth');
    expect(f.data.requiresConfirmation).toBe(true);
    expect(f.detail).toContain('backzone');
  });

  test('舊名 Iceland 與 Atlantic/Reykjavik 相同（不再指向 Abidjan）', () => {
    const a = ctxOf('1965-11-21', '08:10', REYKJAVIK);
    const b = ctxOf('1965-11-21', '08:10', { ...REYKJAVIK, timezone: 'Iceland' });
    expect(b.utc).toEqual(a.utc);
  });

  test('時間未知時以當地 12:00 標示', () => {
    const f = historical(ctxOf('1965-11-21', null, REYKJAVIK))!;
    expect(f.data.basis).toBe('local_noon');
    expect(f.data.reasons).toEqual(['backzone']);
  });

  test('1968-04-07 改為 UTC+0 之後：同年 12 月不是夏令（舊推算會誤判）', () => {
    const ctx = ctxOf('1968-12-01', '12:00', REYKJAVIK);
    expect(ctx.local).toEqual({ iso: '1968-12-01T12:00:00+00:00', utcOffsetMinutes: 0, dst: false });
    expect(ctx.flags.some((f) => f.code === 'dst_applied')).toBe(false);
  });

  test('1970 年後不標示（tz 主資料與 backzone 相同）', () => {
    expect(historical(ctxOf('1985-06-01', '12:00', REYKJAVIK))).toBeUndefined();
  });
});

describe('Oslo 1948（挪威 1948 無夏令；tz 主資料把 Europe/Oslo 連結到 Europe/Berlin）', () => {
  const OSLO = place('Oslo', 59.9167, 10.75, 'Europe/Oslo');

  test('Liv Aakvik 1948-06-23 19:15 → UTC+01:00、非夏令，與 ADB 相同', () => {
    const ctx = ctxOf('1948-06-23', '19:15', OSLO);
    expect(ctx.local).toEqual({ iso: '1948-06-23T19:15:00+01:00', utcOffsetMinutes: 60, dst: false });
    expect(ctx.utc!.iso).toBe(adbUtc('1948-06-23', '19:15', 3600));
    expect(historical(ctx)!.data.reasons).toEqual(['backzone']);
  });

  test('挪威 1959–1965 有夏令（backzone 規則），1960-07-01 為 UTC+2', () => {
    const ctx = ctxOf('1960-07-01', '12:00', OSLO);
    expect(ctx.local).toEqual({ iso: '1960-07-01T12:00:00+02:00', utcOffsetMinutes: 120, dst: true });
  });

  test('Arctic/Longyearbyen、Atlantic/Jan_Mayen 跟隨 Europe/Oslo', () => {
    const a = ctxOf('1948-06-23', '19:15', OSLO);
    for (const tz of ['Arctic/Longyearbyen', 'Atlantic/Jan_Mayen']) {
      expect(ctxOf('1948-06-23', '19:15', { ...OSLO, timezone: tz }).utc).toEqual(a.utc);
    }
  });
});

describe('Ulm 1879／Einstein（德國 1893 年前尚未實施標準時間）', () => {
  test('Einstein（ADB：Ulm 48n24 10e0，LMT +0:40）→ 與 ADB 完全相同', () => {
    const ctx = ctxOf('1879-03-14', '11:30', place('Ulm', 48.4, 10, 'Europe/Berlin'));
    expect(ctx.local).toEqual({ iso: '1879-03-14T11:30:00+00:40', utcOffsetMinutes: 40, dst: false });
    expect(ctx.utc!.iso).toBe(adbUtc('1879-03-14', '11:30', 2400));
    const f = historical(ctx)!;
    expect(f.data.reasons).toEqual(['pre_standard_time_lmt']);
    expect(f.data.tzdataOffsetMinutes).toBeCloseTo(3208 / 60, 10); // 柏林 +0:53:28
    expect(f.data.utcOffsetMinutes).toBe(40);
    expect(f.data.meanSolarOffsetMinutes).toBe(40);
  });

  test('Ulm 市區實際經度（9.9916°E）→ 出生地地方平時 +0:39:58，不是柏林的 +0:53:28', () => {
    const ctx = ctxOf('1879-03-14', '11:30', place('Ulm', 48.3984, 9.9916, 'Europe/Berlin'));
    expect(ctx.local!.iso).toBe('1879-03-14T11:30:00+00:39:58');
    expect(ctx.utc!.iso).toBe('1879-03-14T10:50:02Z');
    // 地方平時＝UTC＋經度×4 分：既然民用時間就是出生地平時，LMT 讀數等於牆鐘讀數。
    expect(ctx.solar!.lmtIso).toBe('1879-03-14T11:30:00');
  });

  test('1893-04-01 改用 CET 之後不再替換（法定標準時間優先於經度）', () => {
    const ctx = ctxOf('1900-06-01', '12:00', place('Ulm', 48.3984, 9.9916, 'Europe/Berlin'));
    expect(ctx.local).toEqual({ iso: '1900-06-01T12:00:00+01:00', utcOffsetMinutes: 60, dst: false });
    expect(historical(ctx)).toBeUndefined();
  });

  test('1893 年 LMT→CET 的轉換年：7 月不被誤判為夏令', () => {
    const ctx = ctxOf('1893-07-01', '12:00', place('Ulm', 48.3984, 9.9916, 'Europe/Berlin'));
    expect(ctx.local).toEqual({ iso: '1893-07-01T12:00:00+01:00', utcOffsetMinutes: 60, dst: false });
  });
});

describe('Van Gogh 1853（荷蘭；tz 主資料把 Europe/Amsterdam 連結到 Europe/Brussels）', () => {
  const ZUNDERT = place('Zundert', 51.466667, 4.666667, 'Europe/Amsterdam');

  test('改用荷蘭自己的阿姆斯特丹平時 +0:19:32（不再是布魯塞爾的 +0:17:30）', () => {
    const ctx = ctxOf('1853-03-30', '11:00', ZUNDERT);
    expect(ctx.local).toEqual({ iso: '1853-03-30T11:00:00+00:19:32', utcOffsetMinutes: 1172 / 60, dst: false });
    expect(ctx.utc!.iso).toBe('1853-03-30T10:40:28Z');
  });

  test('與 ADB（Zundert 地方平時 +0:18:40）差 52 秒，屬慣例差異，並標示不確定', () => {
    const ctx = ctxOf('1853-03-30', '11:00', ZUNDERT);
    const diffSec = (Date.parse(ctx.utc!.iso) - Date.parse(adbUtc('1853-03-30', '11:00', 1120))) / 1000;
    expect(diffSec).toBe(-52);
    const f = historical(ctx)!;
    expect(f.data.reasons).toEqual(['backzone']);
    expect(f.data.meanSolarOffsetMinutes).toBeCloseTo(18.6667, 3);
  });
});

describe('其他歷史情境', () => {
  test('台灣 1890（tz 為台北地方平時 +8:06）→ 改用台南經度的地方平時', () => {
    const ctx = ctxOf('1890-05-01', '12:00', place('Tainan', 22.9922, 120.1848, 'Asia/Taipei'));
    expect(ctx.local!.iso).toBe('1890-05-01T12:00:00+08:00:44');
    expect(historical(ctx)!.data.reasons).toEqual(['pre_standard_time_lmt']);
  });

  test('1970 年前，時區與出生地經度相差超過 90 分鐘 → longitude_offset_mismatch', () => {
    // 喀什（75.99°E，平太陽時 +5:04）卻選 Asia/Shanghai（+8）。
    const ctx = ctxOf('1960-05-01', '12:00', place('Kashgar', 39.47, 75.99, 'Asia/Shanghai'));
    expect(ctx.local!.utcOffsetMinutes).toBe(480);
    expect(historical(ctx)!.data.reasons).toEqual(['longitude_offset_mismatch']);
  });

  test('1970 年後即使經度矛盾也不標示（現代法定時間由 tz 主資料保證）', () => {
    expect(historical(ctxOf('1995-05-01', '12:00', place('Kashgar', 39.47, 75.99, 'Asia/Shanghai')))).toBeUndefined();
  });

  test('Kaliningrad 1989（3 月由 MSK 改為 EET）：8 月為 EEST 夏令，標準 +2', () => {
    const ctx = ctxOf('1989-08-13', '05:23', place('Kaliningrad', 54.71, 20.51, 'Europe/Kaliningrad'));
    expect(ctx.local).toEqual({ iso: '1989-08-13T05:23:00+03:00', utcOffsetMinutes: 180, dst: true });
    const dst = ctx.flags.find((f) => f.code === 'dst_applied');
    expect(dst && dst.code === 'dst_applied' && dst.data.standardOffsetMinutes).toBe(120);
  });
});

describe('現代資料回歸：結果與修正前完全相同', () => {
  type GoldenCase = { profile: BirthProfile; expected: Omit<TimeContext, 'profile'> };
  const cases = modernGolden as unknown as Record<string, GoldenCase>;

  test('至少涵蓋 1995 台南與 DST 缺口／重疊', () => {
    expect(Object.keys(cases)).toEqual(expect.arrayContaining(['tainan-1995', 'tainan-1995-unknown', 'taipei-1979-gap', 'newyork-2000-overlap']));
  });

  for (const [id, c] of Object.entries(cases)) {
    test(id, () => {
      const { profile: _profile, ...rest } = createTimeContext(c.profile);
      void _profile;
      expect(rest).toEqual(c.expected);
      expect(rest.flags.some((f) => f.code === 'historical_zone_uncertain')).toBe(false);
    });
  }

  test('1995-07-16 22:00 台南：關鍵欄位逐一確認', () => {
    const ctx = ctxOf('1995-07-16', '22:00', place('Tainan, Taiwan', 22.9922, 120.1848, 'Asia/Taipei'));
    expect(ctx.local).toEqual({ iso: '1995-07-16T22:00:00+08:00', utcOffsetMinutes: 480, dst: false });
    expect(ctx.utc!.iso).toBe('1995-07-16T14:00:00Z');
    expect(ctx.solar!.trueSolarIso).toBe('1995-07-16T21:54:44');
  });
});
