/**
 * 吠陀占星（Jyotish）外部對照驗證（ROADMAPS M5-01／M5-02、D-039）。
 *
 * 三層：
 * 1. 計算層：同一個 UT 瞬間（由 ADB 標示的 UTC 偏移獨立換算），我們的計算器
 *    vs. 獨立對照演算法（astronomy-engine + 文獻公式，見 jyotish-validation.reference.ts）。
 *    離散欄位（星座、星宿、pada、D9、D10、宮位、逆行、大運／小運主星）必須完全一致；
 *    若對照值距離邊界小於該欄位的度數容差，該欄位記為「無法判定」而不是硬比。
 * 2. 時區層：產品實際走的 IANA 時區 → UT，與 ADB 的 UTC 偏移比較；不一致者必須列在
 *    TIME_LAYER_DIVERGENCES（含原因），不得默默放過。
 * 3. 第三方抽查：NASA/JPL Horizons API、Astrodienst swetest.cgi、ADB 頁面公開的
 *    太陽／月亮／上升（見 fixtures/validation/jyotish-thirdparty.json、jyotish-cases.json）。
 *
 * 容差的量測依據寫在 fixtures/validation/jyotish-validation-report.md。
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import { ascendantAndHouses, initEphemeris, planetPositions } from '../src/calculators/astro/index';
import { buildJyotishChart, isoToJd, type JyotishChart } from '../src/calculators/jyotish/index';
import { createTimeContext } from '../src/time/index';
import type { TimeContext } from '../src/time/types';
import casesJson from './fixtures/validation/jyotish-cases.json';
import thirdParty from './fixtures/validation/jyotish-thirdparty.json';
import * as R from './jyotish-validation.reference';

type Case = (typeof casesJson.cases)[number];

/**
 * 度數容差（角秒），對照值 = astronomy-engine + Lahiri 文獻公式。
 * 先量測再訂：30 個 AA 案例最大差為 歲差 0.37″、太陽 0.94″、月亮 4.7″、水星 5.6″、
 * 金星 4.4″、火星 5.0″、木星 6.5″、土星 13.4″、平均交點 0.16″、上升 0.23″；
 * 1800–2030 年 3000 個隨機時地（|緯度| ≤ 66°）最大差為 太陽 2.0″、月亮 8.2″、
 * 水星 12.3″、金星 19.7″、火星 13.8″、木星 11.1″、土星 13.6″、交點 0.16″、上升 1.3″。
 * 容差取隨機樣本最大值再加約 25% 餘裕。差異來源在對照端：astronomy-engine 的
 * 截斷理論對 JPL Horizons 最大 6.3″（本檔第三方抽查），我們這端對 JPL 最大 1.0″。
 * 2030 年以後兩邊的 ΔT 外推模型分歧（2100 年月亮差約 1′），不在此容差的適用範圍。
 */
const TOL_ARCSEC = {
  ayanamsa: 1,
  sun: 3,
  moon: 12,
  mercury: 15,
  venus: 25,
  mars: 18,
  jupiter: 15,
  saturn: 18,
  rahu: 0.5,
  ketu: 0.5,
  lagna: 2,
} as const;

/** 大運日期容差（日）：月亮 12″ ≈ 星宿的 2.5e-4，乘上最長 20 年 ≈ 1.8 日。量測最大 0.46 日。 */
const TOL_DASHA_DAYS = 2;

/**
 * 時區層的已知分歧：產品依 IANA 時區換算的 UT 與 ADB 的 UTC 偏移不同。
 * 值為「產品 UT − ADB UT」秒數（量測值，±1 秒內需維持不變，變了就要重新檢討）。
 * 這些都不在 jyotish 計算器內，屬時間標準化層（time/**）與 tzdata 的範圍。
 */
