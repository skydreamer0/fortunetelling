# DECISIONS.md — 架構決策記錄（ADR）

> 規則：每條決策有編號、狀態、理由。**執行任務的模型遇到與本文件衝突的情況，
> 必須在此新增一條「狀態：衝突待裁決」的記錄並停止該任務**（見 HARNESS_SPEC.md）。
> 狀態：✅ 已定案｜⚠️ 衝突待裁決｜🗑 已廢止

---

## D-001 可重用核心函式庫（2026-07-11）✅
`core / engines / analysis / visualization` 為框架無關 ES module；`ui` 只是消費者。
唯一公開 API 是 `src/index.js`（package.json `exports` 鎖定）。深路徑 import 不受 semver 保護。

## D-002 系統子集：5 系統，印占/西占/人類圖只留接縫 🗑（由 D-022 取代）
紫微／靈數／命卦／Kin／八字。LayerClassifier 與 ScoringRules 中的 vedic/humandesign
規則是**接縫（seam）**，不是待辦——沒有對應引擎前不得產生輸出。

## D-003 型別策略：JSDoc + `jsconfig.json` checkJs 🗑（由 D-024 取代）
不遷移 TypeScript。所有公開函式必須有完整 JSDoc typedef。

## D-004 Dreamspell Kin 錨定：1987-07-26 = Kin 34 ✅
可重現 Argüelles Kin 11 與線上計算機值。業界另一慣例（=Kin 1）視為可設定約定，暫不提供開關。

## D-005 紫微亮度七級制，單一出處 ✅（審計偏差 2 修正）
權重表唯一出處為 `ZiweiEngine.BRIGHTNESS_WEIGHTS`（廟7/旺6/得5/利4/平3/不2/陷1，÷7 正規化）。
`ScoringRules` 的 `ziwei_star_brightness` 公式必須與之一致（min 14%、max 100%）。
回歸測試：`tests/scoringRules.test.js`。**禁止任何模組另建亮度對照表。**

## D-006 antardasha 屬 L2 年變層 ✅（審計偏差 1 修正）
印占中運以年為尺度，規格明定 L2。接縫規則已修正。

## D-007 未知部件保守歸 L3 + `unclassified` 標記 ✅（審計偏差 4 修正）
沒有分類規則的部件**絕不**進 L0（「你是」為最強斷言，違反誠實條款風險方向）。
fallback = L3（語氣最弱）+ `unclassified: true`，並收錄於 `classification.unclassified`。
正確做法永遠是補規則，fallback 只是安全網。

## D-008 L3 由紫微（命宮vs身宮、三方四正）與八字（十神顯隱）支撐 ✅（審計偏差 3 修正）
`ziwei/soulVsBody`、`ziwei/sanFangSiZheng`（已實作）、`bazi/tenGodsContext`（規則已預埋，
引擎輸出在任務 B3）。西占/人類圖的 L3 部件缺席是**已知且明示的侷限**，
StateSwitchTable 遇到無資料的情境必須標「資料不足」，禁止編故事。

## D-009 雷達策略：每系統一張，不做跨系統合併雷達 ✅（D-023 補充：跨系統只在 signals 層）
不同系統尺度本質不同，合併會誤導。`ScoringRules` 中 5 條 `personality_composite`
（cross_leadership 等）依賴永不存在的 vedic/humandesign 輸入，屬死規則——
**排定於任務 C1 移除**。在那之前不得被任何 RadarBuilder 引用。

## D-010 雷達正規化：每軸獨立 0–100%，允許多軸同高 ✅
不做跨軸 softmax（會強制競爭、違反「佔比非優劣」）。五行/頻次類軸天然是佔比；
亮度/宮強類軸相對自身理論上限。每軸必須帶 `ruleId` 指向 ScoringRules。

## D-011 靈數頻次單位：次數（長條），不是百分比 ✅
規格要求「出現次數長條」。`numerology_digit_frequency` 規則現為百分比公式，
**排定於任務 C1 修正**（unit 改「次」，formula 改 digitOccurrences）。

## D-012 Report Schema v1 凍結（2026-07-11）✅
`REPORT_SCHEMA_VERSION = 1`。欄位形狀見 ARCHITECTURE.md §4。
里程碑 C/D 只能**填入既有空殼**（radars 陣列、stateTable.scenarios、evolution.periods、
honesty.violations）並把對應 `pending` 翻成 `false`；**新增/改名/刪除頂層欄位一律禁止**，
需要時必須先在本文件開新決策並 bump schemaVersion。

