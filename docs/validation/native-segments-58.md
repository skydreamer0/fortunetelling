# #58 公曆格原生期間分段（segment）：惰性（inert）helper 切片

這一片只新增兩個純函式與測試，**沒有接入** `buildTimeline`、回驗（backtest）、問事（questions）、MCP 或網頁，也不從公開 barrel `packages/core/src/index.ts` 匯出。Report／Timeline schema、版本與 golden 均未改動。本片不勾選 #58 任何一項驗收；#58、#56、#34 仍保持 open。

## 契約

- `segmentWindow(cell, periods, timezone)`（`packages/core/src/timeline/nativeSegments.ts`）：
  - `cell` 為公曆年格 `{kind:'year', year}` 或月格 `{kind:'month', year, month}`；以傳入的 IANA 時區（timezone）經內建 tzdb 取「本格首日 00:00 → 下一格首日 00:00」半開區間（half-open interval）。不存在或重複的午夜直接拋錯，不代選 earlier／later。
  - `timezone` 為必填，**沒有預設值**：出生地時區或分析時區尚未由 owner 決定，本片不代選。
  - `periods` 必須是單一家族（同 system、同 kind，例如只有流年、只有流月或只有大運），且彼此不重疊（含重複）；違反即拋錯。多家族合併留給未來的呼叫端。
  - 回傳凍結的 `{window, segments: {interval, periodId}[], coveredMs, unknownMs}`。段落依時間排序、互不重疊、皆落在格內；沒有期間覆蓋的時段不生成段落，只計入 `unknownMs`。恆有 `coveredMs + unknownMs = 格長`。
  - 只做幾何切分；不評估訊號、不計數、不去重。
- `baziNativePeriodsFor(sources, {idPrefix, timezone})`（`packages/core/src/calculators/bazi/nativePeriodSet.ts`）：把既有 `annualPillars`／`monthlyPillars`／`luckCycles` 輸出逐項交給 #56 的三個 adapter，依家族分成 `annual`／`monthly`／`luck` 三組。`idPrefix` 必填；ID 規則為 `<idPrefix>:year:<year>`、`<idPrefix>:month:<solarYear>-<index>`、`<idPrefix>:luck:<index>`。
  - 大運需傳原始 `LuckCycles`（含 `startIso`）。`BaziChart.luckCycles`／`luckStart` 只有日期，本片不從日期猜回起運時刻。
  - 這裡的 `timezone` 對大運而言是來源事實（出生地民用鐘），與 `segmentWindow` 的格時區是兩個獨立參數。

## 驗證（`packages/core/tests/nativeSegments.test.ts`）

- 2026 年格（Asia/Taipei）切成乙巳／丙午兩段，切點等於來源立春瞬間，無缺口、無重疊、`unknownMs = 0`；只給 2026 流年時，元旦到立春計為 unknown。
- 2026 年 2 月格在丑／寅交節切開；1995 合成命例的月格在第 2 步大運起點切開（月份由該起點推得，未硬寫）。
- America/New_York 2026 年 3 月格長為 31 天減 1 小時（DST），證明以指定時區而非 UTC 取格；2028 年 2 月格長 29 天並在立春切開。
- 拒絕混合家族、重疊、缺時區、非法月份與空 `idPrefix`；確認兩個函式不在公開 barrel。
- 未測（CI 不允許 todo／skip，僅在測試檔留註解）：#56 消費端驗收「1 月事件不得使用立春後的年柱」須等接線後才能測。

此處「閏日」只指公曆 2 月 29 日，**不是** #58 驗收中的「跨閏月」（農曆閏月），後者本片未測。

## 尚待處理

1. 消費端接線（buildTimeline、回驗、問事、MCP、網頁），以及 `SignalWindow` 的 segment 參照。
2. 計數規則：同一來源跨兩段只計一次，分母語意與 #28 對齊。
3. 格時區選擇：出生地或分析時區，由 owner 決定。
4. 下一版 Timeline schema 與 MCP window 形狀版本；舊 v1／v2 golden 重現與 delta。
5. 跨閏月格的測試，以及分段後時間軸建置時間增幅的量測。
