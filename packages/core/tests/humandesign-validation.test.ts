/**
 * 人類圖（Human Design）計算器外部驗證（ROADMAPS.md M5-01／M5-02、D-039）。
 *
 * 對照資料：`fixtures/validation/humandesign-reference.json`（38 個 Astro-Databank
 * AA 公眾人物；來源 dailyhumandesign.com＝D、thehumandesignsystem.com＝T、
 * humandesignchart.org＝H）。結果與判定見 `humandesign-validation-report.md`。
 *
 * 斷言原則：
 * - 出生瞬間一律用 ADB 給的 UTC 位移換算（驗證計算器本身，不混入時區模組）。
 * - 結構欄位（類型、權威、角色、定義、已定義中心、通道、輪迴交叉閘門）：
 *   D 與 T 一致者為硬性斷言；兩站不一致者必須列在 {@link knownDivergences}，
 *   否則測試失敗（不允許未說明的分歧）。
 * - 行星「閘門.爻」只有 D 有（T 沒有行星與爻）：以 D 為硬性斷言，閘門另以 T
 *   的閘門標記交叉核對；與 D 不同者必須列在 knownDivergences 並附原因與獨立依據。
 * - H 自身不自洽，不作斷言，只在報告中列出一致率。
 * - knownDivergences 也會被斷言（我方值與來源值都要等於記錄），分歧若消失或改變，
 *   測試會失敗，避免記錄過時。
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { initEphemeris, sunLongitude } from '../src/calculators/astro/index';
import {
  CENTERS,
  GATE_ARC_DEG,
  HD_PLANETS,
  LINE_ARC_DEG,
  activationsAt,
  computeHumanDesign,
  deriveStructure,
  gateStartLongitude,
  humanDesignCalculator,
  type HdPlanet,
  type HumanDesignNatal,
} from '../src/calculators/humanDesign/index';
import { createTimeContext } from '../src/time/index';

// ─── 對照資料型別 ─────────────────────────────────────────────────────────

type Sides = Record<HdPlanet, string>;
interface SourceRecord {
  status: string;
  type?: string;
  authority?: string;
  profile?: string;
  definition?: string;
  incarnationCross?: string | null;
  definedCenters?: string[];
  channels?: string[] | null;
  channelSides?: Record<string, 'personality' | 'design' | 'both'>;
  standaloneGateMarks?: { personality: string[]; design: string[] };
  personality?: Sides | null;
  design?: Sides | null;
  reportedUtcOffsetHours?: number;
}
interface RefCase {
  id: string;
  name: string;
  input: { date: string; time: string; place: string; lat: number; lon: number; timezoneIana: string; utcOffsetHoursFromAdb: number };
  sources: {
    dailyhumandesign_com: SourceRecord;
    thehumandesignsystem_com: SourceRecord;
    humandesignchart_org: SourceRecord;
  };
}
const REF = JSON.parse(
  readFileSync(new URL('./fixtures/validation/humandesign-reference.json', import.meta.url), 'utf8'),
) as { cases: RefCase[] };

// ─── 已知分歧（必須逐一說明原因） ───────────────────────────────────────

export type DivergenceCategory =
  /** 我方錯（修正前存在；目前清單為空）。 */
  | 'oursError'
  /** 來源錯：有獨立依據顯示來源值不可能正確。 */
  | 'sourceError'
  /** 時區或歷史位移判定不同；`impact` 說明是否影響結果。 */
  | 'timezone'
  /** 接近線界、秒級差異即可翻轉。 */
  | 'boundary'
  /** 無法判定。 */
  | 'undetermined';

