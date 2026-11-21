# 授權發布核對

這份清單區分「已在 PR 準備」和「發布前仍須由維護者驗證」。本文件本身不代表任何尚未確認的權利已取得。

## 準備

- 授權路線是保留 Swiss Ephemeris，對專案可依法授權的原創程式碼採 AGPL-3.0-only；第三方仍依原授權。單列 MIT 或只換根目錄名稱無法消除既有 Swiss Ephemeris 和 JS wrapper 條件。
- 正式 GitHub Actions build 的網頁底部提供 checkout 完整 commit 的原始碼網址；來源下載應含鎖檔和可執行的建置、安裝腳本。建置以 `npm ci; npm run build` 重現；對應 Node/npm 版本看該 commit 的 package.json。從 GitHub archive 或 fork 自行重建不會標為官方成品。
- 網頁 build 內有 `LICENSE.txt` 和 `THIRD-PARTY-NOTICES.txt`，CI 比對內容與 checkout 原檔，並核對正式建置裡的 exact-commit source URL。

## 必須完成才能將新產物宣稱為授權與發布均已通過

- [ ] 維護者確認專案程式碼、共同作者、曾匯入的程式、圖片、代理 skills、測試樣本與外部 oracle 資料的適用權利。無法確認的第三方內容保留原權利聲明，移出分發包或取得許可；不把未核對的 fixture 當成專案原創。
- [x] 鎖定 `@swisseph/browser@1.3.1`、`@swisseph/core@1.3.1` 的 npm 發布 archive：content digest 對應 npm provenance 與 lockfile，上游 Git commit、C 資料夾、browser binding 原始碼、重建腳本及發布流程已定位。證據與 WASM digest 見[第三方聲明](../THIRD-PARTY-NOTICES.md)。
- [ ] 發布前核對實際下游 Web bundle 的 WASM digest 等於鎖定的 npm 成品，保留建置證據與可取得的對應原始碼。上游 workflow 使用 `emsdk: latest`，GitHub 發布 job log 已過期，未取得精確工具鏈或逐位元重建結果；如需要逐位元重建，另向上游確認。
- [ ] 以網頁與 Node/MCP 各實際分發的成品，核對完整「對應原始碼」與授權聲明可供取得，而不是只指向會移動的 master 或只附 minified JS/WASM npm 套件。保留 Swiss Ephemeris、wrapper 和各其他組件作者的聲明。
- [ ] 對既有公開部署獨立查它的實際成品 commit 及取得對應原始碼的方式；不能用新 PR 推定舊版本已符合。部署完成後，從公開 URL 點開「本版原始碼」核對完整 SHA、試下無登入源檔、核對對應 WASM 與法律檔可存取。
- [ ] 跑全套 CI／Pages Artifact 檢查。若今後改用商業授權，須分開確認 Astrodienst 上游與 JS wrapper 著作權人涵蓋範圍；購買不必然處理 wrapper 權利。若改無 Swiss 的版本，另行做能力缺失與精度回歸。

參考：[Astrodienst 程式設計手冊](https://www.astro.com/swisseph-download/doc/swephprg.pdf)、[GNU AGPL v3](https://www.gnu.org/licenses/agpl-3.0.en.html)、[Swiss Ephemeris JS](https://github.com/swisseph-js/swisseph)。
