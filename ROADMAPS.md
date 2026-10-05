# Roadmap — 程式先算完，AI 在對話中查詢與比對

> 狀態核對：2026-10-04，以 `master` 的 [da76f163](https://github.com/skydreamer0/fortunetelling/commit/da76f16328469366f8c3b0c9eeeff5efbe9d172f) 為準。V1、V3、M0.5～M2 與 M3 主線已完成；M4 完成 M4-01／02；V2／M5 已有驗證報告；2026-10-05 起人類圖（HD）通過 D-039 門檻、視為已驗證（M5-03），Jyotish 仍標 `experimental`。歷史時區修正與警告、MCP 指定系統篩選及精簡回傳均已併入 `master`。
> 目標架構與介面契約：[docs/ARCHITECTURE-V2.md](docs/ARCHITECTURE-V2.md)
> 決策依據：[docs/DECISIONS.md](docs/DECISIONS.md) D-021 ～ D-039
> 現行 Report 契約（v5）：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)；MCP 設定：[docs/MCP-SETUP.md](docs/MCP-SETUP.md)

## 核心原則

**產品形狀**：圖形介面（整理與呈現命盤資料）＋ 本機 AI 對話（下結論、討論）。
**程式先把能邏輯化的部分全部算完；AI 在你本機的對話中，經 MCP 按需查詢、比對、下結論。**

```
使用者輸入（生日／時間／出生地／性別）
  → 程式：把「能邏輯化的」全部算完
       TimeContext → Calculators → Rule Engine → Signal → 共識／矛盾 → Timeline → 問事排名
  → 兩條出口
       ① 圖形介面（網站，給人看）
       ② 本機 MCP server／匯出檔（給 Claude 桌面版查詢，給 AI 討論）
  → Claude 桌面版對話：AI 按需查詢、比對、下結論
```

1. **能確定的交給程式**：排盤、規則、訊號、共識、逐月分數。AI 不重新排盤、不心算（D-021 仍成立）。
2. **AI 負責最後一段**：跨系統比對、綜合判斷、回答問題、對話追問（D-036 修訂了舊的「AI 只讀結果」說法）。
3. **按需查詢，不一次吞下全部**：每個模組只是多一個工具；工具輸出有大小上限，過大回錯誤而不是截斷。
4. **本機優先**：不需要 API key、不需要伺服器。
5. **保留矛盾、標示不確定**：系統間方向相反就並列；分數未校準（D-033）、未驗證系統（`verified: false`，D-039）要讓 AI 知道。
6. **MCP 只包裝 core**：不自行重算第二套邏輯。
7. **隱私分兩層**（D-038）：本機 profile 保留完整資料；進入 AI 對話的工具結果姓名預設不回傳。

---

## 一、現況總覽

| 區塊 | 狀態 |
|---|---|
| 時間層（時區／DST／真太陽時／節氣／農曆）、BirthProfile、離線城市表 | ✅ V1 |
| 八字／紫微／靈數／Kin／命卦（calculator 契約，`CALCULATORS` registry） | ✅ V1 |
| 八字／紫微規則、Signal、單系統與跨系統彙整、共識與矛盾、年度／月份 Timeline | ✅ V1、V3 |
| Report v5、React UI（時間軸、共識徽章、十二宮盤、合盤、人生事件） | ✅ |
| 問事引擎（`questions/`，逐月排名）、人生事件回驗（本地版） | ✅ V4（本地）、V5 |
| Jyotish／Human Design | 🟡 calculator 與規則已寫、已進非同步 Timeline；M5 已完成獨立驗證（人類圖 38 案、吠陀占星 30 案，未發現計算器錯誤）。**人類圖**達 D-039 門檻 → 已驗證（M5-03）；**吠陀占星**仍缺人工在公開計算器抽查 → 仍視為 `experimental`。兩者都需星曆（async），不在同步 `CALCULATORS`／`analyze()`，改列 `EPHEMERIS_CALCULATORS` |
| Profile 契約：`.fortune.json`、`profileId`＋`chartFingerprint`、canonical serializer、版本區塊 | ✅ M0.5（#7） |
| 本機 MCP server：14 個工具（含 `check_answer`、`import_profile`）、`asOf` 顯式、回應外殼、大小上限、姓名預設不回傳、server 自帶使用守則（instructions） | ✅ M1、M3 |
| 匯出檔（manifest）、`share-redacted`、`import_profile`、網站下載 `.fortune.json` | ✅ M2、M3、M4-02 |
| `packages/ai` 整理（client 改選用進入點、`check_answer`、對話助手系統指令、去識別化共用 core） | ✅ M3 |
| 歷史時區：內建固定版 tz 資料（IANA 2026e）、出生地地方平時、`historical_zone_uncertain` 旗標、各相關系統與網站警告、時區名稱驗證 | ✅ |
| MCP 問事／時間軸／共識可指定 `systems`／`verifiedOnly`；問事精簡回傳與 `experimentalSensitivity`、逐月表格 | ✅ |
| `bun run doctor` 健康檢查（profile、MCP 冒煙、桌面版設定檔），已接進 CI | ✅ |
| 資料庫與帳號同步 | ⏸ 暫停（本機優先） |

