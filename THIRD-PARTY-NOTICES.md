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
上游 wrapper 的 1.3.1 版[發布修正原始碼候選](https://github.com/swisseph-js/swisseph/tree/d15a8a30700f521489f01474385e86a4ce93b5aa)尚未與發布 tarball 的 `gitHead`、WASM 和重建輸入核對，不能用這個連結冒稱已提供完整的對應原始碼。

## 另有授權或待核對的內容

- `packages/core/tests/fixtures/fortel1952.json` 的附隨授權為 [Apache-2.0](packages/core/tests/fixtures/fortel1952.LICENSE)。保留原始歸屬及聲明；測試資料不因專案授權變更。
- `docs/validation/` 的外部校驗來源與資料、`.agents/skills/` 的規則文件、圖片與其他素材，照各檔來源及授權，不視為本專案能再授權的內容。
- Web HTML 向 Google Fonts 請求字體，並未在此專案夾帶字體檔。若改為自行封裝，重新核對對應字體許可與聲明。
- 上表不是各建置成品的完整第三方清單。正式發布前，應以鎖檔和實際成品補齊包含傳遞依賴的授權與版權資訊。參見 [發布核對](docs/licensing-release-checklist.md)。
