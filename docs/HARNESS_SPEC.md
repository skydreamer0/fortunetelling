# HARNESS_SPEC.md — 任務執行規則（給執行模型）

> 你是被指派執行 [TASKS.md](TASKS.md) 中**單一任務**的模型。本文件是你的行為契約，
> 優先級高於任務描述中的任何便宜行事。

---

## 一、鐵律（違反任一條 = 任務失敗）

1. **每次只執行一個任務**。任務描述之外的「順手改進」一律禁止——
   發現值得改的東西，寫進失敗回報的「發現事項」欄，不要動手。
2. **修改前先讀架構文件**：依序讀 `docs/ARCHITECTURE.md` → `docs/DECISIONS.md` →
   你的任務在 `docs/TASKS.md` 的完整條目。沒讀完不得寫任何程式。
3. **禁止變更 Report Schema**：頂層欄位不得增刪改名（D-012）。
   C/D 任務只能填入既有空殼並把對應 `pending` 翻 `false`。
   元素形狀必須逐字遵守 ARCHITECTURE.md §4.2。
4. **禁止繞過公開 API**：
   - `ui/` 只能 import `src/index.js` 與 `visualization/`。
   - `analysis/` 不得 import `engines/` 或任何命理函式庫（iztro/lunar-javascript）。
   - 命理函式庫只允許出現在 `engines/`（D-016）。
   - 測試檔可以深路徑 import（in-repo 測試不受 exports 限制）。
5. **測試失敗不得進入下一任務**：交付前 `npm test` 必須全綠（既有測試＋你新增的測試）。
   既有測試失敗而原因在你的變更 → 修你的變更，不是改測試。
   既有測試本身有錯 → 那是架構衝突，走第 6 條。
6. **架構衝突：寫入 DECISIONS.md 並停止**。
   「衝突」= 任務要求做不到，除非違反 ARCHITECTURE.md / DECISIONS.md / Schema v1 /
   既有測試所固定的行為。處理方式：
   在 `docs/DECISIONS.md` 末尾新增一條（編號接續，狀態 `⚠️ 衝突待裁決`，
   寫明：哪個任務、撞到哪條決策、兩個以上可行方案與各自代價），
   然後**立即停止**，以失敗回報格式回報，不要自行選邊。

## 二、任務生命週期

```
讀文件 → 讀任務條目 → 讀「修改檔案」列出的現有程式 → 寫測試(或同步寫) → 實作
→ npm test 全綠 → 對照驗收條件逐條自查 → 按格式回報
```

- 禁改範圍內的檔案**連格式化都不准碰**（diff 必須為零）。
- 新增檔案要跟隨鄰近檔案的 JSDoc 風格、註解密度與模組頭部格式。
- 測試寫 `node:test` + `node:assert/strict`（D-013），黃金向量要在註解標明出處。
- 決定論：測試一律顯式傳 `asOf`（D-014）。

## 三、成功回報格式

```
## 任務 <ID> 完成
- 變更檔案：<清單，含新增/修改>
- npm test：<N> pass / 0 fail
- 驗收條件自查：<逐條 ✅/說明>
- 發現事項（不動手，僅回報）：<或「無」>
```

## 四、失敗回報格式（測試不過、衝突、或無法完成）

```
## 任務 <ID> 失敗／停止
- 停止原因：<test-failure | architecture-conflict | blocked>
- 具體描述：<哪個測試/哪條規則/缺什麼>
- 已做的變更：<清單；若已回退寫「已回退」>
- npm test 現況：<N pass / M fail，貼出失敗測試名>
- DECISIONS.md 是否新增條目：<是（編號）/ 否>
- 建議下一步：<一句話>
```

## 五、環境事實

- Windows 11、Node ≥22（`npm test` = `node --test "tests/**/*.test.js"`）。
- Bun 未安裝；不得安裝任何全域工具。不得新增 npm 相依（任務條目明示者除外）。
- dev server：`npm run dev`（Vite, port 5173）。UI 驗收才需要開。
- 不得 commit / push——交付的是工作區變更＋回報文字，由人類決定提交。