const TIME_LAYER_DIVERGENCES: Record<string, { seconds: number; e2eFields: string[]; reason: string }> = {
  'van-gogh': {
    seconds: -52,
    e2eFields: [],
    reason:
      '部分修正（time-fix-report.md）：舊值 +70 秒來自執行環境 tzdata 把 Europe/Amsterdam 連結到 Europe/Brussels，用了布魯塞爾的地方平時（+0:17:30）。' +
      '現在改用內建 tz 的 backzone：荷蘭自己的「阿姆斯特丹平時」（+0:19:32，1835 年起通行、1909 年入法），並標 historical_zone_uncertain（backzone）。' +
      'ADB 用出生地 Zundert 的地方平時（+0:18:40），剩下 52 秒是「1909 年前荷蘭鄉間用哪個平時」的慣例差異；本例未影響任何離散欄位。',
  },
  einstein: {
    seconds: 0,
    e2eFields: [],
    reason:
      '已修正（time-fix-report.md）：舊值 −808 秒是因為 tz 在 1893 年前的 Europe/Berlin 只有柏林地方平時（+0:53:28）。' +
      '現在 tz 標為 LMT（尚未實施標準時間）的期間改用出生地經度的地方平時（Ulm +0:40:00），與 ADB 相同，並標 historical_zone_uncertain（pre_standard_time_lmt）。',
  },
  bjork: {
    seconds: 0,
    e2eFields: [],
    reason:
      '已修正（time-fix-report.md）：舊值 −3600 秒是因為執行環境的 tzdata（2022b 起）把 Atlantic/Reykjavik 併為 Africa/Abidjan 的連結，1968 年前的 UTC−1 歷史遺失。' +
      '現在改用內建 tz（含 backzone），1965 年為 UTC−1，與 ADB 相同，並標 historical_zone_uncertain（backzone）。月亮 pada、上升星宿／pada、當前大運／小運都恢復與 ADB 偏移一致。',
  },
};

const GRAHAS = R.REF_GRAHAS;
const asOfJd = isoToJd(`${casesJson.asOf}T00:00:00Z`);

interface Prepared {
  c: Case;
  refJd: number;
  ctx: TimeContext;
  /** 以 ADB 偏移換算的 UT 餵給我們的計算器。 */
  ours: JyotishChart;
  /** 產品實際路徑：IANA 時區。 */
  e2e: JyotishChart;
  ref: R.RefChart;
}

function prepare(c: Case): Prepared {
  const refJd = R.msToJd(R.utcMsFromLocal(c.date, c.time, c.utcOffset));
  const ctx = createTimeContext({
    date: c.date,
    time: c.time,
    timeAccuracy: 'exact',
    gender: 'male',
    birthplace: { label: c.name, lat: c.lat, lng: c.lng, timezone: c.ianaZone },
  });
  const atRef: TimeContext = { ...ctx, jd: { ...ctx.jd!, ut: refJd } };
  return {
    c,
    refJd,
    ctx,
    ours: buildJyotishChart(atRef, { asOf: casesJson.asOf }),
    e2e: buildJyotishChart(ctx, { asOf: casesJson.asOf }),
    ref: R.refChart(refJd, c.lat, c.lng),
  };
}

/** 經度 lon 距 span 邊界的最小距離（角秒）。 */
function marginArcsec(lon: number, span: number): number {
  const r = R.mod360(lon) % span;
  return Math.min(r, span - r) * 3600;
}

/** 欄位 → 對應的邊界間距（度）。 */
const FIELD_SPAN = { sign: 30, nakshatra: 40 / 3, pada: 10 / 3, d9: 10 / 3, d10: 3 } as const;
type Field = keyof typeof FIELD_SPAN;
const FIELDS = Object.keys(FIELD_SPAN) as Field[];

let prepared: Prepared[] = [];
const undecidable: string[] = [];

beforeAll(async () => {
  await initEphemeris();
  prepared = casesJson.cases.map(prepare);
});

describe('案例組成', () => {
  test('≥ 24 個 AA 公眾人物案例，覆蓋要求的條件', () => {
    const cs = casesJson.cases;
    expect(cs.length).toBeGreaterThanOrEqual(24);
    expect(new Set(cs.map((c) => c.id)).size).toBe(cs.length);
    for (const c of cs) {
      expect(c.rodden).toBe('AA');
      expect(c.adbUrl).toStartWith('https://www.astro.com/astro-databank/');
    }
    const n = (pred: (c: Case) => boolean) => cs.filter(pred).length;
    expect(n((c) => c.lat < 0)).toBeGreaterThanOrEqual(2);
    expect(n((c) => c.lat > 0)).toBeGreaterThanOrEqual(2);
    expect(n((c) => Math.abs(c.lat) >= 54)).toBeGreaterThanOrEqual(2);
    expect(n((c) => c.date < '1900')).toBeGreaterThanOrEqual(2);
    expect(n((c) => c.date >= '2000')).toBeGreaterThanOrEqual(2);
    expect(n((c) => c.adbTimezone.includes('daylight saving'))).toBeGreaterThanOrEqual(2);
    expect(new Set(cs.map((c) => c.utcOffset)).size).toBeGreaterThanOrEqual(8);
  });
});

