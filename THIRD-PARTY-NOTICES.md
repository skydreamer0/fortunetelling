# 第三方聲明 / Third-party notices

本清單區分「實際整合的執行期套件」、「僅測試／工具」與「外部服務」。
第三方元件依自己的授權，專案根目錄的授權不取代原始條款，也不代表取得第三方商標、資料、素材或其他權利。

## 主要執行期元件（版本取自 package-lock.json）

| 元件 | 版本 | 授權／上游 |
| --- | --- | --- |
| @swisseph/browser、@swisseph/core | 1.3.1 | AGPL-3.0（沿用鎖檔標示）；[JavaScript / TypeScript wrapper](https://github.com/swisseph-js/swisseph) |
| Swiss Ephemeris C / WebAssembly | C binding 文件記錄為 2.10.03 | Dieter Koch、Alois Treindl／Astrodienst AG；[上游 AGPL 或 Professional 授權](https://www.astro.com/swisseph-download/doc/swephprg.pdf) |
| iztro | 2.5.8 | [MIT](https://github.com/SylarLong/iztro/blob/main/LICENSE) |
| lunar-javascript | 1.7.7 | [MIT](https://github.com/6tail/lunar-javascript/blob/master/LICENSE) |
| react、react-dom | 19.3.0 | [MIT](https://github.com/facebook/react/blob/main/LICENSE) |
| @modelcontextprotocol/sdk | 1.31.0 | [MIT](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/LICENSE) |
| zod | 3.25.76 | [MIT](https://github.com/colinhacks/zod/blob/main/LICENSE) |

網頁的星曆使用套件內 Swiss Ephemeris WebAssembly 和 Moshier 路徑；Node/MCP 也可載入同一套件的本地 WASM。本專案沒有另行提供 `.se1` 星曆資料檔；沒有這些檔案仍有 WASM 的授權義務。
1.3.1 發布的 npm provenance 指向[確切上游原始碼與建置腳本](https://github.com/swisseph-js/swisseph/tree/d15a8a30700f521489f01474385e86a4ce93b5aa)：包含 `native/libswe`、`packages/browser/src/swisseph_wasm.c` 和 `packages/browser/build-wasm.sh`。證據：[Browser attestation](https://registry.npmjs.org/-/npm/v1/attestations/@swisseph%2fbrowser@1.3.1)、[Core attestation](https://registry.npmjs.org/-/npm/v1/attestations/@swisseph%2fcore@1.3.1)、[上游發布執行](https://github.com/swisseph-js/swisseph/actions/runs/29828416348/attempts/1)。兩套 tarball 的 SHA-512 均符合 npm 鎖檔與 attestation subject，browser source map 內 4 個 TypeScript 檔案均與對應 Git blob 一致。npm 內附 WASM 的 SHA-256 為 `c73d47b63f9879fafc99171fe1cf484b7f2dda214c0fd7d5299bad8542d56968`；尚未逐位元重建，原工作流程指定 `emsdk: latest`，具體版本未由保存日誌證實。

## 另有授權或待核對的內容

- `packages/core/tests/fixtures/fortel1952.json` 的附隨授權為 [Apache-2.0](packages/core/tests/fixtures/fortel1952.LICENSE)。保留原始歸屬及聲明；測試資料不因專案授權變更。
- `docs/validation/` 的外部校驗來源與資料、`.agents/skills/` 的規則文件、圖片與其他素材，照各檔來源及授權，不視為本專案能再授權的內容。
- Web HTML 向 Google Fonts 請求字體，並未在此專案夾帶字體檔。若改為自行封裝，重新核對對應字體許可與聲明。
- Web 發布附 `WEB-DEPENDENCY-LICENSES.txt`：從實際 chunk 的套件加上已驗證的 Swiss 包內嵌 core、Vite／Rolldown 產生的執行期程式，原樣保留安裝包的 `LICENSE`／`COPYING`／`COPYRIGHT`／`NOTICE`。它不包含只用於 Node 測試或 Node/MCP 中而未送到瀏覽器的元件。
- 目前 GitHub Releases 沒有獨立二進位包，core／AI／MCP workspace 都是 private，不能由建置成功推定有發行 Node 套件。如果日後另行散布 Node/MCP，必須對該產物重做完整第三方清單、聲明與來源提供。參見 [發布核對](docs/licensing-release-checklist.md)。
