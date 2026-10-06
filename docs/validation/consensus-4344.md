# #43/#44 同向共識驗收與字面差異

對照基線：master 164c5572fb32871de526523a12658f1c034b1ff2。交付：Draft PR #67。
本文件記錄規格、已取得的分段證據；最終 exact-head 全套結果以 PR 的最新驗收紀錄為準。

## 先紅後綠

- 純基線：1274 pass / 2 skip / 0 fail；四套 typecheck、doctor、build 通過
- #43 tests-only：4 pass / 8 fail；修正後全套 1286 pass / 2 skip / 0 fail
- #43 非作者另核 240 組權重／順序／重複／門檻 property，960 斷言通過；原 golden/export 不變
- #44 tests-only：core 13 fail；AI 2 pass / 6 fail；MCP/Web 4 fail；Web 真重放全零權重仍有分數的反例已先紅後綠
- #44 涵蓋 raw θ／τ 邊界、正負中性混合、experimental／零權重、同 domain/window、legacy、錯配來源、隱藏／繼承 entry、引用、未來年份、Web 重放與自訂 θτ
- AI payload 原有 60k／70k 預算測試不提高：修正後独審 60k 保留 24 訊號／59731 字；70k 問事保留 55 訊號／69942 字，25/25 必要引用全留；24 組不同容量均無懸空 ID
- 兩個 skip 是既有需 live Claude 的 smoke test，未傳送真人資料
- GitHub Actions 依使用者要求停用；所有上述新執行證據來自批准的本機 Bun 1.4.2、frozen 依賴，不宣稱新雲端 CI 已跑

## 原 golden 保留與 delta

| 資料 | 原檔處理 | v0.6.0 明確變更 |
| --- | --- | --- |
| reportGolden | 原 v0.5.0 與既有 delta 不動 | 46 個 section：core/version、Report schema、Timeline、Consensus |
| export.golden | 原檔 SHA256 不動 | 8 條 delta：5 組版本資訊、timeline/consensus/README hashes |
| questionSystems.baseline | 原 16 個 hashes 不動 | 新 literal before→after；分數、排序、source signals 全數相同 |
| MCP systemsBaseline | 原 8 個 hashes 不動 | 新 literal before→after，閾值、方向、activity、schema 欄位與預設表格 |

baseline 重新計算的 16 個 Question hashes、8 個 MCP hashes 均先與原錄製值一致，才建立差異。
export 的 profile.json、chart.json、signals.json hashes 與 signalCount 不變。
Question catalog v1 不改；v2 只改 metadata/conventions，不改類別或任何計分係數。

## 台南既有測試案例：18 個誤標清除

既有案例：1995-07-16 22:00、male、Asia/Taipei、lat 22.9922/lng 120.1848，asOf 2026-09-25。
五系統 async，θ=.5、τ=.2；此案例用於回歸，不是預測效度測試。
非作者在改前即用 raw 每系統資料獨立分側，然後逐格比對新結果：170/170 格 raw score、valence、signalIds 全相同；activityAgreement 等於舊活動票數。
年度 5→0、月份 13→0，沒有改 raw 強度來消除標記。

| grain | window start | domain | activityAgreement | 正側 eligible | 負側 eligible | highConsensus |
| --- | --- | --- | ---: | --- | --- | --- |
| year | 2026-01-01 | self | 3 | — | — | true → false |
| year | 2026-01-01 | family | 4 | bazi, ziwei | — | true → false |
| year | 2027-01-01 | learning | 3 | — | — | true → false |
| year | 2030-01-01 | self | 3 | bazi, numerology | — | true → false |
| year | 2030-01-01 | family | 3 | — | — | true → false |
| month | 2026-01-01 | self | 3 | — | — | true → false |
| month | 2026-01-01 | family | 3 | — | bazi | true → false |
| month | 2026-02-01 | self | 3 | — | — | true → false |
| month | 2026-03-01 | family | 3 | bazi | — | true → false |
| month | 2026-05-01 | self | 3 | — | — | true → false |
| month | 2026-06-01 | self | 3 | — | ziwei | true → false |
| month | 2026-07-01 | self | 4 | ziwei | — | true → false |
| month | 2026-08-01 | family | 3 | ziwei | — | true → false |
| month | 2026-09-01 | self | 3 | bazi | — | true → false |
| month | 2026-10-01 | family | 3 | — | bazi | true → false |
| month | 2026-11-01 | self | 3 | — | — | true → false |
| month | 2026-12-01 | self | 3 | bazi | — | true → false |
| month | 2026-12-01 | family | 3 | — | — | true → false |

三套正向、三套負向、同時兩側達標都有 synthetic 測試，避免把「此案例為零」誤實作成一律關閉。
舊 Report 缺 raw proof 時不宣稱新同向結論。experimental 的原訊號與衝突保持可見。

## 不變與限制

noisy-OR／排盤算法／問事分數排名／封存 LOCKED FORECAST 都不變。
這份證據限定同次 Analysis／Report，signalId 不提供跨 profile/spec 防偽；不是完整 ChartSnapshot。
「非 experimental」是現有工程資格標記，不等同真實世界預測已驗證。