describe('計算層：我們的計算器 vs. 獨立對照（同一 UT 瞬間）', () => {
  test('Lahiri 歲差值', () => {
    for (const p of prepared) {
      expect(Math.abs(p.ours.ayanamsaDegrees! - p.ref.ayanamsa) * 3600).toBeLessThan(TOL_ARCSEC.ayanamsa);
    }
  });

  test('行星、交點、上升的恆星黃經在容差內', () => {
    for (const p of prepared) {
      for (const g of GRAHAS) {
        const o = p.ours.planets.find((x) => x.graha === g)!;
        const d = Math.abs(R.angleDiff(o.longitude, p.ref.grahas[g].longitude)) * 3600;
        if (d >= TOL_ARCSEC[g]) throw new Error(`${p.c.id} ${g}: ${d.toFixed(2)}″ ≥ ${TOL_ARCSEC[g]}″`);
      }
      const dl = Math.abs(R.angleDiff(p.ours.lagna!.longitude, p.ref.lagna.longitude)) * 3600;
      expect(dl).toBeLessThan(TOL_ARCSEC.lagna);
    }
  });

  test('Ketu = Rahu + 180°（平均交點）', () => {
    for (const p of prepared) {
      const r = p.ours.planets.find((x) => x.graha === 'rahu')!.longitude;
      const k = p.ours.planets.find((x) => x.graha === 'ketu')!.longitude;
      expect(R.mod360(k - r)).toBeCloseTo(180, 9);
      expect(p.ours.settings.node).toBe('mean');
    }
  });

  test('離散欄位完全一致：星座、星宿、pada、D9、D10、宮位、逆行', () => {
    const mismatches: string[] = [];
    for (const p of prepared) {
      const D = p.ours.divisionalCharts!;
      const points: { key: string; tol: number; refLon: number; ref: R.RefPoint; ours: Record<Field, number> }[] = [
        ...GRAHAS.map((g) => {
          const o = p.ours.planets.find((x) => x.graha === g)!;
          return {
            key: g,
            tol: TOL_ARCSEC[g],
            refLon: p.ref.grahas[g].longitude,
            ref: p.ref.grahas[g],
            ours: { sign: o.sign, nakshatra: o.nakshatra, pada: o.pada, d9: D.D9.grahas[g], d10: D.D10.grahas[g] },
          };
        }),
        {
          key: 'lagna',
          tol: TOL_ARCSEC.lagna,
          refLon: p.ref.lagna.longitude,
          ref: p.ref.lagna,
          ours: {
            sign: p.ours.lagna!.sign,
            nakshatra: p.ours.lagna!.nakshatra,
            pada: p.ours.lagna!.pada,
            d9: D.D9.lagna!,
            d10: D.D10.lagna!,
          },
        },
      ];
      for (const pt of points) {
        for (const f of FIELDS) {
          if (marginArcsec(pt.refLon, FIELD_SPAN[f]) <= pt.tol) {
            undecidable.push(`${p.c.id}:${pt.key}.${f}`);
            continue;
          }
          if (pt.ours[f] !== pt.ref[f]) mismatches.push(`${p.c.id}:${pt.key}.${f} ours=${pt.ours[f]} ref=${pt.ref[f]}`);
        }
      }
      for (const g of GRAHAS) {
        const o = p.ours.planets.find((x) => x.graha === g)!;
        const r = p.ref.grahas[g];
        // 宮位只在本宮與上升星座都可判定時比較（兩者皆已在上面逐一比過）。
        if (o.house !== r.house && !undecidable.some((u) => u === `${p.c.id}:${g}.sign` || u === `${p.c.id}:lagna.sign`)) {
          mismatches.push(`${p.c.id}:${g}.house ours=${o.house} ref=${r.house}`);
        }
        // 對照速度取 ±0.5 日中央差分；astronomy-engine 的誤差是平滑的系統誤差，一日內的
        // 變化遠小於 1e-4°（0.36″），因此只有 |速度| < 1e-4°/日（實質停滯）才無法判定。
        if (Math.abs(p.ref.tropical[g].speed) < 1e-4) {
          undecidable.push(`${p.c.id}:${g}.retrograde`);
        } else if (o.retrograde !== r.retrograde) {
          mismatches.push(`${p.c.id}:${g}.retrograde ours=${o.retrograde} ref=${r.retrograde}`);
        }
      }
    }
    expect(mismatches).toEqual([]);

    // 距邊界小於容差的欄位，改由 JPL Horizons（DE441）判定：
    // 恆星黃經 = JPL 回歸視黃經 − 對照 Lahiri 值；JPL 與對照歲差合計誤差 < 1″，
    // 所以要求 JPL 值距邊界 > 1″ 才算判定成功。
    const resolved = new Set<string>();
    for (const it of thirdParty.horizonsBoundary.items) {
      const p = prepared.find((x) => x.c.id === it.caseId)!;
      expect(Math.abs(p.refJd - it.jdUt) * 86400).toBeLessThan(0.01);
      const sid = R.mod360(it.tropical - p.ref.ayanamsa);
      const rp = R.refPoint(sid);
      const g = it.graha as R.RefGraha;
      const o = p.ours.planets.find((x) => x.graha === g)!;
      const oursF: Record<Field, number> = {
        sign: o.sign,
        nakshatra: o.nakshatra,
        pada: o.pada,
        d9: p.ours.divisionalCharts!.D9.grahas[g],
        d10: p.ours.divisionalCharts!.D10.grahas[g],
      };
      for (const f of it.fields as Field[]) {
        expect(marginArcsec(sid, FIELD_SPAN[f])).toBeGreaterThan(1);
        expect(oursF[f]).toBe(rp[f]);
        resolved.add(`${it.caseId}:${g}.${f}`);
      }
    }
    // 30 案例 × 10 點 × 5 欄位 + 逆行中，只有下列欄位落在容差內；全部已由第三方判定
    // （Senna 土星 D10 距邊界 24″，已在容差外，但仍保留 JPL 判定作為額外檢查）。
    expect([...undecidable].sort()).toEqual(['princess-charlotte:moon.d9', 'princess-charlotte:moon.pada']);
    expect(undecidable.filter((u) => !resolved.has(u))).toEqual([]);
  });

  test('Vimshottari：起運主星、九個大運順序與起點、出生時剩餘年數', () => {
    for (const p of prepared) {
      const v = p.ours.dasha!;
      expect(v.moonNakshatraLord).toBe(p.ref.dasha.lord);
      expect(v.moonNakshatra).toBe(p.ref.dasha.moonNakshatra);
      expect(Math.abs(v.balanceYears - p.ref.dasha.balanceYears) * 365.25).toBeLessThan(TOL_DASHA_DAYS);
      expect(v.mahadashas.map((m) => m.lord)).toEqual(p.ref.dasha.mahas.slice(0, 9).map((m) => m.lord));
      v.mahadashas.forEach((m, i) => {
        expect(Math.abs(m.startJd - p.ref.dasha.mahas[i].startJd)).toBeLessThan(TOL_DASHA_DAYS);
        m.antardashas.forEach((a, k) => {
          expect(a.lord).toBe(p.ref.dasha.mahas[i].antars[k].lord);
          expect(Math.abs(a.startJd - p.ref.dasha.mahas[i].antars[k].startJd)).toBeLessThan(TOL_DASHA_DAYS);
        });
      });
    }
  });

  test(`asOf ${casesJson.asOf} 的大運／小運`, () => {
    for (const p of prepared) {
      const cur = p.ours.current.dasha!;
      const r = R.refDashaAt(p.ref.dasha, asOfJd)!;
      // asOf 距小運交接 < 容差時無法判定（目前無此情形）。
      if (Math.min(Math.abs(asOfJd - r.antar.startJd), Math.abs(asOfJd - r.antar.endJd)) < TOL_DASHA_DAYS) {
        undecidable.push(`${p.c.id}:currentDasha`);
        continue;
      }
      expect(cur.maha.lord).toBe(r.maha.lord);
      expect(cur.antar.lord).toBe(r.antar.lord);
      expect(Math.abs(cur.antar.startJd - r.antar.startJd)).toBeLessThan(TOL_DASHA_DAYS);
    }
  });
});

