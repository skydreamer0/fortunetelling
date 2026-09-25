# Roadmap — 命理計算引擎 × AI 解讀

> 狀態更新：2026-09-25（V1 第一批：V1-01／02／06／07／09 完成）
> 目標架構與介面契約：[docs/ARCHITECTURE-V2.md](docs/ARCHITECTURE-V2.md)
> 決策依據：[docs/DECISIONS.md](docs/DECISIONS.md) D-021 ～ D-029
> 現行 Report 契約（v3）：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## 核心原則

**網站自己算出確定的命盤資料，AI 只讀結果做解讀。**
排盤計算（deterministic）和 AI 解讀（generative）完全拆開，AI 任何時候都不能重新排盤。

```
使用者輸入（生日／時間／出生地／性別／姓名）
  → ① 時間標準化層 TimeContext
  → ② Calculators（八字／紫微／Numerology／Tzolkin／命卦／Jyotish／Human Design）
  → ③ 各系統 Rule Engine → Signal[]
  → ④ 跨系統 Signal Aggregator（分數／共識／矛盾）
  → ⑤ Timeline（逐年／逐月）  ⑥ Question Engine（問事）
  → ⑦ AI 解讀（只讀 JSON、必須引用 source）
  → ⑧ life_events 回驗 → 調整規則權重
```

---

## 一、現況總覽：規劃做到哪裡了？

整份規劃已經寫進 `docs/ARCHITECTURE-V2.md`，也在 DECISIONS D-021 ～ D-029 裁決。
**但程式只完成 V0（monorepo 搬遷）。V1 ～ V5 都還沒開始實作。**
目前能跑的是舊版 v1 架構：五套引擎 → 雷達／分層／演化 → Report v3 → React UI。
這套架構還沒有 TimeContext、Rule Engine、Signal、Timeline、AI。

| # | 規劃項目 | 現況 | 缺口 | 里程碑 |
|---|---|---|---|---|
| 1 | Birth Data／時間標準化層 | 🟡 部分 | `BirthData` 只有年月日時、農曆、節氣日期。**沒有**出生地／IANA 時區／UTC／Julian Day／DST／真太陽時；`longitude` 存了但沒有任何引擎使用 | V1 |
| 2 | 六套 Calculator 模組化 | 🟡 部分 | 目前是 5 套 `*Engine.js`（八字、紫微、靈數、Kin、命卦），還不是 `calculators/<system>` + `calculate(ctx)` 契約；Jyotish、Human Design 不存在 | V1／V2 |
| 3 | 八字 Engine | 🟡 部分 | ✅ 四柱、日主、藏干、十神、五行次數、10 步大運、流年。❌ 固定 Asia/Taipei、無真太陽時；❌ 流月；❌ **Rule Engine 完全沒有**（合沖刑害破、三合三會、伏吟反吟、歲運並臨） | V1 |
| 4 | 紫微 Engine | 🟡 部分 | ✅ 十二宮、主星亮度、生年四化、12 步大限（含大限四化）。❌ 身宮／五行局／命主身主沒有整理成強型別欄位；❌ 流年／流月序列；❌ **特徵權重表**（目前是亮度分數，不是 trait vector） | V1 |
| 5 | Jyotish | ❌ 未開始 | 需要 Swiss Ephemeris（WASM，D-027）、D1/D9/D10、Nakshatra、Vimshottari Dasha | V2 |
| 6 | Human Design | ❌ 未開始 | 同上，另需 Design 時刻求根（太陽黃經差 88°） | V2 |
| 7 | Numerology | 🟡 部分 | ✅ 生命靈數、表達數、靈魂數、人格數、九宮格、個人流年／流月。❌ 主數格式 `11/2`、Birthday、Attitude、Pinnacle、Challenge、多年 personalYears | V1 |
| 8 | Tzolkin | 🟡 部分 | ✅ Kin、Tone、Seal。❌ Wavespell、Castle、Oracle（引導／類比／對立／隱藏） | V1 |
| 9 | Cross-System Engine | ❌ 未開始 | 沒有 Signal 模型、沒有 `aggregateSignals()`、沒有共識／矛盾判定 | V1（單系統）→ V3（跨系統） |
| 10 | 年度 Timeline | ❌ 未開始 | UI 的「本年」只顯示當年主題文字，沒有逐年／逐月的領域分數（感情／財運／事業／移動） | V1 |
| 11 | Event Rule Engine（問事） | ❌ 未開始 | 沒有問事類別目錄、沒有逐月排名 | V5 |
| 12 | AI 解讀層 | ❌ 未開始 | 沒有 `packages/ai`、prompt、citation 後驗證 | V5 |
| — | 資料庫（users／charts／signals／life_events） | 🟡 設計稿 | `docs/db/schema.sql`（未執行）；目前純前端，人生事件只存 localStorage | V4 |
| — | Backtesting | 🟡 本地版 | `packages/core/src/backtest/`（事先固定命中定義、基準線、樣本門檻、訓練／驗證）＋「人生事件」面板；權重未調整（樣本不足） | V4 |

