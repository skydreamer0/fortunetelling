# 架構契約 (Architecture Contract)

> 本文件是**執行任何開發任務前必讀**的設計契約。修改程式前先讀完本文件與
> [DECISIONS.md](DECISIONS.md)；任務規格在 [TASKS.md](TASKS.md)；
> 執行規則在 [HARNESS_SPEC.md](HARNESS_SPEC.md)；測試策略在 [TEST_PLAN.md](TEST_PLAN.md)。
>
> 定案(2026-07-11)：① 可重用核心函式庫 ② 5 系統(紫微/靈數/命卦/Kin/八字)
> ③ JSDoc + `checkJs` ④ Report Schema v1 凍結(D-012)。

---

## 1. 設計原則（不可協商）

1. **核心與 UI 分離**：`core / engines / analysis / visualization` 為框架無關 ES module；
   `ui` 只是消費核心的其中一個 App，**只吃 `Report`**（D-015）。
2. **單一對外入口**：`src/index.js` 是唯一公開 API（package.json `exports` 鎖定）。
3. **穩定契約**：輸出以單一 `Report` 為準；`VERSION` semver；`REPORT_SCHEMA_VERSION` 守形狀。
4. **外掛式引擎**：每系統一個 `BaseEngine` 子類；新增系統不改核心。
   命理函式庫（iztro/lunar-javascript）**只允許出現在 `engines/`**（D-016）。
5. **透明可覆核**：雷達每一軸都帶 `ruleId` 指向 `ScoringRules` 的公開公式，否則雷達只是裝飾。
6. **動靜誠實**：L0「你是」；L1/L2「這段時期」；L3「在某情境下」。
   未知部件保守歸 L3+`unclassified`，絕不進 L0（D-007）。

## 2. 分層依賴規則（import 方向）

```
ui  ──────────►  src/index.js（只能 import 公開 API 與 visualization 的呈現輔助）
core/analyze ──► engines(index)、analysis
engines ──────► core(models, BaseEngine)          ← 唯一可 import 命理函式庫的層
analysis ─────► （無依賴；純函數，吃 components 吐結構）
visualization ► （無核心依賴；吃資料吐圖/文字）
```

違反方向 = 架構衝突，寫入 DECISIONS.md 並停止（HARNESS_SPEC 規則 6）。

## 3. 目錄結構與現況

```
src/
  index.js               ✅ 唯一公開 API(barrel + analyze + VERSION)
  core/
    analyze.js           ✅ 編排器：BirthData → Report
    BaseEngine.js        ✅ 引擎基類(驗證/計時/容錯)
    EngineRegistry.js    ✅ 註冊與調度
    models/BirthData.js  ✅   models/SystemResult.js ✅
  engines/
    index.js             ✅ createEngines / createDefaultRegistry
    ZiweiEngine.js       ✅（含 L3：soulVsBody / sanFangSiZheng）
    NumerologyEngine.js  ✅  MingGuaEngine.js ✅  DreamspellEngine.js ✅
    BaZiEngine.js        ⏳ 任務 B1–B3
  analysis/
    LayerClassifier.js   ✅（bazi 規則已預埋；unclassified 安全網）
    ScoringRules.js      ✅（16 條；C1 需清理 5 條死規則, D-009）
    RadarBuilder.js      ⏳ C1    StateSwitchTable.js ⏳ D2
    EvolutionCalculator.js ⏳ D4  HonestyGuard.js ⏳ D1
  visualization/
    ChartTheme.js ✅  TextFallback.js ✅
    RadarChart.js ⏳ C3  BarChart.js ⏳ C3
  ui/                    （App 層，非核心）
    InputForm.js ✅  ReportView.js ✅（C3 需修 D-015 違例）
  main.js                ✅ App 進入點
tests/                   ✅ 22 tests（node:test）
docs/  ARCHITECTURE.md(本文件) DECISIONS.md HARNESS_SPEC.md TASKS.md TEST_PLAN.md
       CONTRIBUTING.md PLAN-FOR-AUDIT.md
```

## 4. Report Schema v1（凍結，D-012）

```js
import { analyze } from 'fortunetelling';
const report = analyze(input, { asOf: '2026-07-11' }); // 測試必須顯式傳 asOf(D-014)
```

### 4.1 頂層欄位（禁止增刪改名）

| 欄位 | 型別 | 狀態 |
|---|---|---|
| `version` | string | ✅ 函式庫 semver |
| `schemaVersion` | number | ✅ 恆為 1，改形狀才 bump |
| `generatedAt` | string(ISO) | ✅ |
| `asOf` | string(YYYY-MM-DD) | ✅ L1/L2/演化的評估基準日 |
| `input` | object | ✅ 正規化出生資料 echo |
| `engines` | SystemResult[] | ✅ 各引擎原始輸出 |
| `layers` | LayerClassification | ✅ H①（含 `unclassified[]`） |
| `scoringRules` | RulesExport | ✅ G 透明計分全量匯出 |
| `radars` | Radar[] | 空殼→C2 填入 |
| `stateTable` | `{ scenarios: Scenario[], pending: bool }` | 空殼→D2 填入 |
| `evolution` | `{ periods: Period[], narrative: string, pending: bool }` | 空殼→D4 填入 |
| `honesty` | `{ languageRules[], violations[], pending: bool }` | 規則✅ 稽核→D1 |

### 4.2 進階欄位的元素形狀（C/D 任務照此實作，不得自創）

```js
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

## 5. 引擎外掛契約

新增系統五步（詳見 [CONTRIBUTING.md](CONTRIBUTING.md)）：
引擎檔(`_compute` 回傳 SystemResult) → LayerClassifier 補規則 → ScoringRules 登錄公式
→ `engines/index.js` 註冊 → tests/ 黃金測試。
引擎**不得** import UI/visualization/analysis；失敗由 BaseEngine 接成該引擎 `errors`。

## 6. 執行環境（D-013）

- **權威 runtime：Node ≥ 22**（`package.json engines` 已宣告）。`npm test` = `node --test`。
- **Bun 可選**（≥1.2，其 node:test 相容層）：`npm run test:bun`。不全域安裝、不寫入相依。
- CI 建議（GitHub Actions，尚未建檔）：
  ```yaml
  jobs:
    test:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with: { node-version: 22 }
        - run: npm ci
        - run: npm test
        - run: npm run build
  ```
  Bun job 可加為 non-blocking optional matrix。

## 7. 里程碑總覽

- **A ✅ 驗收通過(2026-07-11)**：公開 API、analyze()、Schema v1、22 tests、UI 接通。
- **B ⏳** BaZiEngine（任務 B1–B3）
- **C ⏳** 區塊 G 雷達（任務 C1–C3）
- **D ⏳** 區塊 H 狀態表/演化/誠實守門（任務 D1–D5）

任務規格一律以 [TASKS.md](TASKS.md) 為準。