describe('計算層：隨機時地（1800–2030 年、|緯度| ≤ 66°）', () => {
  test('600 張隨機盤：度數在容差內，可判定的離散欄位完全一致', () => {
    let seed = 20261003;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const base = createTimeContext({
      date: '2000-01-01',
      time: '12:00',
      timeAccuracy: 'exact',
      gender: 'male',
      birthplace: { label: 'random', lat: 0, lng: 0, timezone: 'UTC' },
    });
    const JD_1800 = 2378496.5;
    const JD_2030 = 2462502.5;
    const bad: string[] = [];
    let decided = 0;
    for (let i = 0; i < 600; i++) {
      const jd = JD_1800 + rnd() * (JD_2030 - JD_1800);
      const lat = -66 + rnd() * 132;
      const lng = -180 + rnd() * 360;
      const ctx: TimeContext = {
        ...base,
        jd: { ...base.jd!, ut: jd },
        profile: { ...base.profile, birthplace: { ...base.profile.birthplace, lat, lng } },
      };
      const o = buildJyotishChart(ctx, { asOf: casesJson.asOf });
      const r = R.refChart(jd, lat, lng);
      const D = o.divisionalCharts!;
      const pts = [
        ...GRAHAS.map((g) => {
          const p = o.planets.find((x) => x.graha === g)!;
          return { key: g, tol: TOL_ARCSEC[g], lon: p.longitude, ref: r.grahas[g], f: { sign: p.sign, nakshatra: p.nakshatra, pada: p.pada, d9: D.D9.grahas[g], d10: D.D10.grahas[g] } };
        }),
        { key: 'lagna', tol: TOL_ARCSEC.lagna, lon: o.lagna!.longitude, ref: r.lagna, f: { sign: o.lagna!.sign, nakshatra: o.lagna!.nakshatra, pada: o.lagna!.pada, d9: D.D9.lagna!, d10: D.D10.lagna! } },
      ];
      for (const pt of pts) {
        const d = Math.abs(R.angleDiff(pt.lon, pt.ref.longitude)) * 3600;
        if (d >= pt.tol) bad.push(`jd=${jd} ${pt.key} Δ=${d.toFixed(2)}″`);
        for (const f of FIELDS) {
          if (marginArcsec(pt.ref.longitude, FIELD_SPAN[f]) <= pt.tol) continue;
          decided++;
          if (pt.f[f] !== pt.ref[f]) bad.push(`jd=${jd} ${pt.key}.${f} ours=${pt.f[f]} ref=${pt.ref[f]}`);
        }
      }
      if (o.dasha!.moonNakshatraLord !== r.dasha.lord && marginArcsec(r.grahas.moon.longitude, 40 / 3) > TOL_ARCSEC.moon) {
        bad.push(`jd=${jd} dasha lord`);
      }
    }
    expect(bad).toEqual([]);
    expect(decided).toBeGreaterThan(29_000);
  });
});