export interface KnownDivergence {
  caseId: string;
  /** 'profile'、'personality.sun' 之類；時區項目為 'utcOffset'。 */
  field: string;
  category: DivergenceCategory;
  /** 我方值（以 ADB 位移計算）。 */
  ours: string;
  /** 各來源的值（D／T／H；沒有該欄位為 null）。 */
  sources: { D: string | null; T: string | null; H: string | null };
  /** 是否影響任何驗證欄位。 */
  impact: 'none' | 'field';
  /** 時區項目：改用來源位移時會變動的欄位（無則省略）。 */
  affectedFields?: readonly string[];
  reason: string;
}

/**
 * Daily HD 閘門 25 的爻：該站在閘門 25（跨春分點 0° 牡羊，358.25°～3.875°）內的
 * 爻與經度順序矛盾（例如 358.45° 給 5 爻、0.62° 給 1 爻，同一閘門內爻數隨經度
 * 遞減），完全符合「爻＝floor((經度 mod 5.625°) / 0.9375°)+1」這個把閘門邊界誤對齊
 * 0° 的錯誤模型（見下方測試）。標準曼陀羅（mandala）閘門 25 從雙魚 28°15′ 起算第 1 爻；
 * 另外，T 的角色（profile）在 Senna、Rahul Gandhi 兩案與我方一致（兩者的太陽正好在
 * 閘門 25 的春分點兩側），H 也一致。
 */
const G25 =
  'Daily HD 在閘門 25（跨 0° 牡羊）的爻計算有環繞錯誤：其爻值與經度順序矛盾，且全部符合「經度 mod 5.625°」錯誤模型；標準曼陀羅閘門 25 起於雙魚 28°15′。';

