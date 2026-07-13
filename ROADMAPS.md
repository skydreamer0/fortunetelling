# Fortune Telling Platform - Roadmaps & Architecture Thoughts

此文件記錄了本地端命理綜合分析平台（以紫微斗數為主軸）的開發藍圖與架構設計。

## 🎯 核心目標與原則
1. **純本地執行 (Local SPA)**：使用 Vite + Vanilla JS 建立，無伺服器與資料庫，保障隱私且易於本地部署。
2. **紫微斗數為主軸**：基於強大的 `iztro` 套件為核心，並搭配靈數、命卦、Kin 等無外部依賴的輕量級附帶系統。
3. **Block G 雷達量化系統**：分數計算必須**完全透明**，雷達圖代表「佔比」而非「優劣」，允許多軸同高。
4. **Block H 動靜四層分類**：將所有命理部件嚴格劃分 L0 ~ L3，並依照時間軸呈現時期演化，避免將流動狀態寫成不可變的判決。
5. **極致的深色 UI 美學**：採用深色模式、玻璃擬物化 (Glassmorphism)、漸層與微動畫，營造高級質感。

---

## 🗺️ 開發階段規劃 (Roadmap)

### Phase 1: 基礎架構與核心模型 (Core Architecture)
- [x] Vite 專案初始化 (`vanilla` 模板)與基礎依賴安裝 (`iztro`, `lunar-javascript`, `chart.js`)。
- [x] 實作 `BirthData.js`：統一的出生資料模型（包含真太陽時轉換、公農曆轉換）。
- [x] 實作 `SystemResult.js` 與 `BaseEngine.js`：所有計算引擎的標準介面。
- [x] 實作 `EngineRegistry.js`：註冊與調度各命理系統。

### Phase 2: 命理計算引擎 (Calculation Engines)
- [x] **`ZiweiEngine` (紫微斗數)**：
  - [x] 封裝 `iztro`，提取十二宮、主星亮度、四化、大限（`_compute` 產出 natal/palaces/mainStars/fourTransforms/daXian/xiaoXian/flyingStars components）。
  - [x] 亮度透明計分基礎：`BRIGHTNESS_WEIGHTS` + `brightnessScore()`（廟旺得利平不陷 → 0-1）；三方四正加權留待 Phase 3 `RadarBuilder`。
- [x] **`NumerologyEngine` (生命靈數)**：
  - [x] 生命靈數、表達數、靈魂數、人格數、數字九宮格頻次；個人流年/流月（L2）。
- [x] **`MingGuaEngine` (命卦)**：
  - [x] 男/女命卦計算（含千禧年修正）與八宅吉凶方位。
- [x] **`DreamspellEngine` (馬雅 Kin)**：
  - [x] 13 音階與 20 圖騰計算（Kin 錨定 1987-07-26=Kin34，含閏日規則）。
- [x] **`BaZiEngine` (八字)**：
  - [x] 任務 B1、B2：四柱、五行/十神出現次數、大運與流年基礎計算。
  - [x] 任務 B3：十神顯隱（L3 `tenGodsContext`），聚合成五大關係角色群並判定顯、隱、無三態。
- [x] **`ZiweiEngine` 大限全序列**（任務 D3）：`daXian_1`–`daXian_12` 十二步、各步含該大限四化與 `isCurrent`，供 EvolutionCalculator 使用。

### Phase 3: Block G - 雷達與透明計分 (Radar & Scoring)
- [x] **`ScoringRules`**：建立可匯出的透明計分結構（任務 C1 已清理死規則、數字頻次改計次）。
- [x] **`RadarBuilder`**：收集引擎結果並轉換為雷達圖/長條圖格式（含 `AxisNotes` 各軸資產/負債註記，任務 C1）。
- [x] **analyze() 接線 radars**（任務 C2）：RadarBuilder 結果已填入 `report.radars`，Schema v1 頂層欄位不變。
- [x] **圖表視覺化**（任務 C3）：整合 Chart.js，實作 `RadarChart`、`BarChart`，並保留 `TextFallback` 文字降級方案。

### Phase 4: Block H - 動靜分層與時期演化 (Layers & Evolution)
- [x] **`LayerClassifier`**：標註所有部件的所屬層級（L0恆定、L1慢變、L2年變、L3情境）。
- [x] **`StateSwitchTable`**（任務 D2）：實作五大情境切換表（初識、親密、衝突、低谷、工作），映射表可擴充、無來源情境明示「資料不足」。
- [x] **`EvolutionCalculator`**（任務 D4）：以八字大運與紫微大限為軸，計算各時期的雷達形狀變化與演化敘事（大運疊加規則 `bazi_element_balance_dayun`、大限四化重算宮強）。
- [x] **`HonestyGuard`**（任務 D1）：文字輸出守門員（L0 允許「你是」，L1/L2/L3 禁定性斷言；`analyze()` 已接誠實稽核）。
- [x] **進階 UI 整合**（任務 D5）：五情境狀態切換表與八字／紫微時期演化 timeline 已接入報告。

### Phase 5: UI 與前端整合 (Premium UI Integration)
- [x] **Design System**：已建立深色主題色票、玻璃態 CSS 與響應式圖表樣式。
- [x] **組件開發**：
  - `InputForm`（出生資料輸入）
  - `RadarPanel`（Block G 圖表展示區 + 計分規則展開）
  - `LayerTable` & `StateTable`（分層與情境切換表）
  - `EvolutionPanel`（時間軸演化展示）
- [x] **整合測試**：使用實際名人命盤進行交叉驗證。

---

## 🛠️ 技術決策備忘錄 (ADR)
- **為什麼捨棄後端？** 為了最大化本地部署的便利性，捨棄了需要後端 Swiss Ephemeris 的西洋占星與印度占星，專注於純前端能精確計算的系統（紫微斗數、靈數等）。
- **為什麼選擇 Vite？** 啟動極快、建置為純靜態檔案，無縫整合 ES Modules。
- **UI 框架**：不使用 React/Vue，使用 Vanilla JS 保持輕量，減少依賴，以便專案長久保存與維護。