describe('時區層：IANA 時區 vs. ADB 標示的 UTC 偏移', () => {
  test('除已知分歧外，UT 差 < 1 秒', () => {
    for (const p of prepared) {
      const diff = (p.ctx.jd!.ut - p.refJd) * 86400;
      const known = TIME_LAYER_DIVERGENCES[p.c.id];
      if (known) expect(Math.abs(diff - known.seconds)).toBeLessThan(1);
      else if (Math.abs(diff) >= 1) throw new Error(`${p.c.id}: IANA ${p.c.ianaZone} 與 ADB 偏移差 ${diff.toFixed(0)} 秒，未列入已知分歧`);
    }
  });

  test('產品端到端（IANA）離散欄位：只有已知分歧案例、且只有已記錄的欄位不同', () => {
    for (const p of prepared) {
      const diffs: string[] = [];
      for (const g of GRAHAS) {
        const a = p.e2e.planets.find((x) => x.graha === g)!;
        const b = p.ours.planets.find((x) => x.graha === g)!;
        for (const f of ['sign', 'nakshatra', 'pada'] as const) if (a[f] !== b[f]) diffs.push(`${g}.${f}`);
      }
      for (const f of ['sign', 'nakshatra', 'pada'] as const) if (p.e2e.lagna![f] !== p.ours.lagna![f]) diffs.push(`lagna.${f}`);
      const [ca, cb] = [p.e2e.current.dasha!, p.ours.current.dasha!];
      if (ca.maha.lord !== cb.maha.lord || ca.antar.lord !== cb.antar.lord) diffs.push('current.dasha');
      expect([p.c.id, ...diffs]).toEqual([p.c.id, ...(TIME_LAYER_DIVERGENCES[p.c.id]?.e2eFields ?? [])]);
    }
  });
});

