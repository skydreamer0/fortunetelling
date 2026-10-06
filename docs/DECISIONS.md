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
  不跟隨 `useTrueSolarTime`／`ziHourConvention`（當時的已知限制；2026-10-06 由 D-040 修正）。

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
- `packages/core/package.json` 的 `version` 已同步為 0.5.0。

## D-035 AI 解讀的執行位置：複製 prompt 到使用者自己的 AI ✅（2026-09-25）
> 註記：V5-06（BYOK 呼叫模型）由 D-036 取代；複製 prompt 保留為備援。
`apps/web` 是 GitHub Pages 靜態站，不得內嵌任何 API key，也不架伺服器。**決定：網站不呼叫任何模型**，改為組出一段
自足的 prompt，由使用者複製、貼到自己慣用的聊天 AI（ChatGPT、Claude、Gemini…）。沒有金鑰、沒有伺服器、資料要不要送出由使用者決定（D-029）。
- **組 prompt**：`@fortune/ai` 的 `buildCopyPrompt(report, { question?, questionAnswer?, focus?, maxChars = 24000 })`，
  純函式、決定論（`copy-v1`）。內容依序：(a) 由 ARCHITECTURE-V2 §9 系統指令改寫的角色與規則（只用資料、禁止重新排盤、
  每個重要結論引用〔sig_…〕、三套以上系統同向才說「高共識」、保留矛盾、時間性內容是傾向不是命定、分數未校準（D-033）、
  資料無法回答就直說）；(b) 輸出格式（總覽／本年與未來五年／各領域／共識與分歧／問題的回答／資料限制）；
  (c) 去識別化資料：沿用 `buildInterpretationPayload`，以聊天長度為預算，依序精簡命盤細節、逐月資料，並先丟強度最低的訊號，
  prompt 內明寫省略了什麼；(d) 使用者的問題，以及（若關鍵字對應到問事目錄）網站本地以 `answerQuestion` 算出的月份排名，
  標明「確定性計算，不是 AI 產生」。問題的分類只用關鍵字比對，不用 AI。
- **後驗證**：網站攔截不到外部 AI 的輸出，所以後驗證改為**建議性**的「貼回檢查」：`checkPastedAnswer(payload, text)`
  逐段標示「引用不存在」「提到資料中沒有的干支／星曜／行星」「沒有引用來源」「宿命論用語」（重用 `vocab`／HonestyGuard／
  `validate` 的規則），只提示、不刪改。`validateSections` 的強制後驗證仍適用於日後由程式呼叫模型的路徑。
- **瀏覽器端不含 SDK**：網站只 import `@fortune/ai/copy`（`copyPrompt`＋`pasteCheck`），建置產物不得含 `@anthropic-ai`。
- **日後仍可加**：Serverless 代理（函式持有 key，只收去識別化 payload，伺服器端組固定 prompt、`validateSections`、快取、限流）
  或 BYOK（使用者自備 key、只存 `sessionStorage`）都可以直接用 `@fortune/ai` 的 `interpret()`；皆為選用層（D-029）。
  程式呼叫時預設模型 `claude-fable-5-1`（可用 `{ model }` 覆寫）。

## D-036 方向校正：程式先算完，AI 在本機對話中經 MCP 按需查詢與比對 ✅（2026-09-30，已確認）
細節見 [HISTORY.md](HISTORY.md)。**決定**：程式先把能邏輯化的部分全部算完（排盤、規則、訊號、共識、時間軸），
AI 在使用者本機的對話（Claude 桌面版）中，經本機 MCP server 按需查詢、跨系統比對、下結論；不需要 API key，也不需要伺服器。
- **MCP 只包裝 core、不重算**：工具直接重用 `analyze`／`buildTimeline`／`buildConsensus`／`answerQuestion`／`analyzeCompatibility`，
  不自行實作第二套邏輯；工具輸出有大小上限，明細（evidence／modifiers）按需取。