### 已完成的基礎（保留並沿用）

- 五套引擎、透明計分（`ScoringRules`／`RadarBuilder`／`AxisNotes`）、動靜分層（L0–L3）、`HonestyGuard`
- Report Schema v3 → v5、摘要／洞見、雙人合盤
- React 19 + TS UI、明暗主題、列印、PWA、Bun CI 與 GitHub Pages 部署
- Bun workspaces：`packages/core`、`packages/ai`、`packages/mcp`、`apps/web`

### 已知技術債

1. ~~計算核心沒有延遲載入~~ → 已完成：計算核心與報告元件改為動態載入，首頁只下載約 252 kB（gzip 約 92 kB），原本約 1,625 kB（gzip 約 503 kB）；核心本身約 1.25 MB，送出表單或開啟報告時才載入，PWA 預快取仍涵蓋所有 chunk。
2. ~~網站人生事件的 key（`profileKeyOf`）含姓名，與 `chartFingerprint` 不同~~ → M4-02 已改用指紋，並提供舊 key 遷移。
3. `Component.value`／`meta` 仍為 `any`（各引擎自訂 payload）。
4. ~~BirthData 經緯度死欄位／八字固定 Asia/Taipei／無真太陽時／無歷史 DST／核心 `.js`~~ → V1 已全部處理。
5. ~~`packages/ai` 的 `@anthropic-ai/sdk` 仍在一般 dependencies~~ → M3-01 已改為選用 peerDependency（optional），只有 `client`/`anthropic` 入口才會（動態）載入。

---

## 二、已完成里程碑（V0–V5）

完成條件以測試為準，沒有測試的項目不算完成。以下保留原任務表作為歷史與驗收依據；V3-04、V4-01／02、V5-06 已依新方向暫停或取消（見第四節）。

### V1 — 時間層＋八字規則＋紫微權重＋Timeline（✅ 已完成）

目標：舊架構全部改走 `TimeContext → calculate(ctx) → Signal → Timeline`，Report 升到 v4。

| ID | 任務 | 產出 | 依賴 |
|---|---|---|---|
| V1-01 ✅ | **BirthProfile＋離線城市表** | `profile/`：驗證、IANA 時區、台灣各縣市與常見海外城市的經緯度（離線 JSON） | — |
| V1-02 ✅ | **TimeContext** | `time/`：local→UTC（IANA tzdata，禁止手寫 DST 表）、JD(UT/TT, ΔT)、均時差→真太陽時、精確節氣時刻、農曆；`flags`：`dst_applied`／`dst_gap`／`dst_overlap`／`near_shichen_boundary`／`near_jie_boundary`／`zi_hour_convention`／`time_unknown` | V1-01 |
| V1-03 ✅ | **Calculator 契約＋搬遷** | `calculators/<system>/`，`calculate(ctx, config) → ChartResult`；現有五引擎改包成 calculator，`components` 不變，以免破壞 Report v3 | V1-02 |
| V1-04 ✅ | 八字改吃 TimeContext | 真太陽時（預設開）、`ziHourConvention`、起運精確到月、流月；邊界時兩盤並算 | V1-03 |
| V1-05 ✅ | 紫微改吃 TimeContext＋強型別盤 | 身宮、五行局、命主身主、三方四正索引、流年／流月序列 | V1-03 |
| V1-06 ✅ | Numerology 補齊 | `11/2` 主數格式、Birthday、Attitude、Pinnacle×4、Challenge×4、`personalYears` 多年 | V1-03 |
| V1-07 ✅ | Tzolkin 補齊 | Wavespell、Castle、Oracle 四位 | V1-03 |
| V1-08 ✅ | 命卦改用精確立春 | 修正 D-017 近似 | V1-02 |
| V1-09 ✅ | **Signal 模型** | `signals/`：`Signal` 型別、決定性 id 雜湊、`Domain`／`Trait` 封閉列舉 | — |
| V1-10 ✅ | **八字 Rule Engine** | `rules/bazi/`＋`catalog.json`：天干五合、生剋、六合、六沖、三合、三會、刑、害、破、伏吟、反吟、歲運並臨；範圍涵蓋原局、原局×大運、原局×流年、原局×流月 | V1-04, V1-09 |
| V1-11 ✅ | **紫微特徵權重＋規則** | `traits/ziwei.json`（星曜→trait vector，帶版本）；修正鏈：宮位×旺陷×煞曜×四化，記進 `evidence.modifiers`；規則包含四化飛入、大限／流年疊宮、三方四正煞曜、天馬、祿存 | V1-05, V1-09 |
| V1-10b ✅ | 八字十神／神煞規則 | 十神（財星、官殺、食傷、印星、比劫）、驛馬、財庫、桃花、沖動 → 補上 wealth／contract／movement／property 領域 | V1-10 |
| V1-12 ✅ | 單系統彙整（含 Numerology 流年／流月規則） | `aggregateSignals()` 第 1 步（系統內 noisy-OR）＋第 2 步（系統權重，先固定） | V1-10, V1-11 |
| V1-13 ✅ | **Timeline Engine** | `timeline/`：`asOf` 起 5 年＋當年 12 個月 × 領域分數 0–100，每格附 `topSignals[]`；UI 分四段（低／中／中高／高，切點是資料） | V1-12 |
| V1-14 ✅ | Report v4 | 新增頂層 `timeContext`、`signals`、`timeline`，其餘沿用 v3；八字／紫微改吃 TimeContext（D-032） | V1-13 |
| V1-15 ✅ | UI：Timeline 視圖 | 年度卡片（❤️ 感情／💰 財運／💼 事業／🚗 移動）＋月份展開＋點開看來源規則；出生地輸入改為城市選擇 | V1-14 |
| V1-16 ✅ | 核心轉 TypeScript | `packages/core` 已無 `.js`：舊 core／engines／analysis／visualization 與其測試全數轉 `.ts`（純重構，公開匯出名不變；`exports` → `src/index.ts`）。core `tsconfig` 拿掉 `allowJs/checkJs`，改 `strict: true`＋`noUnusedLocals/Parameters`，0 錯誤。行為一致性以 `tests/reportGolden.test.ts` 鎖住（轉換前錄製的 11 份 Report＋2 份合盤，位元相同）。剩餘寬鬆處：`Component.value`／`meta` 仍為 `any`（各引擎自訂 payload），`HonestyGuard.auditReport` 與 LayerClassifier 以寬鬆物件走訪 | 貫穿 |

