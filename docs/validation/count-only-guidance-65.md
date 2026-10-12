# #65 五行計數文案修正（core 0.9.1）

來源：[Issue #65](https://github.com/skydreamer0/fortunetelling/issues/65)。
本切片只處理「五行出現次數不能推出補缺建議」。不完成整張 Issue，
不新增司令、十二長生、日主狀態、扶抑、旺衰或喜忌判準。

## 公開行為與相容性

- InsightBuilder 只描述既有次數；並列最低完整列出，全同只說次數相同。
- 明示未判定旺衰或喜忌，不能據此提出補缺建議。
- 移除最低元素對色彩、方位與習慣的映射。既有 `balance` 形狀保留，
  `color`、`direction`、`habit` 相容欄位固定空字串，不代表仍有建議。
- `element` 保留第一個最少次數元素，`tiedElements`、`count`、`source`、
  `limitation` 不變；這些欄位都不是喜用神或建議元素。
- 未知時辰沿用 `balance: null`，不填補計數或判斷。
- Web 不展示上述三個舊推薦欄位；只有 insight version 2 使用新計數文案。
  舊版或缺版本的報告改顯示資料限制，避免重新展示舊補缺文案，不修改保存報告。
- 八宅四吉方、數字、來源與其餘報告欄位保持；guidance 第一條限制移除已撤除的
  顏色推薦，明確指向獨立的八宅方位。

依 CONTRIBUTING 的公開 API 行為升版規則，core `VERSION`、package 與
bun.lock workspace version 由 0.9.0 升至 0.9.1；`INSIGHT_VERSION` 由 1 升至 2。
Report 形狀不變，`REPORT_SCHEMA_VERSION` 保持 7。core 版本也自然改變
Report／compatibility version、CalculationSpec 的 core identity／specHash、
MCP versionsHash 與 export manifest coreVersion；沒有更動 hash 演算法或資料遷移。

## 獨立預期值與逐欄守門

`insightBuilder.test.ts` 的合成向量涵蓋五個元素各自最低、並列與全同，
逐欄比較完整 guidance，並確認輸入未變。預期文案直接來自 Issue 的限制，
不是從修改後程式輸出錄製。未知時辰另由 analyze 入口測試。

`apps/web/tests/guidance.test.tsx` 僅 SSR Guidance，涵蓋最低、並列、全同、
未知時辰，以及有／無 insight version 的舊報告。它不取代瀏覽器實機驗收。

`reportGolden.json`、`export.golden.json` 與所有歷史 delta 原樣保留。
新增 `reportGolden.v0.9.1.delta.json` 含 75 個明示 before/after literal：
13 個 core version、11 個 insight version、11 個 guidance limitations、
10 份已知時辰報告各 4 個 balance 欄位（color、direction、habit、text）。
新增 export delta 只改 1 個 coreVersion literal。
Report golden 仍比較完整所有 section，禁止略去未列入 delta 的差異。

## 驗證狀態

此候選製作環境沒有 Bun，沒有安裝或以 Node 替代執行。
以下均為 NOT RUN，靜態審查不代表通過 runtime：

- `bun test packages/core/tests/insightBuilder.test.ts apps/web/tests/guidance.test.tsx`
- `bun test packages/core/tests/reportGolden.test.ts packages/core/tests/export.test.ts packages/core/tests/cooperativeVersion.test.ts packages/core/tests/analyze.test.ts`
- `bun run --filter @fortune/core typecheck`
- `bun run --filter @fortune/web typecheck`
- `bun test`、`bun run build`、原生瀏覽器實測

沒有推送、PR 建立、合併、部署、正式資料庫或憑證變更。