- **修訂 ARCHITECTURE-V2 §0 的「AI 只讀結果做解讀」**：AI 不再只是被動讀一份靜態結果，而是可以主動查詢與比對已算好的結果。
  **修訂 D-021 的措辭**：D-021 中「AI 只讀結果」的說法改為「AI 可經工具查詢結果」。
- **D-021 的核心規則仍成立**：core 不得呼叫 LLM；AI 不得重新排盤、不心算。
- **取代 V5-06**：網站內直接呼叫模型（BYOK）取消；D-035 的複製 prompt 保留為沒有桌面版時的備援。
- D-033 不動：分數仍未校準，回應的 `caveats` 必須讓 AI 知道。

## D-037 Profile 契約：`profileId`、`chartFingerprint`、canonical serializer、stateless MCP ✅（2026-09-30，已確認）
避免 MCP、網站匯出、測試各自產生不同格式（ROADMAPS M0.5）。
- **`profileId`**：使用者命名的穩定 slug（如 `sky`），**不是內容雜湊**——改一個時辰不應換掉「這個人」。
- **`chartFingerprint`**：規範化出生欄位的雜湊，是內容識別；供人生事件等「依命盤」的資料當 key（沿用 `lifeEvents` 現況）。
- **canonical serializer**：鍵序固定，排除 `generatedAt` 等非決定性欄位；MCP、網站匯出、測試共用同一份，確保同一
  `profile + asOf + config + 規則版本` 產生相同的 canonical payload。
- **MCP 為 stateless**：沒有「目前載入哪個人」，每次呼叫都帶 `profileId`；所有時間相關工具顯式帶 `asOf`（延續 D-014）。
- **橋接方式**：網站以 `.fortune.json` 匯出，MCP 讀固定的 profiles 目錄（或 `import_profile`）；**不假設網站能寫本機任意檔案**。
- 每份輸出帶版本資訊：`coreVersion`、`profileSchemaVersion`、規則／catalog version、`asOf`、ephemeris 狀態。

## D-038 隱私分兩層：本機 profile 完整，進入 AI 對話的資料去識別 ✅（2026-09-30，已確認）
延伸 D-029。工具結果一被使用就進了 AI 上下文，所以分兩層處理。
- **本機 profile**：保留完整資料（姓名、生日、出生地）。
- **進入 AI 對話的工具結果**：**姓名預設不回傳**；以 `profileId` 與 derived data 為主，原始出生資料只在明確需要時由工具提供。
- **匯出分兩種 preset**：`local-full`（完整資料）與 `share-redacted`（移除姓名與非必要出生地標籤）。
- **去識別化單一來源**：`share-redacted` 與 `packages/ai` 的 `buildInterpretationPayload` 共用同一份去識別化邏輯，不另寫一套。

## D-039 未驗證系統標 `experimental`，交叉驗證後才升級 ✅（2026-09-30，已確認）
Jyotish 與 Human Design 的 calculator 與 `rules.ts` 已存在，但尚未與公開計算器交叉驗證，且不在 `CALCULATORS` registry／同步 `analyze()` 內。
- **驗證門檻**：與至少兩個公開計算器交叉驗證、至少 20 個案例，才可視為已驗證。
- **驗證前**：標 `experimental`；MCP 回應附 `verified: false` 與 caveat，不與已驗證系統用相同信心標示，也不因此當作高共識的一票而不加說明。
- **驗證後**：才正式納入 public API／registry，並明確 sync／async 行為邊界。
- M1（MCP）不被此驗證阻塞。
- **2026-10-05 落實（M5-03）**：人類圖（38 案、兩個公開產生器）達門檻，升級為已驗證：不再標 `experimental`，計入高共識的「三套已驗證」；仍因需要星曆而不進同步 `CALCULATORS`，改列 `EPHEMERIS_CALCULATORS`（含 `verified` 旗標）。吠陀占星未達門檻，維持 `experimental`。算法有「與公開來源一致」的證據，不等於預測有效性已驗證（D-033 分數未校準仍成立）。

