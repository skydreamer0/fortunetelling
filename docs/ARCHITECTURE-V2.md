# 目標架構 v2（Target Architecture）

> 狀態：**藍圖（2026-09-25 起草）**。本文件描述要遷移過去的目標架構；
> 在對應里程碑完成前，現行程式碼仍以 [ARCHITECTURE.md](ARCHITECTURE.md)（Report Schema v3）為契約。
> 決策依據：[DECISIONS.md](DECISIONS.md) D-021 ～ D-029。

---

## 0. 一句話

**網站自己算出確定的命盤資料，AI 只讀結果做解讀。**
排盤計算（deterministic）與解讀（generative）完全拆開；AI 任何時候都不得重新排盤。

```
使用者輸入（生日／時間／出生地／性別／姓名）
        │
        ▼
① 時間標準化層 TimeContext ─────────── 唯一時間來源（D-026）
        │
        ▼
② Calculators（六套 + 命卦，各自獨立）── calculate(ctx) → ChartResult
        │
        ▼
③ Rule Engines（各系統）────────────── chart × 時間窗 → Signal[]
        │
        ▼
④ Signal Aggregator（跨系統）──────────── Signal[] → 領域分數／共識／矛盾
        │
        ├──► ⑤ Timeline（逐年／逐月）
        ├──► ⑥ Question Engine（問事：哪個月適合買車？）
        ▼
⑦ AI 解讀層 ──────────────────────────── 只收 ① ～ ⑥ 的 JSON，必須引用 source
        │
        ▼
⑧ Backtesting（life_events 回驗 → 調整規則權重）
```

## 1. 設計原則（延續 v1，並新增）

1. **計算與解讀分離**（新，D-021）：`packages/core` 不得呼叫任何 LLM；AI 層不得 import 任何命理函式庫或計算器。
2. **確定性**（延續 D-014）：同一 `(BirthProfile, asOf, 規則版本)` 必須產出位元相同的 JSON。所有時間相關輸出都顯式依賴 `asOf`。
3. **可追溯**（延續 D-019/D-020）：每個分數、每句 AI 結論都要能追到 `signal.id → ruleId → componentId`。沒有 source 的結論不得輸出。
4. **資料化，不 hardcode 解讀**（新，D-028）：「七殺＝壞」這類字串禁止寫進程式。星曜、十神、宮位只輸出**特徵權重**，由資料表維護並帶版本號。
5. **保留矛盾**（新，D-023）：跨系統彙整時，系統間方向相反要標成 `conflict`，不得平均抵銷後假裝中性。
6. **誠實語氣**（延續 D-007/HonestyGuard）：L0「你是」、L1/L2「這段時期」、L3「在某情境下」。AI 輸出也要通過 HonestyGuard。
7. **本地優先**（延續 ROADMAPS 原則 1，D-029）：`core` 必須能在瀏覽器內獨立運作（不需伺服器、不需資料庫）。資料庫與 AI 都是**選用**的上層。

## 2. Repo 結構（Bun workspaces，D-024/D-025）

```
packages/
  core/                    @fortune/core — 純計算，零 IO、零 LLM
    src/
      time/                ① TimeContext：時區／DST／UTC／JD／真太陽時／節氣／農曆
      profile/             BirthProfile 驗證、地點表（離線城市經緯度）
      calculators/
        bazi/  ziwei/  numerology/  tzolkin/  mingGua/
        jyotish/  humanDesign/            ← V2
      rules/               ③ 各系統規則引擎 + 規則資料表（帶版本）
        bazi/  ziwei/  ...
      traits/              特徵權重表（星曜／十神／宮位 → trait vector）
      signals/             ④ Signal 模型、aggregator、共識／矛盾判定
      timeline/            ⑤ 逐年／逐月領域分數
      questions/           ⑥ 問事類別 → 領域 → 規則集 → 月份排名
      report/              現行 analyze()／Report v3 → v4 相容層
      index.ts             唯一公開 API
  ai/                      @fortune/ai — prompt 組裝、輸出 schema 驗證、引用檢查
apps/
  web/                     目前的 Vite UI（遷移期），V3 以後評估換 Next.js
  api/                     V4 起：Next.js route handlers 或獨立 API，接 Postgres
```

遷移採**絞殺者模式**：先用 `git mv` 把 `src/core|engines|analysis|visualization` 搬進 `packages/core`，
`apps/web` 改 import `@fortune/core`，確認 99 個既有測試全綠之後才開始改寫內部。

## 3. ① 時間標準化層（最重要，這層錯了後面全部報廢）

### 3.1 輸入