export const knownDivergences: readonly KnownDivergence[] = Object.freeze([
  { caseId: 'monroe', field: 'personality.uranus', category: 'sourceError', ours: '25.1', sources: { D: '25.5', T: null, H: null }, impact: 'field', reason: G25 },
  { caseId: 'hepburn', field: 'design.venus', category: 'sourceError', ours: '25.4', sources: { D: '25.3', T: null, H: null }, impact: 'field', reason: G25 },
  { caseId: 'macron', field: 'design.earth', category: 'sourceError', ours: '25.4', sources: { D: '25.2', T: null, H: '25.4' }, impact: 'field', reason: `${G25} H 與我方一致。` },
  { caseId: 'spielberg', field: 'design.earth', category: 'sourceError', ours: '25.1', sources: { D: '25.5', T: null, H: '36.6' }, impact: 'field', reason: `${G25} H 此案整體與兩站不符（類型、角色皆不同），不採。` },
  { caseId: 'dali', field: 'personality.moon', category: 'sourceError', ours: '25.5', sources: { D: '25.3', T: null, H: null }, impact: 'field', reason: G25 },
  { caseId: 'nadal', field: 'design.mercury', category: 'sourceError', ours: '25.4', sources: { D: '25.2', T: null, H: '25.4' }, impact: 'field', reason: `${G25} H 與我方一致。我方距線界 0.008°，但兩種解讀相差 2 爻，非邊界問題。` },
  { caseId: 'senna', field: 'personality.sun', category: 'sourceError', ours: '25.3', sources: { D: '25.1', T: null, H: '13.3' }, impact: 'field', reason: `${G25} T 的角色 3/5（個性太陽 3 爻）支持我方；H 的爻同為 3，但閘門錯置，只當弱證據。` },
  { caseId: 'senna', field: 'profile', category: 'sourceError', ours: '3/5', sources: { D: '1/5', T: '3/5', H: '3/5' }, impact: 'field', reason: `D 的個性太陽落在閘門 25（${G25}）；T、H 皆為 3/5。` },
  { caseId: 'senna', field: 'design.southNode', category: 'sourceError', ours: '25.1', sources: { D: '25.5', T: null, H: '60.4' }, impact: 'field', reason: `${G25} H 此值與兩方皆不同，不採。` },
  { caseId: 'eilish', field: 'design.earth', category: 'sourceError', ours: '25.1', sources: { D: '25.5', T: null, H: '25.1' }, impact: 'field', reason: `${G25} H 與我方一致。` },
  { caseId: 'aniston', field: 'personality.northNode', category: 'sourceError', ours: '25.3', sources: { D: '25.1', T: null, H: '25.3' }, impact: 'field', reason: `${G25} H 與我方一致。` },
  { caseId: 'einstein', field: 'personality.mercury', category: 'sourceError', ours: '25.6', sources: { D: '25.4', T: null, H: null }, impact: 'field', reason: `${G25} 此案另有時區分歧，但以 D 自報的 UTC 重算仍為 25.6。` },
  { caseId: 'rgandhi', field: 'design.sun', category: 'sourceError', ours: '25.2', sources: { D: '25.6', T: null, H: '25.2' }, impact: 'field', reason: `${G25} T 角色 6/2 與 H 25.2 皆支持我方。` },
  { caseId: 'rgandhi', field: 'profile', category: 'sourceError', ours: '6/2', sources: { D: '6/6', T: '6/2', H: '6/2' }, impact: 'field', reason: `D 的設計太陽落在閘門 25（${G25}）；T、H 皆為 6/2。` },
  // 時區：各站與 ADB 的位移不同，但不影響任何欄位（以下皆有對應斷言）。
  { caseId: 'einstein', field: 'utcOffset', category: 'timezone', ours: '+0:40 (ADB)', sources: { D: '+0:54', T: '+0:53', H: null }, impact: 'none', reason: '1879 烏爾姆當地平均時；D、T 改用柏林當地平均時，差 13～14 分鐘，所有欄位不變。我方完整流程已修正（time-fix-report.md）：tz 標為 LMT 的期間改用出生地經度的地方平時，現與 ADB 的 +0:40 相同。' },
  { caseId: 'peron', field: 'utcOffset', category: 'timezone', ours: '-4:16:48 (ADB)', sources: { D: '-4:16', T: '-4:17', H: null }, impact: 'none', reason: '1919 布宜諾斯艾利斯當地平均時，差不到 1 分鐘，所有欄位不變。' },
  { caseId: 'aakvik', field: 'utcOffset', category: 'timezone', ours: '+1 (ADB)', sources: { D: '+1', T: '+2', H: null }, impact: 'field', affectedFields: ['personality.moon'], reason: '1948 奧斯陸是否實施夏令時間。ADB 與 D 為 +1；T 採 +2，與現行 IANA 資料庫（Europe/Oslo 連結到 Europe/Berlin，柏林 1948 有夏令）相同。差 1 小時只讓個性月亮由 60.2 變 60.1（T 不顯示月亮，其餘欄位不變）；D 的 60.2 與 ADB 位移一致，故以 ADB 為準。我方完整流程已修正（time-fix-report.md）：改用內建 tz（含 backzone），Europe/Oslo 1948 為 +1，個性月亮 60.2，與 ADB／D 相同。' },
  { caseId: 'maradona', field: 'utcOffset', category: 'timezone', ours: '-3 (ADB)', sources: { D: '-3', T: '-3', H: null }, impact: 'none', reason: 'ADB 標「夏令時間」、T 標「無夏令」，但位移相同，無影響。' },
]);

const divergence = (caseId: string, field: string) =>
  knownDivergences.find((d) => d.caseId === caseId && d.field === field);

// ─── 工具 ───────────────────────────────────────────────────────────────

/** 依 ADB 的 UTC 位移（小時，可為小數）換算儒略日（UT）。 */
function jdFromAdb(c: RefCase): number {
  const [y, m, d] = c.input.date.split('-').map(Number) as [number, number, number];
  const [hh, mm] = c.input.time.split(':').map(Number) as [number, number];
  const ms = Date.UTC(y, m - 1, d, hh, mm) - c.input.utcOffsetHoursFromAdb * 3_600_000;
  return ms / 86_400_000 + 2_440_587.5;
}