describe('第三方抽查', () => {
  const byId = (id: string) => prepared.find((p) => p.c.id === id)!;
  const BODIES = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'] as const;

  test('NASA/JPL Horizons（DE441）回歸視黃經：我們 ≤ 2″、對照演算法 ≤ 10″', () => {
    const entries = Object.entries(thirdParty.horizons);
    expect(entries.length).toBeGreaterThanOrEqual(5);
    for (const [id, h] of entries) {
      const p = byId(id);
      expect(Math.abs(p.refJd - h.jdUt) * 86400).toBeLessThan(0.01);
      const trop = planetPositions(p.refJd);
      for (const b of BODIES) {
        const ours = trop.find((x) => x.body === b)!.longitude;
        expect(Math.abs(R.angleDiff(ours, h[b])) * 3600).toBeLessThan(2);
        expect(Math.abs(R.angleDiff(p.ref.tropical[b].longitude, h[b])) * 3600).toBeLessThan(10);
      }
    }
  });

  test('Astrodienst swetest（Lahiri 恆星黃道、平均交點、整宮上升）', () => {
    const entries = Object.entries(thirdParty.swetest);
    expect(entries.length).toBeGreaterThanOrEqual(5);
    for (const [id, s] of entries) {
      const p = byId(id);
      expect(Math.abs(R.jdToMs(p.refJd) - Date.parse(s.ut))).toBeLessThan(10);
      expect(Math.abs(p.ours.ayanamsaDegrees! - s.ayanamsa) * 3600).toBeLessThan(0.01);
      for (const b of BODIES) {
        const o = p.ours.planets.find((x) => x.graha === b)!;
        expect(Math.abs(R.angleDiff(o.longitude, s[b])) * 3600).toBeLessThan(2);
        const sp = R.refPoint(s[b]);
        expect([o.sign, o.nakshatra, o.pada]).toEqual([sp.sign, sp.nakshatra, sp.pada]);
      }
      const rahu = p.ours.planets.find((x) => x.graha === 'rahu')!;
      expect(Math.abs(R.angleDiff(rahu.longitude, s.meanNode)) * 3600).toBeLessThan(0.1);
      expect(Math.abs(R.angleDiff(p.ours.lagna!.longitude, s.ascendant)) * 3600).toBeLessThan(0.1);
      expect(p.ours.lagna!.sign).toBe(R.refPoint(s.ascendant).sign);
    }
  });

  test('ADB 頁面公開的回歸太陽／月亮／上升（四捨五入到角分）≤ 0.6′', () => {
    for (const p of prepared) {
      const trop = planetPositions(p.refJd);
      const asc = ascendantAndHouses(p.refJd, p.c.lat, p.c.lng, 'whole_sign').ascendant;
      const pairs: [number, string][] = [
        [trop.find((x) => x.body === 'sun')!.longitude, p.c.adbTropical.sun],
        [trop.find((x) => x.body === 'moon')!.longitude, p.c.adbTropical.moon],
        [asc, p.c.adbTropical.asc],
      ];
      for (const [ours, adb] of pairs) {
        const d = Math.abs(R.angleDiff(ours, R.parseAdbPosition(adb))) * 60;
        if (d > 0.6) throw new Error(`${p.c.id}: ${adb} vs ${ours.toFixed(4)} (${d.toFixed(2)}′)`);
      }
    }
  });
});

describe('對照演算法自我檢查（避免兩邊一起錯）', () => {
  test('Lahiri 定義點：1956-03-21 的真歲差 = 23°15′00.658″', () => {
    // t₀ 以 TT 定義；UT = TT − ΔT（1956 年約 31.6 秒），對歲差影響 < 0.001″。
    const t0Ut = R.LAHIRI_T0_JD_TT - 31.6 / 86400;
    expect(Math.abs(R.lahiriTrue(t0Ut) - R.LAHIRI_T0_TRUE_DEG) * 3600).toBeLessThan(0.01);
  });

  test('D9 依宮位性質的規則與連續數法一致；D10 奇偶規則', () => {
    for (let lon = 0.05; lon < 360; lon += 0.37) {
      expect(R.refPoint(lon).d9).toBe((Math.floor(lon / (10 / 3)) % 12) + 1);
    }
    expect(R.refPoint(30.1).d10).toBe(10); // 金牛（偶）自第 9 宮摩羯起
    expect(R.refPoint(60.1).d10).toBe(3); // 雙子（奇）自本宮起
  });

  test('ADB 解析', () => {
    expect(R.parseAdbPosition("Pis 23°30'")).toBeCloseTo(353.5, 9);
    expect(R.parseAdbPosition("Ari 00°37'")).toBeCloseTo(37 / 60, 9);
  });
});