```ts
type BirthProfile = {
  date: string              // 'YYYY-MM-DD'，出生地當地民用曆
  time: string | null       // 'HH:mm'；null = 時間未知
  timeAccuracy: 'exact' | 'approx15m' | 'approx1h' | 'unknown'
  gender: 'male' | 'female'
  name?: string
  birthplace: {
    label: string           // 'Tainan, Taiwan'
    lat: number
    lng: number
    timezone: string        // IANA，例如 'Asia/Taipei'（不得存固定 offset）
  }
}
```

### 3.2 輸出

```ts
type TimeContext = {
  profile: BirthProfile
  local:  { iso: string, utcOffsetMinutes: number, dst: boolean }
  utc:    { iso: string }
  jd:     { ut: number, tt: number, deltaTSeconds: number }
  solar:  { lmtIso: string, trueSolarIso: string, equationOfTimeMinutes: number }
  lunar:  { year, month, day, isLeap, ... }
  solarTerms: { prevJie: {name, utcIso}, nextJie: {name, utcIso}, ... }
  flags:  TimeFlag[]        // 見 3.3
}
```

### 3.3 必須處理並以 `flags` 明示的邊界情況

| flag | 情況 | 影響 |
|---|---|---|
| `dst_applied` | 歷史夏令時間（台灣 1945–1979 有多段） | 由 IANA tzdata 處理；**禁止**手寫 DST 表 |
| `dst_gap` / `dst_overlap` | 撥鐘時不存在或重複的時間 | 要求使用者確認 |
| `near_shichen_boundary` | 距時辰交界 < 精度容忍值 | 八字時柱、紫微命宮可能兩解 → 兩盤並算 |
| `near_jie_boundary` | 距節氣交節 < 精度容忍值 | 八字月柱、年柱（立春）可能兩解 |
| `zi_hour_convention` | 23:00–00:59 | 早晚子時換日約定由各 calculator 的 config 決定 |
| `time_unknown` | `time === null` | 需時間的系統標示不可算，不得猜測 |

### 3.4 各系統時間約定（顯式 config，不得隱含）

| 系統 | 使用的時間 | 可設定項 |
|---|---|---|
| 八字 | 真太陽時（預設開）＋節氣交節精確時刻 | `useTrueSolarTime`、`ziHourConvention` |
| 紫微 | 真太陽時換算時辰 → iztro `timeIndex` | 同上 |
| Jyotish／Human Design | UT（JD） | ayanamsa（Jyotish） |
| Numerology／Tzolkin | 出生地民用曆日期 | Tzolkin 錨定（D-004） |
| 命卦 | 立春精確時刻（修正 D-017 的 Feb-4 近似） | — |

## 4. ② Calculator 契約

```ts
interface Calculator<TChart> {
  id: SystemId                          // 'bazi' | 'ziwei' | 'numerology' | 'tzolkin' | 'mingGua' | 'jyotish' | 'humanDesign'
  version: string                       // 計算器 semver；改演算法必 bump
  requires: { time: boolean; location: boolean; name: boolean }
  calculate(ctx: TimeContext, config?: object): ChartResult<TChart>
}

type ChartResult<TChart> = {
  system: SystemId
  version: string
  chart: TChart                         // 系統專屬、強型別（見下）
  components: Component[]               // 沿用 v1：供 LayerClassifier／Radar／Summary
  warnings: string[]
}
```

`calculate` 必須是純函式：不讀系統時間、不讀環境變數，也不做網路或檔案 IO。

### 4.1 各系統 `TChart` 重點

- **八字**：`pillars{year,month,day,hour}`、`dayMaster`、`hiddenStems`、`tenGods`、`fiveElements`（僅次數，D-019）、`luckCycles[]`（起運歲數精確到月）、`annualCycles[]`。
- **紫微**：12 個 `ZiweiPalace { palace, stem, branch, majorStars[], minorStars[], transformations[], decadeRange }`，再加 `soulPalace`、`bodyPalace`、`fiveElementBureau`、`soulMaster`、`bodyMaster`、`natalTransformations`，以及大限／流年／流月序列、`sanFangSiZheng` 索引。
- **Numerology**：`lifePath`（保留主數 `'11/2'`）、`birthday`、`attitude`、`expression`、`soulUrge`、`pinnacles[4]`、`challenges[4]`、`personalYears{}`。
- **Tzolkin**：`kin`、`tone`、`seal`、`wavespell`、`castle`、`oracle{guide,analog,antipode,occult}`。
- **Jyotish**（V2）：`lagna`、`planets[]`（sign／degree／nakshatra／pada／house／dignity）、`divisionalCharts{D1,D9,D10}`、`dasha[]`（maha／antar，精確到日）、`houseLords`。
- **Human Design**（V2）：`personality`／`design` 兩組行星啟動（design = 出生前太陽黃經差 88° 的時刻，以數值求根算出）、`gates`、`channels`、`definedCenters`、`type`、`authority`、`profile`、`definition`、`incarnationCross`。

