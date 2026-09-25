# 架構契約 (Architecture Contract)

> **🚧 v2 遷移中（2026-09-25）**：目標架構見 [ARCHITECTURE-V2.md](ARCHITECTURE-V2.md)，
> 決策 D-021～D-029。遷移完成前，本文件仍是**現行程式碼**的契約；
> D-002／D-003／D-013 已被取代，執行環境改以 Bun 為準（D-025）。

> 本文件是**執行任何開發任務前必讀**的設計契約。修改程式前先讀完本文件與
> [DECISIONS.md](DECISIONS.md)；任務規格在 [TASKS.md](TASKS.md)；
> 執行規則在 [HARNESS_SPEC.md](HARNESS_SPEC.md)；測試策略在 [TEST_PLAN.md](TEST_PLAN.md)。
>
> 定案(2026-07-11)：① 可重用核心函式庫 ② 5 系統(紫微/靈數/命卦/Kin/八字)
> ③ JSDoc ④ Report Schema 以版本守護形狀（v1：D-012；v2：D-019；v3：D-020；目前 v4：D-032，見 §4.3）。

---

## 1. 設計原則（不可協商）

1. **核心與 UI 分離**：`core / engines / analysis / visualization` 為框架無關 ES module；
   `ui` 只是消費核心的其中一個 App，**只吃 `Report`**（D-015）。
2. **單一對外入口**：`@fortune/core`（`packages/core/src/index.js`）是唯一公開 API（package.json `exports` 鎖定）。
3. **穩定契約**：輸出以單一 `Report` 為準；`VERSION` semver；`REPORT_SCHEMA_VERSION` 守形狀。
4. **外掛式引擎**：每系統一個 `BaseEngine` 子類；新增系統不改核心。
   命理函式庫（iztro/lunar-javascript）**只允許出現在 `engines/`**（D-016）。
5. **透明可覆核**：雷達每一軸都帶 `ruleId` 指向 `ScoringRules` 的公開公式，否則雷達只是裝飾。
6. **動靜誠實**：L0「你是」；L1/L2「這段時期」；L3「在某情境下」。
   未知部件保守歸 L3+`unclassified`，絕不進 L0（D-007）。

## 2. 分層依賴規則（import 方向）

```
apps/web ─────►  @fortune/core（只能 import 公開 API）＋ apps/web 自己的 visualization
core/analyze ──► engines(index)、analysis
engines ──────► core(models, BaseEngine)          ← 唯一可 import 命理函式庫的層
analysis ─────► （無依賴；純函數，吃 components 吐結構）
visualization ► （無核心依賴；吃資料吐圖/文字）
```

違反方向 = 架構衝突，寫入 DECISIONS.md 並停止（HARNESS_SPEC 規則 6）。

## 3. 目錄結構與現況

```
packages/core/            @fortune/core — 框架無關核心（V0 起自 src/ 搬入）
  src/
    index.js             ✅ 唯一公開 API（barrel + analyze + VERSION）
    core/                ✅ analyze / analyzeCompatibility / calendar / BaseEngine / EngineRegistry / models
    engines/             ✅ Ziwei / Numerology / MingGua / Dreamspell / BaZi
    analysis/            ✅ LayerClassifier / ScoringRules / RadarBuilder / AxisNotes / StateSwitchTable /
                            EvolutionCalculator / HonestyGuard / SummaryBuilder / InsightBuilder
    visualization/       ✅ TextFallback（純文字降級，無 DOM 依賴）
  tests/                 ✅ 核心與整合測試（bun test）
apps/web/                 @fortune/web — React 19 + TypeScript + Vite（D-030；只透過 @fortune/core 取用核心）
  src/
    main.tsx  App.tsx    ✅ 進入點與 App 殼（畫面切換、載入、主題、列印）
    lib/                 ✅ core 型別橋接、最近查詢、主題、術語表
    model/               ✅ Report 型別與 selectors（Report → 畫面資料，純函式）
    components/          ✅ input/（表單）report/（八章報告）compat/（合盤）ui/（SVG 雷達、分頁等）
    styles/              ✅ tokens / base / intake / report / charts / print
  tests/                 ✅ selectors、儲存、SSR 渲染測試
docs/  ARCHITECTURE.md(本文件) ARCHITECTURE-V2.md DECISIONS.md HARNESS_SPEC.md TASKS.md
       CONTRIBUTING.md PLAN-FOR-AUDIT.md
```

