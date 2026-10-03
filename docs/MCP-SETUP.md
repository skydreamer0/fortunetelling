# 本機 MCP server 設定（Claude 桌面版）

> 對應 ROADMAPS.md M1。MCP 只包裝 `@fortune/core`：排盤、規則、訊號、共識都由程式算完，Claude 只負責查詢、比對與對話。資料全部留在本機。

## 1. 安裝

```bash
bun install
```

## 2. 建立 profile

profile 是 profiles 目錄下的 `<profileId>.fortune.json`（預設 `~/.fortune/profiles/`，可用環境變數 `FORTUNE_PROFILES_DIR` 改）。網站的「匯出」按鈕在 M4-02 才會有；已有 `.fortune.json` 時，可以在對話裡請 Claude 用 `import_profile`（帶檔案路徑或全文）匯入。沒有檔案時先用指令建立：

```bash
bun run --filter @fortune/mcp add-profile sky \
  --date 1990-05-17 --time 08:30 --gender female --city 台南 --name 王小明
```

- `profileId`（這裡的 `sky`）是你取的名字：小寫字母、數字、`-`、`_`，最長 32 字。之後查詢都用它。
- 出生時間不確定就不要給 `--time`（或加 `--accuracy approx1h`）；需要時間的系統會標示「不可算」，不會亂猜。
- 城市不在內建表裡：改用 `--lat 35.68 --lng 139.69 --tz Asia/Tokyo --place Tokyo`。

## 3. 接上 Claude 桌面版

編輯設定檔：