**V1 完成條件**
- 黃金測試：台灣 DST 年份（例：1974 年夏季）、時辰交界 ±2 分、節氣交節前後、早晚子時、`time_unknown`
- 八字每條規則至少有 1 正例 + 1 反例
- 同一 `(profile, asOf, 規則版本)` 的輸出位元相同（決定論）
- 既有測試全綠，Report v3 欄位不變

### V2 — 天文層：Jyotish＋Human Design

| ID | 任務 |
|---|---|
| V2-01 ✅ | 接入 Swiss Ephemeris WASM（瀏覽器可跑，D-027）；ephemeris 檔延遲載入 |
| V2-02 ✅ | `calculators/astro`：Sun～Saturn、Rahu/Ketu、Ascendant，UT 輸入 |
| V2-03 🟡 | Jyotish（計算器與 30 案獨立對照驗證已完成，仍缺兩個公開吠陀計算器 ≥ 20 案交叉驗證）：ayanamsa 設定、D1/D9/D10、Nakshatra/Pada、House Lord、Vimshottari Maha/Antar Dasha（精確到日）、Transit |
| V2-04 🟡 | Human Design（計算器與 38 案公開來源交叉驗證已完成，M5-03 起視為已驗證）：Personality／Design（88° 求根）、Gate/Line、Channel、Center、Type、Authority、Profile、Definition、Incarnation Cross |
| V2-05 🟡 | Jyotish／HD 規則 → Signal（規則已寫並進非同步 Timeline；待交叉驗證，見 M5）（Dasha 主星、2H/4H/7H/10H/11H 過運等） |

**完成條件**：與至少兩個公開計算器交叉驗證，≥ 20 個案例。

### V3 — 跨系統共識引擎

| ID | 任務 |
|---|---|
| V3-01 ✅ | `aggregateSignals()` 第 3 步：`consensus`（強度 ≥ θ 的系統數，≥ 3 標記「高共識」）、`conflict`（方向相反時保留並列出雙方 signal id，不做平均抵銷） |
| V3-02 ✅ | Report v5：新增 `consensus` 頂層欄位（`buildConsensus(timeline)`：各年高共識／矛盾、headlines、覆蓋度；D-034） |
| V3-03 ✅ | UI：每年每領域顯示共識徽章與矛盾說明；時序章節新增「共識與分歧」摘要與每格「n／m 系統」覆蓋度 |
| V3-04 ⏸ | （暫停，沒有需求）評估 Next.js（Vercel）遷移；`@fortune/core` 保持框架無關，可同時給 Web、App、API 使用 |

