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

## D-017 命卦立春邊界：~~Feb-4 近似~~ → 精確立春 ✅（V1-08 已償還，2026-09-25）
原本以 2/4 為界。V1-08 起改用 `time/solarTerms.ts` 的精確立春時刻（`calculators/mingGua/mingGua.ts`），
出生時刻恰在立春時刻視為新年。
- BirthData 尚無時區，MingGuaEngine 暫以 UTC+8（Asia/Taipei）解讀民用時間，與 BaZiEngine 一致；
  改吃 TimeContext 後移除此假設（D-026）。
- 時間未知時以當地正午判定；若出生日正是立春當天，發出警告並設 `meta.boundaryAmbiguous: true`。
- 影響：每年 2/4 00:00 與精確立春之間（數小時到近兩天）出生者的命卦可能改變，其餘不變。

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

## D-027 星曆函式庫：Swiss Ephemeris（WASM）✅（2026-09-25 裁決）
Jyotish／Human Design 的行星位置、ayanamsa、月交點（Rahu/Ketu）一律由 Swiss Ephemeris 計算，
禁止自行推算。採 WASM 版，保持瀏覽器可執行（D-029）；星曆資料檔（.se1）隨 app 載入，
缺檔時退回內建 Moshier 模式並寫入 warnings。
授權：AGPL，本專案為非商業使用。注意 AGPL 的條件看的是「是否透過網路提供給他人使用」，
不是「是否商用」——若網站公開給他人使用，須同時公開原始碼（公開 repo 即滿足）。
Swiss Ephemeris 僅允許出現在 `calculators/jyotish`、`calculators/humanDesign` 與共用的 `calculators/astro` 模組（V2-01 起取代原訂的 `time/ephemeris`）。
- 套件（V2-01）：`@swisseph/browser@1.3.1`（Swiss Ephemeris 2.10.03 WASM，AGPL-3.0），版本鎖定。
  約 227 KB gzip，由 `initEphemeris()` 動態載入，不進首頁 bundle；初始化後全部同步呼叫。
- 目前使用內建 Moshier 星曆（行星 < 1″、月亮數角秒，1800–2200 足夠），尚未附 .se1 檔；
  計算器須在 warnings 帶 `ephemeris:moshier_fallback`。
- 太陽黃經回傳**視黃經**（J2000 = 280.369°，非平黃經 280.46°）；Lahiri ayanamsa 取含章動值。
- Vite dev 模式接入時預期需要 `optimizeDeps.exclude: ['@swisseph/browser']`。

## D-028 解讀以特徵權重資料表示，不 hardcode 定性文字 ✅
星曜、十神、宮位等只輸出 `traits { change, leadership, risk, ... }` 權重，存於版本化資料表；
宮位、旺陷（沿用 D-005 七級）、煞曜、四化等修正因子逐項記錄於 `signal.evidence.modifiers`。
程式碼中禁止出現「七殺＝壞」「貪狼＝桃花」這類定性對照。舊版本權重不可修改，只能新增版本，
確保舊報告可重現（延伸 D-014）。

## D-029 本地優先，資料庫與 AI 為選用上層 ✅
`packages/core` 必須能在瀏覽器內完整運作，不依賴伺服器或資料庫（延續 ROADMAPS 原則 1）。
帳號、`life_events`、回驗、AI 解讀屬於 V4／V5 的選用層。出生資料屬敏感個資：
伺服器端必須 RLS、可一鍵刪除；送給 AI 的 profile 必須去識別化（不含姓名與精確出生地標籤）。

