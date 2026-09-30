# Roadmap 草案 — 程式先算完，AI 在對話中查詢與比對

> 狀態：**草案，待確認**（2026-09-30）。確認後會取代 [ROADMAPS.md](ROADMAPS.md) 的「核心原則」與 V5，V1–V4 的既有成果全部保留。

## 一、方向校正

**產品形狀**：圖形介面（整理與呈現命盤資料）＋ 本機 AI 對話（下結論、討論）。

```
輸入（生日／時間／出生地／性別）
  → 程式：把「能邏輯化的」全部算完
       TimeContext → Calculators → Rule Engine → Signal → 共識／矛盾 → Timeline → 問事排名
  → 兩條出口
       ① 圖形介面（網站，給人看）
       ② 本機 MCP server／匯出檔（給 Claude 桌面版查詢，給 AI 討論）
  → 你在 Claude 桌面版對話，AI 按需查詢、比對、下結論
```

**原則**

1. **能確定的交給程式**：排盤、規則、訊號、共識、逐月分數。AI 不重新排盤、不心算。
2. **AI 負責最後一段**：跨系統比對、綜合判斷、回答你的問題、對話追問。
3. **AI 按需查詢，不是一次吞下全部**：模組越多越不能全部塞進 prompt。每個模組只是多一個工具。
4. **本機優先**：資料留在你的電腦，不需要 API key、不需要伺服器、不需要去識別化。
5. **保留矛盾、標示不確定**：系統間方向相反就並列；分數未校準（D-033）要讓 AI 知道，不能當成準確度。

## 二、現況（不動的部分）

| 區塊 | 狀態 |
|---|---|
| 時間層、profile、七套 calculator | ✅ 保留（Jyotish／HD 待交叉驗證） |
| 八字／紫微規則、Signal、共識、Timeline、問事、回驗 | ✅ 保留，視為「給 AI 的結構化訊號」 |
| 網站 UI（十二宮盤、時間軸、合盤、人生事件） | ✅ 保留 |
| `packages/ai` 的去識別化、24000 字預算、Anthropic client、section 後驗證 | 🟡 為「網站呼叫 API／複製貼上」設計，不符合本機對話用法 → M3 整理 |
| 「複製 prompt」 | 🟡 保留為沒有桌面版時的備援 |

## 三、里程碑

### M1 — 本機 MCP server（核心，最優先）

新增 `packages/mcp`（`@fortune/mcp`），包裝 `@fortune/core`，以 stdio 跑在本機，Claude 桌面版當工具使用。

| ID | 任務 | 產出 |
|---|---|---|
| M1-01 | 套件骨架＋Bun 執行、`claude_desktop_config.json` 設定範例 | `packages/mcp`、`docs/MCP-SETUP.md` |
| M1-02 | 命盤存取：`load_profile`（讀本機 JSON）、`list_profiles` | 不經網站也能用 |
| M1-03 | 查詢工具：`get_chart(system)`、`get_time_context`、`get_flags`（時辰／節氣邊界、DST、時間未知） | 回傳強型別 JSON，附欄位說明 |
| M1-04 | 訊號工具：`list_signals({domain, system, range, minStrength})`、`get_signal(id)`（附 evidence／modifiers） | AI 可追溯每個結論 |
| M1-05 | 時間軸與共識：`get_timeline(year)`、`get_consensus(year)`、`list_conflicts` | 共識與矛盾直接查得到 |
| M1-06 | 問事：`answer_question({category, range})`、`list_question_categories` | 直接重用 `answerQuestion` |
| M1-07 | 合盤：`compare_profiles(a, b)` | 重用 `analyzeCompatibility` |
| M1-08 | 資料品質提示：每個回應附 `caveats`（分數未校準、時間精度、哪些系統未參與） | 避免 AI 過度自信 |
| M1-09 | 測試：工具輸出與 `analyze()` 位元一致、決定論、未知 id 回結構化錯誤 | `bun test` 覆蓋 |

**完成條件**：在 Claude 桌面版問「我 2027 年哪幾個月適合買車？」，它會呼叫 `answer_question`＋`list_signals`，答案引用的訊號 id 都真實存在。

### M2 — 匯出檔（備援，也是離線／分享用）

| ID | 任務 |
|---|---|
| M2-01 | 網頁「匯出給 Claude」：輸出資料夾 `chart.json`／`signals.json`／`timeline.json`／`consensus.json`，**不砍資料、不去識別化** |
| M2-02 | 隨附 `README.md`（給 AI 看）：欄位說明、哪些是確定性計算、哪些分數未校準、建議的分析步驟 |
| M2-03 | 網頁匯出檔與 MCP 輸出共用同一份序列化（單一來源） |