## D-013 執行環境：Node ≥22 為準，Bun 為可選加速 🗑（由 D-025 取代）
機器未裝 Bun，不做全域安裝。測試一律寫 `node:test` 格式：
- `npm test` → `node --test`（權威，CI 以此為準）
- `npm run test:bun` → `bun test`（可選，需 Bun ≥1.2 其 node:test 相容層）
計畫書「執行環境改用 Bun 加速」降級為：**Bun 是可選最佳化，不是相依**。
純 JS 依賴（iztro/lunar-javascript/chart.js）兩個 runtime 皆可跑。

## D-014 asOf 決定論規則 ✅
`analyze()` 的 `asOf` 預設今天是為了 UX；**所有測試與可重現場景必須顯式傳 `asOf`**。
引擎內任何「當前時間」都必須來自 asOf，禁止在 engine/analysis 層直接 `new Date()` 取今天
（唯一例外：`generatedAt`/`computedAt`/`classifiedAt`/`exportedAt` 時間戳）。

## D-015 UI 只消費 Report（已知一處技術債）✅
`ui/` 不得 import `analysis/` 或 `engines/`。現況 `ReportView.js` 直接 `new ScoringRules()`
產生透明度報告——**已知違例**，排定於任務 C3 改為讀 `report.scoringRules`。
在 C3 之前不得新增同類違例。

## D-016 演化資料由引擎供給，analysis 不碰命理函式庫 ✅
iztro / lunar-javascript 只允許在 `engines/` 出現。EvolutionCalculator 需要的
「全部大限/大運序列」必須由引擎以 components 形式輸出（任務 B2、D3），
analysis 層只做聚合計算。這保持 analysis 可獨立測試、可被替換。

## D-017 命卦立春邊界：Feb-4 近似 ✅（已知精度債，V1 由 D-026 TimeContext 償還）
未用精確節氣時刻。`BirthData.solarTermInfo` 已有資料可日後精修；
生於 2/3–2/5 的使用者結果需標註不確定性。暫不排任務。

## D-018 B3 十神顯隱採三態與可稽核明細 ✅
tenGodsContext 的 presence 採「顯／隱／無」三態。
顯以四柱外顯天干判定，隱以地支藏干判定，完全未出現為無。
每群額外輸出 visibleCount、hiddenCount、breakdown、observedTenGods 與 context。
B1 原始 tenGods 統計維持不變。

## D-019 Report Schema v2 新增可追溯白話摘要（2026-07-18）✅
依 D-012 的升版條款，`REPORT_SCHEMA_VERSION` bump 至 2，函式庫 semver bump 至 0.2.0。
唯一新增的頂層欄位為 `summary`；每句摘要必須引用真實 engine component，資料不足時略過，
禁止補寫。現有五行資料只代表出現次數，因此摘要不得宣稱旺衰、喜用神或吉凶。
Schema v1 其餘欄位與元素形狀保持不變。

## D-020 Report Schema v3 與獨立合盤契約（2026-07-18）✅
`REPORT_SCHEMA_VERSION` bump 至 3、函式庫 semver bump 至 0.3.0。單人 Report 新增
`insights`，正式承載四大人生領域、本年觀察及非決定論的平衡建議；所有敘事需引用
既有部件或明示資料不足，五行出現次數不得冒充旺衰／喜用神。

雙人比較由獨立的 `analyzeCompatibility()` 與 `COMPATIBILITY_SCHEMA_VERSION = 1`
守護，不混入單人 Report。五行互補定義為雙方平均分布接近每元素 20%，摩擦只表示
雙方共同過度集中；公式隨結果匯出，且不得將分數解讀為關係成敗。

---

# v2 架構決策（2026-09-25，對應 [ARCHITECTURE-V2.md](ARCHITECTURE-V2.md)）

## D-021 計算與解讀完全分離 ✅
排盤、規則、訊號、時間軸全部由 `packages/core` 確定性計算；AI 只讀這些 JSON 做解讀。
`core` 不得呼叫 LLM；`packages/ai` 不得 import 命理函式庫或計算器。AI 輸出必須引用
`signal.id`，並經程式後驗證（引用存在、干支／星名存在於輸入、HonestyGuard），
未通過的段落直接丟棄。理由：避免 AI 把八字、紫微、人類圖算錯（幻覺）。

