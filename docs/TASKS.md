# TASKS.md — 里程碑 B/C/D 任務分解

> 每個任務設計為可交給一個模型**獨立執行**。執行前必讀
> [HARNESS_SPEC.md](HARNESS_SPEC.md)（行為契約）、[ARCHITECTURE.md](ARCHITECTURE.md)
> （尤其 §4 Report Schema）、[DECISIONS.md](DECISIONS.md)。
> **依賴與整合順序**：本文件區分「硬性依賴」（功能前置，未完成不可開始驗收）與
> 「落地順序」（避免同檔案衝突，功能實作可在隔離分支並行）。詳見下方交付關卡。
> 失敗回報一律用 HARNESS_SPEC §四格式（首行 `## 任務 <ID> 失敗／停止`）。

---

## 交付關卡（安全依賴優先）

### 共通驗收規則（套用全部 11 項）

1. 全套 `npm test` 必須 0 fail；不得把「總測試數」寫成固定驗收值，新增測試不應使任務失敗。
2. 所有涉及時間的測試必須顯式傳入 `asOf`（D-014）；不得在 engine 或 analysis 測試中依賴今天。
3. 僅可修改各任務列出的檔案；若發現需要跨出範圍，先依 HARNESS_SPEC 回報
   `architecture-conflict`，不得自行擴張。
4. C2、D1、D2、D4 的 `tests/analyze.test.js` 必須斷言 Report 頂層欄位集合完全不變；
   只能填入 ARCHITECTURE §4 已存在的空殼，且僅將自己負責欄位的 `pending` 設為 `false`。
5. 交付回報必須附上實際 `npm test` 結果與本任務新增的契約斷言，不以口頭「應該可行」代替。

### 任務關係與落地順序

| 任務 | 硬性依賴 | 安全落地限制 | 解鎖 |
|---|---|---|---|
| B1 | — | 第一個落地 | B2、B3、C1 |
| B2 | B1 | 必須先於 B3 落地（共改 `BaZiEngine.js`） | D4 |
| B3 | B1 | 必須在 B2 後落地（共改 `BaZiEngine.js`） | D2 |
| C1 | B1 | 可與 D1、D3 並行 | D4、C2 |
| D1 | — | 在所有其他 `analyze.js` 寫入前落地 | D2、D4 |
| D3 | — | 可與 C1、D1 並行；需在 D4 前落地 | D4 |
| D2 | B3、D1 | `analyze.js` 先於 D4、C2 落地 | D5 |
| D4 | B2、C1、D1、D3 | `analyze.js` 在 D2 後、C2 前落地 | D5 |
| C2 | C1 | `analyze.js` 最後一個資料接線任務 | C3 |
| C3 | C2 | `ReportView.js` 先於 D5 落地 | D5 |
| D5 | C3、D2、D4 | 最後整合 UI | B/C/D 完成 |

**推薦落地序列**：`B1 → B2 → B3`；B1 後可平行完成 `C1`、`D1`、`D3`；
接著 `D2 → D4 → C2 → C3 → D5`。平行工作必須遵守上表的最終落地順序。

### 交接關卡

- **資料關卡**：B1、B2、B3、C1、D3 完成後，所有供 analysis 消費的 engine components
  都必須有固定 `asOf` 的黃金測試。
- **報告關卡**：D1、D2、D4、C2 每次落地都要驗證 Schema v1 的頂層欄位不變，並確認
  `honesty.violations` 對已填入內容為空。
- **介面關卡**：C3、D5 完成後，執行 `npm test`、`npm run build`，並以
  1991-10-05 14:00、女、明確 `asOf` 的案例在 375px 寬度手動驗收，確認 console 無錯誤。

---

## 任務 B1 — BaZiEngine 本命結構（L0）

**目標**：新增第 5 個引擎 BaZiEngine，輸出本命（L0）四類部件：
- `natal`：四柱（年/月/日/時的干支）
- `dayMaster`：日主（日干）＋其五行與陰陽
- `elements`：五行分佈 `{ counts: {木,火,土,金,水}, total, includesHiddenStems: true }`——
  天干、地支本氣與藏干均計入（供 `bazi_*_strength` 計分規則的 `woodCount/totalElements` 使用）
- `tenGods`：十神統計（相對日主，各十神出現次數，含天干與藏干）