- macOS：`~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows：`%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "fortune": {
      "command": "bun",
      "args": ["run", "/絕對路徑/fortunetelling/packages/mcp/src/bin.ts"],
      "env": { "FORTUNE_PROFILES_DIR": "/Users/你/.fortune/profiles" }
    }
  }
}
```

`command` 若找不到 `bun`，改成 `which bun` 印出的完整路徑。存檔後完全結束並重開 Claude 桌面版。

## 4. 工具一覽

所有時間相關工具都**明確帶 `asOf`**（`YYYY-MM-DD`）；沒有「目前載入哪個人」的狀態，每次都帶 `profileId`。

| 工具 | 用途 |
|---|---|
| `list_profiles` | 列出可用 profile（只有 id 與指紋，不含姓名、生日） |
| `get_profile` | 性別、時間精度、時區；姓名與出生資料要加 `includeName`／`includeBirthData` 才會回 |
| `get_chart` | 單一系統命盤（`summary`／`full`） |
| `get_time_context` | 真太陽時、節氣、農曆，以及邊界與夏令時間等 flags |
| `list_signals` / `get_signal` | 規則訊號（可篩選、分頁）與單筆完整證據 |
| `get_timeline` | 逐年各領域分數；加 `months: {start,end}`（`YYYY-MM`，最多 36 個月）才回逐月；指定 `domain` 時逐月為每月一列的 `monthTable`。可帶 `systems`／`verifiedOnly` |
| `get_consensus` / `list_conflicts` | 跨系統共識與矛盾；`get_consensus` 可帶 `systems`／`verifiedOnly`（`list_conflicts` 不篩選） |
| `answer_question` / `list_question_categories` | 問事（例如「哪幾個月適合買車」）月份排名；先用 `list_question_categories` 取得 category id，或直接帶 `question` 讓固定關鍵字表決定類別（比對不到或並列會回 `invalid_args` 與 `availableCategories`，不猜）。預設精簡回傳前 3 名＋排名表，附 `experimentalSensitivity`；可帶 `systems`／`verifiedOnly` |
| `compare_profiles` | 雙人合盤（姓名與出生資料不會出現在結果中） |
| `check_answer` | 貼回一段 AI 回答（`profileId`、`asOf`、`answerText`），檢查引用的 `sig_` id 是否存在、有無宿命論或保證式用語、有沒有把 experimental 系統（Jyotish、Human Design）當成「高共識」。只標示、不改寫；回 `{ ok, citedIds, unknownCitations, issues[] }` |
| `import_profile` | 匯入網站匯出的 `.fortune.json`（`content` 全文或 `path` 路徑二選一）。已存在同名 profile 不會覆蓋，要 `overwrite: true`；指紋缺漏或過期會重算並警告 |

每個回應都是 `{ asOf, versions, caveats, data }`：

- `versionsHash`：版本區塊（core、calculator、規則目錄版本與 ephemeris 狀態）的 12 碼雜湊，不含 `asOf`。同一輸入同一版本會得到相同結果；雜湊變了代表版本變了。
- `versions`：完整版本區塊（約 500 bytes）只在 `list_profiles` 與 `get_profile` 回傳，其餘工具只回 `versionsHash` 以節省上下文。
- `caveats`：Claude 不該過度相信的地方——分數未校準、時間邊界、未參與的系統、**Jyotish／Human Design 尚未交叉驗證（`experimental`）**。
- 回應太大時不會截斷，而是回 `response_too_large` 並提示縮小範圍。

回傳瘦身：

- `get_timeline`、`get_consensus` 很長的訊號清單（`signalIds`、`topSignalIds`）預設只保留前 5 筆，旁邊的 `…Total` 欄位是完整筆數。帶 `detail: true` 取得完整清單；單一訊號用 `get_signal`。
- `answer_question` 預設是精簡版（典型 12 個月約 3.3～3.7 KB，目標 < 4 KB）：
  - `top`：前 3 名，每名 `{ rank, month, score, band, highConsensus, domains, signalIds, oneLine }`。`domains` 是每個領域一行摘要（例：「財運 54.1：活躍61.1／支撐54.2／風險7／共識2」，數字取小數 1 位）；`signalIds` 最多 3 個（支撐最強 2 個＋風險最強 1 個，不足依序補），都能用 `get_signal` 查到；`oneLine` 是程式以固定模板產生的一句話理由（不經 LLM）。
  - `ranking`：每個月一列 `[月份, 分數, band]`（`rankingColumns` 說明欄位），不截斷。
  - `detail: true` 回完整結構（`domainScores`、`supportSignals`、`riskSignals`、全部 id、`conventions`）；排名與分數與精簡版完全相同。
- `get_timeline` 的逐月 cell 預設不含 `perSystem`（`detail: true` 才有）。指定 `domain` 且未帶 `detail` 時，逐月改為 `monthTable: { domain, columns, rows }`，每月一列 `[month, score, band, consensus, highConsensus, hasConflict, topSignalIds, topSignalIdsTotal]`，回應 `monthsFormat: "table"`；要舊的巢狀 cell 就帶 `monthsFormat: "cells"`。

指定系統（`answer_question`、`get_timeline`、`get_consensus`）：

- `systems`：系統 id 陣列，可用 `bazi`、`ziwei`、`numerology`、`jyotish`、`humanDesign`。分數、共識、矛盾都由 core 只從這些系統的訊號重算，不是事後乘係數。
- `verifiedOnly: true`：排除 experimental 的吠陀占星（Jyotish）與人類圖（Human Design）；可與 `systems` 併用。
- 回應一律帶 `systemsUsed`、`excludedSystems`、`experimentalIncluded`；有排除時 caveats 會多一條 `systems_excluded`。
- 未知名稱、空陣列、或篩完沒有任何參與系統 → `invalid_args`，`details.availableSystems` 列出可用名稱。
- 注意：某領域在某月完全沒有訊號時，該領域以 0 分計入、權重仍在分母；領域內沒發聲的系統則不計入平均。所以排除某系統可能讓某些領域變成 0。

敏感度提示（`answer_question` 的 `experimentalSensitivity`）：

- 同一問題、同一範圍各算一次「含 experimental 系統」與「僅已驗證系統」的排名，回 `{ top3All, top3VerifiedOnly, changed, verifiedSystems }`（前 3 名的月份與分數）。
- `changed` = 兩邊前 3 名的月份或名次不同。為 true 時 caveats 會多一條 `experimental_sensitive`：結論取決於尚未驗證的系統，回答時要明講，不要當成穩定結論。

`answer_question` 的類別與範圍：

- `category`（明確 id）優先於 `question`；回傳 `categoryResolvedFrom` 為 `"explicit"` 或 `"question"`。
- `range` 省略時為 `asOf` 當月起共 12 個月，回傳的 `range` 即實際範圍，`rangeResolvedFrom` 為 `"default"`（明確給的為 `"explicit"`）。

`get_timeline` 的逐月：core 的 timeline 只建 `asOf` 當年的 12 個月，所以舊版只有 `range` 落在 `asOf` 當年時才有 `months`，其他情況永遠是 `[]`。現在 `months: {start,end}` 會逐年補算（範圍限 `asOf` 前 5 年到後 10 年），不帶 `months` 就只回年度。`range` 只篩年度 cell。

### 建議的對話指示

server 連線時會自動把下面這段當作 `instructions` 送給客戶端；若你的客戶端不會顯示它，可以手動貼到 Claude 桌面版的「專案指示」。這段文字的唯一來源是 `packages/ai/src/instructions.ts` 的 `MCP_SERVER_INSTRUCTIONS`（測試會比對本文件與程式是否一致，改字請兩邊一起改）。

```text
你是命理對話助手：排盤與分數都由本機工具算好，你只查詢與解釋，不自行排盤。
1. 先 list_profiles 取得 profileId；所有時間工具都要帶 asOf（YYYY-MM-DD，使用者沒說就用今天並告知）。
2. 問事先用 answer_question，再用 get_signal／list_signals 查證據；可用 systems 或 verifiedOnly 只看指定／已驗證系統。experimentalSensitivity.changed 為 true 時，要明講結論取決於未驗證系統。
3. 結論附〔sig_…〕，id 逐字取自工具回傳；查不到就說資料裡沒有。
4. 「高共識」需至少 3 套已驗證系統；吠陀占星 Jyotish、人類圖 Human Design 是實驗性系統，不得計入，引用時要註明。
5. 分數未校準，不是機率；若最高分仍在「低」帶，直說「沒有哪個月特別突出」，不硬推薦。
6. 系統矛盾時兩邊都講；語氣用傾向，不說一定會、保證、注定。
重要結論送出前可用 check_answer 自我檢查。
```

需要更完整的守則（各工具用法、矛盾呈現、experimental 降信心、語氣規則）時，用 `@fortune/ai/mcp` 的 `CONVERSATION_SYSTEM_INSTRUCTION`，它以上面這段開頭。

## 5. 試試看

在 Claude 桌面版問：

> 我（profileId: sky）2027 年哪幾個月適合買車？asOf 用今天。

預期 Claude 先呼叫 `answer_question`，需要細節時再呼叫 `list_signals`／`get_signal`，引用的訊號 id 都查得到。

## 隱私

- profile 檔與計算都在你的電腦上，不經網路、不需要 API key。
- 但工具結果一被 Claude 使用就進入對話上下文。所以姓名與出生資料預設不回傳，只在你明確要求時才提供（D-038）。

## 5. 健康檢查（doctor）

接不上或懷疑設定壞掉時，先跑：

```bash
bun run doctor
```

會檢查：profile 目錄與檔案格式、MCP server 是否真的能啟動（隔離的暫存 profile，不動你的資料）、工具是否齊全、回應外殼與錯誤格式、Claude 桌面版設定檔（含 Windows Microsoft Store 版的位置、`command` 是否存在、路徑的反斜線有沒有被吃掉）。有 ✗ 時結束碼為 1，`!` 只是警告。

CI 使用 `bun run packages/mcp/src/cli/doctor.ts --ci`：略過只存在你電腦上的項目，其餘照跑。