### 已完成的基礎（v1 架構，保留並沿用）

- 五套引擎：`ZiweiEngine`（iztro）、`BaZiEngine`、`NumerologyEngine`、`MingGuaEngine`、`DreamspellEngine`
- 透明計分：`ScoringRules`、`RadarBuilder`、`AxisNotes`（每軸都可覆核）
- 動靜分層：`LayerClassifier`（L0–L3）、`StateSwitchTable`、`EvolutionCalculator`
- `HonestyGuard`：語氣守門（V5 的 AI 輸出也要通過它）
- Report Schema v3、摘要／洞見、雙人合盤
- React 19 + TS UI、明暗主題、列印、Bun CI 與 GitHub Pages 部署
- V0：Bun workspaces（`packages/core`、`apps/web`），110 個測試全綠

### 已知技術債（V1 一併處理）

1. `BirthData.longitude`／`latitude` 是死欄位；八字、紫微都沒有真太陽時校正。
2. 八字把所有輸入都當作 Asia/Taipei 民用時間，海外出生會算錯。
3. ~~命卦用 2/4 近似立春（D-017）~~ → V1-08 已改用精確立春。
4. 沒有處理台灣歷史夏令時間（1945–1979）。這幾年出生的人，時辰可能差一個。
5. 核心仍是 `.js` + JSDoc，`tsc` 有 31 筆型別錯誤。
6. 命理套件約 850 kB，首頁沒有延遲載入。
7. 舊版 ROADMAPS 原則寫「Vanilla JS、捨棄後端、不做 Jyotish」，和 D-022／D-024／D-027 衝突。本版已改寫。

---

## 二、里程碑

完成條件以測試為準，沒有測試的項目不算完成。每個里程碑開工時，會把任務拆進 `docs/TASKS.md`（格式沿用 HARNESS_SPEC）。

### V1 — 時間層＋八字規則＋紫微權重＋Timeline（下一步）

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
| V1-16 | 核心轉 TypeScript | 新程式直接寫 `.ts`；舊檔搬進 calculators 時一併轉，清掉 31 筆型別錯誤 | 貫穿 |

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
| V2-03 🟡 | Jyotish（計算器完成，待與公開計算器交叉驗證）：ayanamsa 設定、D1/D9/D10、Nakshatra/Pada、House Lord、Vimshottari Maha/Antar Dasha（精確到日）、Transit |
| V2-04 🟡 | Human Design（計算器完成，待與公開計算器交叉驗證）：Personality／Design（88° 求根）、Gate/Line、Channel、Center、Type、Authority、Profile、Definition、Incarnation Cross |
| V2-05 | Jyotish／HD 規則 → Signal（Dasha 主星、2H/4H/7H/10H/11H 過運等） |

**完成條件**：與至少兩個公開計算器交叉驗證，≥ 20 個案例。

### V3 — 跨系統共識引擎

| ID | 任務 |
|---|---|
| V3-01 | `aggregateSignals()` 第 3 步：`consensus`（強度 ≥ θ 的系統數，≥ 3 標記「高共識」）、`conflict`（方向相反時保留並列出雙方 signal id，不做平均抵銷） |
| V3-02 | Report v5：新增 `consensus` 頂層欄位 |
| V3-03 | UI：每年每領域顯示共識徽章與矛盾說明 |
| V3-04 | 評估 Next.js（Vercel）遷移；`@fortune/core` 保持框架無關，可同時給 Web、App、API 使用 |

**完成條件**：共識與矛盾各有單元測試，包含「兩系統正、一系統負」的案例。

### V4 — 資料庫＋人生事件回驗