## 4. Report Schema v3

Schema v3 在 v2 的可追溯 `summary` 之外新增 `insights`，把既有引擎資料重新組成
人生領域、本年觀察與平衡建議。每段內容仍須保留來源與限制，不補寫缺失資料。

```js
import { analyze } from 'fortunetelling';
const report = analyze(input, { asOf: '2026-07-11' }); // 測試必須顯式傳 asOf(D-014)
```

### 4.1 頂層欄位（禁止增刪改名）

| 欄位 | 型別 | 狀態 |
|---|---|---|
| `version` | string | ✅ 函式庫 semver |
| `schemaVersion` | number | ✅ v3 恆為 3 |
| `generatedAt` | string(ISO) | ✅ |
| `asOf` | string(YYYY-MM-DD) | ✅ L1/L2/演化的評估基準日 |
| `input` | object | ✅ 正規化出生資料 echo |
| `engines` | SystemResult[] | ✅ 各引擎原始輸出 |
| `layers` | LayerClassification | ✅ H①（含 `unclassified[]`） |
| `scoringRules` | RulesExport | ✅ G 透明計分全量匯出 |
| `radars` | Radar[] | 空殼→C2 填入 |
| `summary` | `{ version, sentences[], sourceSystems[], limitations[] }` | ✅ 規則式跨系統白話提要 |
| `insights` | `{ version, domains[], annual, guidance }` | ✅ 領域／本年／平衡建議 |
| `stateTable` | `{ scenarios: Scenario[], pending: bool }` | 空殼→D2 填入 |
| `evolution` | `{ periods: Period[], narrative: string, pending: bool }` | 空殼→D4 填入 |
| `honesty` | `{ languageRules[], violations[], pending: bool }` | 規則✅ 稽核→D1 |

### 4.2 進階欄位的元素形狀

```js
/** Summary — 每句均引用真實引擎部件，缺資料時略過而不補寫 */
Summary {
  version: number,
  sentences: SummarySentence[], // 目前 3–5 句；可用部件不足時允許較少
  sourceSystems: string[],
  limitations: string[],
}
SummarySentence {
  id: string,
  text: string,
  layer: 'L0',
  sources: {
    engineId: string,
    engineName: string,
    componentId: string,
    componentName: string,
  }[],
}

/** Radar — 每系統一張(D-009)，軸獨立 0–100%，允許多軸同高(D-010) */
Radar {
  id: string,            // 'bazi_element_balance' | 'ziwei_palace_strength' | 'numerology_digit_frequency'
  system: string,        // 來源引擎 id
  title: string,         // 顯示名
  kind: 'radar'|'bar',   // 頻次類用 bar
  axes: RadarAxis[],
}
RadarAxis {
  key: string, label: string,
  value: number,         // 0–100（或次數，依 unit）
  unit: '%'|'次'|'分',
  ruleId: string,        // 必須能被 ScoringRules.getRule() 解析
  inputs: Object,        // 實際代入的變數值（可覆核）
  assets: string[],      // 資產面（高佔比時 UI 並列呈現）
  liabilities: string[], // 負債面
}

/** Scenario — H② 狀態切換表。5 固定情境；來源不足必須明示(D-008) */
Scenario {
  id: 'first_meeting'|'intimate_stable'|'conflict'|'low_pressure'|'workplace',
  name: string,          // 初識場合/親密關係穩定期/衝突當下/壓力低谷/工作場域
  cells: Cell[],         // 可為空
  insufficientData: boolean, // true 時 UI 顯示「資料不足」，禁止編故事
}
Cell {
  sources: { system: string, componentId: string, name: string }[], // 至少 1 個
  expression: string,    // 「在此情境下你會…」語氣（過 HonestyGuard L3）
  hypothesis: true,      // 恆為 true：⚠️待驗證假說
}

/** Period — H③ 時期演化。資料來自引擎的序列部件(D-016) */
Period {
  system: 'bazi'|'ziwei',
  label: string,         // e.g. '2024–2033 甲辰大運'
  range: [number, number], // [startYear, endYear]
  radar: Radar,          // 該時期重算後的雷達
  summary: [string, string], // 恰好兩行摘要（過 HonestyGuard L1）
}

/** honesty.violations 元素 — D1 HonestyGuard 產出 */
Violation {
  layer: 'L0'|'L1'|'L2'|'L3',
  location: string,      // 出處（如 'stateTable.scenarios[2].cells[0]'）
  text: string,          // 違規原文
  problem: string,       // 例如 'L2 內容使用了「你是」定性語氣'
}
```