### M3 — 整理 AI 層（`packages/ai`）

| ID | 任務 |
|---|---|
| M3-01 | 標明兩條路：`copy`（備援）與 `mcp`（主線）；`client`／`anthropic` 改為選用，不進主線 |
| M3-02 | 去識別化與字數預算改為「可選」，本機匯出預設關閉 |
| M3-03 | 保留後驗證的詞彙檢查（`vocab`／HonestyGuard），改成獨立工具 `check_answer`，你貼回 AI 的回答可自行檢查 |
| M3-04 | 系統指令改寫為「對話助手」版本：可用工具、如何引用訊號、何時說高共識、如何呈現矛盾 |

### M4 — 網站對接

| ID | 任務 |
|---|---|
| M4-01 | 「問 AI」章節改為兩個入口：**用 Claude 桌面版討論**（顯示 MCP 設定步驟＋匯出）、**複製 prompt**（備援） |
| M4-02 | 網站的資料可一鍵存成本機 profile，供 MCP 讀取 |
| M4-03 | （選用）網站顯示「AI 引用了哪些訊號」：貼回結論後用 M3-03 對照 |

### M5 — 補齊計算端（沿用原 roadmap，優先序在 M1 之後）

| ID | 任務 |
|---|---|
| M5-01 | V2-03／04：Jyotish、Human Design 與公開計算器交叉驗證（≥ 20 案例） |
| M5-02 | V2-05：Jyotish／HD 規則 → Signal，補上後自動出現在 MCP 工具 |
| M5-03 | 新模組進場流程：calculator → rules → Signal，**不需改 AI 層**，MCP 工具自動涵蓋 |
| M5-04 | V4 回驗：累積多人資料（n ≥ 30）後才調權重（維持 D-033） |

## 四、暫停或取消

- V3-04（Next.js 遷移）：暫停，沒有需求。
- V4-01／02（資料庫、帳號同步）：暫停；本機優先，MCP 直接讀本機檔案。
- V5-06（網站內直接呼叫模型／BYOK）：取消，被 MCP 取代。

## 五、執行順序

```
M1-01 → M1-02 → M1-03 → M1-04 → M1-05 → M1-06 → M1-07 → M1-08 → M1-09
                              ↘ M2（共用序列化）
M1 完成 → M3 → M4        M5 可與 M1 並行（不同區塊）
```

第一個可用版本：M1-01 ～ M1-06，加上設定說明。

## 六、需要你確認

1. **MCP 為主、匯出檔為備援**，這個順序對嗎？
2. **姓名、生日不去識別化**（本機使用），可以嗎？
3. 資料庫與帳號同步先暫停，是否同意？
4. Claude 桌面版的實際使用情境：只有你一個人用，還是之後要給別人？（影響要不要做安裝包與多人 profile 管理）

## 七、審閱修正建議

以下項目建議在草案正式取代 `ROADMAPS.md` 前處理。方向維持「程式確定性計算＋本機 MCP 供 AI 按需查詢」，主要補齊資料契約、狀態管理與目前程式現況的落差。

### A. 先補一個 M0.5：Profile 與序列化契約

目前 M1-02 直接讓 MCP 讀本機 JSON，M4-02 又規劃讓網站一鍵存成本機 profile，但現行網站是 GitHub Pages／瀏覽器環境，資料主要存於 `localStorage`，無法直接替本機 MCP 維護任意檔案。

建議在 M1 前增加：

| ID | 任務 | 產出 |
|---|---|---|
| M0.5-01 | 定義 `ProfileSchemaV1` 與穩定 `profileId` | 單一 profile 格式與版本欄位 |
| M0.5-02 | 定義 canonical serializer | MCP、網站匯出、測試共用同一份序列化 |
| M0.5-03 | 定義 import/export 流程 | 網站下載 `.fortune.json`，MCP `import_profile` 或讀固定 profiles 目錄 |
| M0.5-04 | 定義版本資訊 | `coreVersion`、`profileSchemaVersion`、規則／catalog version、`asOf`、ephemeris 狀態 |

避免 M1、M2、M4 各自產生不同格式。

### B. MCP 工具改為顯式 profileId，避免隱藏狀態

`load_profile` 容易形成「目前載入哪一個人」的隱藏 session state。未來同時查多人命盤、合盤或 Claude 平行呼叫工具時，容易查錯 profile。

建議 MCP server 儘量 stateless：

