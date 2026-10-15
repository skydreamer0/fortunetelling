# 八字口徑比較（目前版本）

`compare_bazi_conventions` 是唯讀 MCP 工具，不需要 AI API key。
對同一份已匯入的 profile，用目前 core 的真實八字 calculator 跑兩組明確設定。
用途是回答「早子／晚子、真太陽時／民用時間，改了哪些本命欄位？」

## 呼叫

以下 `example` 是你自行匯入的 profile ID，日期是固定查詢參數，不會讀取今天日期：

```json
{
  "profileId": "example",
  "asOf": "2026-10-15",
  "left": { "useTrueSolarTime": false, "ziHourConvention": "late" },
  "right": { "useTrueSolarTime": false, "ziHourConvention": "early" }
}
```

兩側設定都必須完整提供；不接受額外 schoolPack、歷史版本或出生輸入欄位。
需要先依 [MCP 設定](MCP-SETUP.md) 準備並匯入自己的 profile。

## 如何看結果

- `available: true`：`left`／`right` 各有 `effectiveOptions`、`calculatorVersion`、`natal`、`warnings`。
- `effectiveOptions` 從 calculator 回傳的 chart 讀取，包含實際時鐘及年月柱分界。
- `differences` 列出不同欄位、兩側值與 `chartPath`；`unchangedFields` 只代表這次所比較的欄位相同。
- `sources` 是這些欄位與口徑所用的核心程式路徑，並非流派文獻或預測效度證據。
- `explanation` 是固定模板的中文說明，不是 LLM 生成的命理判詞。
- `versions`、`versionsHash` 保留目前版本資訊；星曆狀態是 `not_initialized`。
- `caveats` 保留時間警示碼及未精確出生時間提醒；它們不會因兩組結果一致就消失。
- `available: false`：出生時間未知或核心未提供完整比較欄位；不猜測、不將缺資料視為一致。

例如測試使用虛構的民用時間 23:10，在晚子／早子設定下直接比較 core 輸出的日柱。
這是規劃的回歸案例，不是已驗證的測試執行結果；執行狀態應以 CI／驗收紀錄為準。
沒有預先捏造某份真實使用者的命盤或差異數字。

## 限制與隱私

目前只比較八字主盤的四柱、日主、五行出現次數、十神出現次數。
不比較大運、流年、流月、規則解讀、分數、流派結論；不判定哪個設定比較準。
兩項設定同時改變時，只呈現合併結果，不聲稱單一變因的因果歸屬。
時間警示不等於完整的不確定性分析；本工具沒有窮舉時間誤差範圍或替代盤。
版本 metadata 不代表可重播歷史引擎；沒有保存出生輸入、歷史依賴或快照。

工具只讀取本機 MCP profile store，不寫檔、不呼叫外部 AI、不上傳。
輸出不含姓名、出生日期、地點標籤、座標或原始時鐘時間戳；但命盤衍生資料仍然是私人資訊。
若在外部 AI client 呼叫 MCP，工具結果會交給該 client；是否繼續傳給模型由 client 的設定決定。

## 驗證

在有 Node.js 24 LTS 與已安裝鎖定依賴的 checkout：

```sh
npm test -- packages/mcp/tests/compareBazi.test.ts
npm test -- packages/mcp/tests/docsSync.test.ts packages/mcp/tests/batch.test.ts packages/mcp/tests/e2e.test.ts
```

仍需跑專案既有 typecheck、完整測試與相關 CI；新增測試檔不等於測試已通過。