const gl = (a: { gate: number; line: number }) => `${a.gate}.${a.line}`;
const sortCenters = (xs: readonly string[]) => CENTERS.filter((c) => xs.includes(c));
const sortChannels = (xs: readonly string[]) => [...xs].sort();

interface Ours {
  natal: HumanDesignNatal;
  fields: Record<string, string>;
}

function structuralFields(n: HumanDesignNatal): Record<string, string> {
  return {
    type: n.type,
    authority: n.authority,
    profile: n.profile.label,
    definition: n.definition,
    definedCenters: JSON.stringify(n.definedCenters),
    channels: JSON.stringify(sortChannels(n.channels.map((c) => c.id))),
    incarnationCross: n.incarnationCross.label,
  };
}

function sourceStructural(s: SourceRecord, field: string): string | null {
  if (s.status !== 'ok') return null;
  switch (field) {
    case 'definedCenters':
      return s.definedCenters ? JSON.stringify(sortCenters(s.definedCenters)) : null;
    case 'channels':
      return s.channels ? JSON.stringify(sortChannels(s.channels)) : null;
    default:
      return ((s as unknown as Record<string, string | null | undefined>)[field] ?? null) as string | null;
  }
}

const STRUCTURAL = ['type', 'authority', 'profile', 'definition', 'definedCenters', 'channels', 'incarnationCross'] as const;

const ours = new Map<string, Ours>();
beforeAll(async () => {
  await initEphemeris();
  for (const c of REF.cases) {
    const natal = computeHumanDesign(jdFromAdb(c));
    ours.set(c.id, { natal, fields: structuralFields(natal) });
  }
});
const get = (id: string) => ours.get(id)!;

// ─── 測試 ───────────────────────────────────────────────────────────────

describe('對照資料完整性', () => {
  test('38 個案例，每案 D 與 T 皆可用', () => {
    expect(REF.cases.length).toBe(38);
    for (const c of REF.cases) {
      expect(c.sources.dailyhumandesign_com.status).toBe('ok');
      expect(c.sources.thehumandesignsystem_com.status).toBe('ok');
    }
  });

  test('knownDivergences 指向存在的案例，且沒有「我方錯」或未說明原因的項目', () => {
    const ids = new Set(REF.cases.map((c) => c.id));
    for (const d of knownDivergences) {
      expect(ids.has(d.caseId)).toBe(true);
      expect(d.reason.length).toBeGreaterThan(10);
      if (d.category === 'timezone') continue;
      // 記錄的 H 值必須與對照資料相同（H 不作斷言，但記錄不能抄錯）。
      const H = REF.cases.find((c) => c.id === d.caseId)!.sources.humandesignchart_org;
      const [side, planet] = d.field.split('.') as ['personality' | 'design', HdPlanet];
      const h = H.status !== 'ok' ? null : d.field === 'profile' ? H.profile! : H[side]![planet];
      expect({ id: d.caseId, field: d.field, H: h }).toEqual({ id: d.caseId, field: d.field, H: d.sources.H });
    }
    expect(knownDivergences.filter((d) => d.category === 'oursError')).toEqual([]);
  });
});