## D-030 前端改寫：React + TypeScript、SVG 圖表、「通書」視覺 ✅（2026-09-25）
`apps/web` 由字串模板改為 React 19 + TypeScript。理由：報告區塊變多（V1 起加入 Timeline／signals），
字串拼接難以維護與測試；React 也讓 V3 評估 Next.js 時可直接沿用元件。
- 元件只讀 `model/selectors.ts` 產出的畫面資料，不直接翻 `engines[].components`；selectors 為純函式並有測試。
- 移除 Chart.js，改用自繪 SVG 雷達（含無障礙資料表），圖表與版面同一套 tokens，明暗主題不需重繪。
- 報告改為八章（命格／本年／領域／命盤／運程／情境／建議／方法），各系統命盤收進分頁；
  手機版頁長由約 18,000px 降到約 10,600px。列印時展開所有分頁與摺疊區塊。
- 視覺方向「通書」：宣紙底、墨色字、朱砂印章色；Chiron Sung HK（標題）、Noto Sans TC（內文）、
  霞鶩文楷（摘要）、Cormorant Garamond（數字）。規格見 `design-system/fortune-telling-platform/MASTER.md`。
- D-015（UI 只消費 Report）維持不變。

## D-031 時間層可使用 lunar-javascript（修訂 D-016）✅（2026-09-25）
D-016 規定 iztro／lunar-javascript 只能出現在 `engines/`。V1-02 TimeContext 需要精確節氣時刻與農曆，
因此放寬為：**`engines/`、`calculators/`、`time/` 可使用；`analysis/`、`signals/`、`timeline/` 仍禁止**。
- lunar-javascript 的節氣時刻為中國標準時間（UTC+8），`time/solarTerms.ts` 固定減 8 小時轉 UTC。
  驗證：立春 2026 = 2026-02-03T20:02:08Z；冬至 1999 與公開值 07:44 UT 相差 1 分鐘內。
- 套件沒有型別宣告，由 `src/types/lunar-javascript.d.ts` 以 any 宣告，呼叫端負責轉成強型別。
- TimeContext 的邊界容忍值（時辰 5／15／60 分、節氣 30／30／60 分，依 `timeAccuracy`）是匯出常數，屬資料而非寫死規則。

## D-032 Report Schema v4：TimeContext 進入 analyze()（2026-09-25）✅
依 D-012 升版條款，`REPORT_SCHEMA_VERSION` bump 至 4、函式庫 semver bump 至 0.4.0。v3 全部欄位與形狀保留，
只新增 `timeContext`、`signals`、`timeline` 三個頂層欄位（ARCHITECTURE-V2 §11；形狀見 ARCHITECTURE §4.3）。
`analyze()` 維持同步；jyotish／humanDesign 需要非同步星曆，一律不進 `analyze()` 的 timeline（`buildTimelineAsync` 另取）。
不新增 `meta`／`conventions` 頂層欄位：採用的時間約定寫在 `timeContext.conventions` 與各引擎 `meta.timeConvention`。
`signals` 取 timeline `topSignals` 的去重聯集（非全部訊號），控制報告大小（約 0.5 MB）。

**行為變更（償還 D-026 記錄的債務，刻意為之）：**
- **真太陽時預設開啟**：八字日／時柱、紫微時辰改以出生地真太陽時判定（`useTrueSolarTime: false` 可回到民用時）。
  例：台北 2026-02-15 13:03 → 真太陽時 12:55 → 時柱 壬午（v3：癸未）。
- **晚子時**：23:00–24:00 出生，紫微改用晚子（iztro timeIndex 12，同日），v3 誤用同日早子。
  新增 `ziHourConvention: 'early'`（子初換日：八字 sect=1、紫微次日早子）。
- **非 UTC+8 出生**：八字年／月柱以出生瞬間對精確交節瞬間判定，不再把外地牆鐘當成 UTC+8 比對節氣。
  例：紐約 2026-03-05 12:00（17:00Z，驚蟄 13:59Z 之後）→ 月柱 辛卯（v3：庚寅）。大運方向、干支與起運同步修正。
  同理修正台灣日治時期（UTC+9）與夏令時間出生的交節前後判斷。