## D-022 系統範圍擴充為 6 + 1（取代 D-002）✅
八字、紫微、Numerology、Tzolkin（沿用 Dreamspell 引擎）、Jyotish、Human Design，
另保留命卦（既有、成本低，不參與 V1 以後新增的規則引擎，但仍可輸出 components 與 signals）。
Jyotish／Human Design 在 V2 實作；在引擎存在之前，D-002 的「接縫不得產生輸出」規則仍然適用。

## D-023 跨系統彙整只存在於 signals 層（補充 D-009）✅
雷達仍是每系統一張、不合併。跨系統比較一律透過 `Signal { domain, trait, intensity, valence, window }`：
系統內先用 noisy-OR 合併（避免規則多的系統壓過別人），再跨系統加權平均；
≥3 系統同向標「高共識」；方向相反標 `conflict` 並列出雙方來源，**禁止平均抵銷**。

## D-024 型別策略：新程式碼用 TypeScript（取代 D-003）✅
`packages/core` 啟用 TypeScript（`allowJs` + `checkJs` 漸進遷移）。既有 JS 檔搬遷時不強制改寫，
修改到的檔案優先轉 `.ts`。公開 API 必須有完整型別。Bun 可直接執行 TS，不需額外建置步驟跑測試。

## D-025 執行環境：Bun 為權威 runtime（取代 D-013）✅
與 `.agents/AGENTS.md`（commit 80cfbaf）一致：安裝、測試、建置、dev 一律用 `bun`
（`bun install`／`bun test`／`bun run build`／`bun run dev`）。採 Bun workspaces 管理
`packages/*` 與 `apps/*`。`core` 仍須保持可在瀏覽器與 Node 執行（不得使用 Bun 專屬 API）。

## D-026 時間標準化層是唯一時間來源 ✅
所有 calculator 只接受 `TimeContext`，**禁止**各自做時區、DST、真太陽時或節氣換算。
時區一律存 IANA 名稱，歷史 DST（例如台灣 1945–1979）交給 tzdata，禁止手寫 DST 表。
時辰／節氣交界、早晚子時、DST 缺口或重疊都要以 `flags` 明示；落在邊界容忍範圍內時兩盤並算，
不替使用者選邊。各系統採用的時間約定是顯式 config（見 ARCHITECTURE-V2 §3.4）。
現行 BaZiEngine 的「固定 Asia/Taipei、不做真太陽時」是已知債務，V1 償還。

## D-027 星曆函式庫選擇 ⚠️ 衝突待裁決
Jyotish／Human Design 需要精確行星位置，禁止自行推算。候選方案：
- **A. Swiss Ephemeris（WASM 版）**：業界標準、內建 ayanamsa／交點。**AGPL 授權**：
  公開網站使用必須開源全部程式碼，否則需購買商業授權。
- **B. astronomy-engine（MIT）**：純 JS、體積小、精度對命理用途足夠；Lahiri ayanamsa、
  Rahu/Ketu（月交點）需要自行實作並用公開計算器交叉驗證。
- **C. 伺服器端 Swiss Ephemeris + 商業授權**：精度最佳，但破壞本地優先（D-029）且有授權費。
建議 B（授權乾淨、符合本地優先），但需使用者在 V2 開始前裁決。

## D-028 解讀以特徵權重資料表示，不 hardcode 定性文字 ✅
星曜、十神、宮位等只輸出 `traits { change, leadership, risk, ... }` 權重，存於版本化資料表；
宮位、旺陷（沿用 D-005 七級）、煞曜、四化等修正因子逐項記錄於 `signal.evidence.modifiers`。
程式碼中禁止出現「七殺＝壞」「貪狼＝桃花」這類定性對照。舊版本權重不可修改，只能新增版本，
確保舊報告可重現（延伸 D-014）。

## D-029 本地優先，資料庫與 AI 為選用上層 ✅
`packages/core` 必須能在瀏覽器內完整運作，不依賴伺服器或資料庫（延續 ROADMAPS 原則 1）。
帳號、`life_events`、回驗、AI 解讀屬於 V4／V5 的選用層。出生資料屬敏感個資：
伺服器端必須 RLS、可一鍵刪除；送給 AI 的 profile 必須去識別化（不含姓名與精確出生地標籤）。
