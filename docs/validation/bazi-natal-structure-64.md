# #64 八字原局結構事實層：限定切片

這一片只新增內部、純確定性的結構事實建構器，不接入 Report、MCP、web，也不加入公開 barrel `packages/core/src/index.ts`。不能以本頁宣稱 #64 全部完成。

## 交付內容

- `packages/core/src/rules/bazi/structure.ts`：`buildBaziNatalStructure(pillars)` 回傳深度凍結的 `BaziNatalStructure`（避開 web UI 既有型別名 `BaziStructure`）。`schema` 為暫定識別 `bazi.natalStructure.provisional.v0`，待 #27 定案後遷移。
  - 月令（月支）：月支與其藏干，角色為本氣（main）／中氣（middle）／餘氣（residual）。
  - 透干（revealed）：四柱天干等於任一地支藏干者，記錄天干柱位、地支柱位與藏干角色；同一天干可透自多支。
  - 通根（roots）：四柱天干 × 四地支，地支藏干含同五行者，只記錄藏干、角色與柱位。
  - 鄰接（adjacency）：六組柱位對，年月、月日、日時為相鄰，其餘為不相鄰。
  - 干支關係（relations）：既有 `relations.ts` find* 命中原樣複製，加 `domain` 與 `transformation: 'not_evaluated'`。
- `packages/core/src/calculators/bazi/natalBasis.ts`：provider 回傳的 basis 多一個不可列舉、延遲、成功才快取的 `structure` getter，只取主四柱。`BaziNatalBasis` 型別與 ChartSnapshot 形狀不變；`Object.keys(basis)` 與 `JSON.stringify(basis)` 不變。

推導只使用既有 `tenGods.ts`（`HIDDEN_STEMS`／`hiddenStemsOf`）與 `relations.ts`，沒有新的藏干表或五行表。

## 明確不交付

- 不分根之強弱、無權重、不判身強弱或旺衰。
- 不判定合化：`element` 仍只是關係表的合化／局五行標示，`transformation` 恆為 `not_evaluated`，不得讀成「已化」。
- 不判格局成立或破格（#32）。
- 未接入任何輸出；Report／export golden 應維持逐位元組相同。
- 外部來源引用尚未補齊（驗收第 4 項仍 open）。

## 驗證

`packages/core/tests/baziNatalStructure.test.ts`：

- 對照 fixture：甲子 乙卯 丙午 丁酉 與 乙卯 甲子 丁酉 丙午，測試內先驗五行計數相同，再驗月令、透干、通根不同。
- 合而不化防護：甲子 己丑 丙午 辛卯 含甲己、丙辛合及子丑合，所有命中 `transformation === 'not_evaluated'`，無其他化合狀態欄位。
- 多源透干與中氣／餘氣角色、通根欄位無強弱欄位、鄰接表。
- 藏干與 lunar-javascript `LunarUtil.ZHI_HIDE_GAN` 一致（只是同一來源 parity，不是獨立外部驗證）。
- 確定性、凍結、非法干支拒絕；natalBasis getter 延遲、快取、失敗不快取、不可列舉、未進公開 barrel。

期望的透干／通根值依教科書藏干常識手寫，刻意避開各書中氣／餘氣排序不一的寅巳申；藏干排序依本 repo `HIDDEN_STEMS` 慣例（巳丙庚戊、申庚壬戊）。外部來源引用仍待補。

重現：

```sh
npx vitest run packages/core/tests/baziNatalStructure.test.ts
npm run typecheck
```
