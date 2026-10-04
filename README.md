<div align="center">

# 🔮 Fortune Telling Platform

**本地端命理綜合分析平台**

以紫微斗數為主軸，結合生命靈數、命卦、馬雅 Kin 與八字，
程式先把能確定的部分算完，再交給你或 AI 解讀。

![Local-first](https://img.shields.io/badge/local--first-no%20backend-2ea44f?style=flat-square)
![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white)
![Bun](https://img.shields.io/badge/Bun-workspaces-f9f1e1?style=flat-square&logo=bun&logoColor=black)
![MCP](https://img.shields.io/badge/MCP-14%20tools-d97757?style=flat-square)
![PWA](https://img.shields.io/badge/PWA-installable-5a0fc8?style=flat-square)

[快速開始](#-快速開始) · [Claude 桌面版](#-搭配-claude-桌面版本機-mcp) · [安裝到 iPhone](#-安裝到-iphonepwa) · [架構](#-架構) · [Roadmap](./ROADMAPS.md)

</div>

---

## ✨ 為什麼做這個

| | |
|---|---|
| 🔒 **本機優先** | 不需帳號、不需後端，在本機排盤，查詢紀錄存在瀏覽器。使用 MCP 與 AI 對話時，工具回傳的資料會進入 AI 上下文。 |
| 📊 **分數透明** | 每一分怎麼來都看得到。雷達圖表示特質「佔比」而非優劣，不談宿命論。 |
| ⏳ **動靜分層** | 特質分成 L0 恆定、L1 慢變、L2 年變、L3 情境；大運與大限以可收合時間軸呈現。 |
| 🧭 **問題導向** | 白話命格提要、本年觀察，以及事業／感情／財富／身心四大領域與平衡建議。 |
| 🤝 **雙人合盤** | 五行互補與摩擦疊圖、生命靈數與八宅比較。 |
| 🤖 **AI 只負責對話** | 排盤、規則、訊號、共識、逐月分數全由程式算完，AI 查詢比對而不重新排盤。 |
| 🎨 **明暗雙主題** | 共用語意 token，圖表、列印、鍵盤焦點與減少動態偏好同步支援。 |

## 🚀 快速開始

需要 [Bun](https://bun.sh)；本專案的執行、套件管理與測試皆使用 Bun。

```bash
bun install
bun run dev
```

開啟終端機顯示的網址（通常是 `http://localhost:5173/fortunetelling/`）。

| 指令 | 用途 |
|---|---|
| `bun run dev` | 啟動開發伺服器 |
| `bun run build` | 打包純靜態網頁到 `apps/web/dist`，可部署至 GitHub Pages、Vercel、Netlify |
| `bun run preview` | 預覽正式版（測試 PWA 用） |
| `bun test` | 執行全部測試 |

## 🤖 搭配 Claude 桌面版（本機 MCP）

`packages/mcp` 把計算核心包成本機 MCP server，Claude 可以直接查你的命盤、訊號、共識與逐月分數。

**1. 建立 profile**（預設存於 `~/.fortune/profiles/`）

網站報告的「用 Claude 桌面版討論」入口可下載 `<profileId>.fortune.json`，放進上述目錄，或請 Claude 以 `import_profile` 讀取本機檔案路徑。也可以用指令建立：

```bash
bun run --filter @fortune/mcp add-profile sky \
  --date 1990-05-17 --time 08:30 --gender female --city 台南
```

**2. 在 `claude_desktop_config.json` 加入**

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

重開 Claude 桌面版後，直接問「幫我看 sky 明年哪幾個月適合買車」即可。

> profile 檔案與計算在本機；MCP 工具回傳的命盤、時間資訊等資料會進入 AI 對話上下文。`get_profile` 預設不回姓名與原始出生欄位，但不代表其他工具結果不含可識別資訊。
> 所有時間相關工具都明確帶 `asOf`，不依賴隱藏狀態。完整設定、隱私說明與 14 個工具見 [docs/MCP-SETUP.md](./docs/MCP-SETUP.md)。

## 📱 安裝到 iPhone（PWA）

部署到 HTTPS 後，用 iPhone Safari 開啟 → 分享 → **加入主畫面**。第一次開啟後，排盤與合盤在飛航模式下也能使用。

<details>
<summary>實作細節</summary>

- `apps/web/public/manifest.webmanifest`、`icons/`：App 名稱與圖示（iOS 用 180×180 `apple-touch-icon.png`）。
- `apps/web/pwa/sw.js`：預先快取 App 外殼與打包檔；頁面網路優先、離線時用快取；Google Fonts 於執行期快取。
- `apps/web/pwa/plugin.ts`：建置時產生 `dist/sw.js` 與快取清單，不需額外套件。
- `apps/web/src/lib/pwa.ts`、`InstallHint`：只在正式版註冊 Service Worker；iPhone／iPad 顯示一次可關閉的安裝說明。
- 版面使用 `env(safe-area-inset-*)` 避開瀏海與 Home 列。

Service Worker 只在 HTTPS 或 `localhost` 生效；`bun run dev` 不會註冊，請用 `bun run build && bun run preview` 測試。

</details>

## 🏗️ 架構

```
packages/core   @fortune/core   框架無關的計算核心（排盤、規則、訊號、共識）
      │
      ├── packages/mcp   @fortune/mcp   本機 MCP server → Claude 桌面版
      └── apps/web       @fortune/web   Vite + React UI → 瀏覽器 / PWA
```

- **命理計算**：[`iztro`](https://github.com/SylarLong/iztro)（紫微斗數）、[`lunar-javascript`](https://github.com/6tail/lunar-javascript)（公農曆與干支）
- **視覺化**：自繪 SVG（雷達、十二宮盤、八宅方位圖），不依賴圖表套件
- 目標架構見 [docs/ARCHITECTURE-V2.md](./docs/ARCHITECTURE-V2.md)

## 🗺️ 開發進度

| 狀態 | 項目 |
|---|---|
| ✅ 已完成 | 五套正式計算引擎、Report schema v5、透明雷達、十二宮盤、時期演化、本年／領域／建議視圖、國農曆與不確定時辰、列印、明暗主題、雙人合盤 |
| ✅ 已完成 | 跨系統共識、人生事件本地回驗、M0.5 Profile 契約、M1 本機 MCP server（現有 14 個工具） |
| ✅ 已完成 | M2 匯出包、M3 的 `import_profile`／`check_answer` 與對話助手主線、M4-01／02 網站 MCP 入口與 `.fortune.json` 下載 |
| ✅ 已完成 | 歷史時區資料與不確定警告、指定系統／`verifiedOnly` 篩選、問事精簡回傳與實驗性系統敏感度提示、`doctor` 健康檢查 |
| 🟡 保留實驗性 | Jyotish／Human Design 已有計算器與驗證報告，仍標 `experimental`；吠陀占星尚缺原定公開計算器交叉驗證，正式升級另行決定 |
| ⏳ 待做 | 選用的 M4-03：網站的 `check_answer` 檢查整合；現有「複製 prompt」入口已支援貼回檢查 |
| 🔧 待優化 | 計算核心已拆成獨立 chunk，首頁尚未延遲載入；Anthropic SDK 仍是 AI 套件的一般依賴 |

核心、MCP、整合、曆法、洞見、合盤與視覺化契約由 `bun test` 覆蓋；CI 另執行各套件型別檢查、`doctor --ci` 與 `bun run build`。分數仍未校準，不能當成機率或預測準確度。里程碑、驗證限制與任務拆解見 [ROADMAPS.md](./ROADMAPS.md)。

## 📝 授權

本專案供學習與個人分析使用。命理結果僅供參考，不構成任何決策建議。
