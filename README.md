<div align="center">

<p>FORTUNE TELLING PLATFORM</p>

# 命理綜合分析

### 一個生辰，五種讀法。

以八字與紫微斗數為主軸，整合多系統排盤、時間分析與可追溯的規則訊號。<br>
在瀏覽器整理命盤，在本機 MCP 查詢證據，再由你與 AI 討論。

**本機優先 · 計算與解讀分層 · 保留不確定性**

[快速啟動](#快速啟動) · [產品流程](#產品流程) · [系統架構](#系統架構) · [能力與限制](#能力與限制) · [文件入口](#文件入口)

</div>

---

## 為理解建立的工具

Fortune Telling Platform 將傳統命理的計算、規則與解讀拆開，讓結果可以逐層核對。網站不需登入，也不需為一般排盤設定模型 API key；出生資料在瀏覽器內計算，查詢紀錄保存在使用者的裝置。

| 關注的問題 | 平台提供的能力 |
| :--- | :--- |
| **這個結論從哪裡來？** | 命盤部件、計分規則與訊號來源可查；雷達按系統分開呈現，避免把不同尺度混成一個總分。 |
| **本命與當下有何不同？** | 以 L0 恆定、L1 慢變、L2 年變、L3 情境區分特質與狀態，搭配大運／大限、年度與月份視角。 |
| **不同系統說法相反怎麼辦？** | 分開呈現共同關注、同向共識與矛盾，保留兩側證據與來源。 |
| **如何讓 AI 討論有依據？** | 程式負責排盤與規則計算；AI 透過 MCP 或匯出內容解讀，回答可貼回檢查引用與用語。 |

介面沿用「通書」的紙、墨、朱印語彙，以章節索引、細線與數據層級組織長報告。支援明暗主題、自繪 SVG 圖表、列印樣式與減少動態偏好。設計依據見 [Design System](design-system/fortune-telling-platform/MASTER.md)。

> 分數是尚未校準的研究訊號，不是事件機率、預測準確率或決策保證。計算器的交叉對照，也不等於命理預測有效性已被證實。

## 產品流程

### 01 · 建立輸入

輸入生日、時間、出生地與性別，可選國曆／農曆並標示時間精度。需要的資料不足時，報告會揭露無法計算的範圍與時間邊界警告。首頁也提供範例與本機最近查詢。

### 02 · 閱讀報告

從命格提要進入本年、時間軸、領域分析與命盤細節，再查看規則依據。雙人合盤比較五行分布、生命靈數與八宅分組；人生事件可保存在本機，供回顧與規則回驗使用。

### 03 · 帶著證據討論

- **瀏覽器路徑**：複製整理過的 prompt 到慣用的 AI，再把回答貼回網站檢查。
- **本機 MCP 路徑**：下載 `.fortune.json`，讓 Claude 桌面版按需查詢命盤、訊號、時間軸與問題結果。
- **閱讀問事結果**：只有 `status = ranked` 時才比較排名；資料不足或無法區分時，先讀取拒絕排名的原因。排名本身仍受下方[模型限制](#能力與限制)約束。

「檢查回答」會標示引用與部分用語問題，不能取代對回答內容的完整事實查核。

## 快速啟動

需要 Git 與 [Bun](https://bun.sh)。本專案以 Bun 管理 workspace、執行程式及測試。

```bash
git clone https://github.com/skydreamer0/fortunetelling.git
cd fortunetelling
bun install --frozen-lockfile
bun run dev
```

開啟終端機顯示的網址，預設為 `http://localhost:5173/fortunetelling/`。可先使用表單的範例資料探索報告。

| 指令 | 用途 |
| :--- | :--- |
| `bun run dev` | 啟動 Vite 開發伺服器 |
| `bun test` | 執行 workspace 測試 |
| `bun run build` | 產生靜態網站至 `apps/web/dist` |
| `bun run preview` | 預覽已建置的網站 |
| `bun run doctor` | 檢查本機 MCP、profile 與桌面版設定 |

建置的預設 base path 為 `/fortunetelling/`。部署至其他路徑前，請核對 [Vite 設定](apps/web/vite.config.ts)；現有 [Pages workflow](.github/workflows/deploy.yml) 由 `master` 推送觸發。

### 接上本機 MCP

MCP server 與網頁共用計算核心，目前註冊 **15 個工具**，涵蓋 profile、命盤、訊號、時間軸、共識、問事、合盤、回答檢查與批次查詢。完整工具與隱私說明見 [MCP 設定指南](docs/MCP-SETUP.md)。

<details>
<summary><strong>最小設定：建立 profile，接上 Claude 桌面版</strong></summary>

建立一份示例 profile，預設寫入 `~/.fortune/profiles/`：

```bash
bun run --filter @fortune/mcp add-profile demo \
  --date 1990-05-17 --time 08:30 --gender female --city 台南
```

也可從網站下載 `.fortune.json` 後放入該目錄，或使用 `import_profile` 讀取本機檔案路徑。

在 `claude_desktop_config.json` 加入以下設定，將路徑換成實際的專案絕對路徑。若桌面版找不到 `bun`，也須將 `command` 換成 Bun 的絕對路徑。

```json
{
  "mcpServers": {
    "fortune": {
      "command": "bun",
      "args": ["run", "/絕對路徑/fortunetelling/packages/mcp/src/bin.ts"]
    }
  }
}
```

重開 Claude 桌面版後，可請它列出 `demo` 的命盤與計算口徑。查詢個人資料時明確指定 `profileId`；時間相關工具另需 `asOf`，例如 `2026-10-09`。設定檔位置、工具參數與疑難排解請依 [MCP 設定指南](docs/MCP-SETUP.md) 操作。

</details>

### 安裝與離線使用

正式建置包含 PWA manifest 與 Service Worker。在 HTTPS 站台，可從 iPhone Safari 的分享選單加入主畫面；離線使用需先成功註冊 Service Worker 並完成資產快取。

```bash
bun run build
bun run preview
```

Service Worker 只在正式建置註冊，`bun run dev` 不會啟用；測試環境須為 HTTPS 或 `localhost`。目前快取實作已包含 Vary 比對修正，但部署站與手機的離線／更新流程仍須實機驗收，不能以建置成功代替。追蹤見 [#18](https://github.com/skydreamer0/fortunetelling/issues/18)。

## 系統架構

四個 workspace 分離計算、介面、AI 交接與工具協定。Web 以 React + TypeScript + Vite 建置為靜態網站；一般排盤不需要應用後端。

```text
packages/core  @fortune/core
  出生資料與時間標準化 → 計算器 → 規則／訊號 → 共識／時間軸／問事
       │
       ├── apps/web      @fortune/web   報告、合盤、回驗、PWA
       ├── packages/ai   @fortune/ai    對話指示、payload、回答檢查
       └── packages/mcp  @fortune/mcp   本機 stdio 工具介面
```

`@fortune/web` 與 `@fortune/mcp` 也使用 `@fortune/ai` 的對話與檢查能力；AI 層不另寫一套排盤邏輯。

| 層次 | 技術與邊界 |
| :--- | :--- |
| **計算核心** | 框架無關的 TypeScript 核心；以 `iztro`、`lunar-javascript` 與星曆套件支援各系統計算。公開入口為 [`@fortune/core`](packages/core/src/index.ts)。 |
| **Web** | 瀏覽器內執行同步分析，計算核心與報告頁延遲載入；查詢與事件資料保存在本機瀏覽器。 |
| **AI 交接** | 網站組合 prompt、檢查貼回答案，不直接呼叫模型；選用的程式呼叫層另由 `@fortune/ai/client` 提供。 |
| **MCP** | 本機 profile 檔案搭配 stdio server；包裝核心輸出，附版本、口徑與限制資訊。 |

目前 `@fortune/core` 為 **0.8.0**、Report schema 為 **7**。套件版本與資料契約分開演進；Timeline／Backtest 要求明確的真太陽時與子時設定。詳細契約以[目前公開型別](packages/core/src/index.ts)、[協作者指南](docs/CONTRIBUTING.md)與[決策紀錄](docs/DECISIONS.md)共同核對，架構文件中的早期版本不代表現行介面。

## 能力與限制

### 計算覆蓋

| 範圍 | 現行狀態 | 使用邊界 |
| :--- | :--- | :--- |
| 八字、紫微斗數、生命靈數、馬雅 Kin、八宅命卦 | 同步計算核心與網站報告已接入 | 各系統有不同資料需求；有命盤不代表每個系統都提供逐月訊號。 |
| 人類圖 Human Design | 星曆擴充；已達專案計算器交叉驗證門檻 | 經非同步核心、MCP／匯出使用，不在網站同步 `analyze()` 的五系統報告內。[驗證範圍](packages/core/tests/fixtures/validation/humandesign-validation-report.md)不等於預測能力認證。 |
| 吠陀占星 Jyotish | 已有計算器與對照報告，仍標記 `experimental` | 未達專案要求的公開吠陀計算器交叉驗證門檻，不計入高共識；可用 `verifiedOnly` 排除。[驗證紀錄](packages/core/tests/fixtures/validation/jyotish-validation-report.md)。 |

### 使用前應知道

- **分數與方向仍有研究缺口。** 分數未校準；不同 id 的同源規則仍可能累積，使 noisy-OR 分數上升（[#28](https://github.com/skydreamer0/fortunetelling/issues/28)）。問事的 trait 與 valence 方向不一致尚待語義決策（[#47](https://github.com/skydreamer0/fortunetelling/issues/47)），月份排名不宜直接當成行動建議。
- **共同關注與同向共識有不同定義。** `activityAgreement` 計共同關注；「高共識」需同領域、同時間窗至少三套符合門檻的正權重、非 experimental 系統同向。人類圖行運訊號的 `valence` 為 0，只能貢獻共同關注，不投同向票；完整資格見 [ADR](docs/DECISIONS.md) D-045。
- **時間與星曆覆蓋有邊界。** 出生時間精度、歷史時區及換日口徑都會影響結果。人類圖行運年格／月格均未含凱龍星，月格另未取樣天王星、海王星與冥王星；細節見[規則目錄](packages/core/src/calculators/humanDesign/catalog.json)。
- **本機計算不等於 AI 對話完全離線。** MCP 工具結果會進入 AI 上下文；`.fortune.json` 含出生資料，匯出或分享前應先檢查。`get_profile` 預設省略姓名與原始出生欄位，其他工具仍可能帶可識別資訊。見 [MCP 隱私說明](docs/MCP-SETUP.md#隱私)。
- **部分驗收與契約仍在進行。** 回答檢查已有分年掃描、取消與過期結果隔離，桌機／手機瀏覽器的互動及效能驗收另由 [#19](https://github.com/skydreamer0/fortunetelling/issues/19)／[#46](https://github.com/skydreamer0/fortunetelling/issues/46) 追蹤；跨入口共用 ChartSnapshot 及舊報告重播保證尚未交付（[#51](https://github.com/skydreamer0/fortunetelling/issues/51)）。

資料庫／帳號同步與 Next.js 遷移目前暫停。進行中工作以 [GitHub Issues](https://github.com/skydreamer0/fortunetelling/issues) 為準，方向與相依關係見 [Roadmap](ROADMAPS.md)。

## 開發與驗證

以下對應目前 [CI workflow](.github/workflows/ci.yml) 的主要檢查，可在 repository 根目錄執行：

```bash
bun test
bun run --filter @fortune/core typecheck
bun run --filter @fortune/web typecheck
bun run --filter @fortune/ai typecheck
bun run --filter @fortune/mcp typecheck
bun run packages/mcp/src/cli/doctor.ts --ci
bun run build
```

測試涵蓋核心計算、資料契約、規則、AI 交接、MCP 與 Web 邏輯；外部 Claude live smoke 需另行設定憑證，預設不執行。單元測試、建置與 MCP smoke 不代表已完成真實瀏覽器、手機或 PWA 驗收。

## 文件入口

| 想了解 | 從這裡開始 |
| :--- | :--- |
| 文件的現行／歷史邊界 | [文件索引](docs/README.md) |
| 安裝 MCP、工具參數與隱私 | [MCP-SETUP](docs/MCP-SETUP.md) |
| 開發方式、公開介面與有效時間設定 | [CONTRIBUTING](docs/CONTRIBUTING.md) |
| 系統分層、計算管線與演進 | [ARCHITECTURE](docs/ARCHITECTURE.md) · [ARCHITECTURE-V2](docs/ARCHITECTURE-V2.md) |
| 設計取捨、口徑與相容性 | [DECISIONS](docs/DECISIONS.md) |
| 視覺與互動語言 | [Design System](design-system/fortune-telling-platform/MASTER.md) |
| 後續方向與已完成紀錄 | [ROADMAPS](ROADMAPS.md) · [HISTORY](docs/HISTORY.md) · [Archive](docs/archive/README.md) |

---

本專案供學習與個人分析使用。命理結果僅供參考，不構成醫療、法律、投資或其他重大決策建議。
