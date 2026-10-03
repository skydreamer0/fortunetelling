/**
 * @fileoverview 吠陀占星（Jyotish）驗證用的「獨立對照演算法」（M5-01）。
 *
 * 刻意不 import `src/calculators/**` 任何內部模組：星曆改用 astronomy-engine
 * （純 JS 實作，行星為 VSOP87 截斷、月亮為 Brown／ILE 理論，與我們使用的
 * Swiss Ephemeris Moshier 模式是不同程式碼與不同理論），歲差、星宿、分盤、
 * 大運全部依公開文獻重寫一份。
 *
 * 公式與出處：
 * - 視黃經：astronomy-engine `GeoVector(body, t, aberration=true)`（含光行時與
 *   光行差）→ `Ecliptic()`（轉到真黃道、真春分點，含歲差與章動）；太陽用
 *   `SunPosition()`、月亮用 `EclipticGeoMoon()`（同為真黃道座標）。
 * - 章動 Δψ、真黃赤交角 ε：astronomy-engine `e_tilt()`（IAU 2000B 截斷）。
 * - 平均交點（Rahu）：Meeus《Astronomical Algorithms》2nd ed. 式 47.7
 *   Ω = 125.0445479 − 1934.1362891 T + 0.0020754 T² + T³/467441 − T⁴/60616000
 *   （T 為 TT 儒略世紀數，相對平春分點），再加 Δψ 轉到真春分點。Ketu = Rahu + 180°。
 * - 上升點（Lagna，東方地平線與黃道的交點）：由 Meeus 第 13 章赤道／黃道座標
 *   轉換推得的標準式 λ_asc = atan2(cos θ, −(sin θ cos ε + tan φ sin ε))，
 *   θ = 地方視恆星時（astronomy-engine `SiderealTime()` 的 GAST + 東經），
 *   ε = 真黃赤交角，φ = 地理緯度。
 * - Lahiri（Chitrapaksha）歲差：印度曆法改革委員會（Calendar Reform Committee,
 *   1955 報告）定義 1956-03-21 00:00 ET 的歲差值為 23°15′00.658″（含章動的「真」值）。
 *   平均值 A_mean(t) = (23°15′00.658″ − Δψ(t₀)) + [p_A(t) − p_A(t₀)]，
 *   p_A 為黃經總歲差，採 IAU 2006（Capitaine et al. 2003；IERS Conventions 2010
 *   式 5.40）：p_A = 5028.796195 T + 1.1054348 T² + 0.00007964 T³
 *   − 0.000023857 T⁴ − 0.0000000383 T⁵（角秒）。
 *   真值 A_true(t) = A_mean(t) + Δψ(t)；恆星黃經 = 視回歸黃經 − A_true。
 *   （Swiss Ephemeris 說明文件 §2.7.2 也以同一 1956 定義值為基準，但改用其歲差
 *   矩陣投影計算；兩者差異屬「歲差模型實作」層級，見驗證報告。）
 * - 星宿：27 宿各 13°20′、每宿 4 個 pada（3°20′），自恆星白羊 0° 起算。
 * - Vimshottari 大運：主星序 Ketu 7、Venus 20、Sun 6、Moon 10、Mars 7、Rahu 18、
 *   Jupiter 16、Saturn 19、Mercury 17（共 120 年）；出生大運主星 = 月亮星宿主星，
 *   已走比例 = 月亮在該宿已走比例；小運自大運主星起依同序，長度 = 大運 × 年數 / 120；
 *   年長 365.25 日。
 * - D9（Navamsa）：BPHS 第 6 章原文規則——動宮自本宮、固定宮自第 9 宮、
 *   變動宮自第 5 宮起數 9 分。D10（Dasamsa）：奇數宮自本宮、偶數宮自第 9 宮起數。
 *
 * @module tests/jyotish-validation.reference
 */

import {
  Body,
  Ecliptic,
  EclipticGeoMoon,
  GeoVector,
  MakeTime,
  SiderealTime,
  SunPosition,
  e_tilt,
  type AstroTime,
} from 'astronomy-engine';

export const REF_GRAHAS = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn', 'rahu', 'ketu'] as const;
export type RefGraha = (typeof REF_GRAHAS)[number];