## D-040 主報告與時間軸共用有效時間選項（2026-10-06，#26 首包）

**問題與證據：** `analyze()` 已正規化真太陽時與子時選項，但 `buildSyncTimeline` 沒有傳下去，
`prepareSystems` 重新排盤只帶 `asOf/name`，非預設報告因此混用不同本命盤。
PR #37 的 tests-only commit `ceebfca3853554afa4c49c1e741da78935d9d5cd` 由既有 Bun CI 重現：
[run 37424848501](https://github.com/skydreamer0/fortunetelling/actions/runs/37424848501)，1196 pass／2 skip／20 fail。
民用／真太陽時跨時辰與 23:00 民用早子案在訊號 ID 比對即失敗；明確預設值與原 golden 通過。

**決定：**
- `analyze → buildSyncTimeline → buildTimeline` 傳同一份已正規化 `AnalysisTimeOptions`。
- `TimelineOptions` 開放 `useTrueSolarTime` 與 `ziHourConvention`（八字 `late/early`）；未提供仍為 `true/late`。
- 八字使用 `late`（sect=2）／`early`（sect=1）；紫微必須經既有 `toZiweiZiConvention` 映射為
  `splitMidnight`／`nextDayAt23`。這是各計算器既有輸入契約的映射，不表示兩套系統的命理語義完全相同。
- 主報告的 `timeContext.conventions.timeline` 記有效 clock 與逐系統子時值，`followsOptions: true`。
- 八字 timeline 仍讀 typed `chart`，不把保留民用時相容用途的 legacy `components` 當唯一真值。
- 同步 `analyze` 的星曆排除契約不變；直接同步／非同步 timeline 在相同指定系統與選項下應一致。

**版本與封存：** core `0.5.0 → 0.5.1`，Report schema 仍為 5，calculator／catalog 版本不變（算法未改）。
舊 `reportGolden.json`、舊匯出 golden 與已封存預測不重寫；新結果以精確版本差異逐項驗證。
`LOCKED FORECAST V1 2026-10-03` 的既有年分、命中與內容不得因本次重算而改寫。
非預設 early+civil fixture 的 timeline／signals／consensus 差異須以 CI 實際結果記錄，不以全量重錄掩蓋。

**實測差異（修補 commit `7b7764ff62abdcc095b9fd919f993400bad02f10`）：**
[run 37425777507](https://github.com/skydreamer0/fortunetelling/actions/runs/37425777507) 的 21 個新回歸全通過，
整體 1214 pass／2 skip／2 fail，剩下兩項只因原 report／export golden 尚未套用新版本差異。
- 11 個 report 都只先變 core version 與 timeline conventions；其中 10 個預設案例的所有計算 section 不變。
- 唯一非預設 `late-zi-2330-early-civil` 額外改動 `signals`、`timeline`、`consensus`：
  原時間軸誤用 trueSolar／late，修正為與主盤一致的 civil／early（紫微映射 nextDayAt23），
  本命規則來源改變，造成訊號集與彙整分數改變，再由同一時間軸重建共識。
  其三個 section 的 JSON 長度分別由 223942／281550／25380 變為 216607／274013／25938。
  精確前後 SHA-256 見 `packages/core/tests/fixtures/reportGolden.v0.5.1.delta.json`，不更新原 fixture。
- 兩組 compatibility 只更新 core version；最終 golden 比對仍檢查所有其餘欄位。
- export 的六個 file hash 與 signalCount 1191 不變，只更新 manifest 的 coreVersion。
測試先核原 fixture 的固定 SHA-256，再逐項驗證 before 值並套用 literal delta，最後做完整結果比對；
不得由當次計算自動產生 expected。

**首包邊界：** 本包只處理主報告時間軸及直接 timeline API 的選項傳遞，不完成 CalculationSpec／ChartSnapshot。
Web Ask AI 月訊號重算（`apps/web/src/model/askAi.ts`）、Backtest 等仍需在 #26 後續傳入有效選項／共用快照；
MCP、匯出和 profile 契約也未因此新增時間選項輸入。不得宣稱所有入口已一致。
不新增流派、UI 或權重；#26、#20、#24 均不可因這個切片整單結案。


## D-041 問 AI、引用檢查與人生事件沿用報告時間軸（2026-10-06，#26 第二片）

**範圍：** Web 的 `monthSignalProvider`（包含 `localQuestion` 與 `reportSignalLookup`）
以及 `LifeEvents → buildReportBacktestTimeline → buildBacktestTimeline`，共用
`model/reportTimeline.ts` 解析報告的有效時間約定；不新增 AI 模型、流派、資料庫或 UI 功能。

- 只讀 `timeContext.conventions.timeline` 的完整 clock／八字子時／紫微子時映射與
  `followsOptions`。新報告須與外層已記錄選項一致；缺漏、非法或矛盾資料不猜、不重新計算。
- `followsOptions: false` 只接受 D-032 歷史的 trueSolar／late／splitMidnight 組合，
  即使主盤記為 civil／early 也保持歷史時間軸設定，不用主盤設定改寫舊結果。
- 重算固定使用 `report.timeline.systems` 與既有系統權重；空集合仍是空集合。
  全局星曆稍後初始化不得讓原同步報告突然加入 jyotish／humanDesign。
- 每份 month provider 的快取只存在該報告的 closure；LifeEvents 已計算結果綁定來源 report，
  換報告時不呈現前一份的年分數。這不是新 snapshot/cache-key 契約。
- core `BacktestTimelineOptions` 只增加 `useTrueSolarTime`／`ziHourConvention`，每一個
  50 年 chunk 都傳入既有 `buildTimeline`；直接呼叫未提供值時維持 true／late。
- 舊報告不能可靠重算時仍可查看既存結果、解析報告內已有 signal ID；問事回傳無排名，
  回驗沿用既有重新排盤提示。

**版本與封存：** core 0.5.2，Report schema 仍為 5。原 report/export golden 保持固定 SHA-256；
新增 literal 0.5.2 delta 只有 11 份 report 與 2 份 compatibility 的版本字串，
export 也只有 manifest coreVersion，所有計算 section 與檔案 hash 必須不變。
沒有改寫封存預測或重新生成原 golden。

**驗證：** `apps/web/tests/reportReplay.test.ts` 走實際計算器與呼叫鏈，不 mock timeline。
覆蓋民用／真太陽跨時辰、early/late、出生農曆年末與西曆年末、查詢跨十二月／一月、
本地 Question Engine 排名、完整／短引用、報告間快取隔離、舊報告 metadata、
不可信 metadata fail-closed、星曆初始化前後的來源系統隔離及跨 50 年 chunk 的回驗傳遞。
先以 tests-only commit `02237132796312d0881cd045ce5da54202b0d474` 的
[既有 Bun CI](https://github.com/skydreamer0/fortunetelling/actions/runs/37445404579) 記錄舊行為：
1217 pass／2 skip／7 fail，七項失敗正是非預設月訊號、排名、引用、隔離與回驗分數比較；
再驗修正候選。工作區無 Bun，不宣稱本機測試已執行。

**未交付：** CalculationSpec／ChartSnapshot、snapshotId/specHash、跨執行的快取識別、
MCP／匯出／profile 全入口統一，以及完整 DST／曆法矩陣仍在 #26；本片不能將 #26 結案。

## D-042 同步 analyze 的不可變 CalculationSpec 與意圖識別（2026-10-06，#26 第三片）

**範圍：** `createCalculationSpec(input)` 是既有同步 `analyze` 的建構契約；
`analyze` 也從同一個 resolver 取得有效選項並明確傳入 DST overlap 策略。
`identity.scope = "analyze-sync-natal-intent"` 只識別此入口的本命計算意圖，
不是已計算的 ChartSnapshot、完整報告識別碼或舊結果可重播保證。

- 原始受支援欄位保存在深複製、深凍結的 `source`；省略仍是省略，子時 alias 與時區別名保留。
  BirthData 的 source 明確標為建構子套用預設後的 `toJSON()`，不冒稱仍是原始使用者輸入。
- `identity` 只包含明確展開的有效值：民用生日／時間／精度、性別、姓名、未四捨五入的座標、
  內建 canonical IANA zone，以及逐系統 clock／子時規則與已支援的固定設定。
  姓名會影響生命靈數，故不得像既有 chartFingerprint 一樣排除。
  時間未知固定為 null／unknown；保留的原始 hour/minute 不進有效識別碼。
- 八字 late/early 與紫微 splitMidnight/nextDayAt23 透過既有明確映射，
  不能只因字串相似就當作同一流派。紫微 fixLeap=true／zh-TW 來自既有 sync engine。
  星曆系統在這個入口明確 excluded，不接受新的歲差、宮制、交點等未接入選項。
- 版本識別包含 core 與五個相關 calculator 版本、同步計算所需完整 locked dependency closure 的
  精確版本及套件 integrity、內建 tzdb 版本，以及六份相關規則／traits 的 canonical 內容摘要。
  規則內容直接摘要，不把缺版本猜成 0；依賴清單有 lockfile closure 一致性回歸。
  當前入口只接受內建時區；未來若放寬為無版本 Intl fallback，這裡仍須拒絕建立跨裝置識別碼。
- `specHash` 是 `cs1-` + FNV-1a 64-bit；供診斷與後續比對，非密碼學、匿名化或權限 token。
  未來快取命中還必須比較完整 canonical identity，不能只信 hash。
  source label／provenance、asOf／期間、generatedAt 不進本命意圖識別碼。
  同一 identity 仍不代表不同期間的整份報告可以互換。

**兩項精確的輸入驗證修正：**
1. 既有 ZI_ALIASES 普通物件會誤收 inherited key（toString／constructor／__proto__）；
   改成 own-key 檢查後，在排盤之前明確拒絕，合法 late/early 及兩個 alias 不變。
2. BirthData 原本用 host-local Date 驗民用日期；當 host 是 Pacific/Apia，
   2011-12-30 會被主機的跳日誤判不存在，即使出生地是台灣。
   改成 Date.UTC 與 UTC getters 只驗曆日；出生地時間解析與 DST 決策沒有改動。

**版本與相容：** core 0.5.3；Report schema 5、Profile schema 1 不變。原 report/export golden、
LOCKED FORECAST V1 與既有快照都不改寫。新增 literal delta 只把 11 份 report 與
2 份 compatibility 的 0.5.2 變成 0.5.3；匯出只有 manifest coreVersion 改變，
所有計算 section 與匯出檔案 hash 仍由舊 golden 完整比對。

**驗收與限制：** 使用合成資料，覆蓋省略／明確預設／aliases、精確座標及姓名敏感度、
深層不可變且不凍結呼叫者、版本每個維度、跨時辰真實分析、22:59／23:00／23:59／00:00，
以及 UTC／台北／紐約／Apia 子程序的同內容比對。DST gap／overlap 在 spec 中保留請求的
民用時刻及明確既有策略，這不是完整曆法驗收矩陣。工作區沒有 Bun；執行證據由既有 locked CI 提供。

先紅證據：[CI 37456101693](https://github.com/skydreamer0/fortunetelling/actions/runs/37456101693)
為 1230 pass／2 skip／15 fail（缺少公開 spec 契約、inherited 子時選項未拒絕）。
首個實作候選 [CI 37456773778](https://github.com/skydreamer0/fortunetelling/actions/runs/37456773778)
的 19 項新回歸與舊 golden 全通過；唯一失敗是 analyze.test 的舊 0.5.2 版本 literal，
已按 0.5.3 公開 API 契約精確更新。另檢查 VERSION／package.json／bun.lock 三處版本一致。

**尚未交付：** natal snapshot 共用、snapshotId、真正的 cache migration／cross-run reuse、
舊報告 parser／回填、MCP／匯出／profile 全入口統一、async 星曆設定及完整曆法邊界矩陣。
本切片不關閉 #26，不宣稱提高命理預測準確率。


## D-043 MCP Analyzer 以完整載入來源識別熱快取（#26 後續有界切片）

**問題：** ProfileStore 每次讀檔並驗證，但 Analyzer 原本只以
`profileId | chartFingerprint | asOf` 作快取 key。Profile v1 的 cf1 刻意排除姓名／地名標籤，
且座標四捨五入到四位小數；因此同 ID 的檔案改姓名、標籤或細微座標後，舊 Analysis 仍可能命中。
解析器修復／補上 cf1 的 warnings 也不是舊 key 的一部分。

**決定：**
- 每個 profileId/asOf 保留一個目前的 cache entry，包含完整 canonical
  `{ file, warnings, asOf }` 與 pending Promise。file 是 ProfileStore 驗證後的完整 ProfileFileV1，
  包括精確 profile 欄位、姓名、地名標籤、format/schemaVersion/profileId/chartFingerprint。
- 使用完整 canonical 字串比較，不以 cf1、四捨五入、內容摘要或 core cs1 代替。
  JSON 物件 key 排序與無關空白不影響重用；目前有效來源任何欄位／warning 改變就換 entry。
- 每次 get 都先讀檔驗證，不能因暖快取而隱藏檔案損壞、缺漏或 profileId 不符。
- 同來源同 asOf 的並行呼叫共用 pending，完成後也重用同一 Analysis；不同 ID／期間隔離。
  失敗只在 entry 仍是目前 slot 擁有者時清除。不能只比對 identity：
  A → B → A 之後，第一個 A 的延後失敗也不得刪掉第二個 A。

**界線：** 這是單一 Analyzer 實例、單一執行程序內的來源失效修正，不是 ChartSnapshot、
跨程序快取、舊報告重播或 async/sync 通用 CalculationSpec。
本程序的計算器／規則版本固定，沒有新持久 cache 格式。
Profile v1、cf1、core `analyze-sync-natal-intent` cs1、Report v5、既有 calculators、
report/export golden 與 LOCKED FORECAST V1 都不改。import_profile 的 chartChanged 仍按既有 cf1 語義；
姓名改動可以 chartChanged=false，但後續 Analysis 必須讀到新姓名。

**驗證計畫與目前狀態：** 新增 11 項合成資料回歸：
真 ProfileStore 檔案暖 cache 後覆寫姓名／label、分別微調緯度與經度、stale/missing cf1 警告與修復，
JSON key 重排／空白、ID/asOf 隔離、壞檔拒絕、pending 共用、失敗重試、A → B → A ownership，
以及真 import_profile → get_chart 以 ALICE 改 BOB 並與 fresh Analyzer 比對、姓名保持遮蔽。
資料新鮮度測試使用真計算器；只有故障時序測試攔截該實例的 compute，store 觀察器仍委派真讀檔。
先紅證據：[CI 37473204662](https://github.com/skydreamer0/fortunetelling/actions/runs/37473204662)，
tests-only head `c0676d2d4e8e69c3c9a141d1dac6f589e19bc90a`，
1254 pass／2 skip／6 fail。六項失敗正是姓名改動後 get_chart 未更新、
姓名／精確座標／label／warnings 仍沿用舊 Analysis，以及 A → B → A 被同一舊 pending 吃掉。
其餘五項保護回歸與既有測試通過。

**最終狀態（2026-10-06）：** 實作 head `63948d2dddc2d3d6577c50fee9aecc379b2c1b7c`
的 [CI 37474913169](https://github.com/skydreamer0/fortunetelling/actions/runs/37474913169)
為 1260 pass／2 skip／0 fail，四套 typecheck、doctor、build 與 GitGuardian 通過；
已透過 [PR #40](https://github.com/skydreamer0/fortunetelling/pull/40) 合併（merge `2dda69c`）。
#26 維持部分交付，不關閉整單。


## D-044 同步分析共用八字不可變本命基底（#26 有界續片）

**範圍：** 同一次同步 `analyze` 的主盤 `TimeContextBaZiEngine` 與 timeline 八字 calculator，
共用準確四柱 `computePillars` 與原始起運／大運 steps `luckCycles`。這只是內部、單次執行的
`BaziNatalBasis`，不是跨入口 ChartSnapshot、snapshotId、持久快取或舊報告遷移。

**契約與錯誤順序：**
- 建立 run-local provider 時複製出生 TimeContext 與有效八字設定；使用完整 canonical
  `{ ctx, options }` 核對每個 consumer，不只比 hash。來源或 clock／子時設定不符即拒絕。
  私有來源深凍結，不凍結呼叫者；拿到 lazy basis 後再修改 caller 也不會改變計算來源。
- pillars 與 raw luck 是獨立 lazy getter，各自只保存成功、深複製且深凍結的值。
  provider 建立時不排盤、不讀時鐘；失敗不快取，下個 consumer 可以依原流程重試。
- 主盤仍按 pillars → legacy engine → luck 順序；typed calculator 仍先跑 legacy engine，
  時間未知或 legacy 失敗回空 chart 時不要求 natal basis。沒有把 engine 內的計算例外
  提前到 registry 外，亦沒有改變既有 timeline 計算失敗會拋例外的邊界。
- consumer 個別複製 pillars／luck 再建立公開結果；frozen 物件不流入 Report 或 typed chart。
  修改一次輸出的 clock／alternatives／luck start 等欄位，不會污染 basis 或另一個 consumer。

**本命與期間分離：** basis 僅保留四柱、替代盤、使用時鐘／交節資料及原始起運／steps。
`asOf`、annualRange、annual／annualSequence／monthly、isCurrent 仍由原 consumer 投影。
主盤大運以 asOf 午夜與完整起運 timestamp 比較；typed calculator 仍以 inclusive date 比較。
此片特意不統一兩者既有語義；起運當日非午夜的 synthetic fixture 鎖定原有 false／true 差異。

**相容與界線：** core 0.5.3、Report schema 5、公開 TimelineOptions、Profile v1、cf1／cs1、
所有 golden 與 LOCKED FORECAST 都不變。timeline barrel 明列既有 exports，避免把內部能力
加進公開 API。主盤 legacy `super._compute` 與 calculator 的 civil components 照舊，
不宣稱所有重排盤已消除。獨立 `buildTimeline`／calculator 仍可不帶 provider 使用。
紫微、Question／Backtest／MCP 跨入口共用、完整曆法矩陣與快照遷移均留後續，#26 不關閉。

**驗證：** 新增 14 項合成回歸；計數 spy 委派真 `computePillars`／`luckCycles`，
檢驗同步主盤與 timeline 的準確本命計算由兩次降為一次。涵蓋四個子時邊界×civil／solar×
early／late、跨年／農曆年界與不同 annualRange 的原結果等價、兩種 isCurrent 原語義、
深層不可變／caller mutation、完整來源與選項不符、unknown time、個別計算故障重試、
legacy failure 順序、A/B/A 及獨立執行隔離、DST gap／overlap、四種 host timezone。
故障時序測試才使用合成例外；計算／等價驗收均用真實計算器，沒有改寫 golden。

既有工作區沒有 Bun，本機 tests／typecheck／doctor／build 均為 **NOT RUN**。
先紅 tests-only head `378276c2eab7f10129a8e696c9065fd403c8243e` 的
[CI 37502508500](https://github.com/skydreamer0/fortunetelling/actions/runs/37502508500)
與最終精確 head 的完整 locked CI、非作者獨立驗收結果記錄於
[Draft PR #42](https://github.com/skydreamer0/fortunetelling/pull/42)。本文件不代替執行證據。