行星位置一律交給 Swiss Ephemeris（WASM 版，瀏覽器可跑）計算，**不自己推算**（D-027）。

## 5. ③ Rule Engine

規則是**資料 + 小型判定函式**，不是散落在各處的 if/else。

```ts
type Rule = {
  id: string              // 'bazi.branch.clash'（六沖）
  version: number
  system: SystemId
  scope: 'natal' | 'decade' | 'year' | 'month'
  match(chart, window): RuleHit[]       // 純函式
  emits: SignalTemplate[]               // 命中後產出哪些 domain × trait
}
```

- **八字規則集**：天干五合、生剋、六合、六沖、三合、三會、刑、害、破、伏吟、反吟、歲運並臨。對象可以是原局、原局 × 大運、原局 × 流年、原局 × 流月。
- **紫微規則集**：四化飛入、大限／流年命宮疊宮、三方四正煞曜會照、天馬、祿存等。
- 每條規則在 `rules/<system>/catalog.json` 登錄 `id / version / 說明 / 古籍或慣例出處`。`ScoringRules` 的透明匯出延伸到這裡（Report 裡的 `scoringRules` 會含規則目錄）。

### 5.1 特徵權重（D-028）

```json
{ "id": "ziwei.star.七殺", "version": 1,
  "traits": { "change": 0.8, "leadership": 0.7, "risk": 0.65, "independence": 0.8 } }
```

最終權重 = 基礎 trait × 宮位修正 × 旺陷修正（沿用 D-005 七級）× 煞曜／四化修正。每個修正因子都要記在 `signal.evidence.modifiers` 裡，可以逐項覆核。

## 6. ④ Signal 與跨系統彙整

```ts
type Domain = 'self' | 'career' | 'wealth' | 'relationship' | 'family'
            | 'movement' | 'property' | 'learning' | 'contract' | 'health'
type Trait  = 'change' | 'growth' | 'stability' | 'pressure' | 'opportunity'
            | 'connection' | 'separation' | 'visibility' | ...   // 封閉列舉，擴充要改版

type Signal = {
  id: string                 // 由 (system, ruleId, ruleVersion, window, target) 決定性雜湊
  system: SystemId
  ruleId: string
  ruleVersion: number
  domain: Domain
  trait: Trait
  intensity: number          // 0–1：這個訊號有多強
  valence: number            // -1–1：支撐（+）或壓力（−）；0 = 純變動
  window: { grain: 'natal' | 'decade' | 'year' | 'month', start: string, end: string }
  evidence: { componentIds: string[], text: string, modifiers: Modifier[] }
}
```

### 6.1 彙整演算法（`aggregateSignals`）

以 `(domain, window)` 為單位，分三步：

1. **系統內合併**：同一系統的多條訊號用 noisy-OR 合併，`1 − Π(1 − intensityᵢ)`。這樣規則多的系統不會因為條數多就壓過其他系統。
2. **跨系統加權**：`score = Σ wₛ · sysScoreₛ / Σ wₛ`，得出 0–100。系統權重 `wₛ` 是資料，V4 由回驗調整。
3. **共識與矛盾**：
   - `consensus = 強度 ≥ θ 的系統數`；≥ 3 標記為「高共識」。
   - 同時有系統 valence > +τ 和系統 valence < −τ，就標記 `conflict`，並列出雙方 signal id。

跨系統彙整**只存在於 signals 層**。v1 的雷達維持「每系統一張」（D-009 保留，D-023 補充）。

## 7. ⑤ Timeline

- 輸出 `asOf` 年起連續 N 年（預設 5 年），以及當年 12 個月的領域分數。
- 後端保留 0–100 分數；UI 顯示四段：**低 / 中 / 中高 / 高**，切點是資料（例如 35／55／75）。
- 每格都帶 `topSignals[]`，點開可以看到是哪些規則造成的。

## 8. ⑥ Question Engine（V5）

```
「2026～2027 何時適合買車？」
   │  AI 只做一件事：把自然語言轉成下面這個結構（schema 驗證 + enum 封閉）
   ▼
{ category: 'vehicle_purchase', range: ['2026-01', '2027-12'] }
   │  以下全部確定性計算
   ▼
questions/catalog.json：vehicle_purchase → domains [wealth, property, movement, contract]
                                     → 各系統相關規則（八字 財星／驛馬…；紫微 財帛／田宅／遷移／天馬…；Jyotish 2H/4H/11H…）
   ▼
逐月計算 signals → 排名 → 前 3 個月份 + 每月的 source
```