const UNIX_EPOCH_JD = 2440587.5;
const DAY_MS = 86_400_000;

export function mod360(x: number): number {
  const r = x % 360;
  return r < 0 ? r + 360 : r;
}

/** 兩個角度的有號差（a − b），範圍 (−180, 180]。 */
export function angleDiff(a: number, b: number): number {
  let d = mod360(a - b);
  if (d > 180) d -= 360;
  return d;
}

// ─── 時間 ────────────────────────────────────────────────────────────────────

/** '+05:21:10' → 分鐘（含秒的小數）。 */
export function parseOffsetMinutes(offset: string): number {
  const m = /^([+-])(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(offset);
  if (!m) throw new Error(`bad offset ${offset}`);
  const v = Number(m[2]) * 60 + Number(m[3]) + Number(m[4] ?? 0) / 60;
  return m[1] === '-' ? -v : v;
}

/** 當地民用時間 + 明確 UTC 偏移 → UTC 毫秒（不經 IANA 時區資料庫）。 */
export function utcMsFromLocal(date: string, time: string, offset: string): number {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return Date.UTC(y, mo - 1, d, h, mi) - parseOffsetMinutes(offset) * 60_000;
}

export function msToJd(ms: number): number {
  return ms / DAY_MS + UNIX_EPOCH_JD;
}

export function jdToMs(jd: number): number {
  return (jd - UNIX_EPOCH_JD) * DAY_MS;
}

function astroTime(jdUt: number): AstroTime {
  return MakeTime(new Date(jdToMs(jdUt)));
}

// ─── 回歸黃道（視位置）──────────────────────────────────────────────────────

const AE_BODY: Record<Exclude<RefGraha, 'sun' | 'moon' | 'rahu' | 'ketu'>, Body> = {
  mars: Body.Mars,
  mercury: Body.Mercury,
  jupiter: Body.Jupiter,
  venus: Body.Venus,
  saturn: Body.Saturn,
};

/** 章動 Δψ（度）。 */
export function nutationLongitude(t: AstroTime): number {
  return e_tilt(t).dpsi / 3600;
}

/** Meeus 47.7 平均升交點（平春分點），度。 */
export function meanNodeMeeus(t: AstroTime): number {
  const T = t.tt / 36525;
  return mod360(125.0445479 - 1934.1362891 * T + 0.0020754 * T * T + (T * T * T) / 467441 - (T * T * T * T) / 60616000);
}

function tropicalAt(g: RefGraha, t: AstroTime): number {
  switch (g) {
    case 'sun':
      return SunPosition(t).elon;
    case 'moon':
      return EclipticGeoMoon(t).lon;
    case 'rahu':
      return mod360(meanNodeMeeus(t) + nutationLongitude(t));
    case 'ketu':
      return mod360(meanNodeMeeus(t) + nutationLongitude(t) + 180);
    default:
      return Ecliptic(GeoVector(AE_BODY[g], t, true)).elon;
  }
}

/** 回歸黃道視黃經（度）與速度（度／日，±0.5 日中央差分）。 */
export function refTropical(jdUt: number): Record<RefGraha, { longitude: number; speed: number }> {
  const t = astroTime(jdUt);
  const t0 = astroTime(jdUt - 0.5);
  const t1 = astroTime(jdUt + 0.5);
  const out = {} as Record<RefGraha, { longitude: number; speed: number }>;
  for (const g of REF_GRAHAS) {
    out[g] = { longitude: mod360(tropicalAt(g, t)), speed: angleDiff(tropicalAt(g, t1), tropicalAt(g, t0)) };
  }
  return out;
}

/** 回歸黃道上升點（度）。lng 東經為正。 */
export function refTropicalAscendant(jdUt: number, lat: number, lng: number): number {
  const t = astroTime(jdUt);
  const eps = (e_tilt(t).tobl * Math.PI) / 180;
  const theta = (mod360(SiderealTime(t) * 15 + lng) * Math.PI) / 180;
  const phi = (lat * Math.PI) / 180;
  const asc = Math.atan2(Math.cos(theta), -(Math.sin(theta) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps)));
  return mod360((asc * 180) / Math.PI);
}

// ─── Lahiri 歲差 ─────────────────────────────────────────────────────────────

