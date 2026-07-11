# B1 BaZiEngine 設計

## 範圍

新增第五個引擎 `BaZiEngine`，只產生 L0 本命資料：四柱、日主、五行出現次數與十神統計。
不處理大運、流年或情境資料。

## 時間慣例

- 所有 B1 輸入一律解讀為 `Asia/Taipei` 民用時間。
- 使用國曆年月日時分直接呼叫 `Solar.fromYmdHms()`；不做 UTC 轉換、時區換算、
  經度校正或真太陽時校正。
- 採 `lunar-javascript@1.7.7` 預設 `EightChar` sect=2 的換日口徑。
- 非台灣時區與真太陽時需求留待 `BirthData.timezone`／出生地模型擴充後處理。

## Component 契約

`natal.value` 輸出 year/month/day/time 四柱及時間慣例 metadata。`dayMaster.value` 輸出
日干、五行、陰陽。

`elements.value` 是五行**出現次數**，不是五行強弱；必含
`counts`、`total`、`includesHiddenStems: true`、`includesDayMaster: true`、
`metric: 'occurrence-count'` 與旺衰／月令／藏干權重未納入的限制說明。

五行與十神都計四個天干與各地支完整藏干。相同藏干出現在不同地支時分別計數；
同一地支內不重複計數。本氣已包含於該地支的藏干，不能再加算一次。日干是四天干之一，
並在十神統計中記為比肩；`tenGods.value.includesDayMaster` 必為 true。

## 黃金案例

國曆 `1986-05-29 08:00`（Asia/Taipei、辰時）得到
`丙寅／癸巳／癸酉／丙辰`，日主為癸水。四個天干加十個藏干，
`elements.total` 與 `tenGods.total` 都必為 14。

## 後續限制

C1 僅能把此資料呈現為五行出現占比，不能以「五行強度」表述或從中推論旺衰。