describe('結構欄位：D 與 T 一致者為硬性斷言', () => {
  for (const c of REF.cases) {
    test(`${c.id}（${c.name}）`, () => {
      const o = get(c.id).fields;
      const D = c.sources.dailyhumandesign_com;
      const T = c.sources.thehumandesignsystem_com;
      for (const f of STRUCTURAL) {
        const d = sourceStructural(D, f);
        const t = sourceStructural(T, f);
        const known = divergence(c.id, f);
        if (known) {
          // 已知分歧：鎖住我方值與來源值，記錄過時就失敗。
          expect({ f, ours: o[f] }).toEqual({ f, ours: known.ours });
          expect({ f, D: d, T: t }).toEqual({ f, D: known.sources.D, T: known.sources.T });
          continue;
        }
        if (d !== null && t !== null) {
          // 兩站不一致卻沒有記錄 → 失敗。
          expect({ f, D: d }).toEqual({ f, D: t });
          expect({ f, ours: o[f] }).toEqual({ f, ours: d });
        } else if (f === 'channels' && t !== null && D.personality && D.design) {
          // D 缺通道（3 案）：以 D 自己的閘門推導通道，與 T 形成兩源一致。
          const fromD = deriveStructure(
            HD_PLANETS.map((p) => Number(D.personality![p].split('.')[0])),
            HD_PLANETS.map((p) => Number(D.design![p].split('.')[0])),
          );
          expect(JSON.stringify(sortChannels(fromD.channels.map((x) => x.id)))).toBe(t);
          expect({ f, ours: o[f] }).toEqual({ f, ours: t });
        } else {
          throw new Error(`${c.id}.${f}: 沒有兩個可靠來源可比對`);
        }
      }
    });
  }
});

describe('行星「閘門.爻」：對照 D（26 個值×38 案）', () => {
  for (const c of REF.cases) {
    test(`${c.id}（${c.name}）`, () => {
      const n = get(c.id).natal;
      const D = c.sources.dailyhumandesign_com;
      for (const side of ['personality', 'design'] as const) {
        for (const a of n[side]) {
          const field = `${side}.${a.planet}`;
          const src = D[side]![a.planet];
          const known = divergence(c.id, field);
          if (known) {
            expect({ field, ours: gl(a), D: src }).toEqual({ field, ours: known.ours, D: known.sources.D! });
            // 已知分歧只限閘門 25 的爻；閘門本身必須一致。
            expect(src.split('.')[0]).toBe(String(a.gate));
          } else {
            expect({ field, ours: gl(a) }).toEqual({ field, ours: src });
          }
        }
      }
    });
  }
});

describe('閘門層級：對照 T 的閘門標記', () => {
  /**
   * T 只畫閘門標記。抄錄語意（由資料歸納，38/38 案成立）：同一側有兩個以上行星
   * 落在同一閘門時，T 的第二個設計標記被抄成「個性」。因此：
   * - 設計標記＝我方設計側、不在通道內的閘門；
   * - 個性標記＝我方個性側不在通道內的閘門 ∪ 設計側被兩個以上行星啟動、不在通道內的閘門；
   * - 通道顏色：任一端閘門有個性（或設計重複）標記且有設計標記 → both。
   */
  for (const c of REF.cases) {
    test(`${c.id}（${c.name}）`, () => {
      const n = get(c.id).natal;
      const T = c.sources.thehumandesignsystem_com;
      const inChannel = new Set(n.channels.flatMap((ch) => [...ch.gates]));
      const pGates = new Set(n.personality.map((a) => a.gate));
      const dCount = (g: number) => n.design.filter((a) => a.gate === g).length;
      const dGates = new Set(n.design.map((a) => a.gate));
      const pMark = (g: number) => pGates.has(g) || dCount(g) >= 2;
      const nums = (xs: string[]) => xs.map(Number).sort((a, b) => a - b);
      const standalone = (pred: (g: number) => boolean) =>
        [...new Set([...pGates, ...dGates])].filter((g) => !inChannel.has(g) && pred(g)).sort((a, b) => a - b);

      expect(nums(T.standaloneGateMarks!.design)).toEqual(standalone((g) => dGates.has(g)));
      expect(nums(T.standaloneGateMarks!.personality)).toEqual(standalone(pMark));
      // 嚴格版：只看個性側也必須是 T 個性標記的子集。
      for (const g of standalone((x) => pGates.has(x))) expect(T.standaloneGateMarks!.personality).toContain(String(g));

      const sides = Object.fromEntries(
        n.channels.map((ch) => {
          const p = ch.gates.some(pMark);
          const d = ch.gates.some((g) => dGates.has(g));
          return [ch.id, p && d ? 'both' : p ? 'personality' : 'design'];
        }),
      );
      expect(sides).toEqual(T.channelSides!);
    });
  }
});

