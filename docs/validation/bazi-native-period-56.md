# #56 八字原生期間轉接：限定切片

這一片只新增三個 adapter，不改原 `annualPillars`、`monthlyPillars`、`luckCycles` 輸出，不接入 Timeline／Question／Backtest。原本整個公曆格採 dominantPeriod 的問題仍需 #58 接線；不能以這份 adapter 測試宣稱整張 #56／#34 完成。

## 契約

- `baziAnnualNativePeriod(source, {periodId, timezone})` 保留來源立春到下個立春的 UTC 半開區間。
- `baziMonthlyNativePeriod(source, {periodId, timezone})` 保留來源交節到下個交節的 UTC 半開區間。
- `baziLuckCycleNativePeriod(luckCyclesResult, index, {periodId, timezone, startOverlap?, endOverlap?})` 從原 `startIso` 出發，以同一 lunar-javascript `nextYear(10*n)` 算法取得每一步的民用時刻。兩端分別依明確 profile timezone 解為 UTC；不把 inclusive end 日期加 24 小時、不用 3650 天、不把日期當 UTC 午夜。
- 大運必須同時提供整份來源與步驟 index，不能僅由日期猜回時刻。來源 startDate、該步 start／inclusive end 與推導結果不一致時拒絕。不存在的民用時間拒絕；重複時間必須分別明選 earlier／later。
- 回傳凍結的 `NativePeriod`。`precision: second` 表示來源邊界解析度，不是天文誤差保證。年／月的原絕對瞬間不隨 profile timezone 改變；大運民用時間需以傳入的 profile timezone 解讀。
- 八字來源沒有 period ID，因此呼叫端明傳非空 `periodId`；應包含自己的 chart/source scope。沒有 global fact、snapshot 或 cache identity 保證。

## 來源與限制

來源是已存在的 `packages/core/src/calculators/bazi/pillars.ts`、`time/solarTerms.ts` 及鎖檔中的 lunar-javascript 1.7.7。2025 立春 `2025-02-03T14:10:28Z`、2026 立春 `2026-02-03T20:02:08Z` 固定值來自目前來源函式，是防止 adapter 錯轉的 regression，不宣稱獨立外部天文驗證。

大運保留原有順逆與起運慣例：以整分鐘節氣差折算起運年／月／日／時，再在出生地民用鐘做原 library 算術。本片不選擇新流派、不變更分鐘截斷，也不聲称歷史時區與預測效度已獨立校驗。閏日測試特別驗證每個十年都從原起點加年，而非先夾到 2/28 再累加。

## 驗證

新增 adapter 測試先紅：缺少 API 時 1 pass／5 fail；其中純拒絕測試因缺函式也會拋錯，該一項不當作已驗功能。新增 API 後，兩套新測試＋保留舊匯出集合的明列增量測試為 13 pass／0 fail、237 assertions；core typecheck 通過。

覆蓋：1 月屬前一個立春年、12 個交節月前後一秒、順逆大運每一步前後一秒、完整時分秒、閏日十年、明確 profile 時區、兩端 DST gap／overlap、非法日期／索引／選項、來源不一致、9999 越界、immutable／原來源不變。

四個實際 host TZ 子程序（UTC、台北、紐約、Apia）比較台北／紐約／Kathmandu 的完整來源與 adapter 輸出，禁止 Intl fallback，並確認四個 host offset 確實不同。

重現（Bun 1.4.2）：

```sh
bun test packages/core/tests/baziNativePeriods.test.ts packages/core/tests/baziNativePeriodsHostTimezone.test.ts packages/core/tests/cooperativeVersion.test.ts
bun run --filter @fortune/core typecheck
```

本地嘗試 frozen install 遇 registry 403，未重試／換源；實測使用既有依賴副本，鎖檔未改。新遠端 CI、完整 repository 測試、非作者獨審與 Windows 尚須分別記錄結果，不能由本頁測試清單推定通過。沒有 browser／production deployment 驗收，原 golden、版本、workflow 與 runtime consumer 都未改。
