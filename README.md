# Fortune Telling Platform (本地端命理綜合分析平台)

這是一個純本地端執行的命理綜合分析平台，以「紫微斗數」為主軸，並搭配生命靈數、命卦、馬雅 Kin 等輕量級系統，提供透明、客觀且具備層次感的命理分析。

## ✨ 核心特色

- **🔒 純本地執行 (Local SPA)**：基於 Vite + Vanilla JS 打造，完全無伺服器與資料庫，確保使用者的出生資料等隱私絕對安全。
- **🔮 紫微斗數為核心**：基於強大的 `iztro` 套件，進行精確的星盤排盤與分析。
- **📊 絕對透明的雷達量化系統 (Block G)**：分數計算完全公開透明，雷達圖代表各項特質的「佔比」而非「優劣」，破除傳統命理的宿命論。
- **⏳ 動靜四層分類與時期演化 (Block H)**：將命理特質分為四個層級（L0 恆定、L1 慢變、L2 年變、L3 情境），並依照紫微大限展示個人的時期演化，強調人的改變與流動性。
- **🎨 極致的深色 UI 美學**：採用深色模式、玻璃擬物化 (Glassmorphism) 設計，營造具備現代感與神祕感的高級視覺體驗。

## 🛠️ 技術棧

- **核心框架**：HTML, CSS, Vanilla JavaScript
- **構建工具**：Vite
- **命理計算**：
  - `iztro`: 紫微斗數排盤核心
  - `lunar-javascript`: 公農曆轉換、干支曆法
- **資料視覺化**：`Chart.js`

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
   npm install
   ```
   *(如果使用 Bun: `bun install`)*

3. **啟動本地開發伺服器**：
   ```bash
   npm run dev
   ```
   *(如果使用 Bun: `bun run dev`)*

4. **開啟應用程式**：
   伺服器啟動後，在瀏覽器中開啟終端機顯示的本地網址（通常為 `http://localhost:5173`）即可使用。

### 建置正式版本

若要打包為靜態檔案進行部署：
```bash
npm run build
```
*(如果使用 Bun: `bun run build`)*

建置完成的檔案將會輸出於 `dist` 目錄中，這是一組純靜態網頁，可部署至任何靜態託管平台（如 GitHub Pages, Vercel, Netlify）。

## 📂 專案架構與開發狀態

本專案採用高度模組化的架構設計，將不同命理學派實作為獨立的計算引擎，並統一資料格式進行視覺化展示。

**🟢 目前開發進度**
- **已完成**：基礎架構 (Phase 1)、全部計算引擎 (Phase 2，含紫微斗數、八字、生命靈數、命卦、馬雅 Kin)、雷達與透明計分核心 (RadarBuilder/ScoringRules，任務 C1)、動靜分層與誠實守門 (LayerClassifier/HonestyGuard/StateSwitchTable，任務 D1–D3)。
- **進行中**：任務 D4 時期演化 (EvolutionCalculator)，之後為 C2 radars 接線與 C3/D5 UI 整合。

更詳細的系統架構、評分規則設計與未來的開發階段規劃，請參閱 [`ROADMAPS.md`](./ROADMAPS.md) 文件。

## 📝 授權條款

本專案供學習與個人分析使用。