**完成條件**：共識與矛盾各有單元測試，包含「兩系統正、一系統負」的案例。

### V4 — 資料庫＋人生事件回驗

| ID | 任務 |
|---|---|
| V4-01 ⏸ | （暫停）🟡 schema 設計稿 `docs/db/schema.sql`（未執行，無 `apps/api`）。`apps/api` + Postgres（Supabase）；資料表：`users`、`birth_profiles`（RLS、欄位加密、一鍵刪除）、`chart_snapshots`、`signals`、`rules`／`trait_weights`（版本化，只增不改）、`annual_cycles`／`monthly_cycles`、`interpretations`、`life_events`、`backtest_runs` |
| V4-02 ⏸ | （暫停）❌ 未開始（無帳號憑證）。帳號與同步；**沒登入也能用**（D-029 本地優先） |
| V4-03 | ✅ 本地版：報告「驗 人生事件」面板，新增／編輯／刪除／刪除全部，依命盤指紋存於 localStorage（不上傳）。`life_events` 輸入 UI（例：2018 畢業／北上、2022 化療藥局、2024 離職、2025 藥廠、2026 回台南／KAM） |
| V4-04 | ✅ 方法與本地執行：`buildBacktestTimeline`／`runBacktest`（決定論、seed 切分、驗證集分開報告）；D-033 的權重／切點仍待多人 n ≥ 30 資料才決定。Backtesting（同時決定 D-033 懸而未決的：系統權重、四段切點、未發訊號系統是否計 0）：命中定義事先固定（事件落在個人時間軸前 25%）、以隨機時間窗作基準線、樣本 < 30 只顯示「樣本不足」、訓練與驗證分開 |
| V4-05 | 🟡 `proposeWeights` 只從驗證集 n ≥ 30 產生新版本提案（凍結物件、不改舊版）；單人資料一律回「樣本不足」。權重調整只產生新版 `trait_weights`，舊報告可用舊版本重現 |

**完成條件**：回驗報告可重現（同版本、同樣本 → 同命中率）。

### V5 — 問事系統＋AI 解讀

| ID | 任務 |
|---|---|
| V5-01 ✅ | `questions/catalog.json`：`vehicle_purchase`、`job_change`、`relationship_timing`、`startup_timing`… → domains → 各系統相關規則 |
| V5-02 ✅ | Question Engine：逐月計算 signals → 排名 → 前 3 個月份，每個月份附 source；不在目錄內的問題回「目前不支援」 |
| V5-03 ✅ | `packages/ai`：AI 只做兩件事：(a) 自然語言 → `{category, range}`（schema 驗證）；(b) 讀 JSON 寫解讀。固定系統指令：禁止重新排盤、每個結論都要引用 `signal.id`、三套以上同向才能說「高共識」、保留矛盾 |
| V5-04 ✅ | 程式後驗證（不靠 AI 自律）：citation id 必須存在；文字中出現的干支、星名、宮名、行星名必須出現在輸入 charts；通過 HonestyGuard；以 `hash(input, promptVersion, model)` 快取 |
| V5-05 ✅ | 複製 prompt UI（D-035）：報告「問 AI 解讀」章節——解讀重點（總覽／本年／我有問題）、問題以關鍵字對應問事目錄並在本機跑 `answerQuestion` 附上月份排名、prompt 預覽＋字數＋「複製 prompt」、隱私說明；「貼回 AI 的回答來檢查」逐段標示引用不存在／資料外的干支星曜行星／沒有引用／宿命論用語。不需金鑰、不經伺服器 |
| V5-06 ❌ | UI：問事輸入、月份排名、解讀段落點開就能看到引用的訊號（**取消**：被本機 MCP 取代，D-036） |

**完成條件**：攔截率測試。故意餵入錯誤干支或錯誤星曜的 AI 輸出，必須 100% 被丟棄。

---

## 三、新里程碑（M0.5～M5）

### M0.5 — Profile 與序列化契約 ✅（#7）

避免 M1、M2、M4 各自產生不同格式。

| ID | 任務 | 產出 |
|---|---|---|
| M0.5-01 ✅ | `ProfileSchemaV1`：`profileId`（使用者可命名的穩定 slug，如 `sky`）＋`chartFingerprint`（規範化出生欄位的雜湊）＋版本欄位 | 單一 profile 格式 |
| M0.5-02 ✅ | canonical serializer：鍵序固定、排除 `generatedAt`／執行時間等非決定性欄位 | MCP、網站匯出、測試共用 |
| M0.5-03 ✅ | import／export：網站下載 `.fortune.json`（M4-02）、MCP 讀固定 profiles 目錄（M1-02）或 `import_profile`（M3）；檔案格式與 parse 共用 core | 瀏覽器 → 本機的橋 |
| M0.5-04 ✅ | 版本資訊：`coreVersion`、`profileSchemaVersion`、規則／catalog version、`asOf`、ephemeris 狀態 | 每份輸出都帶 |