使用 `lunar-javascript`（已在 dependencies）的 `Solar`/`Lunar`/`EightChar`。
繼承 `BaseEngine`，`id='bazi'`，`name='八字'`。分層規則已預埋於 LayerClassifier，不要動它。

**修改檔案**：
- 新增 `src/engines/BaZiEngine.js`
- 修改 `src/engines/index.js`（createEngines 加入 `new BaZiEngine({ asOf })`；barrel export）
- 修改 `src/index.js`（re-export BaZiEngine）
- 新增 `tests/bazi.test.js`
- 修改 `tests/analyze.test.js`（僅兩處：引擎數 4→5、ids 陣列加 `'bazi'`）

**禁止修改**：`src/core/**`、`src/analysis/**`、`src/ui/**`、`src/visualization/**`、
其他引擎檔、`docs/**`、`package.json`。

**驗收條件**：
1. `npm test` 全綠（不鎖定測試總數；既有斷言與本任務新增斷言都必須通過）。
2. `analyze()` 回傳 5 個引擎，bazi 零 `errors`、無 `unclassified` 部件。
3. 四柱黃金向量通過（見測試案例）。
4. `elements.counts` 五鍵齊全、總和 = `total`。

**測試案例**（至少）：
- 黃金向量（出處：lunar-javascript README 範例）：1986-05-29 →
  年柱 `丙寅`、月柱 `癸巳`、日柱 `癸酉`；日主 `癸`（水）。
- 1991-10-05 14:00 → 引擎零錯誤、components 含全部四個 category、
  十神次數總和 > 0。
- `elements` 藏干驗證：任選一柱，斷言藏干確實被計入（counts 總和 > 8，
  因為僅天干+地支本氣為 8）。

**失敗回報**：HARNESS_SPEC §四，ID=B1。

---

## 任務 B2 — BaZi 大運（L1 全序列）與流年（L2）

**目標**：BaZiEngine 增加時間層輸出：
- `daYun`（L1）：**全部大運步**，每步一個 component，
  value `{ index, ganZhi, startYear, endYear, startAge, isCurrent }`。
  `isCurrent` 依 `asOf` 判定，至多一步為 true（asOf 早於起運則全 false）。
  ⚠️ 必須輸出**完整序列**而非只有當前步——D4 EvolutionCalculator 依賴它（D-016）。
- `liuNian`（L2）：`asOf` 當年的流年干支 value `{ year, ganZhi }`。

**修改檔案**：`src/engines/BaZiEngine.js`、`tests/bazi.test.js`。

**禁止修改**：其餘一切（含 `tests/analyze.test.js`——若它壞了表示你改壞了引擎）。

**驗收條件**：
1. `npm test` 全綠。
2. daYun 部件數 ≥ 8；恰好 ≤1 步 `isCurrent`；各步 `startYear` 嚴格遞增且不重疊。
3. `asOf` 改變只影響 `isCurrent` 與 liuNian，不影響序列本身（決定論，D-014）。

**測試案例**（至少）：
- 1991-10-05 14:00 女、asOf=2026-07-11：liuNian ganZhi = `丙午`（2026 丙午年，
  可用 lunar-javascript 交叉驗證後寫死）。
- 同輸入、asOf=2030-01-01 vs 2026-07-11：daYun 序列逐步深比對相等（isCurrent 除外）。
- isCurrent 的那步滿足 `startYear ≤ asOf年 ≤ endYear`。

**失敗回報**：HARNESS_SPEC §四，ID=B2。

---

## 任務 B3 — BaZi 十神顯隱（L3 `tenGodsContext`）

**目標**：輸出 L3 情境部件 `tenGodsContext`：把 B1 的十神統計聚合成五個關係角色群
（官殺=權威場合、財星=資源/親密、食傷=表達/創造、印星=支持/學習、比劫=同輩競合），
每群 value `{ group, tenGods: string[], count, share, presence: '顯'|'隱' }`
（share=該群次數/十神總數；presence 依 share 是否 > 0 級距自訂並在 JSDoc 說明）。
語氣屬 L3——component `name` 與任何文字禁用「你是」句式。
分層規則 `bazi/tenGodsContext → L3` 已存在，不要動 LayerClassifier。

**修改檔案**：`src/engines/BaZiEngine.js`、`tests/bazi.test.js`。

**禁止修改**：其餘一切。

**驗收條件**：
1. `npm test` 全綠。
2. `analyze()` 後 `layers.byLayer.L3` 含 bazi 部件（與既有 ziwei L3 並存）。
3. 五群 share 總和 ≈ 1（±浮點誤差）。