/** 1956-03-21 00:00 TT（儒略日）。 */
export const LAHIRI_T0_JD_TT = 2435553.5;
/** 23°15′00.658″（含章動）。 */
export const LAHIRI_T0_TRUE_DEG = 23 + 15 / 60 + 0.658 / 3600;

/** IAU 2006 黃經總歲差 p_A（角秒），T 為自 J2000.0 起的 TT 儒略世紀數。 */
export function generalPrecessionArcsec(T: number): number {
  return 5028.796195 * T + 1.1054348 * T ** 2 + 0.00007964 * T ** 3 - 0.000023857 * T ** 4 - 0.0000000383 * T ** 5;
}

function ttCenturies(jdTt: number): number {
  return (jdTt - 2451545.0) / 36525;
}

function nutationAtTt(jdTt: number): number {
  // MakeTime 吃 UT；t₀ 處 ΔT ≈ 31.6 秒，對 Δψ 的影響 < 1e-6″，可忽略。
  return nutationLongitude(MakeTime(new Date(jdToMs(jdTt))));
}

/** Lahiri 平均歲差（度）。 */
export function lahiriMean(jdTt: number): number {
  const meanT0 = LAHIRI_T0_TRUE_DEG - nutationAtTt(LAHIRI_T0_JD_TT);
  const dp = generalPrecessionArcsec(ttCenturies(jdTt)) - generalPrecessionArcsec(ttCenturies(LAHIRI_T0_JD_TT));
  return meanT0 + dp / 3600;
}

/** Lahiri 真歲差（含章動，度），在 UT 儒略日求值。 */
export function lahiriTrue(jdUt: number): number {
  const t = astroTime(jdUt);
  const jdTt = t.tt + 2451545.0;
  return lahiriMean(jdTt) + nutationLongitude(t);
}

// ─── 恆星黃道離散欄位 ────────────────────────────────────────────────────────

export const REF_NAKSHATRA_LORDS: readonly RefGraha[] = [
  'ketu', 'venus', 'sun', 'moon', 'mars', 'rahu', 'jupiter', 'saturn', 'mercury',
];
export const REF_DASHA_YEARS: Readonly<Record<RefGraha, number>> = {
  ketu: 7, venus: 20, sun: 6, moon: 10, mars: 7, rahu: 18, jupiter: 16, saturn: 19, mercury: 17,
};
const YEAR_DAYS = 365.25;

export interface RefPoint {
  longitude: number;
  /** 1–12 */
  sign: number;
  degree: number;
  /** 1–27 */
  nakshatra: number;
  /** 1–4 */
  pada: number;
  d9: number;
  d10: number;
}

/** 1–12 環繞。 */
function wrap12(n: number): number {
  return ((((n - 1) % 12) + 12) % 12) + 1;
}

export function refPoint(longitude: number): RefPoint {
  const lon = mod360(longitude);
  const sign = Math.floor(lon / 30) + 1;
  const degree = lon - (sign - 1) * 30;
  const nakshatra = Math.floor((lon * 27) / 360) + 1;
  const pada = Math.floor((lon * 108) / 360) - (nakshatra - 1) * 4 + 1;
  // D9：依宮位性質（BPHS 原文），不使用「連續數」的捷徑。
  const part9 = Math.floor((degree * 9) / 30);
  const kind = (sign - 1) % 3; // 0 動、1 固定、2 變動
  const start9 = kind === 0 ? sign : kind === 1 ? wrap12(sign + 8) : wrap12(sign + 4);
  const d9 = wrap12(start9 + part9);
  const part10 = Math.floor(degree / 3);
  const start10 = sign % 2 === 1 ? sign : wrap12(sign + 8);
  const d10 = wrap12(start10 + part10);
  return { longitude: lon, sign, degree, nakshatra, pada, d9, d10 };
}

export interface RefDashaPeriod {
  lord: RefGraha;
  startJd: number;
  endJd: number;
}

export interface RefVimshottari {
  moonNakshatra: number;
  lord: RefGraha;
  elapsedFraction: number;
  balanceYears: number;
  mahas: (RefDashaPeriod & { antars: RefDashaPeriod[] })[];
}