| ID | 任務 |
|---|---|
| V4-01 | 🟡 schema 設計稿 `docs/db/schema.sql`（未執行，無 `apps/api`）。`apps/api` + Postgres（Supabase）；資料表：`users`、`birth_profiles`（RLS、欄位加密、一鍵刪除）、`chart_snapshots`、`signals`、`rules`／`trait_weights`（版本化，只增不改）、`annual_cycles`／`monthly_cycles`、`interpretations`、`life_events`、`backtest_runs` |
| V4-02 | ❌ 未開始（無帳號憑證）。帳號與同步；**沒登入也能用**（D-029 本地優先） |
| V4-03 | ✅ 本地版：報告「驗 人生事件」面板，新增／編輯／刪除／刪除全部，依命盤指紋存於 localStorage（不上傳）。`life_events` 輸入 UI（例：2018 畢業／北上、2022 化療藥局、2024 離職、2025 藥廠、2026 回台南／KAM） |
| V4-04 | ✅ 方法與本地執行：`buildBacktestTimeline`／`runBacktest`（決定論、seed 切分、驗證集分開報告）；D-033 的權重／切點仍待多人 n ≥ 30 資料才決定。Backtesting（同時決定 D-033 懸而未決的：系統權重、四段切點、未發訊號系統是否計 0）：命中定義事先固定（事件落在個人時間軸前 25%）、以隨機時間窗作基準線、樣本 < 30 只顯示「樣本不足」、訓練與驗證分開 |
| V4-05 | 🟡 `proposeWeights` 只從驗證集 n ≥ 30 產生新版本提案（凍結物件、不改舊版）；單人資料一律回「樣本不足」。權重調整只產生新版 `trait_weights`，舊報告可用舊版本重現 |

**完成條件**：回驗報告可重現（同版本、同樣本 → 同命中率）。

### V5 — 問事系統＋AI 解讀

| ID | 任務 |
|---|---|
| V5-01 ✅ | `questions/catalog.json`：`vehicle_purchase`、`job_change`、`relationship_timing`、`startup_timing`… → domains → 各系統相關規則 |
| V5-02 ✅ | Question Engine：逐月計算 signals → 排名 → 前 3 個月份，每個月份附 source；不在目錄內的問題回「目前不支援」 |
| V5-03 | `packages/ai`：AI 只做兩件事：(a) 自然語言 → `{category, range}`（schema 驗證）；(b) 讀 JSON 寫解讀。固定系統指令：禁止重新排盤、每個結論都要引用 `signal.id`、三套以上同向才能說「高共識」、保留矛盾 |
| V5-04 | 程式後驗證（不靠 AI 自律）：citation id 必須存在；文字中出現的干支、星名、宮名、行星名必須出現在輸入 charts；通過 HonestyGuard；以 `hash(input, promptVersion, model)` 快取 |
| V5-05 | UI：問事輸入、月份排名、解讀段落點開就能看到引用的訊號 |

**完成條件**：攔截率測試。故意餵入錯誤干支或錯誤星曜的 AI 輸出，必須 100% 被丟棄。

---

## 三、執行順序建議

```
V1-01 → V1-02 ──┬─→ V1-03 ─┬─→ V1-04 ─→ V1-10 ─┐
                │          ├─→ V1-05 ─→ V1-11 ─┼─→ V1-12 → V1-13 → V1-14 → V1-15
                │          ├─→ V1-06, V1-07    │
                └─→ V1-08  └── V1-09 ──────────┘
```

- **第一步做 V1-02 TimeContext**：這一層算錯，後面全部報廢，而且現在是完全缺的。
- V1-06／V1-07（Numerology、Tzolkin 補齊）獨立、風險低，可以和主線並行。
- V2（天文層）和 V1 沒有程式依賴，可以在 V1-03 契約定案後開另一條線並行。
- V4 資料庫可以晚做；V1–V3 全部在瀏覽器內跑，不需要後端。

---

## 附錄：v1 架構歷史里程碑（已完成）

- Phase 1 核心模型：`BirthData`、`SystemResult`、`BaseEngine`、`EngineRegistry`
- Phase 2 引擎：紫微（含 12 步大限）、靈數、命卦、Kin、八字（B1 四柱／B2 大運流年／B3 十神顯隱）
- Phase 3 Block G：`ScoringRules`、`RadarBuilder`、`AxisNotes`、雷達圖（C1–C3）
- Phase 4 Block H：`LayerClassifier`、`StateSwitchTable`、`EvolutionCalculator`、`HonestyGuard`（D1–D5）
- Phase 5 UI：React + TS、年鑑風格設計、名人命盤整合測試、Report v3、合盤
- V0：Bun workspaces 搬遷

任務細節見 [docs/TASKS.md](docs/TASKS.md)。