describe('分歧的獨立核對', () => {
  test('Daily HD 閘門 25 的所有爻都符合「經度 mod 5.625°」錯誤模型，且與經度順序矛盾', () => {
    const g25Start = gateStartLongitude(25);
    expect(g25Start).toBeCloseTo(358.25, 12);
    const pairs: { lon: number; dLine: number; ourLine: number }[] = [];
    let outside = 0;
    for (const c of REF.cases) {
      const n = get(c.id).natal;
      const D = c.sources.dailyhumandesign_com;
      for (const side of ['personality', 'design'] as const) {
        for (const a of n[side]) {
          const [gate, line] = D[side]![a.planet].split('.').map(Number) as [number, number];
          if (gate !== 25) {
            if (gl(a) !== D[side]![a.planet]) outside++;
            continue;
          }
          pairs.push({ lon: a.longitude, dLine: line, ourLine: a.line });
        }
      }
    }
    expect(outside).toBe(0); // 閘門 25 以外 0 個爻不一致
    expect(pairs.length).toBe(12);
    for (const p of pairs) {
      // 錯誤模型：把閘門邊界當成從 0° 起每 5.625° 一格。
      expect(Math.floor((p.lon % GATE_ARC_DEG) / LINE_ARC_DEG) + 1).toBe(p.dLine);
      // 標準曼陀羅：自閘門起點 358.25° 起算。
      expect(Math.floor((((p.lon - g25Start) % 360) + 360) % 360 / LINE_ARC_DEG) + 1).toBe(p.ourLine);
      expect(p.dLine).not.toBe(p.ourLine);
    }
    // 自相矛盾：同一閘門內，經度較小（展開到閘門起點之後）卻給較大的爻。
    const unwrap = (lon: number) => (lon >= g25Start ? lon - g25Start : lon + 360 - g25Start);
    const sorted = [...pairs].sort((a, b) => unwrap(a.lon) - unwrap(b.lon));
    const inversions = sorted.filter((p, i) => i > 0 && p.dLine < sorted[i - 1]!.dLine).length;
    expect(inversions).toBeGreaterThan(0);
    expect(sorted.every((p, i) => i === 0 || p.ourLine >= sorted[i - 1]!.ourLine)).toBe(true);
  });

  test('設計時刻是「太陽黃經退後 88°」而非「88 天」：88 天版本與 D 大量不符', () => {
    let mismatch88days = 0;
    let total = 0;
    for (const c of REF.cases) {
      const n = get(c.id).natal;
      expect(Math.abs(((sunLongitude(n.birthJdUt) - 88 - sunLongitude(n.designJdUt) + 540) % 360) - 180)).toBeLessThan(1e-7);
      const D = c.sources.dailyhumandesign_com;
      for (const a of activationsAt(n.birthJdUt - 88)) {
        if (D.design![a.planet].startsWith('25.')) continue;
        total++;
        if (gl(a) !== D.design![a.planet]) mismatch88days++;
      }
    }
    expect(total).toBeGreaterThan(450);
    expect(mismatch88days / total).toBeGreaterThan(0.3);
  });

  test('設計時刻的精度：所有案例的 D 設計側同時成立的時間偏移區間包含 0，且寬度 ≤ 10 分鐘', () => {
    // 以 1 分鐘為格，在 ±30 分鐘內找出讓每案的 D 設計側（閘門 25 以外）全部一致的偏移。
    const offsets = Array.from({ length: 61 }, (_, i) => i - 30);
    const feasible = offsets.filter((dt) =>
      REF.cases.every((c) => {
        const D = c.sources.dailyhumandesign_com;
        return activationsAt(get(c.id).natal.designJdUt + dt / 1440).every(
          (a) => D.design![a.planet].startsWith('25.') || gl(a) === D.design![a.planet],
        );
      }),
    );
    expect(feasible).toContain(0);
    expect(feasible[feasible.length - 1]! - feasible[0]!).toBeLessThanOrEqual(10);
  });

  test('交點：真交點（預設）與 D 完全一致；平均交點多數不符', () => {
    let meanOk = 0;
    let n = 0;
    for (const c of REF.cases) {
      const jd = jdFromAdb(c);
      const D = c.sources.dailyhumandesign_com;
      const mean = computeHumanDesign(jd, { node: 'mean' });
      for (const side of ['personality', 'design'] as const) {
        for (const p of ['northNode', 'southNode'] as const) {
          n++;
          if (gl(mean[side].find((a) => a.planet === p)!) === D[side]![p]) meanOk++;
        }
      }
    }
    expect(n).toBe(152);
    expect(meanOk / n).toBeLessThan(0.5);
  });
});