function seqFrom(lord: RefGraha): RefGraha[] {
  const i = REF_NAKSHATRA_LORDS.indexOf(lord);
  return Array.from({ length: 9 }, (_, k) => REF_NAKSHATRA_LORDS[(i + k) % 9]);
}

/** 兩個 120 年循環（18 個大運），足以涵蓋任何 asOf ≤ 出生後 240 年。 */
export function refVimshottari(moonSidereal: number, birthJd: number): RefVimshottari {
  const span = 360 / 27;
  const lon = mod360(moonSidereal);
  const idx = Math.floor((lon * 27) / 360);
  const lord = REF_NAKSHATRA_LORDS[idx % 9];
  const elapsedFraction = (lon - idx * span) / span;
  const balanceYears = (1 - elapsedFraction) * REF_DASHA_YEARS[lord];
  let t = birthJd - elapsedFraction * REF_DASHA_YEARS[lord] * YEAR_DAYS;
  const mahas: RefVimshottari['mahas'] = [];
  const order = seqFrom(lord);
  for (let k = 0; k < 18; k++) {
    const ml = order[k % 9];
    const mYears = REF_DASHA_YEARS[ml];
    const start = t;
    const antars: RefDashaPeriod[] = [];
    let a = start;
    for (const al of seqFrom(ml)) {
      const len = ((mYears * REF_DASHA_YEARS[al]) / 120) * YEAR_DAYS;
      antars.push({ lord: al, startJd: a, endJd: a + len });
      a += len;
    }
    t = start + mYears * YEAR_DAYS;
    mahas.push({ lord: ml, startJd: start, endJd: t, antars });
  }
  return { moonNakshatra: idx + 1, lord, elapsedFraction, balanceYears, mahas };
}

export function refDashaAt(v: RefVimshottari, jd: number): { maha: RefDashaPeriod; antar: RefDashaPeriod } | null {
  for (const m of v.mahas) {
    if (jd >= m.startJd && jd < m.endJd) {
      const antar = m.antars.find((a) => jd >= a.startJd && jd < a.endJd) ?? m.antars[8];
      return { maha: { lord: m.lord, startJd: m.startJd, endJd: m.endJd }, antar };
    }
  }
  return null;
}

// ─── 整張對照盤 ──────────────────────────────────────────────────────────────

export interface RefChart {
  jdUt: number;
  ayanamsa: number;
  tropical: Record<RefGraha, { longitude: number; speed: number }>;
  tropicalAscendant: number;
  grahas: Record<RefGraha, RefPoint & { retrograde: boolean; house: number }>;
  lagna: RefPoint;
  dasha: RefVimshottari;
}

export function refChart(jdUt: number, lat: number, lng: number): RefChart {
  const ayanamsa = lahiriTrue(jdUt);
  const tropical = refTropical(jdUt);
  const tropicalAscendant = refTropicalAscendant(jdUt, lat, lng);
  const lagna = refPoint(tropicalAscendant - ayanamsa);
  const grahas = {} as RefChart['grahas'];
  for (const g of REF_GRAHAS) {
    const p = refPoint(tropical[g].longitude - ayanamsa);
    grahas[g] = {
      ...p,
      retrograde: g !== 'sun' && g !== 'moon' && tropical[g].speed < 0,
      house: wrap12(p.sign - lagna.sign + 1),
    };
  }
  return { jdUt, ayanamsa, tropical, tropicalAscendant, grahas, lagna, dasha: refVimshottari(grahas.moon.longitude, jdUt) };
}

// ─── ADB 字串 ────────────────────────────────────────────────────────────────

const SIGN_ABBR = ['Ari', 'Tau', 'Gem', 'Can', 'Leo', 'Vir', 'Lib', 'Sco', 'Sag', 'Cap', 'Aqu', 'Pis'];

/** "Pis 23°30'" → 回歸黃經（度）。 */
export function parseAdbPosition(s: string): number {
  const m = /^([A-Z][a-z]{2}) (\d{2})°(\d{2})'?$/.exec(s);
  if (!m) throw new Error(`bad ADB position ${s}`);
  const i = SIGN_ABBR.indexOf(m[1]);
  if (i < 0) throw new Error(`bad sign ${m[1]}`);
  return i * 30 + Number(m[2]) + Number(m[3]) / 60;
}