**測試案例**：五群齊全；share ∈ [0,1]；分類後 layer === 'L3' 且非 unclassified。

**失敗回報**：HARNESS_SPEC §四，ID=B3。

---

## 任務 C1 — RadarBuilder ＋ 軸註記 ＋ 計分規則清理

**目標**：
1. 新增 `src/analysis/RadarBuilder.js`：純函數，吃 `SystemResult[]`，
   產出 `Radar[]`（形狀**逐字遵守** ARCHITECTURE §4.2）。首發三張：
   - `bazi_element_balance`（kind:'radar'，5 軸，%，資料來自 bazi `elements`）
   - `ziwei_palace_strength`（kind:'radar'，12 軸，分，公式=既有規則
     `ziwei_palace_strength`：主星亮度×0.6＋輔星數×10×0.2＋四化加成×0.2；
     加成定義：宮內含生年四化星 → 100，否則 0——請同步把該規則的
     description 更新成此定義）
   - `numerology_digit_frequency`（kind:'bar'，9 軸，次）
2. 新增 `src/analysis/AxisNotes.js`：每軸的 `assets[]/liabilities[]` 文字登錄表
   （五行 5 軸＋十二宮 12 軸＋數字 9 軸，各至少 1 資產 1 負債，語氣中性、
   禁「你是」句式——這些文字會出現在各層，措辭用「傾向/常見」）。
3. 清理 `src/analysis/ScoringRules.js`：
   - 移除 5 條 `personality_composite` 死規則（D-009）。
   - `numerology_digit_frequency` 規則改為次數：unit `次`、
     formula `digitOccurrences`、maxValue 8（yyyymmdd 8 位數）（D-011）。

**修改檔案**：新增 `RadarBuilder.js`、`AxisNotes.js`、`tests/radarBuilder.test.js`；
修改 `ScoringRules.js`、`tests/scoringRules.test.js`（若清理影響斷言）。

**禁止修改**：`src/core/**`、`src/engines/**`、`src/ui/**`、`src/visualization/**`。
（analyze 接線是 C2 的事——本任務不碰 Report。）

**驗收條件**：
1. `npm test` 全綠。
2. 每個 axis 的 `ruleId` 都能被 `ScoringRules.getRule()` 解析且非 null。
3. 每個 axis 的 `inputs` 帶實際代入值（可覆核）；`assets/liabilities` 非空。
4. 不做跨軸正規化：構造兩軸同值輸入，輸出兩軸同高（D-010）。

**測試案例**：五行雷達軸值總和 ≈ 100；已知輸入（1991-10-05）數字頻次 bar 軸值
= {1:3, 9:2, 5:1, 其餘:0}；personality_composite 規則已不存在
（`getRulesForRadar('personality_composite')` 為空）。

**失敗回報**：HARNESS_SPEC §四，ID=C1。

---

## 任務 C2 — analyze() 接上 radars

**目標**：`core/analyze.js` 呼叫 RadarBuilder，把結果填入 `report.radars`。
不新增欄位、不動其他欄位（D-012）。

**修改檔案**：`src/core/analyze.js`、`tests/analyze.test.js`（加 radars 斷言）。

**禁止修改**：其餘一切。

**驗收條件**：`npm test` 全綠；`report.radars.length ≥ 3`；每軸 ruleId 可解析；
`tests/analyze.test.js` 驗證 Report 頂層欄位集合完全不變、僅 `radars` 空殼被填入。

**測試案例**：radars 內含 id `bazi_element_balance`、`ziwei_palace_strength`、
`numerology_digit_frequency`；Report 頂層欄位集合與 A 驗收時完全相同。

**失敗回報**：HARNESS_SPEC §四，ID=C2。

---

## 任務 C3 — RadarChart / BarChart ＋ UI 接圖（並修 D-015 違例）

**目標**：
1. 新增 `src/visualization/RadarChart.js`、`BarChart.js`：Chart.js 轉接層，
   吃一個 `Radar` 物件＋canvas，使用既有 `ChartTheme.js` 的 build* helpers。
2. `ui/ReportView.js`：以 canvas 圖呈現 `report.radars`（radar→RadarChart、
   bar→BarChart），文字長條（TextFallback）改為 `<details>` 降級保留；
   每張雷達下方列出各軸計分規則（資料來源 `report.scoringRules`，**移除**
   `import { ScoringRules }`——修復 D-015 違例）；高佔比軸（≥60%）並列
   assets/liabilities。