/** 兩張盤之間不同的驗證欄位，例如 ['personality.moon']。 */
function changedFields(a: HumanDesignNatal, b: HumanDesignNatal): string[] {
  const fa = structuralFields(a);
  const fb = structuralFields(b);
  const out = STRUCTURAL.filter((f) => fa[f] !== fb[f]) as string[];
  for (const side of ['personality', 'design'] as const) {
    a[side].forEach((x, i) => {
      if (gl(x) !== gl(b[side][i]!)) out.push(`${side}.${x.planet}`);
    });
  }
  return out;
}

describe('時區爭議（記錄於 knownDivergences）', () => {
  test('以各來源自報的位移重算，改變的欄位與記錄相符', () => {
    for (const d of knownDivergences.filter((x) => x.category === 'timezone')) {
      const c = REF.cases.find((x) => x.id === d.caseId)!;
      const base = get(c.id).natal;
      const changed = new Set<string>();
      for (const s of [c.sources.dailyhumandesign_com, c.sources.thehumandesignsystem_com]) {
        const off = s.reportedUtcOffsetHours;
        if (off === undefined) continue;
        const alt = computeHumanDesign(jdFromAdb({ ...c, input: { ...c.input, utcOffsetHoursFromAdb: off } }));
        changedFields(base, alt).forEach((f) => changed.add(f));
      }
      expect({ id: d.caseId, changed: [...changed] }).toEqual({ id: d.caseId, changed: [...(d.affectedFields ?? [])] });
      expect(d.impact).toBe(changed.size ? 'field' : 'none');
    }
  });

  test('完整流程（createTimeContext＋IANA 時區）與 ADB 位移的結果一致', () => {
    for (const c of REF.cases) {
      const ctx = createTimeContext({
        date: c.input.date,
        time: c.input.time,
        timeAccuracy: 'exact',
        gender: 'female',
        birthplace: { label: c.input.place, lat: c.input.lat, lng: c.input.lon, timezone: c.input.timezoneIana },
      });
      const chart = humanDesignCalculator.calculate(ctx).chart;
      const base = get(c.id).natal;
      const diffMin = Math.abs(chart.birthJdUt! - base.birthJdUt) * 1440;
      // 原本 Einstein（IANA 柏林當地平均時）與 Aakvik（IANA 奧斯陸 1948 夏令）位移不同；
      // 時間層修正後（time-fix-report.md）全部 38 案都與 ADB 位移相同。
      expect({ id: c.id, diffMin: diffMin <= 0.01 ? 0 : diffMin }).toEqual({ id: c.id, diffMin: 0 });
      const pipeline = computeHumanDesign(chart.birthJdUt!);
      expect(pipeline.personality.map(gl)).toEqual(chart.personality.map(gl));
      const expected = diffMin > 0.01 ? [...(divergence(c.id, 'utcOffset')!.affectedFields ?? [])] : [];
      expect({ id: c.id, changed: changedFields(base, pipeline) }).toEqual({ id: c.id, changed: expected });
    }
  });
});
