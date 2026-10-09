# 協作者指南

> 文件入口見 [README.md](README.md)，架構與後續契約見 [ARCHITECTURE.md](ARCHITECTURE.md)、
> [ARCHITECTURE-V2.md](ARCHITECTURE-V2.md) 與 [DECISIONS.md](DECISIONS.md)。
> v1 外部審計計畫已[歸檔](archive/2026-07-v1/PLAN-FOR-AUDIT.md)，不代表現行技術選型。

## 快速開始

```bash
bun install
bun run dev    # Vite dev server（apps/web）
bun test       # 所有 workspace 的測試
```

## 只重用計算核心（不要 UI）

唯一公開 API 是 `@fortune/core`（`packages/core/src/index.ts`）（package.json `exports`）。深路徑 import 不在 semver 保證內。

```js
import { analyze, BirthData, VERSION } from 'fortunetelling';

const report = analyze(
  { year: 1991, month: 10, day: 5, hour: 14, gender: 'female', name: 'Wang Xiaoming' },
  { asOf: '2026-07-11' },   // L1/L2 時間層的評估基準日，預設今天
);

report.engines;      // 各引擎原始 SystemResult[]
report.layers;       // 區塊 H①：L0–L3 動靜分層（含語言規則）
report.scoringRules; // 區塊 G：透明計分規則全量匯出
report.radars;       // 里程碑 C 填入（現為穩定空殼）
report.stateTable;   // 里程碑 D
report.evolution;    // 里程碑 D
report.honesty;      // 語言規則已就位；違規稽核里程碑 D
```

## 同步分析的 CalculationSpec（core 0.5.3）

`createCalculationSpec(input)` 回傳深層不可變的來源與有效設定，以及 `specHash`。
它與 `analyze(input)` 共用正規化入口；不執行排盤，也不初始化星曆。
`source` 保留受支援的原始欄位，`identity` 包含 canonical 有效輸入、逐系統設定與版本。
姓名、精確座標和時間精度都影響 identity；地名標籤、原始 alias、生成時間和 asOf 不影響。
內容含個人出生資料及姓名，不能當成去識別化匯出。

此版 scope 僅為 `analyze-sync-natal-intent`。尚未建構或共用 ChartSnapshot，不保證舊報告重播；
也沒有改動 MCP、匯出或 profile 格式。不要把原始出生資料代入本 API 後回填舊報告的有效設定。
specHash 使用非密碼學 FNV-1a 64-bit；未來快取須同時比較完整 canonical identity，
且期間／asOf 必須是另一層識別，不能拿同一本命 spec 互換不同期間結果。
依賴升級時更新 `core/calculationDependencies.json`，完整版本及 integrity 必須符合 bun.lock；
測試會檢查同步計算 dependency closure，不能手寫猜測值。詳細邊界見 D-042。

## Timeline 有效設定（core 0.8.0）

`buildTimeline`、`buildTimelineAsync` 及 `buildBacktestTimeline` 必須明確帶入
`useTrueSolarTime: boolean` 和 canonical `ziHourConvention: 'late' | 'early'`。
TypeScript 缺值不通過；JavaScript 缺值／undefined 會拋錯，即使 systems 為空也不例外。
async 入口在初始化星曆前先檢查這兩個欄位。八字命名到紫微命名的映射仍由 core 明確處理。

`analyze` 仍於既有入口展開使用者未選的設定，再傳有效值到 Timeline；Web 問事與回驗
沿用報告記錄並維持缺漏 metadata 不重算。不要在重播歷史報告時自行補 true/late。
Profile v1 的 MCP／export 入口沒有設定欄位，本版只明傳它們既有的 trueSolar/late 政策，
沒有新增可切換設定或跨入口快照。ChartSnapshot／snapshotId、姓名 identity 與 Report 下一版
相容策略仍屬 #51 後續契約；本切片不提供舊快照重播保證。

這是 0.x 公開 API 的必填參數收緊，故 core 0.7.0 → 0.8.0；Report7／Timeline2／
BacktestTimeline1／Profile1 的輸出形狀不變。完整有效輸入的計算結果不應因此變動。

## 新增一個命理系統（引擎外掛契約）

新增系統**不改動核心**，五步：

1. **新增引擎檔** `packages/core/src/engines/XxxEngine.js`：繼承 `BaseEngine`，宣告 `id`/`name`，
   實作 `_compute(birth)` 回傳 `SystemResult`。每個 component 必須帶 `category`。
2. **補分層規則**：在 `packages/core/src/analysis/LayerClassifier.js` 的 `CLASSIFICATION_RULES`
   為每個 `(sourceSystem, category)` 配一條 L0–L3 規則＋理由。
   沒配規則的部件會被保守歸入 L3 並標 `unclassified`（不會進 L0）。
3. **登錄計分公式**：在 `packages/core/src/analysis/ScoringRules.js` 為每個雷達軸加一條
   透明規則（formula/inputs/範圍/版本）。**計分規則不揭露，雷達就只是裝飾。**
4. **註冊**：加進 `packages/core/src/engines/index.js` 的 `createEngines()`。
5. **加測試**：`packages/core/tests/` 下用已知向量寫黃金測試。

## 鐵律

- 引擎**不得** import UI / visualization；UI 只消費 `Report`。
- 引擎失敗不得拖垮整份報告——丟例外會被 `BaseEngine` 接住變成該引擎的 `errors`。
- 誠實條款：L0「你是」、L1/L2「這段時期」、L3「在某情境下」。
  禁止把流動狀態寫成人格本質。
- 同一個計分尺度只能有一個出處（例：紫微亮度七級制以
  `ZiweiEngine.BRIGHTNESS_WEIGHTS` 為準，ScoringRules 的公式必須與之一致，
  packages/core/tests/scoringRules.test.js 有回歸測試守著）。

## 版本

- `VERSION`（semver）：公開 API 行為改變就 bump。
- `REPORT_SCHEMA_VERSION`：`Report` 形狀改變才 bump（消費端據此判斷相容性）。