**修改檔案**：新增 `RadarChart.js`、`BarChart.js`；修改 `src/ui/ReportView.js`。

**禁止修改**：`src/core/**`、`src/engines/**`、`src/analysis/**`、`src/index.js`、
`src/main.js`、`tests/**`（視覺層以手動驗收為主；若加測試放 `tests/visualization.test.js`）。

**驗收條件**：
1. `npm test` 全綠。
2. `npm run dev` → 填 1991-10-05 14:00 女 → 報告出現 3 張 canvas 圖、
   console 零錯誤。
3. `npm run build` 成功；`src/ui/**` 無任何 `analysis/` 或 `engines/` import
   （D-015 修復證明）。

**測試案例**（手動）：切視窗寬度 375px 圖不溢出；`<details>` 展開可見文字長條。

**失敗回報**：HARNESS_SPEC §四，ID=C3。

---

## 任務 D1 — HonestyGuard（區塊 H④）

**目標**：新增 `src/analysis/HonestyGuard.js`：
- `lint(text, layerCode) → { ok, problems: string[] }`：
  L1/L2/L3 文字含定性斷言模式（「你是」「你天生」「注定」「永遠」等，
  模式表要可擴充並匯出）→ 違規；L0 允許「你是」。
- `auditReport(report) → Violation[]`（形狀見 ARCHITECTURE §4.2）：
  掃 `stateTable.scenarios[].cells[].expression`、`evolution.periods[].summary`、
  `evolution.narrative`（空殼時回傳 []）。
- `core/analyze.js`：組完 Report 後跑 audit，填 `honesty.violations`、
  `honesty.pending = false`。

**修改檔案**：新增 `HonestyGuard.js`、`tests/honestyGuard.test.js`；
修改 `src/core/analyze.js`、`src/index.js`（export HonestyGuard）、
`tests/analyze.test.js`（honesty.pending === false）。

**禁止修改**：其餘一切。

**驗收條件**：`npm test` 全綠；Report 頂層欄位集合完全不變，僅 `honesty.pending`
設為 `false`；空殼 Report 的 violations === []；
lint 對「這段時期你是領導者」(L2) 回報違規、對「你是七殺坐命」(L0) 放行。

**測試案例**：每層各 ≥2 正例 2 反例；Violation 形狀四欄齊全。

**失敗回報**：HARNESS_SPEC §四，ID=D1。

---

## 任務 D2 — StateSwitchTable（區塊 H②）

**目標**：新增 `src/analysis/StateSwitchTable.js`：吃 `LayerClassification`，
產出 5 固定情境（id/name 見 ARCHITECTURE §4.2 Scenario）。
映射表（可擴充、要匯出）：`soulVsBody`→初識/工作；`sanFangSiZheng`→衝突/工作；
`tenGodsContext`（各群依語意）→親密/衝突/工作/壓力低谷。
每格 `sources` ≥1、`hypothesis: true`、expression 用「在…情境下你會傾向…」模板
且**必須通過 HonestyGuard.lint(text,'L3')**。無來源部件的情境
`insufficientData: true`、cells 空（D-008：禁止編故事）。
`core/analyze.js` 接線：`stateTable.scenarios` 填入、`pending = false`。

**修改檔案**：新增 `StateSwitchTable.js`、`tests/stateSwitchTable.test.js`；
修改 `src/core/analyze.js`、`src/index.js`、`tests/analyze.test.js`。

**禁止修改**：`src/engines/**`、`src/ui/**`、`src/visualization/**`、
`LayerClassifier.js`、`ScoringRules.js`、`HonestyGuard.js`。

**驗收條件**：`npm test` 全綠；Report 頂層欄位集合完全不變，僅
`stateTable.pending` 設為 `false`；恰好 5 個 scenario、id 固定；
`analyze()` 全報告 `honesty.violations === []`（自產文字不得違規）；
每個非空 cell 的 sources 都指向真實存在的 component id。

**測試案例**：1991-10-05 案例至少 3 情境有 cells；斷開 bazi（用只含 ziwei 的
輸入陣列）時「親密關係穩定期」insufficientData === true。

**失敗回報**：HARNESS_SPEC §四，ID=D2。

---

