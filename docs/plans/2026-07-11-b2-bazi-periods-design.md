# B2 BaZi 大運與流年設計

## 範圍

B2 在既有 `BaZiEngine` 增加 L1 的十步大運與 L2 的流年；不改動 B1 本命 component
的內容，也不修改 `src/core/**`、analysis 或 UI。

## 時間與節氣契約

- `asOf` 僅接受 `YYYY-MM-DD`，解讀為 `Asia/Taipei 00:00:00`；不接受 ISO timestamp。
- 流年使用 `getYearInGanZhiExact()`，以立春精確交節切換（`liChun-exact`）。
- `asOfConvention` 固定輸出 `{ timezone: 'Asia/Taipei', time: '00:00:00',
  yearBoundary: 'liChun-exact', precision: 'date' }`。
- 日柱換日仍使用 `eightChar.setSect(2)`；起運時間換算獨立使用 `getYun(gender, 2)`。
  兩種 sect 不可混為同一規則。

## 大運契約

`getDaYun(11)` 的 index 0 是出生到起運前的非十年區間，必須排除。輸出 index 1 至 10，
每一筆都是十年大運，value 為 `{ index, ganZhi, startYear, endYear, startAge, isCurrent,
ageConvention: 'nominal-year-age' }`。

`startAge` 沿用套件的虛歲計算（`startYear - birthYear + 1`）。`startYear`／`endYear`
只供年度顯示；`isCurrent` 使用實際起運時刻作邊界：第一步從 `yun.getStartSolar()` 開始，
後續每十年同時刻開始，採起點包含、終點不包含。

## 性別契約

僅 `male` 映射為 `1`、`female` 映射為 `0`。缺失或其他值是引擎錯誤，絕不可讓套件的
寬鬆判定把未知性別當作女性。

## 驗證案例

- 1991-10-05 14:00、女、2026-07-11：10 步大運、流年丙午，以及輸出範圍內至多一筆 current。
- 2030-01-01：流年己酉；靜態大運欄位不受 asOf 影響，`isCurrent` 可改變或維持。
- 每步 `endYear - startYear === 9`、年份遞增且不重疊；只有 asOf 落入十步的實際時間範圍時，
  才要求恰好一筆 `isCurrent`。
