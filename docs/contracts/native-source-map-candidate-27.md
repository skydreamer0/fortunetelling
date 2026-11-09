# #27 有限 native source mapping 候選盤點 v1

**狀態：candidate-not-adopted。不是 Signal V2、production grouping、SchoolPack attribution 或 G1 採納。**

固定來源：`master@ff745920264faa01aafd149407ce4a145fa84dc8`。本包只新增這份說明、相鄰 JSON ledger 與 `docs/validation/verify-native-source-map-27.mjs` 靜態審核程式。沒有改 runtime、來源規則、FactStore、registry、Signal/Report identity、聚合器、權重、輸出或公開 API。

## 為什麼是差額，不是重做

#106–110/#126 已交 owned FactStore、native metadata、exact shared-fact links 及有限 validationRef。原 `natal-validation-links-27.md` 明確要求下一個 consumer 提供 reviewed/versioned school/question-to-native-rule mapping，不能從 domain/trait/target 或 shared-fact overlap 推論。

本包補**固定來源、可機器檢查的候選盤點**：把現有兩份 catalog 的所有 rule/version、native metadata 覆蓋與其已知缺口列在一起，並把未採納欄位明確留空。它提供下一次採納審查的輸入，不新增一個與既有 descriptor 平行的 runtime registry，也不聲稱 mapping 已實作。

## 有限覆蓋與計數

|來源集合|總 rule IDs|含 natal scope|native metadata mapped-limited|
|---|---:|---:|---:|
|`rules/bazi/catalog.json`|13|12|1|
|`rules/ziwei/catalog.json`|11|4|2|
|合計|24|16|3|

因此有 **13 個 natal rule/version 未映射、8 個 catalog rule/version 不在 natal scope**。一個規則有多個 scopes 仍只算一列；這是兩 catalog 的覆蓋，不是全 repo 41 rules 或特定出生盤命中數。八字十神 catalog、其他系統、替代盤與 flow-period metadata 都明列 excluded。沒有命中不等於規則未覆蓋；`coverage` 是來源 allowlist 與 catalog scope 的靜態關係。

JSON每列保留catalog的JSON Pointer、其原始 `source` 字串及rule版本。這些書目/慣例是 **repo自述來源**，不是本次查閱古籍原文或獨立命理認證。所有school/question/source-family/group-key/eligibility欄位一律null；不能拿來源字串中的流派名稱或廣義career領域直接填入。

## 三個已支援 native metadata 樣本

|rule v1|已存在的來源角色|完整性與限制|
|---|---|---|
|bazi.stem.control|有向controller、controlled → bazi.pillar facts；保留directed/complete|source resolved仍**claim unresolved**，只代表兩個原局天干位置可解析；不是一般相剋來源族或問題命題|
|ziwei.star.tianma|primary-placement，實際命中時的lucun本宮/對宮/三合與same-palace-sha|source partial；palace-relations及absence條件不是facts；host/source palace保留；不因描述多就增加獨立星曜|
|ziwei.natal.star_traits|primary-placement、natal-transformation、same-palace-sha；借星保留原source宮|source partial；另缺brightness fact；借星不是另一顆獨立星，traits和modifiers仍是版本化啟發式|

`sourceRoles` 是可能角色的詞彙清單，不代表每次hit都有這些依賴。依賴由實際matcher產生，primary-placement由現有Fact consumer補入；本盤點不從target字串重建角色、不產生新的fact id。

所有claim仍 `no-registered-claim-mapping`，independence仍 `not-established`。source resolved、validation ref resolved、同一fact相交都不授權directional vote、prediction或scoring group。日期window只是natal matcher的內部呼叫輸入，不在本ledger匯出為真實native interval。現有converter排除adjectiveStars，不能稱完整紫微星曜圖。

## 後續採納所需內容（尚未提供）

1. 精確rule/catalog版本與實際school、question、grain scope；提出的映射需有來源與具名審核，不以caller宣告當verified。
2. 明定target命題、domain、native trigger/source-family的同一與不同條件；反例需包含不同domain、不同方向、同源多描述、相同fact但不同命題、流派相反分支。
3. 代表性正例/反例/邊界fixture與可追來源，標明工程對照與獨立語義審查的差別。缺少來源保留unresolved。
4. 另一份採納的eligibility policy與coverage/分母契約。mapping採納不自動採納聚合策略或推薦。
5. 原owner的明確採納收據及新版本。此candidate不可原地把status改成adopted，不能將schema自驗PASS當採納證據。

本輪沒有上述決策、外部來源認證或完整Signal V2 consumer。#27保持open；#28/#29不得直接使用這份JSON計分。

## 可重現的靜態審核

於包含固定base commit物件的repo根執行（Node24，無額外依賴）：

```sh
node --test docs/validation/verify-native-source-map-27.mjs
git diff --check
```

審核程式只讀本地檔案及 `git show/rev-parse`，沒有網路、寫入、產品import或排盤。十個來源檔以完整SHA256與固定base Git blob雙核；修改source、漏pin、漏/重複/未知rule、偽造adopted/G1/group/eligibility、錯source文字、刪partial缺口或灌大coverage都須拒絕。規則列採明確code-unit排序，不依host locale。

這是snapshot-bound inventory驗證，不是安全簽章；能同時改audit與ledger的人可以改政策，所以需非作者同hash審查，不能宣稱防竄改或runtime enforcement。它也不是算法/瀏覽器/科學驗收，不接CI以免新增未核定gate。

本次作者檢查：Node24.22.1，19/19靜態audit tests通過（1基準+18負控制）；初版曾因Python code-unit排序與JS localeCompare不一致而1失敗，修成顯式code-unit比較後通過，失敗log保留於交付證據。產品tests/typecheck/build/browser未執行；同版獨審收據另列。

## 版本與回復

只新增三個docs檔，刪除候選檔即可撤回本提案，不需資料或runtime遷移。舊來源版本保留，後續來源變更必須重新列完整coverage、審核diff及建立新候選版本；不可自動刷新hash掩蓋變更。沒有部署、合併或G1採納權限由本文件產生。
