# BaZiEngine B1 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 新增以 Asia/Taipei 民用時間解讀的八字 L0 引擎，提供四柱、日主、五行出現次數與十神統計。

**Architecture:** `BaZiEngine` 將 `BirthData` 原樣年月日時分交給 `lunar-javascript@1.7.7`
的 `Solar.fromYmdHms()`；引擎本地常數表負責五行、陰陽和十神分類，讓計數口徑可稽核。
`src/engines/index.js` 是預設引擎註冊點，不需修改 `src/core/**`。

**Tech Stack:** ESM JavaScript、Node.js `node:test`、`node:assert/strict`、`lunar-javascript@1.7.7`。

---

### Task 1: 寫 BaZiEngine 的紅燈契約測試

**Files:**
- Create: `tests/bazi.test.js`
- Modify: `tests/analyze.test.js`

**Step 1: 寫失敗測試**

新增 `BaZiEngine` 的單元測試，建立 `BirthData(1986, 5, 29, 8:00)`，斷言：

```js
assert.deepEqual(natal.value, {
  year: '丙寅', month: '癸巳', day: '癸酉', time: '丙辰',
  convention: {
    calendar: 'gregorian', timezone: 'Asia/Taipei',
    dayBoundary: 'lunar-javascript sect=2', trueSolarTime: false,
    library: 'lunar-javascript@1.7.7',
  },
});
assert.deepEqual(elements.value.counts, { 木: 2, 火: 4, 土: 3, 金: 2, 水: 3 });
assert.equal(elements.value.total, 14);
assert.equal(tenGods.value.total, 14);
```

再測 1991-10-05 14:00 的四 component、零錯誤、`includesDayMaster`，並將
`analyze.test.js` 的固定「四引擎」斷言改為：存在一個成功的 `bazi` 結果，且其
四個 component 都在 L0、沒有未分類 component。

**Step 2: 驗證紅燈**

Run: `node --test tests/bazi.test.js`

Expected: FAIL，因 `BaZiEngine` 尚未匯出／實作。

### Task 2: 實作最小的 BaZiEngine

**Files:**
- Create: `src/engines/BaZiEngine.js`

**Step 1: 建立引擎與時間轉換**

讓 `BaZiEngine extends BaseEngine`，設定 `id = 'bazi'`、`name = '八字'`，在 `_compute`
中呼叫：

```js
const solar = Solar.fromYmdHms(
  birthData.year, birthData.month, birthData.day,
  birthData.hour, birthData.minute, 0,
);
const eightChar = solar.getLunar().getEightChar();
```

不得讀取 `longitude`／`latitude`，也不得做 UTC、時區或真太陽時換算。

**Step 2: 建立 L0 component**

使用 `getYear()`、`getMonth()`、`getDay()`、`getTime()` 與相對 getter 產生
`natal`、`dayMaster`、`elements`、`tenGods`。以本地十天干五行／陰陽對照表和五行生剋關係
分類十神；日干自己計為比肩。對每個地支只遍歷一次 `get*HideGan()` 陣列，保持不同地支的
重複藏干為獨立出現。

**Step 3: 驗證綠燈**

Run: `node --test tests/bazi.test.js`

Expected: PASS，所有 B1 黃金向量、計數與 metadata 斷言通過。

### Task 3: 註冊與公開匯出

**Files:**
- Modify: `src/engines/index.js`
- Modify: `src/index.js`

**Step 1: 讓失敗的整合斷言可執行**

在 engines barrel 匯出 `BaZiEngine`，並在 `createEngines({ asOf })` 加入
`new BaZiEngine({ asOf })`。在 package root barrel re-export `BaZiEngine`。

**Step 2: 驗證整合**

Run: `node --test tests/analyze.test.js tests/bazi.test.js`

Expected: PASS；不以預設引擎總數作為契約。

### Task 4: 全套驗證與提交

**Files:**
- Verify: `src/engines/BaZiEngine.js`
- Verify: `src/engines/index.js`
- Verify: `src/index.js`
- Verify: `tests/bazi.test.js`
- Verify: `tests/analyze.test.js`

**Step 1: 執行全套驗證**

Run: `npm test`

Expected: 0 fail。

**Step 2: 檢查範圍與格式**

Run: `git diff --check; git diff --name-only`

Expected: 僅有 B1 指定的程式與測試檔（另含已核准的 B1 文件／計畫）。

**Step 3: Commit**

```bash
git add src/engines/BaZiEngine.js src/engines/index.js src/index.js tests/bazi.test.js tests/analyze.test.js docs/plans/2026-07-11-b1-bazi-engine-plan.md
git commit -m "feat(bazi): add natal L0 engine"
```
