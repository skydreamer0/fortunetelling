# Fortune Telling Platform · 命理綜合分析

**Local-first chart calculations, traceable rules, and MCP tools for developers.**

把排盤、規則與 AI 解讀分開，讓每一層都能被閱讀、核對與改進。

Fortune Telling Platform 是以 TypeScript 與 npm workspace 建立的命理研究專案。它提供框架無關的計算核心、本機 MCP server，以及使用同一套核心的 Web 介面。你可以從網站探索報告、讓支援 stdio MCP 的 AI 客戶端查詢規則依據，或在程式中直接使用核心。

一般排盤與 MCP server 不需要模型 API key；AI 對話由你選擇的客戶端負責。專案希望讓計算口徑、規則來源與已知缺口公開可查，歡迎以問題、測試與程式碼一起改進。

> **授權狀態：尚未定案。** Repository 目前沒有專案層級的 `LICENSE`；可閱讀原始碼不代表已授予自由重用或散布的權利。整合與再發布前，請先閱讀下方[授權與第三方依賴](#授權與第三方依賴)。
>
> 命理分數是未校準的研究訊號，不是事件機率或預測準確率。計算器結果對照也不等於預測有效性已獲證實。

[快速開始](#快速開始) · [MCP](#透過-mcp-使用) · [Core API](#在程式中使用核心) · [架構](#系統架構) · [限制](#能力與限制) · [參與貢獻](#參與貢獻) · [文件](#文件入口)

## 可以拿它做什麼？

- **研究計算與規則**：檢查命盤、時間標準化、訊號與規則來源，對照不同輸入或計算口徑的差異。
- **接入 AI 工具流程**：透過 MCP 查詢 profile、命盤、時間軸與訊號，讓回答引用可追查的依據。
- **探索自己的介面**：從 core 的結構化報告建立 CLI、研究工具或其他 UI；目前以 repository 原始碼與 workspace 為使用方式。
- **改善共同基礎**：補上可重現的邊界案例、交叉驗證資料與文件，讓限制更清楚，錯誤更容易修正。

Web 提供報告、年度與月份視角、雙人合盤、本機事件紀錄、AI prompt 匯出與回答檢查。L0–L3 分層用來區分恆定特質、慢變、年變與情境訊號；跨系統的共同關注、同向共識與矛盾則分開呈現。

## 快速開始

準備 Git 與 [Node.js 24 LTS](https://nodejs.org)；目前 [CI](.github/workflows/ci.yml) 使用 Node.js **24.19.0** 與 npm **11.9.0**。以下指令都從 repository 根目錄執行。

```bash
git clone https://github.com/skydreamer0/fortunetelling.git
cd fortunetelling
npm ci
npm run dev
```

開啟終端機顯示的網址，預設為 `http://localhost:5173/fortunetelling/`，可先使用表單中的範例資料。一般排盤不需登入、不需應用後端，也不需設定模型 API key。

| 指令 | 用途 |
| --- | --- |
| `npm run dev` | 啟動 Web 開發伺服器 |
| `npm test` | 執行 workspace 測試 |
| `npm run build` | 建置靜態網站至 `apps/web/dist` |
| `npm run preview` | 預覽已建置的網站 |
| `npm run doctor` | 檢查 MCP 啟動、profile 與 Claude 桌面版設定 |

只想使用 MCP 或核心時，完成安裝後可直接往下，不必啟動 Web。

## 透過 MCP 使用

MCP server 以 **stdio** 提供本機工具，與 Web 共用 core。它負責計算與提供證據；AI 客戶端負責對話。本節以 Claude 桌面版為例，其他支援 stdio 的客戶端需依自己的設定格式接入。

### 1. 建立示範 profile

以下為虛構示例，不含姓名：

```bash
npm run add-profile --workspace @fortune/mcp -- demo \
  --date 1990-05-17 --time 08:30 --gender female --city 台南
```

預設儲存在 `~/.fortune/profiles/demo.fortune.json`；可用 `FORTUNE_PROFILES_DIR` 改變目錄。也可以從網站下載 `.fortune.json`，放入 profiles 目錄。出生時間未知時請省略 `--time`，不要為了得到完整命盤填入猜測值。

### 2. 設定客戶端

在 Claude 桌面版的 `claude_desktop_config.json` 中加入：

```json
{
  "mcpServers": {
    "fortune": {
      "command": "node",
      "args": ["/絕對路徑/fortunetelling/packages/mcp/dist/bin.js"]
    }
  }
}
```

將路徑換成實際的專案位置。若客戶端找不到 `node`，將 `command` 也換成 Node.js 的絕對路徑。完全結束並重新開啟客戶端，再執行 `npm run doctor` 檢查連線。各平台設定檔位置、自訂目錄與疑難排解見 [MCP 設定指南](docs/MCP-SETUP.md)。

### 3. 從可核對的查詢開始

可以對客戶端說：

> 請先列出可用 profile，再查詢 demo 的八字命盤。asOf 使用 2026-10-15。請說明採用的計算口徑與警告，缺少資料時不要自行補值。

對應的 `get_chart` 工具參數如下。這是 MCP 工具引數，不是終端機指令：

```json
{
  "profileId": "demo",
  "system": "bazi",
  "asOf": "2026-10-15",
  "detail": "summary"
}
```

先由 `list_profiles` 取得 id；個人查詢明確指定 `profileId`，時間相關工具明確指定 `asOf`。成功結果會包含 `data`、`caveats` 與 `versionsHash`；命盤另外附上 `conventions`。不要只取結論而丟棄警告與口徑。

目前共有 **16 個工具**：

| 類型 | 工具 |
| --- | --- |
| Profile | `list_profiles`、`get_profile`、`import_profile` |
| 命盤與時間 | `get_chart`、`get_time_context`、`get_timeline` |
| 規則依據 | `list_signals`、`get_signal`、`get_consensus`、`list_conflicts` |
| 問事與比較 | `list_question_categories`、`answer_question`、`compare_profiles`、`compare_bazi_conventions` |
| 回答檢查與批次 | `check_answer`、`batch` |

`import_profile` 會寫入本機檔案；`batch` 僅支援唯讀查詢，最多 8 個，不能包含匯入或巢狀批次。完整參數與回應格式見 [MCP 設定指南](docs/MCP-SETUP.md)。

問事只在 `status = ranked` 時比較排名；其他狀態應先讀 `abstentionReasons`。`check_answer` 可以標示引用與部分用語問題，不能當成完整事實查核或預測有效性驗證。

## 在程式中使用核心

`@fortune/core` 是 workspace 套件，公開入口為 [`packages/core/src/index.ts`](packages/core/src/index.ts)。目前 root 與 core 的 package 都標記 `private: true`，core 提供編譯後的 ESM 與 TypeScript 宣告；本文件不假設已有可從 npm 安裝的獨立發行版。

完成上述 clone 與安裝後，在 repository 根目錄建立 `example.mjs`：

```ts
import { analyze, VERSION, REPORT_SCHEMA_VERSION } from '@fortune/core';

// 虛構示範資料。明確指定地點、時區、時間精度與計算口徑。
const report = analyze(
  {
    year: 1990,
    month: 5,
    day: 17,
    hour: 8,
    minute: 30,
    gender: 'female',
    birthplace: {
      label: 'Tainan',
      lat: 22.99,
      lng: 120.22,
      timezone: 'Asia/Taipei',
    },
    timeAccuracy: 'exact',
    useTrueSolarTime: true,
    ziHourConvention: 'late',
  },
  { asOf: '2026-10-15' },
);

console.log({
  coreVersion: VERSION,
  reportSchemaVersion: REPORT_SCHEMA_VERSION,
  asOf: report.asOf,
  systems: report.engines.map(engine => engine.engineId),
  signalCount: report.signals.length,
  conventions: report.timeContext.conventions,
  skippedSystems: report.timeline.skippedSystems,
});
```

```bash
node example.mjs
```

此例不需 Web server、MCP 客戶端或模型 API key。它使用編譯後的公開 package 入口；在已宣告 `@fortune/core: "*"` 依賴的 workspace 中，可改用 `import { analyze } from '@fortune/core'`。避免依賴套件內部深路徑。

- `analyze()` 回傳同步 `Report`，包括各引擎結果、分層、計分規則、訊號、時間軸與共識。
- 同步報告涵蓋八字、紫微斗數、生命靈數、馬雅 Kin 與八宅命卦。人類圖／吠陀占星需要非同步星曆路徑，不會因你先初始化星曆就自動加入 `analyze()`。
- 直接使用 `buildTimeline`、`buildTimelineAsync` 或 `buildBacktestTimeline` 時，須明確提供 `useTrueSolarTime` 與 `ziHourConvention`；詳見[有效設定契約](docs/CONTRIBUTING.md)。
- 目前 core 為 **0.9.1**，Report schema 為 **7**，兩者獨立演進。保存結果時也應保存輸入、有效口徑與版本；這不代表已具備跨版本歷史重播能力。

## 系統架構

```text
出生資料 → 時間標準化 → 計算器 → 規則與訊號 → 時間軸／共識／問事
                         packages/core
                              │
              ┌───────────────┼────────────────┐
              ▼               ▼                ▼
           apps/web       packages/mcp     packages/ai
           Web 報告       本機 stdio       AI 交接與檢查
```

| Workspace | 責任與邊界 |
| --- | --- |
| [`@fortune/core`](packages/core) | 框架無關的 TypeScript 計算核心；包括時間處理、計算器、規則、訊號與資料契約。 |
| [`@fortune/web`](apps/web) | React + Vite 靜態網站；瀏覽器內計算、顯示報告與管理本機紀錄。 |
| [`@fortune/mcp`](packages/mcp) | Profile 檔案、stdio 工具與回應封裝；計算仍交給 core。 |
| [`@fortune/ai`](packages/ai) | 共用對話指示、payload 與回答檢查；Web／MCP 都會使用。另有選用的模型呼叫入口。 |

Web 的 prompt 複製／回答貼回流程不直接呼叫模型。若自行使用 `@fortune/ai/client`，則需另外處理模型供應商的憑證、費用與資料政策。

## 能力與限制

| 範圍 | 現況與邊界 |
| --- | --- |
| 八字、紫微、生命靈數、馬雅 Kin、八宅命卦 | 已接入同步核心與 Web；各系統的資料需求與時間訊號覆蓋不同。 |
| 人類圖 Human Design | 已有非同步計算與專案計算器交叉驗證；可由 MCP／匯出使用，不在同步五系統報告內。[驗證範圍](packages/core/tests/fixtures/validation/humandesign-validation-report.md)。 |
| 吠陀占星 Jyotish | 仍為 `experimental`；尚未達專案公開計算器交叉驗證門檻，不計入高共識。支援此參數的工具可用 `verifiedOnly` 排除。[驗證紀錄](packages/core/tests/fixtures/validation/jyotish-validation-report.md)。 |
| SchoolPack／流派比較 | 已有內部契約與測試，預設 pack 仍為不下結論的 placeholder；synthetic fixture 僅供測試，不能當成已交付的真實流派規則。 |
| 歷史報告重播 | 已有當前程式版本的 cold-process reconstruction 測試；尚非 archive-only 或跨歷史計算器版本的報告重播。見[驗證邊界](docs/validation/school-pack-cold-replay-66.md)。 |

還有幾個重要邊界：

- **分數不是機率。** 同源規則累積與問事方向語義仍有研究缺口；月份排名不能直接當成重大決策建議。
- **共同關注不等於同向支持。** 高共識需符合系統數、權重、時間窗與方向門檻；中性訊號與 experimental 系統不能當成同向票。詳見 [D-045](docs/DECISIONS.md)。
- **時間口徑會改變結果。** 出生時間精度、歷史時區、夏令時間、真太陽時與子時換日都需要核對；資料不足時應保留不可算或拒絕排名的結果。
- **星曆覆蓋不完整。** 人類圖行運年格／月格未含凱龍星；月格另未取樣天王星、海王星與冥王星。見[規則目錄](packages/core/src/calculators/humanDesign/catalog.json)。
- **測試通過有範圍。** 單元測試、型別檢查與建置成功，不等同真實客戶端、手機或 PWA 的完整驗收。

進行中工作與優先順序以 [Issues](https://github.com/skydreamer0/fortunetelling/issues) 與 [Roadmap](ROADMAPS.md) 為準；研究中的功能不代表已交付。

## 隱私與資料流

- Web 的一般排盤在瀏覽器內執行，查詢與事件紀錄保存在本機瀏覽器；MCP profile 預設保存在本機檔案。
- **本機計算不代表 AI 對話完全離線。** MCP 結果進入客戶端／模型上下文後，是否傳至雲端由該客戶端與供應商決定。
- `.fortune.json` 包含出生資料，可能含姓名；完整 `Report` 也含輸入與衍生資料。匯出、貼給 AI 或分享前請檢查內容及接收對象。
- `get_profile` 預設省略姓名與原始出生欄位，但其他工具仍可能提供可識別的時間或命盤資訊；這不是匿名化保證。
- 回報 bug 請使用虛構或經適當處理的案例。不要把真實 profile、完整個人報告、憑證或私人對話提交到公開 Issue／PR。

更完整的工具資料流見 [MCP 隱私說明](docs/MCP-SETUP.md#隱私)。

## 建置與離線使用

```bash
npm run build
npm run preview
```

預設部署路徑是 `/fortunetelling/`，輸出位於 `apps/web/dist`；變更站台路徑時請先檢查 [Vite 設定](apps/web/vite.config.ts)。現有 GitHub Pages 流程由 [CI](.github/workflows/ci.yml) 在 `master` 推送通過驗收後呼叫[部署 workflow](.github/workflows/deploy.yml)。

正式建置包含 PWA manifest 與 Service Worker；開發模式不會註冊 Service Worker。離線使用需先在 HTTPS 或 `localhost` 成功註冊並快取資產。安裝到主畫面、手機離線與更新流程仍需依實際瀏覽器驗收，不能只憑建置成功判定。

## 參與貢獻

歡迎提出問題、修正文件、補測試與討論規則。你不必先熟悉所有命理系統才能參與。

- **發現結果不一致**：請附虛構的最小輸入、core／schema 版本、`asOf`、有效計算設定、預期與實際結果；若引用其他計算器，請說明來源與口徑。
- **改善規則或新增系統**：先開 Issue 討論適用範圍、資料來源、授權與驗證方法。將計算事實、解讀規則與 UI 分開，並保留資料不足與拒絕下結論的情況。
- **修復程式或文件**：保持 PR 範圍清楚；附相關測試、未驗證的部分及相容性影響。文件範例若與程式不一致，也值得單獨修正。

從 [Issues](https://github.com/skydreamer0/fortunetelling/issues) 與[協作者指南](docs/CONTRIBUTING.md) 開始。部分架構與指南保留早期範例，實作時請交叉核對目前的 package exports、型別與測試；本 README 的 core 範例使用現行入口。

在 repository 根目錄可執行：

```bash
npm test
npm run typecheck --workspace @fortune/core --
npm run typecheck --workspace @fortune/web --
npm run typecheck --workspace @fortune/ai --
npm run typecheck --workspace @fortune/mcp --
npm run doctor -- --ci
npm run build
```

CI 另包含變更範圍分類、資產驗證與原生跨平台日曆檢查，完整流程以 [workflow](.github/workflows/ci.yml) 為準。需要外部模型憑證的 live smoke 不屬於無憑證的基本使用流程。

## 文件入口

| 想了解 | 文件 |
| --- | --- |
| 現行文件與歷史文件的界線 | [文件索引](docs/README.md) |
| MCP 安裝、工具參數與隱私 | [MCP-SETUP](docs/MCP-SETUP.md) |
| 開發、公開 API 與有效設定 | [CONTRIBUTING](docs/CONTRIBUTING.md) |
| 架構與演進 | [ARCHITECTURE](docs/ARCHITECTURE.md) · [ARCHITECTURE-V2](docs/ARCHITECTURE-V2.md) |
| 計算口徑與設計決策 | [DECISIONS](docs/DECISIONS.md) |
| 視覺與互動設計 | [Design System](design-system/fortune-telling-platform/MASTER.md) |
| 規劃與完成紀錄 | [ROADMAPS](ROADMAPS.md) · [HISTORY](docs/HISTORY.md) · [Archive](docs/archive/README.md) |

## 授權與第三方依賴

本專案目前**尚未提供根目錄 `LICENSE`**，因此不標示為 MIT、Apache-2.0 或其他已確立的開源授權。正式重用、修改後散布或納入其他產品前，請先向維護者確認專案授權；本文的技術範例不是額外的授權聲明。

第三方依賴各自適用其授權，包括 `iztro`、`lunar-javascript` 與 `@swisseph/browser`。其中星曆依賴的授權尤其需要在再發布前核對；專案本身的授權不能取代第三方條件。正式開源發布仍需補齊授權選擇、相依授權確認及必要聲明。

---

本專案供學習與研究參考，不構成醫療、法律、投資或其他重大決策建議。
