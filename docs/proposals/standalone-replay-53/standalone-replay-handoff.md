# Standalone replay 後續作者交接

狀態：待採納決策稿。來源固定 d9133cf63070791bb3e6480357ab2d363eafcb8c；Issue [#53](https://github.com/skydreamer0/fortunetelling/issues/53)。政策採納後才能開始產品實作；本稿不表示功能已完成。

## 本次做了什麼

只讀同 SHA 六份 source/test（完整引用與 blob SHA 見 decision 稿）、Issue 差額與已交的兩份時態文件。製作兩方案決策稿、24 個宣告式 synthetic 反例及此交接。沒有執行新舊產品測試、calculator、WASM、typecheck、build、browser 或 calibration；所有案例為合成資料，不含真實個人出生紀錄。

本次與舊包不重複：不再修正 #154/Core 版本的文件時態，不重寫 resolver/registry ownership，不重跑原 R2；新增的是 standalone record 的 raw/effective 分層、opt-in 邊界、兩方案政策與新反例。

## 採納後才啟動的最小作者包

建議先採 A，首包只 Jyotish standalone opt-in capture/replay。具體 API/schema/hash 名稱仍由採納決議固定，不要讓此稿的示意名稱意外變成現有公開契約。

預定新增白名單（候選路徑，開工前確認不存在／無其他作者）：
- packages/core/src/core/standaloneEphemerisReplay.ts：版本化 envelope、owned input、raw presence codec、effective 重建及完整結果比對。
- packages/core/tests/standaloneEphemerisReplay.test.ts：由反例矩陣轉為可執行 synthetic 測試。
- docs/contracts/standalone-ephemeris-replay.md：採納後的正式契約與限制。
- 根據現行 export 結構，精確選定最少的一個公開 barrel 及其 export inventory 測試；尚未列准的路徑不可隨意擴大。

只讀引用現有 resolver/calculator；預設不改 ephemerisSettings.ts、既有 calculator algorithms、aes1、asyncReplay.ts、Report/Profile、UI/MCP、依賴、CI。若必須抽取共用 ownership/canonicalization，先列新增跨模組範圍和舊輸出保護，不以順手重構擴包。

若選 B，以上 A 白名單不可直接沿用：先形成新 timeline spec／記錄版本與 consumer 遷移範圍，列所有變動入口並重新核定。不能把 B 藏在 A 的 serializer 中實作。

## 開工前必備

1. 採納 decision 稿四個政策選項並保存來源；版本／raw presence／數值域／首包範圍可追溯。
2. fresh head 與進行中作者清單；head 若改變，僅對受影響source做差額，不能假裝本稿仍完全有效。

## 變更後驗證與非作者驗收

待實作後，才將 JSON 反例轉為 executable cases；每個 case 的 NOT_RUN 需有真執行／head／command／artifact 才能更新。沒有天文 oracle，不用人工編造大運日期期望值；可用固定版真 calculator 做一致性驗證，另外的科學驗證保持未做。

- 核新 record 的 raw presence、effective resolver 重建、context/asOf/dependency 綁定與 JSON roundtrip。
- 逐個改版本、依賴、資料、結果、unknown欄做負控；驗不能只比hash。驗 synthetic unknown time 保留空盤。
- 驗輸入／輸出別名隔離，first-init 與 warm-init caller mutation；新 capture 不凍結 caller。
- 僅重跑真正受變更影響的現有 standalone/default/export/strict-boundary 契約。若共用函式有變，再擴到 asyncReplay 既有 ownership；沒有變更則引用同版成功驗證證據，不能無條件重跑全庫。
- 非作者比較新舊 legacy JSON、cs1/aes1 和既有記錄 bytes；確認沒有自動capture、遷移、持久化或新UI欄。
- 分列 PASS、FAIL、NOT_RUN；失敗原因未知不能自動算資源問題。無執行證據的案例維持 NOT_RUN。

## 停止與交付界線

政策未採納時停止產品實作，仍可審提案。來源變更、需改既有公共契約或涉及真實個人資料時，先重新審查範圍。回報「決策稿可審」而非「功能已完成」；非作者審查此三檔只能通過文件完整性，不能通過產品、#53、#26、實機或科學效度。

本提案不涵蓋歷史 runtime 下載或全路徑 Report/Profile/MCP 整合，也不改變其他 Issue 的產品範圍。