類別目錄不在清單內的問題，一律回「目前不支援此類問題」，不得即興發揮。

## 9. ⑦ AI 解讀層（`packages/ai`）

**輸入**只有：`{ profile(去識別化), charts{…}, signals[], timeline, question? }`。

**系統指令（固定）：**
- 禁止重新排盤或推算任何干支、星曜、行星位置；只能使用提供的計算結果。
- 每個重要結論都必須引用至少一個 `signal.id`。
- 三套以上系統同向時才可以用「高共識」措辭。
- 系統間矛盾必須保留並說明，不得擇一。
- 遵守 L0–L3 語氣規則。

**輸出**為結構化 JSON：`{ sections: [{ text, citations: signalId[] }] }`。

**後驗證**（程式執行，不靠 AI 自律）：
1. `citations` 中的每個 id 都必須存在於輸入 → 否則整段丟棄。
2. 文字中出現的干支、星名、宮名、行星名，都必須出現在輸入 charts 裡 → 否則丟棄（防止 AI 自己排盤）。
3. 通過 HonestyGuard。
4. 以 `hash(input, promptVersion, model)` 快取，確保同樣輸入的結果穩定。

## 10. ⑧ 資料層與回驗（V4，選用）

Postgres（Supabase 類）。瀏覽器單機模式不需要資料庫（D-029）。

```
users
birth_profiles        -- 敏感個資：RLS、欄位加密、可一鍵刪除
chart_snapshots       -- (profile_id, system, calculator_version, input_hash) → chart jsonb
signals               -- (snapshot_id, rule_id, rule_version, window, domain, ...) 
rules / trait_weights -- 版本化；舊版本不可變更，只能新增
annual_cycles / monthly_cycles  -- timeline 快取
interpretations       -- AI 輸出 + 使用的 prompt/model 版本 + citations
life_events           -- (profile_id, date, category, domain, description, confidence)
backtest_runs         -- 規則版本、樣本數、命中率、日期
```

### 10.1 回驗方法（避免自欺）

- **命中定義要在執行前固定**：事件所在的 `(domain, window)` 分數落在該使用者全時間軸前 25% 才算命中。
- **基準線**：同一使用者的隨機時間窗命中率（理論上約 25%）。規則的命中率要顯著高於基準線才有意義。
- **樣本門檻**：一條規則的事件數少於 30 筆時，只顯示「樣本不足」，不調整權重。
- **切分驗證**：調整權重用一部分事件，另一部分事件留作驗證集，只看驗證集的命中率。
- 權重調整只會產生新版本的 `trait_weights`，舊報告可以用舊版本重現。

## 11. Report Schema 演進

- **v4**（V1 完成時）：新增 `timeContext`、`signals`、`timeline` 三個頂層欄位，其餘沿用 v3（依 D-012 升版條款）。 ✅ V1-14 已實作（D-032，ARCHITECTURE §4.3）。
- **v5**（V3）：新增 `consensus`（跨系統共識／矛盾摘要）。
- AI 輸出**不進** Report，而是獨立的 `Interpretation` 物件，引用 Report 的 `schemaVersion` 與 `generatedAt`。

## 12. 里程碑

| 版本 | 內容 | 完成條件 |
|---|---|---|
| **V0 ✅** | 清理重複檔 ✅；Bun workspace ✅；搬遷到 `packages/core` / `apps/web` ✅；TS 設定（allowJs）✅，既有 JSDoc 型別錯誤 31 筆留待 V1 轉 `.ts` 時清掉 | 既有 99 tests 全綠，UI 行為不變 |
| **V1** | TimeContext；BirthProfile + 離線城市表；八字規則引擎；紫微特徵權重；Numerology 補 pinnacle/challenge；Tzolkin 補 wavespell/castle/oracle；Signal 模型 + 單系統彙整；Timeline；Schema v4 | 黃金測試：台灣 DST 年份、時辰／節氣邊界、早晚子時 |
| **V2** | Swiss Ephemeris 接入（D-027）；Jyotish；Human Design | 與至少兩個公開計算器交叉驗證 ≥ 20 個案例 |
| **V3** | 跨系統共識／矛盾引擎；Schema v5；評估 Next.js | 共識、矛盾都有單元測試 |
| **V4** | 資料庫、帳號、life_events、回驗 | 回驗報告可重現 |
| **V5** | Question Engine + AI 解讀層 | 後驗證攔截率測試：故意餵入錯誤干支的輸出必須被丟棄 |

各任務細節會在每個里程碑開始時寫進 [TASKS.md](TASKS.md)，格式沿用現行的 HARNESS_SPEC。
