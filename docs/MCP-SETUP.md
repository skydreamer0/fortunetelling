# 本機 MCP server 設定（Claude 桌面版）

> 對應 ROADMAPS.md M1。MCP 只包裝 `@fortune/core`：排盤、規則、訊號、共識都由程式算完，Claude 只負責查詢、比對與對話。資料全部留在本機。

## 1. 安裝

```bash
bun install
```

## 2. 建立 profile

profile 是 profiles 目錄下的 `<profileId>.fortune.json`（預設 `~/.fortune/profiles/`，可用環境變數 `FORTUNE_PROFILES_DIR` 改）。網站的「匯出」按鈕在 M4-02 才會有，現在先用指令建立：

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
| `get_timeline` | 逐年各領域分數；加 `months: {start,end}`（`YYYY-MM`，最多 36 個月）才回逐月 |
| `get_consensus` / `list_conflicts` | 跨系統共識與矛盾 |
| `answer_question` / `list_question_categories` | 問事（例如「哪幾個月適合買車」）月份排名；先用 `list_question_categories` 取得 category id，或直接帶 `question` 讓固定關鍵字表決定類別（比對不到或並列會回 `invalid_args` 與 `availableCategories`，不猜） |
| `compare_profiles` | 雙人合盤（姓名與出生資料不會出現在結果中） |

每個回應都是 `{ asOf, versions, caveats, data }`：

- `versionsHash`：版本區塊（core、calculator、規則目錄版本與 ephemeris 狀態）的 12 碼雜湊，不含 `asOf`。同一輸入同一版本會得到相同結果；雜湊變了代表版本變了。
- `versions`：完整版本區塊（約 500 bytes）只在 `list_profiles` 與 `get_profile` 回傳，其餘工具只回 `versionsHash` 以節省上下文。
- `caveats`：Claude 不該過度相信的地方——分數未校準、時間邊界、未參與的系統、**Jyotish／Human Design 尚未交叉驗證（`experimental`）**。
- 回應太大時不會截斷，而是回 `response_too_large` 並提示縮小範圍。

回傳瘦身（`answer_question`、`get_timeline`、`get_consensus` 共通）：

- 很長的訊號清單（`signalIds`、`topSignalIds`、`supportSignals`、`riskSignals`）預設只保留前 5 筆，旁邊的 `…Total` 欄位是完整筆數。帶 `detail: true` 取得完整清單；單一訊號用 `get_signal`。
- `answer_question` 預設不回 `conventions`（公式說明長文），只回 `conventionsOmitted: true`；`detail: true` 才回。
- `get_timeline` 的逐月 cell 預設不含 `perSystem`（`detail: true` 才有）。逐月資料量大，建議搭配 `domain` 縮小範圍。

`answer_question` 的類別與範圍：

- `category`（明確 id）優先於 `question`；回傳 `categoryResolvedFrom` 為 `"explicit"` 或 `"question"`。
- `range` 省略時為 `asOf` 當月起共 12 個月，回傳的 `range` 即實際範圍，`rangeResolvedFrom` 為 `"default"`（明確給的為 `"explicit"`）。

`get_timeline` 的逐月：core 的 timeline 只建 `asOf` 當年的 12 個月，所以舊版只有 `range` 落在 `asOf` 當年時才有 `months`，其他情況永遠是 `[]`。現在 `months: {start,end}` 會逐年補算（範圍限 `asOf` 前 5 年到後 10 年），不帶 `months` 就只回年度。`range` 只篩年度 cell。

## 5. 試試看

在 Claude 桌面版問：

> 我（profileId: sky）2027 年哪幾個月適合買車？asOf 用今天。

預期 Claude 先呼叫 `answer_question`，需要細節時再呼叫 `list_signals`／`get_signal`，引用的訊號 id 都查得到。

## 隱私

- profile 檔與計算都在你的電腦上，不經網路、不需要 API key。
- 但工具結果一被 Claude 使用就進入對話上下文。所以姓名與出生資料預設不回傳，只在你明確要求時才提供（D-038）。