**決定**：`profileId` 不是內容雜湊。改一個時辰不應換掉「這個人」；`chartFingerprint` 才是內容雜湊，供人生事件等「依命盤」的資料當 key（沿用 `lifeEvents` 現況）。

### M1 — 本機 MCP server ✅（#9）

新增 `packages/mcp`（`@fortune/mcp`），stdio 跑在本機，Claude 桌面版當工具用。**Stateless**：沒有「目前載入哪個人」，每次呼叫都帶 `profileId`。所有時間相關工具顯式帶 `asOf`（延續 D-014）。

```text
list_profiles()
get_profile({ profileId })                                     // 預設不回姓名
get_chart({ profileId, system, asOf, detail: "summary"|"full" })
list_signals({ profileId, domain?, system?, range?, minStrength?, limit?, cursor? })
get_signal({ profileId, signalId })                            // 完整 evidence／modifiers 在這裡取
get_timeline({ profileId, asOf, range?, domain? })
get_consensus({ profileId, asOf, range? })
list_conflicts({ profileId, asOf, range? })
answer_question({ profileId, category, range, asOf })
list_question_categories()
compare_profiles({ profileIdA, profileIdB, asOf })
```

每個回應都附 `asOf`、`versions`、`caveats`（分數未校準、時間精度與邊界 flags、未參與的系統、`verified: false` 的系統）。預設只回必要 evidence。

| ID | 任務 |
|---|---|
| M1-01 ✅ | 套件骨架、Bun 執行、`claude_desktop_config.json` 範例、`docs/MCP-SETUP.md`（另有 `add-profile` 指令，網站匯出在 M4-02 前的過渡） |
| M1-02 ✅ | profile 存取：`list_profiles`、`get_profile`（讀固定目錄，依 M0.5 契約） |
| M1-03 ✅ | `get_chart`（summary／full）、時間 flags（時辰／節氣邊界、DST、時間未知） |
| M1-04 ✅ | `list_signals`（limit／cursor）、`get_signal` |
| M1-05 ✅ | `get_timeline`、`get_consensus`、`list_conflicts`（range／domain 篩選） |
| M1-06 ✅ | `answer_question`、`list_question_categories`（重用 `answerQuestion`） |
| M1-07 ✅ | `compare_profiles`（重用 `analyzeCompatibility`） |
| M1-08 ✅ | 統一回應外殼：`asOf`、`versions`、`caveats`、大小上限 |
| M1-09 ✅ | **canonical contract 測試**：同一 `profile + asOf + config + 規則版本` 的 canonical payload 一致；sync 與 async 路徑各自 golden；未知 id 回結構化錯誤 |

**完成條件（已以真實 stdio 客戶端驗收）**：在 Claude 桌面版問「我 2027 年哪幾個月適合買車？」，Claude 先以 `profileId` 呼叫 `answer_question`，需要細節再呼叫 `list_signals`／`get_signal`。所有引用的 signal id 必須存在；回應附 `asOf`、版本與 caveats；同一輸入與版本重跑得到相同 canonical 結果。

### M2 — 匯出／匯入（備援，也是離線與分享用）✅

```text
manifest.json   exportSchemaVersion／profileSchemaVersion／coreVersion／規則與 catalog 版本／asOf／
                參與與略過的系統／ephemeris 模式與 warnings／redacted 與否
profile.json
chart.json
signals.json
timeline.json
consensus.json
README.md       給 AI 看：欄位說明、哪些是確定性計算、哪些分數未校準、建議分析步驟
```

| ID | 任務 |
|---|---|
| M2-01 ✅ | 兩種 preset：`local-full`（完整資料）、`share-redacted`（移除姓名與非必要出生地標籤） |
| M2-02 ✅ | 序列化與 MCP 共用 M0.5 的 canonical serializer（單一來源） |
| M2-03 ✅ | `share-redacted` 與 `packages/ai` 的 `buildInterpretationPayload` 共用同一份去識別化邏輯（D-029），不另寫一套 |

### M3 — 整理 AI 層（`packages/ai`）✅ 完成

