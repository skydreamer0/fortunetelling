# Standalone 命盤 replay 身分契約決策稿

狀態：待採納提案，非實作，也不是 Issue #53 結案。2026-10-26；固定來源 d9133cf63070791bb3e6480357ab2d363eafcb8c（Core 0.11.0）。本次只讀原碼與已交文件，沒有執行產品測試。

## 要決定的事

建議選 A：另建明確 opt-in 的 standalone Jyotish 執行紀錄，讓 custom dashaYearDays 可重播，保留既有 aes1 與 async timeline 記錄。這是推薦，不是已採納。若真正產品目標是「讓 timeline 也能選不同 dasha 年長」，才選 B；B 包含計算政策與跨入口語意變更，不能把它當漏欄位修補。

目前 360／365.2422 日的 standalone 年長已會影響實際大運期間，並有既有測試；不存在「尚未支援 custom 年長」這個基礎缺陷。缺的是可保存、驗證、重算的完整 standalone 執行身分。這個局部決策不解決完整 Report／Profile／MCP async 整合，也不證明命理或天文預測正確。

## 已實讀來源與邊界

所有連結固定到同一 commit；blob SHA 可供逐 byte 對帳。

- S1 [ephemerisSettings.ts](https://github.com/skydreamer0/fortunetelling/blob/d9133cf63070791bb3e6480357ab2d363eafcb8c/packages/core/src/core/ephemerisSettings.ts)，blob e13932f534cc889a08ebdea74ae5519717f73402。純 resolver 使用 nullish fallback，Lahiri／mean／365.25／whole_sign；不驗證所有 legacy 數值、不載 WASM、不形成結果身分。回傳物件可變。
- S2 [asyncEphemerisCalculationSpec.ts](https://github.com/skydreamer0/fortunetelling/blob/d9133cf63070791bb3e6480357ab2d363eafcb8c/packages/core/src/core/asyncEphemerisCalculationSpec.ts)，blob 834c46c291fdbcd64053770fe67f3652c9bf0709。jyotish 欄白名單只有 ayanamsa/node；dashaYearDays 固定為 365.25 convention。aes1 僅 timeline settings identity，不能用作命盤結果 cache key。
- S3 [standaloneEphemerisSettings.test.ts](https://github.com/skydreamer0/fortunetelling/blob/d9133cf63070791bb3e6480357ab2d363eafcb8c/packages/core/tests/standaloneEphemerisSettings.test.ts)，blob a16faa39fcd672e21e60fd802f9c83a70a7944a7。明列 omitted/default 全 JSON 相等、360/365.2422 實際期間、legacy nullish、unknown time、mutable output 與 registry await 隔離等測試。本輪只讀，沒有重跑。
- S4 [jyotish/calculator.ts](https://github.com/skydreamer0/fortunetelling/blob/d9133cf63070791bb3e6480357ab2d363eafcb8c/packages/core/src/calculators/jyotish/calculator.ts)，blob 69e01cfa9509655b3ad7ed14ea05247e170a8ea0。buildJyotishChart 先 normalizeAsOf，再 resolve settings；ctx.jd=null 時回空盤；其餘將有效年長傳到 vimshottari。calculate 包裝成 chart/components/warnings。已初始化後為同步計算，不是新的 async 身分 API。
- S5 [ephemerisRegistry.ts](https://github.com/skydreamer0/fortunetelling/blob/d9133cf63070791bb3e6480357ab2d363eafcb8c/packages/core/src/calculators/ephemerisRegistry.ts)，blob 829a05e72727c142debab79c50d6013bfbf12cbd。使用嚴格 aes1；在 initEphemeris await 前複製 configs／asOf Date，custom 年長不在其選項中。不得把 registry 已有 ownership 工作重做成新成果。
- S6 [asyncReplay.ts](https://github.com/skydreamer0/fortunetelling/blob/d9133cf63070791bb3e6480357ab2d363eafcb8c/packages/core/src/timeline/asyncReplay.ts)，blob ee4df5a673ad9cc3f82b1153b658c15c7d596219。既有 schema1／async-timeline-replay-v1 已記完整 context/options、Core/tzdb/dependencies/ruleDigests/iztroConfiguration，重新真算並比完整 spec/result；拒絕不符版本，不載歷史執行器。FNV 診斷 hash 不是簽章。
- [Issue #53 最新差額](https://github.com/skydreamer0/fortunetelling/issues/53#issuecomment-6308858144)：明列 standalone 邊界與全路徑 replay 尚缺，#154 經 #160 整合，不能稱 async 身分全未實作。

呼叫圖：legacy direct buildJyotishChart → resolver → vimshottari；legacy calculate → direct chart → components/warnings。registry → strict aes1 → init await → calculator。async timeline record → own context/options → current-build execution identity → 真 timeline replay。新提案只能補第一條的 opt-in record，不偷換其他三條的意義。

## 兩個方案

| 比較 | A 獨立 standalone 記錄（推薦待採納） | B 新版 timeline 契約擴充 |
|---|---|---|
| 產品意圖 | 保存／重播已存在的 custom standalone 計算 | 新增 timeline custom 年長選項與共同新版記錄 |
| 相容性 | legacy signatures／輸出不動，新 capture/replay API opt-in | 必須有明確新版選擇與調用端遷移；舊 aes1/v1 路徑永久保持原義 |
| 風險 | 新 envelope 與重播 validator，範圍可收斂 | timeline 規則期間、consumer、registry、UI/MCP/export 都可能受影響 |
| 成本 | 一個 calculator 的 record、完整結果比對與反例 | 另加版本分流、跨入口測試、遷移政策；不能只改 schema number |
| 隱私 | 只有明確 capture 才含完整 birth/context，預設不持久化／上傳 | 同樣要求；跨入口 export 更需明確受眾與資料界線 |
| 未涵蓋 | HD standalone、Report/Profile/MCP consumer、歷史 runtime、永久 cache | 亦不自動涵蓋歷史 runtime、科學校準與正式儲存政策 |

B 不是「把 dashaYearDays 加進 aes1-v1」。若採 B，另立新 schema/implementation/scope/hash namespace，保留舊函式路徑及已存 bytes；新 namespace 的名稱尚未決定。不得默默讓舊呼叫開始計算 custom 年長，或自動把舊檔升級成缺失資料的新檔。

## A 的建議資料規則

以下都是待採納規則，不是現有產品保證。

1. 身分分層：scope/calculator/schema/implementation、完整 owned TimeContext、原始 supplied config 的存在狀態、有效 settings、原始及正規化 asOf、精確 Core/calculator/tzdb/ephemeris 依賴版本與 integrity、必要算法資源 digest。結果另外保存完整 ChartResult（含 warnings/components）及診斷 result hash；settings hash 不能代表結果。
2. raw 與 effective 分開。legacy omitted、own undefined、null 在 resolver 上都可得到 default，但來源不同；建議 raw 用明確 presence descriptor 表示，JSON 不含真正 undefined。每個允許欄位區分 absent／undefined／null／value。重播只解析嚴格已知 descriptor，不靠 JSON.stringify 抹掉差異。等效輸出可相同、execution identity 不必相同。effective 必須由固定版 resolver 重建並逐欄比對，不能信任檔案填的值。
3. asOf 不得偷用現在時間。保存 supplied string 或 Date 的類型及值，另外保存 calculator 正規化後日期。有效 Date 用明確 ISO representation；invalid Date／無法正規化者在新 capture 拒絕，legacy normalizeAsOf 不變。相同 asOf/effective 不代表兩份不同生辰的結果可共用。
4. 新 capture 先擁有完整 plain-data context/config，再進入任何初始化 await。Date 只容許在明確 asOf slot 轉為 descriptor；其他 getter/prototype/cycle/symbol/hidden/sparse 欄拒絕，不執行 accessor。returned record 深凍結，不能凍結或改動 caller；legacy chart 的可變性保留。
5. custom 年長：建議新 opt-in record 僅允許有限正數，至少包含既有 360、365.2422、365.25；不新增「準確度」上限或縮成三選一。對極端有限值導致中間／結果不有限、溢位或不完整時不得發有效 record，須清楚失敗。這是新邊界驗證提案，不得回灌收緊 legacy API。數值可接受域及錯誤分類須在採納時確認，不把缺實證的容差寫成標準。
6. unknown time：保留 null/unknown 的 source、空 planets/components/dasha/lagna 與 time_unknown warning，仍記錄有效 custom settings；不能補中午時間。重播只證明相同輸入的輸出一致，不替原 TimeContext 真實來源背書。
7. 重播先嚴格驗 envelope／version／欄位及 dependencies，再重建有效設定、真 calculator 重算、比完整 ChartResult。unknown fields、錯結果、錯版本或 source mismatch 一律拒絕。不能只比 hash；更換整份自洽紀錄仍可能通過，因此沒有防偽／來源認證承諾。
8. 新 record 不變更 cs1、aes1、舊 AsyncTimelineRecord、Profile2、Report8 的 bytes 或意義；不回填既有檔案，不下載舊 runtime，不寫 DB/cache、不上傳。HD 與全消費鏈整合留下一包，須有各自採納契約。

## 去重與採納檢查點

已交的兩份時態校正（docs/validation/async-ephemeris-spec-53.md、docs/contracts/async-timeline-replay.md）只是修正「#154 尚未交付／Core0.9.1」的過時描述。本稿不再改那兩檔、不重跑 #133/#154/R2 的成功測試。新增差額是獨立 record 或新版 timeline 的政策選擇、raw presence 序列化、反例與後續作者範圍。

待採納四點：選 A 或 B；是否接受 raw presence descriptor 與保守身分不合併；確認新 opt-in 年長驗證域／錯誤行為；確認首包只 Jyotish standalone capture/replay、不接 consumer／持久化。採納前可以審稿，不能宣稱新的 schema 已存在或開始遷移產品。

配套 standalone-replay-cases.json 為宣告式合成設計，不是測試程式；所有結果 NOT_RUN。獨審應核 sources、原行為保留、方案間差異及無重複交付，再作政策採納決策。