### 4.3 Report Schema v4（V1-14，D-032）

v4 = v3 全部欄位與元素形狀**不變**，另外只新增三個頂層欄位；`schemaVersion` 恆為 4、
函式庫 semver 0.4.0。`analyze()` 仍是**同步**函式。

```js
analyze({
  year, month, day, hour, minute, timeKnown, gender, name,   // v3 欄位照舊
  longitude, latitude,                                      // v3：以 Asia/Taipei 民用時解讀
  birthplace: { label, lat, lng, timezone },                // v4 選填（IANA 時區）
  cityId: 'tainan',                                         // v4 選填，findCity() 可解析的鍵
  timeAccuracy: 'exact' | 'approx15m' | 'approx1h',         // v4 選填；timeKnown:false → 'unknown'
  ziHourConvention: 'late' | 'early',                       // v4 選填，預設 'late'（晚子不換日）
  useTrueSolarTime: true,                                   // v4 選填，預設 true
}, { asOf: '2026-07-11' });
```

出生地解析順序：`birthplace` → `cityId` → 舊 `longitude/latitude`（時區固定 Asia/Taipei，
距 120°E 超過 15° 時在 `timeContext.conventions.warnings` 標 `legacy_coordinates_outside_utc+8_meridian`）
→ 預設台北市（`DEFAULT_BIRTHPLACE`）。`input` echo 維持 v3 形狀，經緯度改為實際採用的出生地座標。

| 新欄位 | 型別 | 內容 |
|---|---|---|
| `timeContext` | `TimeContext & { conventions }` | ① 時間層輸出（ARCHITECTURE-V2 §3.2）；`profile` **不含姓名**（姓名已在 `input`），保留 `birthplace.label`。送 AI 前仍須再移除 label（D-029）。 |
| `timeline` | `Timeline`（`timeline/buildTimeline`） | 同步版：asOf 年起 5 個西曆年 + asOf 年 12 個月，系統 = 八字／紫微／靈數。jyotish／humanDesign 需要非同步載入的 Swiss Ephemeris，在 `analyze()` 中**一律略過**（`skippedSystems` 原因 `ephemeris_not_initialised`，時間未知時為 `time_unknown`），與他處是否已初始化星曆無關（D-014）。完整版請用 `buildTimelineAsync`。 |
| `signals` | `Signal[]` | timeline 各格 `topSignals` 的**去重聯集**（依 id 排序），不是全部訊號：`perSystem.signalIds` 可能引用不在此陣列的 id（每格每領域只留前 5 名）。實測約 350 筆、150 KB。 |

`timeContext.conventions`（實際採用的時間約定）：