| ID | 任務 |
|---|---|
| M3-01 ✅ | `copy`（備援）與 `mcp`（主線）入口已分離；`client` 為獨立選用入口，`@anthropic-ai/sdk` 改為選用 peerDependency（`peerDependenciesMeta.optional`，devDependencies 保留供測試），缺少時 `createAnthropicComplete` 給出明確錯誤 |
| M3-02 ✅ | 去識別化與字數預算改為可選，本機匯出預設關閉 |
| M3-03 ✅ | 保留 `vocab`／HonestyGuard 檢查，獨立成 `check_answer`：貼回 AI 的回答自行檢查 |
| M3-04 ✅ | 系統指令改寫為「對話助手」版：可用工具、如何引用訊號、何時說高共識、如何呈現矛盾與 `experimental` 系統 |

### M4 — 網站對接 ✅（M4-01～03 完成）

| ID | 任務 |
|---|---|
| M4-01 ✅ | 「問 AI」章節兩個入口：**用 Claude 桌面版討論**（MCP 設定步驟＋匯出）、**複製 prompt**（備援） |
| M4-02 ✅ | 網站下載 `.fortune.json`（M0.5-03），供 MCP 讀取；不假設網站能寫本機任意檔案 |
| M4-03 ✅ | 網站「用 Claude 桌面版討論」入口新增「檢查回答」步驟：貼回 Claude 的回答，用與 MCP `check_answer` 同一個 `checkAnswer`，以報告訊號（含 asOf 年 −5～+10 的月份訊號，與 `get_signal` 同範圍）查 sig_ 編號、宿命論用語、實驗性系統算進高共識；只標示不改寫，不送出資料。與「複製 prompt」那條路的 `checkPastedAnswer` 並存 |

### M5 — 計算端驗證與補齊（與 M1～M4 並行）🟡（已有驗證報告，公開來源門檻與正式升級仍有待辦）

| ID | 任務 |
|---|---|
| M5-01 🟡 | 門檻：與至少兩個公開計算器交叉驗證，≥ 20 案例。HD 已有兩站 38 案；Jyotish 已有 30 案獨立對照與第三方抽查，但仍缺兩個吠陀專用計算器 ≥ 20 案 |
| M5-02 ✅ | 驗證前標 `experimental`，MCP 回應附 `verified: false` 與 caveat；不與已驗證系統用相同信心標示 |
| M5-03 ✅ | **人類圖**升級為已驗證：`EXPERIMENTAL_SYSTEMS`（core／ai）、`EXPERIMENTAL_SYSTEM_IDS` 只剩 `jyotish`，MCP 不再附 `experimental:humanDesign` caveat，`verifiedOnly` 與高共識「三套已驗證」計入人類圖；新增 `EPHEMERIS_CALCULATORS`／`runEphemerisCalculators`（core 公開 API，`verified` 旗標）明訂 sync／async 邊界：同步 `CALCULATORS`／`analyze()`／`buildTimeline` 不含星曆系統，`buildTimelineAsync`、MCP、匯出包才含。**吠陀占星**未達門檻（缺兩個吠陀專用計算器 ≥ 20 案），維持 `experimental`，補齊後再升級。HD 規則（過運閘門等）屬啟發式、未經外部驗證，與其他系統的規則同級 |
| M5-04 | V2-05：Jyotish／HD 規則 → Signal 補齊（新模組進場：calculator → rules → Signal，不需改 AI 層） |
| M5-05 | 回驗累積多人資料 n ≥ 30 後才調權重（維持 D-033） |

M1 不被 M5 阻塞。

## 四、暫停或取消

- V3-04 Next.js 遷移：暫停，沒有需求。
- V4-01／02 資料庫與帳號同步：暫停；本機優先，MCP 直接讀本機檔案。
- V5-06 網站內直接呼叫模型／BYOK：取消，被 MCP 取代。

## 五、隱私分兩層

- **本機 profile**：可保留完整姓名、生日、出生地。
- **進入 Claude 對話的資料**：工具結果一被使用就進了 AI 上下文。`get_profile` 預設不回姓名與原始出生欄位，要明確帶 `includeName`／`includeBirthData` 才提供；`get_time_context` 等工具仍會回傳日期、時間或命盤資訊。本機計算不代表工具結果不會送入 AI 對話，也不代表結果無法識別個人。
- **分享用匯出**走 `share-redacted`。

## 六、執行順序

```
M0.5 → M1 → M2 → M3 → M4
M5 與 M1～M4 並行
```

M0.5、M1、M2 與 M3 主線已完成，M4 完成 M4-01／02。`historical_zone_uncertain` 的各系統／網站警告、MCP 回傳瘦身與 `systems`／`verifiedOnly` 已完成。M4-03 已完成。M5-03 已完成（人類圖升級），首頁延遲載入已完成。剩餘：M5 按系統補足驗證門檻後再決定正式升級，規則補齊與多人回驗仍依原條件執行。

## 七、已確認事項（2026-09-30）

