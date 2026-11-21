# 授權發布核對

這份清單區分「已在 PR 準備」和「發布前仍須由維護者驗證」。本文件本身不代表任何尚未確認的權利已取得。

## 準備

- 授權路線是保留 Swiss Ephemeris，對專案可依法授權的原創程式碼採 AGPL-3.0-only；第三方仍依原授權。單列 MIT 或只換根目錄名稱無法消除既有 Swiss Ephemeris 和 JS wrapper 條件。
- 正式 GitHub Actions build 的網頁底部提供 checkout 完整 commit 的原始碼 ZIP；來源下載應含鎖檔和可執行的建置、安裝腳本。建置以 `npm ci; npm run build` 重現；對應 Node/npm 版本看該 commit 的 package.json。從 GitHub archive 或 fork 自行重建不會標為官方成品。
- 網頁 build 內隨附 `LICENSE.txt`、`THIRD-PARTY-NOTICES.txt`、`WEB-DEPENDENCY-LICENSES.txt`；前兩個比對 checkout，第三個從建置中的 bundle 套件擷取原文。另核對實際產物的 Swiss WASM 雜湊、PWA 離線選單與 exact-commit source URL。

## 網頁對應原始碼與測試資料的分界

「本版原始碼」連至完整 commit 的 GitHub ZIP（由 `git archive` 產生），不連會變動的分支。解壓縮後，以 `.nvmrc` 指定的 Node 與 npm 11 執行：

```sh
npm ci
npm run build
node scripts/ci/assets.ts
```

產物在 `apps/web/dist`。依賴鎖檔、建置腳本、實際 Web 程式、圖示與授權聲明都在 ZIP 內。ZIP 不是完整開發用 checkout，故不聲稱可以重跑所有對照測試。官方 Actions 建置才會寫入對應的完整 commit URL；ZIP 解壓後的本機建置不會宣稱是官方成品。

`.gitattributes` 只將開發代理 skills 與不參與 Web 建置的外部對照資料（含 Astro-Databank 與其他公開計算器的個案紀錄）從來源 ZIP 排除。這沒有移除 Git 歷史、給外部資料重新授權、也沒有停用或削弱維護者 checkout 的現有測試。一般歷史 checkout 中仍有這些資料，是獨立的權利核對範圍。

## 必須完成才能將新產物宣稱為授權與發布均已通過

- [ ] 維護者確認專案程式碼、共同作者、曾匯入的程式、圖片、代理 skills、測試樣本與外部 oracle 資料的適用權利。無法確認的第三方內容保留原權利聲明，移出分發包或取得許可；不把未核對的 fixture 當成專案原創。
- [x] 鎖定 `@swisseph/browser@1.3.1`、`@swisseph/core@1.3.1` 的 npm 發布 archive：content digest 對應 npm provenance 與 lockfile，上游 Git commit、C 資料夾、browser binding 原始碼、重建腳本及發布流程已定位。證據與 WASM digest 見[第三方聲明](../THIRD-PARTY-NOTICES.md)。
- [x] 將下游 Web bundle Swiss WASM 的 digest 核對納入建置與 CI 產物驗證。Node 24.19.0 本地實際產物已核對與 npm WASM 完全一致；正式部署仍應驗下載成品。
- [ ] 上游 workflow 使用 `emsdk: latest`，GitHub 發布 job log 已過期。若需逐位元重建，另向上游確認具體工具鏈；這不影響已識別的上游原始碼 commit 或下游 WASM 雜湊。
- [ ] 以實際分發的成品核對完整「對應原始碼」與授權聲明可供取得，而不是只指向會移動的 master 或只附 minified JS/WASM npm 套件。網頁已實作固定來源與套件全文聲明；尚未在線上驗取回。Node/MCP 目前是來源 workspace，未查到獨立發行成品；若日後發行，按該產物另做同等檢查。
- [ ] 對既有公開部署獨立查它的實際成品 commit 及取得對應原始碼的方式；不能用新 PR 推定舊版本已符合。部署完成後，從公開 URL 點開「本版原始碼」核對完整 SHA、試下無登入源檔、核對對應 WASM 與法律檔可存取。
- [ ] 跑全套 CI／Pages Artifact 檢查。若今後改用商業授權，須分開確認 Astrodienst 上游與 JS wrapper 著作權人涵蓋範圍；購買不必然處理 wrapper 權利。若改無 Swiss 的版本，另行做能力缺失與精度回歸。

參考：[Astrodienst 程式設計手冊](https://www.astro.com/swisseph-download/doc/swephprg.pdf)、[GNU AGPL v3](https://www.gnu.org/licenses/agpl-3.0.en.html)、[Swiss Ephemeris JS](https://github.com/swisseph-js/swisseph)。