```js
{
  warnings: string[],
  birthplaceSource: 'birthplace' | 'cityId' | 'legacyCoordinates' | 'default',
  useTrueSolarTime: boolean, ziHourConvention: 'late' | 'early',
  bazi:  { dayHourClock: 'trueSolar'|'civil', yearMonthBasis: 'jie-instant', ziHourConvention,
           luckCycles: 'birth-instant-to-jie-instant', liuNian: 'liChun-solar-year-of-asOf' },
  ziwei: { clock: 'trueSolar'|'civil', ziHourConvention: 'splitMidnight'|'nextDayAt23' },
  numerology: 'civil-local-date', dreamspell: 'civil-local-date',
  minggua: 'civil-local-time-read-as-utc+8',
  timeline: { clock: 'trueSolar', baziZiHourConvention: 'late', ziweiZiHourConvention: 'splitMidnight',
              followsOptions: false, skippedInSyncAnalyze: ['jyotish', 'humanDesign'] },
}
```

引擎層（`engines[]` 形狀不變，部件 id／category 不變）：

- **八字**：`core/timeContextEngines#TimeContextBaZiEngine`。引擎吃解析後的牆鐘（真太陽時或民用時），
  四柱再以 `computePillars(ctx)`（年／月柱＝出生瞬間對精確交節瞬間；日／時柱＝所選時鐘與子時約定）覆寫並重算
  日主／五行／十神／十神角色；`daYun_*` 由 `luckCycles(ctx)` 重建（方向、干支、起運皆依出生瞬間）；
  `liuNian.year` 改為 asOf 的**立春年**。`engines[bazi].meta.timeConvention` 記錄時鐘、交節、
  引擎牆鐘四柱與 `overriddenFields`、兩盤並算候選、起運資訊。`natal.convention` 反映實際時區／sect／真太陽時。
- **紫微**：`TimeContextZiweiEngine`，與 `ziweiCalculator` 同路徑（`timeIndexFrom` → iztro），
  23:00–24:00 為晚子（timeIndex 12）；`engines[ziwei].meta.timeConvention` 記錄時鐘、牆鐘、iztro 日期與候選。
- 靈數／Kin／命卦：沿用民用日期（命卦仍以民用時刻視為 UTC+8 判立春，未改）。
- `useTrueSolarTime: false` 且為 UTC+8（非日治 +9、非夏令時間）出生、asOf 不在 1/1～立春之間時，
  全部 `engines[].components` 與 v3 逐位元相同（測試守護）。

誠實稽核（D1）新增掃描：`signals[].evidence.text` 與 `modifiers[].reason`（依 window.grain：
natal L0、decade L1、year/month L2）、`timeContext.flags[].detail`（L2）。

效能：單次 `analyze()` 約 1 秒（主要是 timeline 的紫微流年／流月序列），報告 JSON 約 0.5 MB。

## 5. 引擎外掛契約

新增系統五步（詳見 [CONTRIBUTING.md](CONTRIBUTING.md)）：
引擎檔(`_compute` 回傳 SystemResult) → LayerClassifier 補規則 → ScoringRules 登錄公式
→ `engines/index.js` 註冊 → tests/ 黃金測試。
引擎**不得** import UI/visualization/analysis；失敗由 BaseEngine 接成該引擎 `errors`。

## 6. 執行環境（D-025）

- **權威 runtime：Bun**，Bun workspaces 管理 `packages/*` 與 `apps/*`。
- 根目錄指令：`bun install`、`bun test`（跑所有 workspace 的測試）、`bun run dev`、`bun run build`
  （轉交 `@fortune/web`，輸出在 `apps/web/dist`）。
- 型別檢查：`bun run --filter @fortune/web typecheck`（CI 執行）；`bun run --filter @fortune/core typecheck`（D-024；已知 JSDoc 型別債，尚未納入 CI）。
- CI：`.github/workflows/ci.yml`（test + build）；部署：`deploy.yml` 上傳 `apps/web/dist` 到 GitHub Pages。

## 7. 里程碑總覽

- **A ✅ 驗收通過(2026-07-11)**：公開 API、analyze()、Schema v1、22 tests、UI 接通。
- **B ⏳** BaZiEngine（任務 B1–B3）
- **C ⏳** 區塊 G 雷達（任務 C1–C3）
- **D ⏳** 區塊 H 狀態表/演化/誠實守門（任務 D1–D5）

任務規格一律以 [TASKS.md](TASKS.md) 為準。