1. MCP 為主、匯出檔為備援。
2. 本機不去識別化；進對話的資料姓名預設不回傳。
3. 資料庫與帳號同步先暫停。
4. 使用情境：**只有你自己用**（不做安裝包與多人 profile 管理；之後要給別人再開新里程碑）。
5. `profileId` 為使用者命名的 slug，另設 `chartFingerprint`。

## 八、實作紀錄

### M0.5

位置：`packages/core/src/portable/`，測試 `packages/core/tests/portable.test.ts`。

- `canonicalStringify`／`canonicalize`：鍵序固定、排除 `generatedAt`、拒收 NaN／函式／Date。與 `signals/signalId` 既有的寬鬆 `canonicalJson` 並存（訊號 id 依賴後者，不動）。
- `chartFingerprint`：`cf1-` + FNV-1a 64（沿用 `fnv1a64Hex`）。只含出生日期、時間、精度、性別、經緯度（4 位小數）、時區；**不含姓名與地名標籤**。
- `.fortune.json`：`createProfileFile`／`serializeProfileFile`／`parseProfileFile`；檔案無時間戳，輸出位元穩定；指紋缺漏或過期時重算並回警告。
- `buildVersionInfo({ asOf })`：core／schema／calculator／catalog 版本、ephemeris 狀態、`experimentalSystems`（M5-03 前為 Jyotish／HD，現只剩 Jyotish）。

**M0.5 當時的差異**：網站 `lifeEvents` 的 key（`profileKeyOf`）包含姓名，與 `chartFingerprint` 不同；當時未動網站。後續已於 M4-02 改用指紋並加入舊 key 遷移，見下方 M4 紀錄。

### M1

位置：`packages/mcp`，說明 `docs/MCP-SETUP.md`。64 個測試（含真實 stdio 客戶端的端到端驗收）。

- M1 完成時有 12 個工具（M3 再加入兩個，現有 14 個）：`list_profiles`、`get_profile`、`get_chart`、`get_time_context`、`list_signals`、`get_signal`、`get_timeline`、`get_consensus`、`list_conflicts`、`answer_question`、`list_question_categories`、`compare_profiles`。
- `get_profile` 預設不回姓名與原始出生欄位，需明確 `includeName`／`includeBirthData`；`compare_profiles` 只回 A／B 與衍生值。其他工具的日期、時間或命盤結果仍可能識別個人，見第五節。
- 回應外殼 `{ asOf, versions, caveats, data }`；超過 60000 字元回 `response_too_large` 與縮小範圍提示，不截斷。
- **驗收抓到的缺口（已修）**：`answer_question` 引用的月份訊號，起初 `get_signal` 查不到（兩邊各算各的）。現在月份訊號由 `Analysis` 統一計算並快取，`get_signal` 在 asOf 年 −5 ～ +10 內都能解析；`answer_question` 的區間必須落在此範圍，否則回 `invalid_args`。回歸測試：問事答案引用的每個 id 都必須可取得。
- core 補匯出 `initEphemeris`、`jyotishCalculator`、`humanDesignCalculator`（仍標 `experimental`，不進 `CALCULATORS`）。

**後續已補**：`import_profile` 與 `check_answer` 在 M3 完成；`get_timeline` 的逐月與回傳瘦身在 #11 完成。現行成功回應都有 `versionsHash`，僅 `list_profiles`／`get_profile` 另附完整 `versions`。10/3 已加入 `systems`／`verifiedOnly`、問事精簡前 3 名與排名表、`experimentalSensitivity`，以及指定領域的逐月表格；詳見 [MCP-SETUP.md](docs/MCP-SETUP.md)。

### M2

位置：`packages/core/src/export/`，測試 `packages/core/tests/export.test.ts`；CLI `bun run --filter @fortune/mcp export-profile`。

- 匯出包：manifest、profile、chart、signals、timeline、consensus、README（給 AI 看）；序列化走 canonical serializer，位元穩定、不含時間戳。
- 兩種 preset：`local-full`、`share-redacted`。`share-redacted` 保留出生日期、時間與經緯度（重算命盤所需），`dropCoordinates` 可連經緯度一起移除（預設關）；`profileId` 不會被去識別化。
- `export/redact.ts` 是去識別化的單一來源：`packages/ai` 的 `buildInterpretationPayload` 與複製 prompt 已改用它（佔位符 `[name]`／`[place]`），D-021 邊界測試納入此模組。

### M3

位置：`packages/ai`、`packages/mcp`，說明 `docs/MCP-SETUP.md`。

