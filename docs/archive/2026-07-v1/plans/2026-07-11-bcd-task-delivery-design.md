# B/C/D 任務交付安全調整 Implementation Plan

> **For Codex:** This plan changes documentation only; it does not authorize implementation of B/C/D code tasks.

**Goal:** 補足 11 個 B/C/D 任務的安全依賴、整合落地順序與可重現驗收條件。

**Architecture:** 保持 HARNESS_SPEC、ARCHITECTURE 的 Schema v1 與既有任務邊界不變。
以硬性依賴區分功能前置，並以落地順序管理 `BaZiEngine.js`、`analyze.js`、
`ReportView.js` 的編輯衝突。

**Tech Stack:** Markdown、Node.js `node:test` 驗收契約、Vite build。

---

### Task 1: 建立任務關係表

**Files:**
- Modify: `docs/TASKS.md`

1. 對照各任務的修改檔案、ARCHITECTURE §4 與 D-014～D-016。
2. 將功能必要的前置與僅為避免衝突的落地順序分開列出。
3. 驗證每個 B1～D5 任務都恰有一列，且 D5 是最終 UI 整合關卡。

### Task 2: 強化可重現驗收

**Files:**
- Modify: `docs/TASKS.md`

1. 將測試總數改為 `npm test` 0 fail，避免新增測試使文件失效。
2. 加入明確 `asOf`、Report 頂層欄位不變與各自 `pending` 翻轉的契約。
3. 為 C3、D5 加入 `npm run build` 及 UI 邊界驗收。

### Task 3: 驗證文件變更

**Files:**
- Verify: `docs/TASKS.md`
- Verify: `docs/plans/2026-07-11-bcd-task-delivery-design.md`

1. 執行 `git diff --check`，預期無空白錯誤。
2. 檢查 Git diff，確認只變更計畫與任務文件。
3. 提交文件變更，讓後續執行者可追溯已核准的交付規則。

## 目標

在不改變凍結的 Report Schema v1 與 11 個任務邊界下，讓每個任務的前置條件、
落地順序與驗收證據清楚可查，降低平行開發與交接時的整合風險。

## 採用的方式

採用「硬性依賴 + 整合落地順序 + 統一驗收關卡」。硬性依賴是功能正確所需的
前置任務；落地順序則只用來避免同一檔案的合併衝突，不能被誤解為額外功能依賴。

## 交付規則

- 所有案例測試都顯式提供 `asOf`，不得依賴執行當日日期。
- 驗收以全套 `npm test` 的 0 fail 為準，不鎖定測試數量。
- C2、D1、D2、D4 必須驗證 Report 頂層欄位集合不變，只填入既有空殼並翻轉
  自己負責的 `pending`。
- D1 → D2 → D4 → C2 依序落地 `src/core/analyze.js`；C3 → D5 依序落地
  `src/ui/ReportView.js`。
- 最終 UI 關卡除 `npm test` 外，還要通過 `npm run build` 與 375px 手動檢查。

## 安全整合順序

`B1 → B2 → B3`；`B1 → C1`；D1 與 D3 可在 B1 後獨立完成。其後依序為
`D2 → D4 → C2 → C3 → D5`，其中 D4 另需 B2、C1、D1、D3；D5 另需 D2、D4。

## 不變條件

此設計不改變任何任務的目標、禁止修改範圍或 Report Schema，只補足交付與驗收契約。
