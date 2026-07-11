# DECISIONS.md — 架構決策記錄（ADR）

> 規則：每條決策有編號、狀態、理由。**執行任務的模型遇到與本文件衝突的情況，
> 必須在此新增一條「狀態：衝突待裁決」的記錄並停止該任務**（見 HARNESS_SPEC.md）。
> 狀態：✅ 已定案｜⚠️ 衝突待裁決｜🗑 已廢止

---

## D-001 可重用核心函式庫（2026-07-11）✅
`core / engines / analysis / visualization` 為框架無關 ES module；`ui` 只是消費者。
唯一公開 API 是 `src/index.js`（package.json `exports` 鎖定）。深路徑 import 不受 semver 保護。

## D-002 系統子集：5 系統，印占/西占/人類圖只留接縫 ✅
紫微／靈數／命卦／Kin／八字。LayerClassifier 與 ScoringRules 中的 vedic/humandesign
規則是**接縫（seam）**，不是待辦——沒有對應引擎前不得產生輸出。

## D-003 型別策略：JSDoc + `jsconfig.json` checkJs ✅
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

## D-009 雷達策略：每系統一張，不做跨系統合併雷達 ✅
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

## D-013 執行環境：Node ≥22 為準，Bun 為可選加速 ✅
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

## D-017 命卦立春邊界：Feb-4 近似 ✅（已知精度債）
未用精確節氣時刻。`BirthData.solarTermInfo` 已有資料可日後精修；
生於 2/3–2/5 的使用者結果需標註不確定性。暫不排任務。

## D-018 B3 十神顯隱採三態與可稽核明細 ✅
tenGodsContext 的 presence 採「顯／隱／無」三態。
顯以四柱外顯天干判定，隱以地支藏干判定，完全未出現為無。
每群額外輸出 visibleCount、hiddenCount、breakdown、observedTenGods 與 context。
B1 原始 tenGods 統計維持不變。