- **一月流年**：`liuNian.year` 改為立春年。asOf 2027-01-15 → `{ year: 2026, ganZhi: '丙午' }`（v3 為 `{ 2027, 丙午 }`，年份與干支不一致）。
- **預設出生地**：未給 `birthplace`／`cityId`／經緯度時為台北市政府（121.5637°E, 25.0375°N），
  `input.longitude/latitude` echo 改為實際採用座標（v3 為 BirthData 預設 121.5/25.05）。
  舊 `longitude/latitude` 仍以 Asia/Taipei 民用時解讀；距 120°E 超過 15° 時標 warning——海外出生請改傳 `birthplace`／`cityId`。
- 八字 `elements.limitation` 在真太陽時模式下不再宣稱「未做真太陽時校正」。
- 命卦、靈數、Kin 不變（民用日期；命卦仍以民用時刻視為 UTC+8）。timeline 固定使用計算器預設（真太陽時、晚子），
  不跟隨 `useTrueSolarTime`／`ziHourConvention`（已知限制，需 timeline 開放 calculator config 才能修正）。

**隱私（D-029）：** `timeContext.profile` 不含姓名；保留出生地標籤供顯示。送 AI 的 payload 仍須移除 `input.name`
與 `birthplace.label`。

## D-033 跨系統分數維持「只平均有訊號的系統」，權重與切點待回驗再調 ✅（2026-09-25）
`aggregateSignals` 的跨系統分數只平均對該 `(domain, window)` 發出訊號的系統，沒發訊號的系統不算 0。
- 已知後果：只有一套系統觸及的領域，分數就等於該系統的強度；沒有系統觸及的領域為 0，
  因此逐年會跳動（例：移動 0 ↔ 50），不同領域間的分數也不可直接比較。UI 必須標示「未校準」。
- 不在沒有資料的情況下憑感覺改公式或權重。系統權重（目前皆 1）、四段切點（35／55／75）、
  是否把未發訊號系統計為 0，全部留到 V4 以 `life_events` 回驗後決定，調整只產生新版本（D-028）。

## D-034 Report Schema v5：跨系統共識摘要 `consensus`（V3，2026-09-25）✅
依 D-012 升版條款，`REPORT_SCHEMA_VERSION` bump 至 5、函式庫 semver bump 至 0.5.0（`VERSION`）。v4 全部欄位與形狀保留，
只新增頂層 `consensus = buildConsensus(timeline)`（形狀見 ARCHITECTURE §4.4；ARCHITECTURE-V2 §11）。
- **只重排、不另算**：共識數、高共識旗標、矛盾雙方都照抄 `aggregateSignals` 在 timeline 各格的判定（§6.1 第 3 步），
  `buildConsensus` 只補上「哪些系統」與「哪些 signal id」，並排序出 headlines。沒有新的分數公式或權重（D-033 不動）。
- **矛盾永不截斷**（D-023）：`headlines.conflicts` 列出全部年格的矛盾；`headlines.agreements` 只取最強的 5 筆，
  排序固定為 共識系統數↓、分數↓、DOMAINS 順序、年份，確保決定論。
- **覆蓋度 `coverage`**：每個領域 × 年／月格記錄「可發訊號的系統數（timeline.systems）／實際發訊號的系統數」。
  這是對 D-033 稀疏問題的**揭露**而非修正：UI 顯示「n／m 系統」，只有 1 個系統時註明分數即該系統強度，分數本身不變。
- 列出「達門檻系統」用的 θ 預設 0.5，必須與建 timeline 時的 θ 相同（timeline 目前不記錄 θ，由 `buildConsensus` 參數傳入並寫入輸出）。
- `analyze()` 仍為同步，`consensus` 因此只涵蓋八字／紫微／靈數（與 v4 timeline 相同）；jyotish／humanDesign 需以
  `buildConsensus(await buildTimelineAsync(ctx, { asOf }))` 取得。
- 已知限制：`packages/core/package.json` 的 `version` 欄位未同步（仍為 0.4.0；私有套件，公開版本以 `VERSION` 常數為準）。