## 任務 D3 — ZiweiEngine 大限全序列（供演化用）

**目標**：ZiweiEngine 的 `daXian` 從「只有當前」改為**全部大限序列**：
每個大限一個 component（id `daXian_<index>`，category 仍為 `daXian`），
value `{ index, palaceIndex, palaceName, range: [起虛歲, 迄虛歲], heavenlyStem,
earthlyBranch, mutagen（該大限四化）, isCurrent }`。
大限四化：對每個大限範圍內任一日期呼叫 `astrolabe.horoscope()` 取 `decadal.mutagen`。
移除舊的單一 `daXian_current` component（category/分層不變，LayerClassifier 不動）。

**修改檔案**：`src/engines/ZiweiEngine.js`、`tests/engines.test.js`（daXian 斷言）。

**禁止修改**：其餘一切。

**驗收條件**：`npm test` 全綠；daXian 部件 = 12；恰一個 isCurrent
（asOf=2026-07-11、1991 案例）；各 range 遞增不重疊；全部在 L1。

**測試案例**：isCurrent 那步的 range 含虛歲 36；每步 mutagen 為 4 元素陣列。

**失敗回報**：HARNESS_SPEC §四，ID=D3。

---

## 任務 D4 — EvolutionCalculator（區塊 H③）

**目標**：新增 `src/analysis/EvolutionCalculator.js`：吃 `SystemResult[]`＋asOf，產出
`{ periods: Period[], narrative: string }`（形狀 §4.2）：
- 八字：本命 `elements.counts` → 每步大運把大運干支各計 1.0 疊加 → 每十年一張
  五行雷達（重算佔比）。可註冊新計分規則 id `bazi_element_balance_dayun`
  （formula 寫明疊加法）於 ScoringRules。
- 紫微：每個大限把 `ziwei_palace_strength` 的四化加成改用**該大限 mutagen**
  重算 12 宮 → 每十年一張宮強雷達。
- 每個 Period：`summary` 恰兩行（模板產生，**過 HonestyGuard.lint(text,'L1')**）；
  最後 `narrative` 一段整體演化敘事（同樣過 L1 lint）。
- `core/analyze.js` 接線：`evolution` 填入、`pending = false`。

**修改檔案**：新增 `EvolutionCalculator.js`、`tests/evolution.test.js`；
修改 `src/core/analyze.js`、`src/index.js`、`src/analysis/ScoringRules.js`
（僅新增規則，不改既有）、`tests/analyze.test.js`。

**禁止修改**：`src/engines/**`、`src/ui/**`、`RadarBuilder.js`、`HonestyGuard.js`。

**驗收條件**：`npm test` 全綠；Report 頂層欄位集合完全不變，僅
`evolution.pending` 設為 `false`；bazi periods 數 = daYun 步數、ziwei periods = 12；
每 Period.radar 軸 ruleId 可解析；全報告 `honesty.violations === []`。

**測試案例**：任一步大運疊加後，該干支對應五行的軸值 ≥ 本命同軸值
（單調性 sanity）；summary 長度恰 2。

**失敗回報**：HARNESS_SPEC §四，ID=D4。

---

## 任務 D5 — UI：狀態切換表 ＋ 時期演化面板

**目標**：`ReportView.js`（可拆 `ui/StateTablePanel.js`、`ui/EvolutionPanel.js`）
呈現 `report.stateTable`（用既有 `.state-table*` class；每格顯示來源部件 chip
＋「⚠️待驗證」；insufficientData 顯示「資料不足」空狀態）與 `report.evolution`
（`.timeline*`／`.decade-*`／`.evolution-*` class；每十年雷達可用 RadarChart 或
文字降級）。移除 ReportView 的「待完成區塊」佔位。

**修改檔案**：`src/ui/ReportView.js`、（可新增）`src/ui/StateTablePanel.js`、
`src/ui/EvolutionPanel.js`。

**禁止修改**：`src/core/**`、`src/engines/**`、`src/analysis/**`、`tests/**`。

**驗收條件**：`npm test` 全綠；`npm run build` 成功；`npm run dev` 手動驗收：
狀態表 5 情境齊、資料不足者顯示空狀態、演化 timeline 可見、console 零錯誤；
`ui/` 無 analysis/engines import。

**測試案例**（手動）：375px 寬度不橫向溢出；每格能看到來源部件標註。

**失敗回報**：HARNESS_SPEC §四，ID=D5。
