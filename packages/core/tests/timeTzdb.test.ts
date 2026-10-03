/**
 * 內建時區資料庫（`src/time/tzdb/`）：編譯器、編碼格式、資料完整性、跨環境決定性（D-014）。
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { createTimeContext } from '../src/time/index';
import { compileZone, parseTzSource, typeAt } from '../src/time/tzdb/compile';
import { TZDB_LINKS, TZDB_VERSION, TZDB_ZONES } from '../src/time/tzdb/data';
import { decodeZone, encodeZone, zoneTypeAtSec, type DecodedZone } from '../src/time/tzdb/format';
import { allZoneNames, canonicalZoneName, lookupZone } from '../src/time/tzdb/index';
import { resolveWallTime, zoneInfoAt } from '../src/time/zone';
import offsetSamples from './timeFix.offsetSamples.json';
import modernGolden from './timeFix.modernGolden.json';

const sec = (iso: string) => Date.parse(iso) / 1000;

// 合成的 zic 輸入：涵蓋 LMT 行、UNTIL 的 s／u 後綴、lastSun、Sun>=8、只有一年的規則與 max。
const SYNTHETIC = `
# 規則
Rule	Tst	1916	only	-	Apr	30	23:00	1:00	S
Rule	Tst	1916	only	-	Oct	1	1:00	0	-
Rule	Tst	1981	max	-	Mar	lastSun	1:00u	1:00	S
Rule	Tst	1996	max	-	Oct	lastSun	1:00u	0	-
Rule	Tst	1981	1995	-	Sep	lastSun	1:00u	0	-
Rule	Us	2007	max	-	Mar	Sun>=8	2:00	1:00	D
Rule	Us	2007	max	-	Nov	Sun>=1	2:00	0	S
Zone	Test/Euro	0:53:28	-	LMT	1893 Apr
			1:00	Tst	CE%sT	1945 May 24 2:00s
			1:00	-	CET	1980
			1:00	Tst	CE%sT
Zone	Test/Us	-4:56:02 -	LMT	1883 Nov 18 17:00u
			-5:00	Us	E%sT
Link	Test/Euro	Test/Alias
`;

describe('compile（zic 演算法的重寫）', () => {
  const src = parseTzSource(SYNTHETIC);
  const euro = compileZone('Test/Euro', src.zones.get('Test/Euro')!, src.rules, 2100);
  const us = compileZone('Test/Us', src.zones.get('Test/Us')!, src.rules, 2100);

  test('LMT 行：最早的型別為地方平時', () => {
    expect(euro.initial).toEqual({ utoff: 3208, stdoff: 3208, isDst: false, isLmt: true });
    expect(typeAt(euro, sec('1893-03-31T23:06:31Z')).isLmt).toBe(true);
    // 1893 Apr 1 00:00 當地 LMT = 1893-03-31T23:06:32Z。
    expect(typeAt(euro, sec('1893-03-31T23:06:32Z'))).toEqual({ utoff: 3600, stdoff: 3600, isDst: false, isLmt: false });
  });

  test('只有一年的規則（1916 夏令）', () => {
    expect(typeAt(euro, sec('1916-06-01T00:00:00Z')).utoff).toBe(7200);
    expect(typeAt(euro, sec('1916-10-30T00:00:00Z')).utoff).toBe(3600);
  });

  test('UNTIL 的 s 後綴與「無規則」行', () => {
    expect(typeAt(euro, sec('1950-07-01T00:00:00Z'))).toEqual({ utoff: 3600, stdoff: 3600, isDst: false, isLmt: false });
  });

  test('lastSun 1:00u；1995 前 9 月、1996 起 10 月結束', () => {
    expect(typeAt(euro, sec('1990-03-25T00:59:59Z')).utoff).toBe(3600);
    expect(typeAt(euro, sec('1990-03-25T01:00:00Z')).utoff).toBe(7200);
    expect(typeAt(euro, sec('1990-09-30T01:00:00Z')).utoff).toBe(3600);
    expect(typeAt(euro, sec('1996-10-27T00:59:59Z')).utoff).toBe(7200);
    expect(typeAt(euro, sec('1996-10-27T01:00:00Z')).utoff).toBe(3600);
  });

  test('Sun>=8 2:00（當地牆鐘）與 UNTIL 的 u 後綴', () => {
    expect(typeAt(us, sec('1883-11-18T16:59:59Z')).isLmt).toBe(true);
    expect(typeAt(us, sec('1883-11-18T17:00:00Z')).utoff).toBe(-18000);
    // 2024-03-10 02:00 EST = 07:00Z；2024-11-03 02:00 EDT = 06:00Z。
    expect(typeAt(us, sec('2024-03-10T06:59:59Z')).utoff).toBe(-18000);
    expect(typeAt(us, sec('2024-03-10T07:00:00Z')).utoff).toBe(-14400);
    expect(typeAt(us, sec('2024-11-03T05:59:59Z')).utoff).toBe(-14400);
    expect(typeAt(us, sec('2024-11-03T06:00:00Z')).utoff).toBe(-18000);
  });

  test('Link 解析', () => {
    expect(src.links.get('Test/Alias')).toEqual({ target: 'Test/Euro', hint: null });
  });
});

describe('format（編碼／解碼與尾段規則）', () => {
  test('解碼後的每一筆都與完整轉換列表相同，尾段規則推算到 2200 年', () => {
    const src = parseTzSource(SYNTHETIC);
    const compiled = compileZone('Test/Euro', src.zones.get('Test/Euro')!, src.rules, 2201);
    const start = sec('1997-03-30T01:00:00Z');
    const z: DecodedZone = {
      types: [compiled.initial],
      at: [],
      idx: [],
      tail: {
        start,
        stdoff: 3600,
        rules: src.rules.get('Tst')!.filter((r) => r.to === Infinity).map(({ month, day, atSec, atType, save, isDst }) => ({ month, day, atSec, atType, save, isDst })),
      },
      backzoneUntil: null,
    };
    for (const t of compiled.transitions.filter((t) => t.at < start)) {
      let i = z.types.findIndex((x) => JSON.stringify(x) === JSON.stringify(t.type));
      if (i < 0) i = z.types.push(t.type) - 1;
      z.at.push(t.at);
      z.idx.push(i);
    }
    const round = decodeZone(encodeZone(z));
    expect(round).toEqual(z);
    for (const t of compiled.transitions) {
      for (const p of [t.at - 1, t.at, t.at + 3600]) expect(zoneTypeAtSec(round, p)).toEqual(typeAt(compiled, p));
    }
  });
});

describe('內建資料（data.ts）', () => {
  test(`版本 ${TZDB_VERSION}，每個時區都能解碼，別名都指向存在的時區`, () => {
    expect(TZDB_VERSION).toMatch(/^\d{4}[a-z]$/);
    for (const v of Object.values(TZDB_ZONES)) expect(() => decodeZone(v)).not.toThrow();
    for (const target of Object.values(TZDB_LINKS)) expect(TZDB_ZONES[target]).toBeDefined();
    expect(Object.keys(TZDB_ZONES).length).toBeGreaterThan(400);
  });

  test('名稱大小寫不敏感；常見舊名可解析', () => {
    expect(canonicalZoneName('asia/taipei')).toBe('Asia/Taipei');
    expect(canonicalZoneName('Asia/Calcutta')).toBe('Asia/Kolkata');
    expect(canonicalZoneName('ROC')).toBe(canonicalZoneName('Asia/Taipei'));
    expect(canonicalZoneName('No/Such_Zone')).toBeNull();
  });

  test('執行環境 Intl 支援的時區名稱全都在內建資料內（不會退回 Intl）', () => {
    const supported = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
    expect(supported.filter((z) => canonicalZoneName(z) === null)).toEqual([]);
  });

  test('固定抽樣 400 筆（1800–2025）偏移不變', () => {
    expect(offsetSamples.tzdbVersion).toBe(TZDB_VERSION);
    const actual = (offsetSamples.samples as [string, string, number, number, number, number][]).map(([z, iso]) => {
      const r = lookupZone(z, Date.parse(iso))!;
      return [z, iso, r.utoff, r.isDst ? 1 : 0, r.isLmt ? 1 : 0, r.fromBackzone ? 1 : 0];
    });
    expect(actual).toEqual(offsetSamples.samples);
  });

  test('backzone 只影響 1970 年以前', () => {
    for (const name of allZoneNames()) {
      expect(lookupZone(name, Date.UTC(1970, 0, 1))!.fromBackzone).toBe(false);
    }
  });
});

describe('決定性（D-014）：不依賴執行環境的 Intl／ICU', () => {
  const RealDTF = Intl.DateTimeFormat;
  afterEach(() => {
    (Intl as { DateTimeFormat: typeof Intl.DateTimeFormat }).DateTimeFormat = RealDTF;
  });

  /**
   * 把 Intl.DateTimeFormat 換成「帶 timeZone 時一格式化就丟錯」的版本：證明換算完全不讀執行環境的
   * 時區資料。只建構不格式化（profile/validate.ts 用來檢查名稱是否存在）仍然允許。
   */
  function forbidIntlTimeZones(): void {
    const Fake = function (this: unknown, locales?: string | string[], opts?: Intl.DateTimeFormatOptions) {
      const real = new RealDTF(locales, opts);
      if (!opts?.timeZone) return real;
      const deny = () => {
        throw new Error(`不應讀取執行環境時區資料：${opts.timeZone}`);
      };
      return { format: deny, formatToParts: deny, formatRange: deny, formatRangeToParts: deny, resolvedOptions: () => real.resolvedOptions() };
    } as unknown as typeof Intl.DateTimeFormat;
    (Intl as { DateTimeFormat: typeof Intl.DateTimeFormat }).DateTimeFormat = Fake;
  }

  test('禁用 Intl 時區後，換算結果與現代 golden 相同', () => {
    forbidIntlTimeZones();
    type G = { profile: Parameters<typeof createTimeContext>[0]; expected: unknown };
    for (const c of Object.values(modernGolden as unknown as Record<string, G>)) {
      expect(zoneInfoAt(c.profile.birthplace.timezone, 0).source).toBe('tzdb');
      const { profile: _p, ...rest } = createTimeContext(c.profile);
      void _p;
      expect(rest).toEqual(c.expected as typeof rest);
    }
    const r = resolveWallTime('Asia/Taipei', Date.UTC(1995, 6, 16, 22));
    expect(r).toEqual({ kind: 'normal', utcMs: Date.UTC(1995, 6, 16, 14), offsetMinutes: 480 });
  });

  test('跨年份隨機抽樣（1800–2199，600 筆）：結果穩定、與 Intl 無關、且內部一致', () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const zones = allZoneNames().filter((z) => !/^Etc\/GMT[+-]/.test(z) && z !== 'Factory');
    const profiles = Array.from({ length: 600 }, () => {
      const pad = (n: number) => String(n).padStart(2, '0');
      const tz = zones[Math.floor(rnd() * zones.length)];
      const date = `${1800 + Math.floor(rnd() * 400)}-${pad(1 + Math.floor(rnd() * 12))}-${pad(1 + Math.floor(rnd() * 28))}`;
      const time = `${pad(Math.floor(rnd() * 24))}:${pad(Math.floor(rnd() * 60))}`;
      const lat = Math.round((rnd() * 120 - 60) * 1e4) / 1e4;
      const lng = Math.round((rnd() * 360 - 180) * 1e4) / 1e4;
      return { date, time, timeAccuracy: 'exact' as const, gender: 'male' as const, birthplace: { label: 'x', lat, lng, timezone: tz } };
    });
    // 有些名稱目前的執行環境 Intl 不認得（profile 驗證會拒絕），只取驗證通過者。
    const valid = profiles.filter((p) => {
      try {
        createTimeContext(p);
        return true;
      } catch {
        return false;
      }
    });
    expect(valid.length).toBeGreaterThan(550);
    const first = valid.map((p) => JSON.stringify(createTimeContext(p)));
    forbidIntlTimeZones();
    const again = valid.map((p) => JSON.stringify(createTimeContext(p)));
    (Intl as { DateTimeFormat: typeof Intl.DateTimeFormat }).DateTimeFormat = RealDTF;
    expect(again).toEqual(first);

    for (let i = 0; i < valid.length; i++) {
      const ctx = JSON.parse(first[i]);
      // 內部一致：local = utc + offset；歷史旗標只出現在 1970 年前。
      const localMs = Date.parse(`${ctx.local.iso.slice(0, 19)}Z`);
      expect(Math.round((localMs - Date.parse(ctx.utc.iso)) / 1000)).toBe(Math.round(ctx.local.utcOffsetMinutes * 60));
      const hist = ctx.flags.find((f: { code: string }) => f.code === 'historical_zone_uncertain');
      if (Date.parse(ctx.utc.iso) >= Date.UTC(1970, 0, 1)) expect(hist).toBeUndefined();
    }
  });
});
