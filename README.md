# Fortune Telling Platform (本地端命理綜合分析平台)

這是一個純本地端執行的命理綜合分析平台，以「紫微斗數」為主軸，並搭配生命靈數、命卦、馬雅 Kin 等輕量級系統，提供透明、客觀且具備層次感的命理分析。

## ✨ 核心特色

- **🔒 純本地執行 (Local SPA)**：基於 Vite + React 打造，不需帳號或後端；最近查詢只保存在使用者自己的瀏覽器。
- **🔮 紫微斗數為核心**：基於強大的 `iztro` 套件，進行精確的星盤排盤與分析。
- **📊 絕對透明的雷達量化系統 (Block G)**：分數計算完全公開透明，雷達圖代表各項特質的「佔比」而非「優劣」，破除傳統命理的宿命論。
- **⏳ 動靜四層分類與時期演化 (Block H)**：將命理特質分為四個層級（L0 恆定、L1 慢變、L2 年變、L3 情境），以可收合時間軸呈現八字大運與紫微大限。
- **🧭 使用者問題視圖**：提供白話命格提要、2026 本年觀察、事業／感情／財富／身心領域、平衡建議與八宅四吉方。
- **盤面與合盤**：提供可互動的紫微十二宮盤，以及雙人五行互補／摩擦疊圖、生命靈數與八宅比較。
- **🎨 明暗雙主題**：暖色明亮模式與深色模式共用語意 token，圖表、列印、鍵盤焦點與減少動態偏好同步支援。

## 🛠️ 技術棧

- **核心框架**：計算核心為框架無關的 JavaScript（`packages/core`）；介面為 React 19 + TypeScript（`apps/web`）
- **構建工具**：Vite
- **命理計算**：
  - `iztro`: 紫微斗數排盤核心
  - `lunar-javascript`: 公農曆轉換、干支曆法
- **資料視覺化**：自繪 SVG（雷達、十二宮盤、八宅方位圖），不依賴圖表套件

## 🚀 快速開始

### 環境要求

確保你的電腦已安裝 [Node.js](https://nodejs.org/) (建議 v18 以上)。若你想使用 Bun 作為運行環境與套件管理工具，本專案也支援。

### 安裝與運行

1. **進入專案目錄**：
   ```bash
   cd fortunetelling
   ```

2. **安裝依賴套件**：
   ```bash
   bun install
   ```

3. **啟動本地開發伺服器**：
   ```bash
   bun run dev
   ```

4. **開啟應用程式**：
   伺服器啟動後，在瀏覽器中開啟終端機顯示的本地網址（通常為 `http://localhost:5173/fortunetelling/`）即可使用。

### 建置正式版本

若要打包為靜態檔案進行部署：
```bash
bun run build
```

建置完成的檔案將會輸出於 `apps/web/dist` 目錄中，這是一組純靜態網頁，可部署至任何靜態託管平台（如 GitHub Pages, Vercel, Netlify）。

## 📱 安裝到 iPhone（PWA）

正式版本是可安裝的 PWA：部署到 GitHub Pages（HTTPS）後，

1. 用 iPhone 的 Safari 開啟網站（iOS 16.4 以上的 Chrome／Edge 也可以）。
2. 點「分享」按鈕 → 「加入主畫面」。
3. 從主畫面圖示開啟時會全螢幕執行；第一次開啟後，排盤與合盤在飛航模式下也能使用。

實作位置：

- `apps/web/public/manifest.webmanifest`、`apps/web/public/icons/`：App 名稱、圖示（iOS 使用 180×180 的 `apple-touch-icon.png`）。
- `apps/web/pwa/sw.js`：Service Worker——預先快取 App 外殼與打包檔；頁面採網路優先（新版部署後下次開啟即更新），離線時改用快取；Google Fonts 於執行期快取。
- `apps/web/pwa/plugin.ts`：建置時依打包結果產生 `dist/sw.js` 與快取清單，不需額外套件。
- `apps/web/src/lib/pwa.ts`、`InstallHint`：只在正式版註冊 Service Worker；iOS 沒有安裝提示，所以在 iPhone／iPad 顯示一次可關閉的「加入主畫面」說明。
- 版面使用 `env(safe-area-inset-*)`，避開瀏海與底部 Home 列。

> Service Worker 只在 HTTPS 或 `localhost` 生效；`bun run dev` 不會註冊，請用 `bun run build && bun run preview` 測試。

## 📂 專案架構與開發狀態

Monorepo（Bun workspaces）：`packages/core`（`@fortune/core`，框架無關的計算核心）與 `apps/web`（`@fortune/web`，Vite UI）。目標架構見 [docs/ARCHITECTURE-V2.md](docs/ARCHITECTURE-V2.md)。

本專案採用高度模組化的架構設計，將不同命理學派實作為獨立的計算引擎，並統一資料格式進行視覺化展示。

**🟢 目前開發進度**
- **已完成**：五套計算引擎、Report schema v3、透明雷達、白話摘要、十二宮盤、時期演化、本年／領域／建議視圖、國農曆與不確定時辰、最近查詢、列印、明暗主題及雙人合盤。
- **驗證**：核心、整合、曆法、洞見、合盤與視覺化契約由 `bun test` 覆蓋；正式版本以 `bun run build` 驗證。
- **後續效能項目**：命理計算套件（約 850 kB）已拆成獨立 chunk；下一步可改為延遲載入，讓首頁先顯示。

更詳細的系統架構、評分規則設計與未來的開發階段規劃，請參閱 [`ROADMAPS.md`](./ROADMAPS.md) 文件。

## 📝 授權條款

本專案供學習與個人分析使用。
