# 實作 B3 任務：BaZi 十神顯隱（L3 `tenGodsContext`）技術計畫

## 目標與背景
將八字引擎（`BaZiEngine`）的十神統計，轉換為 L3 關係角色群（官殺、財星、食傷、印星、比劫），用以判斷個人在不同生活面向（如：規範與權威、資源與交換等）的特質表現。此版本導入了「顯、隱、無」三態判定，精確排除了日主，並依據最新修訂的 `TASKS.md` 與 `DECISIONS.md (D-018)` 進行規劃。

## 架構決策與合約更新
1. **DECISIONS.md (D-018)**：已新增決策，確立 tenGodsContext 的 presence 採「顯／隱／無」三態。
2. **TASKS.md**：更新 B3 驗收條件，包含衍生欄位與 `total` 計算規則。
3. **VERSION Semver**：新增 `tenGodsContext` 為公開引擎輸出，公開行為改變之版本號（VERSION）更新留待後續專案統一發版時處理。

## 實作細節 (Proposed Changes)

### 引擎核心 (src/engines/BaZiEngine.js)
1. **定義群組與型別**：
   ```javascript
   /**
    * @typedef {'顯'|'隱'|'無'} TenGodPresence
    */
   const TEN_GOD_GROUPS = [
     { group: '官殺', context: '規範與權威', tenGods: ['正官', '七殺'] },
     { group: '財星', context: '資源與交換', tenGods: ['正財', '偏財'] },
     { group: '食傷', context: '表達與產出', tenGods: ['食神', '傷官'] },
     { group: '印星', context: '學習與支持', tenGods: ['正印', '偏印'] },
     { group: '比劫', context: '同儕與競合', tenGods: ['比肩', '劫財'] }
   ];
   ```
2. **精確排除日主計算**：
   - 原始 `tenGods` (L0) 統計保持不變。
   - B3 透過精確位置取得排除日主的 `visibleStems`：
     ```javascript
     const contextVisibleStems = [
       eightChar.getYearGan(),
       eightChar.getMonthGan(),
       eightChar.getTimeGan(),
     ];
     ```
3. **計算聚合資訊**：
   - 遍歷 `TEN_GOD_GROUPS`，對每群組計算 `breakdown` (以 `tenGods` 為 keys)，以及 `observedTenGods` (僅包含次數 > 0 的十神)。
   - 計算 `visibleCount`（自 `contextVisibleStems`）與 `hiddenCount`（自 `hiddenStems`），並得 `count = visibleCount + hiddenCount`。
   - 計算 `total`（所有群組 count 總和）。
   - 計算 `share = total > 0 ? count / total : 0`。
   - 判定 `presence` 三態：`visibleCount > 0 ? '顯' : (hiddenCount > 0 ? '隱' : '無')`。
4. **輸出元件 `tenGodsContext`**：
   - `id`: `'tenGodsContext'`, `category`: `'tenGodsContext'`, `name`: `'十神關係角色'`
   - `value` 包含：`groups`, `total`, `includesHiddenStems: true`, `includesDayMaster: false`, `metric: 'occurrence-share'`, `presenceConvention: 'visible-hidden-absent'`。

### 測試 (tests/bazi.test.js)
加入以下精確測試斷言：
1. **固定黃金案例數值 (1986-05-29 08:00)**：
   - 排除日主後 total 預期為 13。
   - 官殺 (count: 3, presence: 隱)、財星 (count: 4, presence: 顯)、食傷 (count: 2, presence: 隱)、印星 (count: 2, presence: 隱)、比劫 (count: 2, presence: 顯)。
2. **三態與「無」案例鎖定**：
   使用 `node -e` 或專案外的暫存檔尋找特定命盤（某一十神群的兩個十神皆未出現），並在測試中**寫死**該出生資料，確保特定群組的預期狀態必定為「無」，達成 100% 邏輯覆蓋。
3. **Share 契約與一致性驗證**：
   ```javascript
   assert.ok(group.share >= 0 && group.share <= 1);
   assert.equal(group.share, group.count / context.value.total);
   const shareTotal = groups.reduce((sum, group) => sum + group.share, 0);
   assert.ok(Math.abs(shareTotal - 1) < 1e-12);
   assert.equal(context.value.total, tenGods.value.total - 1);
   ```
4. **衍生欄位與完整元件契約驗證**：
   - 驗證 `observedTenGods` 與 `breakdown` 一致且維持宣告順序。
   - 驗證各群組屬性與中繼資料 (includesDayMaster 等)。
5. **語氣與決定論斷言**：
   - 確保名稱無「你是」：`assert.doesNotMatch(component.name, /你是/);`
   - 分析測試固定時間：`analyze(input, { asOf: '2026-07-11' });`
   - 確保進入 `layers.byLayer.L3` 且未被視為 `unclassified`。

## 驗收指令
```bash
npm test
git diff --check
git diff --name-only
```