```text
list_profiles()

get_profile({ profileId })

get_chart({
  profileId,
  system,
  asOf,
  detail: "summary" | "full"
})

list_signals({
  profileId,
  domain?,
  system?,
  range?,
  minStrength?,
  limit?,
  cursor?
})

get_signal({
  profileId,
  signalId
})

get_timeline({
  profileId,
  asOf,
  range?,
  domain?
})

get_consensus({
  profileId,
  asOf,
  range?
})

answer_question({
  profileId,
  category,
  range,
  asOf
})

compare_profiles({
  profileIdA,
  profileIdB,
  asOf
})
```

所有時間相關工具都明確帶 `asOf`，延續 D-014 的決定論原則。

### C. 修正 Jyotish／Human Design 的 roadmap 現況描述

目前 repo 已經存在：

- `calculators/jyotish` 與 `calculators/humanDesign`
- 兩者各自的 `rules.ts`
- `buildTimelineAsync()` 已能納入 Jyotish／Human Design
- 但兩套 calculator 仍待公開計算器交叉驗證，且同步 `analyze()`／公開 `CALCULATORS` registry 並未完整納入兩者

因此 M5 建議改成：

| ID | 任務 |
|---|---|
| M5-01 | Jyotish／Human Design 與至少兩個公開計算器交叉驗證，≥ 20 案例 |
| M5-02 | 驗證前標記為 `experimental`，MCP 回應必須附 `verified: false`／caveat |
| M5-03 | 驗證完成後正式納入 public API／registry，確認 sync／async 行為邊界 |
| M5-04 | 回驗累積多人資料 n ≥ 30 後才調權重，維持 D-033 |

M1 不必被這兩套系統阻塞，但未驗證系統不可和已驗證系統用相同信心標示。

### D. M1-09 的「位元一致」要改成 canonical contract

`analyze()` 含 `generatedAt` 等時間戳，且 sync `analyze()` 與需要 ephemeris 的 async timeline 路徑不同，因此直接要求 MCP 工具輸出與完整 `analyze()` 位元一致不合理。

建議改成：

- 同一 `profile + asOf + config + rule/catalog version` 的 canonical payload 位元一致
- 排除 `generatedAt`／執行時間等非決定性欄位
- sync 與 async 路徑分開做 golden contract test
- MCP 只包裝 core 結果，不自行重新計算第二套邏輯

### E. MCP 回傳量要有限制

「AI 按需查詢」的核心目的會被過大的工具輸出抵消。建議：

- `get_chart.detail = summary | full`
- `list_signals` 支援 `limit`／`cursor`
- `get_timeline` 支援 `range`／`domain`
- 預設只回必要 evidence，完整 modifiers 由 `get_signal(id)` 再取
- 每個工具回傳 `caveats`、`versions`、`asOf`

### F. 隱私敘述需再切兩層

「本機 MCP server」代表原始 profile 可以保留在本機，但工具結果被 Claude 使用後，相關資料會進入 AI 對話上下文。

因此建議：

- 本機 profile：可保留完整姓名、生日、出生地
- MCP 預設輸出：以 `profileId` 與 derived data 為主，姓名預設不回傳
- 原始出生資料：只有明確需要時才由工具提供
- 匯出增加兩種 preset：
  - `local-full`：完整資料
  - `share-redacted`：移除姓名與非必要出生地標籤

M2-01 的「分享用＋完全不去識別化」應拆開。

### G. 匯出格式增加 manifest

M2 建議從四個裸 JSON 擴充為：

```text
manifest.json
profile.json
chart.json
signals.json
timeline.json
consensus.json
README.md
```

`manifest.json` 至少包含：

- `exportSchemaVersion`
- `profileSchemaVersion`
- `coreVersion`
- rule/catalog versions
- `asOf`
- 參與／略過的 systems
- ephemeris 模式與 warnings
- 是否 redacted

### H. 建議調整執行順序

```text
M0.5 Profile／序列化契約
  ↓
M1 MCP server
  ↓
M2 匯出／匯入
  ↓
M3 AI layer 整理
  ↓
M4 Web 對接與安裝體驗

M5 計算驗證可與 M1～M4 並行
```

第一個可用版本仍可維持 M1-01～M1-06，但應先完成 M0.5，且 Jyotish／Human Design 在驗證完成前標記 experimental。

### I. 建議修改完成條件

M1 完成條件建議改為：

> 在 Claude Desktop 問「我 2027 年哪幾個月適合買車？」時，Claude 先以 `profileId` 呼叫 `answer_question`，需要細節時再呼叫 `list_signals`／`get_signal`。所有引用 signal id 必須存在；回應附 `asOf`、版本與 caveats；同一輸入與版本重跑得到相同 canonical 結果。

這樣可以同時驗收 MCP 介面、決定論、可追溯性與 context 控制。