- `@fortune/ai` 主線不再匯出 Anthropic client，改走 `@fortune/ai/client`；新增 `@fortune/ai/mcp` 進入點。`@anthropic-ai/sdk` 仍在 dependencies（動 lockfile，未改選用）。
- `buildInterpretationPayload` 新增 `redact`、`budget` 選項（預設不變），`LOCAL_PAYLOAD_OPTIONS` 供本機使用。
- 新 MCP 工具 `check_answer`（引用的 signal id 是否存在、宿命論字眼、是否把實驗性系統算進高共識；不做 vocab 比對，因 MCP 端無 payload）與 `import_profile`（不覆蓋既有 profile，除非 `overwrite: true`）。
- server 連線時送出 500 字內的 `instructions`；`docs/MCP-SETUP.md` 的「建議對話指示」與它逐字相同並有測試比對。
- 實驗性系統（吠陀占星、人類圖）不計入高共識，複製 prompt 與系統指令一併修正（`copy-v2`、`interpret-v2`）；最高分也在「低」帶時須直說沒有突出的月份。

### M4（M4-01／02）

位置：`apps/web`。

- 「問 AI」兩個入口：用 Claude 桌面版討論（預設展開，含 Windows／macOS 設定檔路徑與 Microsoft Store 版位置、JSON 反斜線跳脫）、複製 prompt（備援）。
- 網站可下載 `<profileId>.fortune.json`（core 的 `createProfileFile`，位元穩定）；`profileKeyOf` 改為 `chartFingerprint`，舊含姓名 key 由 `legacyProfileKeyOf` 自動遷移。回測的隨機種子改用新 key，遷移後訓練／驗證分組可能與舊的不同。
- **M4-03 已完成**：網站「檢查回答」步驟（`AnswerCheck`），既有複製 prompt 路徑的 `checkPastedAnswer` 不受影響。

### M5（驗證段）

報告：`packages/core/tests/fixtures/validation/`。

- **人類圖**：38 個 Astro-Databank AA 案例、2～3 個公開產生器；類型、權威、定義、中心 38/38，行星閘門 988/988；12 個爻不一致全在閘門 25，判定為來源錯誤；未發現計算器錯誤。三站可能不獨立、爻只有一個可靠來源、無設計時刻。
- **吠陀占星**：30 個 AA 案例，改用獨立程式化來源（`astronomy-engine` 僅 devDependency、JPL Horizons 抽查 7 案、swetest 抽查 10 案）；離散欄位 100% 一致，未發現計算器錯誤。**尚缺**人工在兩個吠陀專用公開計算器抽查 ≥ 20 案，故仍為 `experimental`。
- 網頁表單來源不可行（導向無關頁面、拒絕連線），因此未達 M5-01 字面標準。

### 時間模組：歷史時區

報告 `packages/core/tests/fixtures/validation/time-fix-report.md`。

- 根因：IANA tz 自 2022b 起把冰島、挪威、荷蘭等 1970 年前歷史移到 backzone，Bun／Node 的 ICU 都不含；加上程式完全依賴執行環境的 Intl，Bun 與 Node 結果不一致（D-014 被破）。
- 修正：`packages/core/src/time/tzdb/` 內建固定版 tz 資料（2026e，含 backzone，gzip 約 31 KB，無新依賴）；tz 標為地方平時的期間改用出生地經度的地方平時；新增 `historical_zone_uncertain` 旗標。
- 代價：網站 core chunk 約多 190 KB（未壓縮）。1995 台南等 17 個現代案例輸出不變。
- **後續已完成**：`profile/validate.ts` 改用內建 tz 資料驗證名稱與別名；八字、紫微、吠陀占星、人類圖與網站報告已加入歷史時區警告。靈數、馬雅與命卦只用日期，不加此警告。D-026 等架構文件仍待對齊。

### doctor

`bun run doctor`（`packages/mcp/src/cli/doctor.ts`）：檢查 profile 目錄、MCP 真實 stdio 冒煙、桌面版設定檔（含 Store 版位置與反斜線被吃掉）；CI 使用 `--ci`。`.gitattributes` 將測試 fixtures 固定為 LF（避免 Windows autocrlf 造成 golden 比對失敗）。

---

## 附錄：v1 架構歷史里程碑（已完成）

- Phase 1 核心模型：`BirthData`、`SystemResult`、`BaseEngine`、`EngineRegistry`
- Phase 2 引擎：紫微（含 12 步大限）、靈數、命卦、Kin、八字（B1 四柱／B2 大運流年／B3 十神顯隱）
- Phase 3 Block G：`ScoringRules`、`RadarBuilder`、`AxisNotes`、雷達圖（C1–C3）
- Phase 4 Block H：`LayerClassifier`、`StateSwitchTable`、`EvolutionCalculator`、`HonestyGuard`（D1–D5）
- Phase 5 UI：React + TS、年鑑風格設計、名人命盤整合測試、Report v3、合盤
- V0：Bun workspaces 搬遷

任務細節見 [docs/TASKS.md](docs/TASKS.md)。
