# 協作者指南

> 對應 [PLAN-FOR-AUDIT.md](PLAN-FOR-AUDIT.md)（架構計畫）與 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 快速開始

```bash
npm install
npm run dev    # Vite dev server（UI App）
npm test       # node --test（Bun 1.2+ 亦可直接 bun test）
```

## 只重用計算核心（不要 UI）

唯一公開 API 是 `src/index.js`（package.json `exports`）。深路徑 import 不在 semver 保證內。

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

## 新增一個命理系統（引擎外掛契約）

新增系統**不改動核心**，五步：

1. **新增引擎檔** `src/engines/XxxEngine.js`：繼承 `BaseEngine`，宣告 `id`/`name`，
   實作 `_compute(birth)` 回傳 `SystemResult`。每個 component 必須帶 `category`。
2. **補分層規則**：在 `src/analysis/LayerClassifier.js` 的 `CLASSIFICATION_RULES`
   為每個 `(sourceSystem, category)` 配一條 L0–L3 規則＋理由。
   沒配規則的部件會被保守歸入 L3 並標 `unclassified`（不會進 L0）。
3. **登錄計分公式**：在 `src/analysis/ScoringRules.js` 為每個雷達軸加一條
   透明規則（formula/inputs/範圍/版本）。**計分規則不揭露，雷達就只是裝飾。**
4. **註冊**：加進 `src/engines/index.js` 的 `createEngines()`。
5. **加測試**：`tests/` 下用已知向量寫黃金測試（node:test）。

## 鐵律

- 引擎**不得** import UI / visualization；UI 只消費 `Report`。
- 引擎失敗不得拖垮整份報告——丟例外會被 `BaseEngine` 接住變成該引擎的 `errors`。
- 誠實條款：L0「你是」、L1/L2「這段時期」、L3「在某情境下」。
  禁止把流動狀態寫成人格本質。
- 同一個計分尺度只能有一個出處（例：紫微亮度七級制以
  `ZiweiEngine.BRIGHTNESS_WEIGHTS` 為準，ScoringRules 的公式必須與之一致，
  tests/scoringRules.test.js 有回歸測試守著）。

## 版本

- `VERSION`（semver）：公開 API 行為改變就 bump。
- `REPORT_SCHEMA_VERSION`：`Report` 形狀改變才 bump（消費端據此判斷相容性）。
