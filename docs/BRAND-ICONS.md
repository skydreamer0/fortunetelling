# 網站與 PWA 圖示

採用核准的 A 案「太極＋八角框」v1 素材，原樣複製，沒有重畫、改比例或改色。
靛藍 `#252947` 與暖金 `#D5B57A` 為圖示配色；頁面本身的主題色與 PWA 名稱、身分及啟動範圍維持既有設定。

| 用途 | public/ 內的檔案 | 核准素材來源 |
| --- | --- | --- |
| 瀏覽器 SVG favicon | `favicon.svg` | `svg/fortune-app.svg` |
| 舊式瀏覽器 ICO | `favicon.ico`，16 / 32 / 48 px | `favicon.ico` |
| 一般 PWA 圖示 | `icons/fortune-app-v1-192.png`、`fortune-app-v1-512.png` | `app/fortune-app-192.png`、`fortune-app-512.png` |
| 向量 PWA 圖示 | `icons/fortune-app-v1.svg` | `svg/fortune-app.svg` |
| 系統裁切圖示 | `icons/fortune-maskable-v1-512.png` | `app/fortune-maskable-512.png` |
| iPhone / iPad 主畫面 | `icons/fortune-apple-touch-v1-180.png` | `app/fortune-maskable-180.png` |

一般圖示保留核准的圓角底；maskable 與 Apple 圖示使用核准的滿版不透明底及安全留白，讓作業系統自行裁切，不疊加預製圓角。PNG 尺寸與 SVG/ICO 內容由 `apps/web/tests/brandIcons.test.ts` 驗證，雜湊鎖定核准素材的完整位元組。

## 路徑與更新

- `index.html` 引用 favicon、manifest 與 Apple icon；Vite 正式建置會套用 `/fortunetelling/` base。
- manifest 的圖示路徑相對於 manifest，適用 GitHub Pages 子路徑。
- 圖示檔名帶 `v1`，favicon URL 帶版本查詢參數，避免沿用舊圖示 URL。
- 既有 PWA 建置器會把 public 資產納入預快取，並依檔案內容更新 Service Worker 版本；不需要新增 Service Worker 或更改快取邏輯。
- 已安裝的主畫面圖示由瀏覽器及作業系統管理，不能保證立即更新。部署後先連線開啟網站並重新啟動；若主畫面仍顯示舊圖示，重新加入可能需要先移除已安裝的 App；不同系統可能連同本機資料移除，因此務必先匯出重要命盤／資料備份。不要僅為換圖示清除瀏覽器儲存資料。

## 驗證範圍

執行 `bun test apps/web/tests/brandIcons.test.ts`、Web typecheck 與正式建置；檢查產物中的 manifest、圖示 URL 與 Service Worker 預快取清單。手機桌面的實際裁切及既有安裝的圖示更新仍需在對應裝置驗收。

此變更不修改 CI 工作流程。既有一般 CI 在建立 PR 時執行；Pages 僅在 master 推送或手動觸發時部署。Draft PR 並不會自動停用所有 CI。
