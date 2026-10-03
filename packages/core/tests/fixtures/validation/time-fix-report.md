# 歷史時區／當地時間換算修正報告（time/**）

- 日期：2026-10-03
- 範圍：`packages/core/src/time/**`（時間標準化層，所有命理系統的輸入時刻都從這裡來）
- 新增測試：`tests/timeHistorical.test.ts`（38 項）、`tests/timeTzdb.test.ts`（14 項）
- 測試資料：`tests/timeFix.modernGolden.json`（現代案例，以修正前的程式產生）、`tests/timeFix.offsetSamples.json`（400 筆固定抽樣）
- 結果：根目錄 `bun test` 1039 pass／0 fail；core、ai、mcp、web typecheck 與 web build 全綠

## 一、結論

| 問題 | 根因 | 修正後 |
|---|---|---|
| Björk 1965（冰島） | **資料**：IANA tz 自 2022b 起把「1970 年後相同」的時區合併，`Atlantic/Reykjavik` 變成 `Africa/Abidjan` 的連結，1968 年前的 UTC−1 移到 `backzone`；各執行環境的 ICU 都不含 backzone | UTC−1，與 ADB 相同，標 `historical_zone_uncertain`（backzone） |
| Oslo 1948 | **資料**：同上，`Europe/Oslo` 被連結到 `Europe/Berlin`，套用了柏林 1948 年的夏令 | UTC+1（挪威 1948 無夏令），與 ADB 相同，標 backzone |
| Ulm 1879／Einstein | **tz 的設計**：標準時間實施前只有「時區代表城市」的地方平時（LMT，Local Mean Time），`Europe/Berlin` 1893 年前一律是柏林的 +0:53:28 | 改用出生地經度的地方平時（Ulm +0:40:00），與 ADB 相同，標 `pre_standard_time_lmt` |
| Van Gogh 1853 | **資料**：`Europe/Amsterdam` 被連結到 `Europe/Brussels`，實際用的是**布魯塞爾**的 LMT +0:17:30（原驗證報告寫成阿姆斯特丹 +0:19:32，不正確） | 改用荷蘭自己的「阿姆斯特丹平時」+0:19:32（backzone），與 ADB（Zundert 地方平時 +0:18:40）仍差 52 秒，屬慣例差異，已標示 |
| 跨執行環境不一致（新發現） | **我們的程式**：完全依賴執行環境的 `Intl`，而各環境 ICU／tz 版本不同 | 改用內建、固定版本的 tz 資料，Bun 與 Node 結果逐位元相同 |
| 夏令判斷在「標準偏移改變的那一年」誤判（新發現） | **我們的程式**：`standardOffsetMinutes` 用「1/1 與 7/1 偏移取小」推算標準偏移 | 該年 tz 標準偏移有變時改用 tz 資料本身的標準偏移 |

所以答案是「兩者都有」：Björk、Oslo、Van Gogh 是 tz 資料政策加上 ICU 不含 backzone；Einstein 是 tz 本身只有代表城市 LMT；而我們的程式把結果交給執行環境的 `Intl`，讓同一輸入在不同環境得到不同答案（違反 D-014）。原本懷疑的「以某日 12:00 推 offset」**不是** UT 錯誤的原因——`resolveWallTime` 的牆鐘→UTC 演算法在資料正確時是對的；12:00 推算只影響 `dst` 旗標（見第二節 2.4）。

## 二、證據（最小重現）

### 2.1 不是 Bun 獨有：Node 也一樣錯

同一段程式（`Intl.DateTimeFormat` 取偏移）：

| 時區、UTC 瞬間 | Bun 1.3.14（ICU 73.2） | Node 22.22.3（ICU 78.2，tz 2026a） | 正確（ADB／tz backzone） |
|---|---|---|---|
| `Atlantic/Reykjavik` 1965-11-21 12:00Z | GMT（+0） | +00:00 | −01:00 |
| `Europe/Oslo` 1948-06-01 12:00Z | +02:00 | +02:00 | +01:00 |
| `Europe/Berlin` 1879-03-14 10:00Z | +00:53:28 | +00:53:28 | 依出生地（Ulm +0:40） |
| `Europe/Amsterdam` 1853-03-30 10:00Z | +00:17:30（布魯塞爾） | +00:17:30 | +00:19:32（阿姆斯特丹平時） |

IANA 原始資料 `backward` 檔：`Link Africa/Abidjan Atlantic/Reykjavik`、`Link Europe/Berlin Europe/Oslo`、`Link Europe/Brussels Europe/Amsterdam`；被移出的歷史在 `backzone`（例如 `Zone Atlantic/Reykjavik -1:28 - LMT 1908 / -1:00 Iceland -01/+00 1968 Apr 7 1:00s / 0:00 - GMT`）。

### 2.2 舊程式在 Bun 與 Node 結果不同（D-014 已被打破）

- 以本次寫的 zic 編譯器編譯 tz 2026a 主資料，逐一比對 Node（tz 2026a）的 `Intl`：所有時區、1800–2100 年、每個轉換點前後與每 97 天取樣，共 **871,302 點，0 個不一致**。
- 同樣的比對拿去 Bun：**55 個時區、9,962 點不一致**，不只 1970 年前，也包括 `Asia/Almaty` 2024、`Europe/Chisinau` 2022、`America/Asuncion` 2025、`Asia/Gaza` 2024 起、`America/Toronto` 1947、墨西哥 1922–1931 等（Bun 的 ICU 資料較舊）。
- 舊版 `createTimeContext` 對 6,000 個隨機輸入（1800–2199 年、560 個時區），**Bun 與 Node 有 72 個輸出不同，其中 29 個在 1970 年後**。
- `profile/validate.ts` 用 `Intl` 檢查名稱：Bun 不接受 `CET`、`EST5EDT`、`America/Coyhaique` 等，Node 接受——同一份 profile 在一個環境合法、在另一個環境被拒。
- 瀏覽器（PWA）的 ICU 版本又各自不同（Safari 用系統 tz），問題只會更多。

### 2.3 修正後

- 同樣 6,000 個隨機輸入：**Bun 與 Node 輸出 0 個不同**。
- `timeTzdb.test.ts` 把 `Intl.DateTimeFormat` 換成「一格式化時區就丟錯」的假物件後，600 個跨年份隨機輸入與 17 個現代 golden 仍得到完全相同的結果——證明換算不讀執行環境的時區資料。

### 2.4 夏令判斷的推算缺陷

`standardOffsetMinutes(tz, year)` 取「1/1 12:00 與 7/1 12:00 偏移的較小者」當標準偏移。在標準偏移本身改變的那一年會誤判，例如：

- 冰島 1968-04-07 由 −1 改為 0：舊推算把 1968 年 12 月的 UTC+0 判成「夏令（標準 −1）」。
- 德國 1893-04-01 由地方平時改為 CET：Ulm 1893 年 7 月被判成「夏令（標準 +0:40）」。
- `Europe/Kaliningrad` 1989（3 月由 MSK 改 EET）：8 月的 +3 其實是 EEST 夏令，舊推算判為非夏令。
- `America/Bahia_Banderas` 2010-04 改為中部時間：夏令旗標的「標準偏移」寫成 −7，實為 −6。

只影響 `local.dst` 與 `dst_applied` 旗標，不影響 UT。

## 三、修正方式

### 3.1 內建固定版本的 tz 資料（`src/time/tzdb/`）

| 檔案 | 內容 |
|---|---|
| `compile.ts` | zic（tz 官方編譯器）`outzone()`／`writezone()` 的 TypeScript 重寫：解析 Rule／Zone／Link，編譯成轉換列表（UTC 偏移、標準偏移、是否夏令、是否 LMT）。純函式 |
| `format.ts` | 緊湊的字串編碼、解碼、查詢；最後一段規則（例如 EU 的 3 月／10 月最後一個星期日）以「尾段規則」逐年推算，不必列出到 2200 年的每次轉換 |
| `data.ts` | 產生的資料：tz **2026e**，438 個時區、159 個別名 |
| `index.ts` | 執行期查詢入口（名稱大小寫不敏感，與 `Intl` 相同） |
| `build.ts` | 維護者用的產生腳本，執行期不載入 |

- **來源**：IANA tz 資料庫 2026e（`https://data.iana.org/time-zones/releases/tzdata2026e.tar.gz`），**公有領域（public domain）**。
- **格式**：與官方 Makefile `DATAFORM=rearguard PACKRATDATA=backzone PACKRATLIST=zone.tab` 相同（用官方 `ziguard.awk` 產生）。rearguard 讓夏令 SAVE 一律為正（愛爾蘭、納米比亞不會出現「冬天是夏令」）；backzone 只取 `zone.tab` 列出的時區（每個國家／地區自己的 1970 年前歷史），不取 backzone 中其他更冷門的條目。
- **大小**：`data.ts` 約 192 KB（gzip 約 31 KB）；連同編譯器與查詢程式約 223 KB 原始碼。網站 `core` chunk 由此增加約 190 KB（未壓縮）。**沒有新增任何 npm 依賴**。
- **自我驗證**：`build.ts` 產生後，每個時區在 1800–2200 年的每個轉換前後與每 90 天，解碼結果都必須與完整編譯結果一致，否則中止。編譯器本身以 tz 2026a 主資料對 Node `Intl` 比對 871,302 點全一致（見 2.2）。
- **更新方式**：下載新版 tzdata 解壓 → `bun packages/core/src/time/tzdb/build.ts <目錄>`（需要 `awk`，Git Bash、macOS、Linux 皆有）→ 跑 `timeTzdb`／`timeHistorical` 測試。`timeFix.offsetSamples.json` 的 400 筆固定抽樣若有變化，須逐筆對照 tz `NEWS` 確認是官方資料修正後再更新。

### 3.2 換算（`zone.ts`、`createTimeContext.ts`）

1. 所有偏移改由內建資料查詢；只有名稱不在內建資料時才退回 `Intl`，並標示（`zone_not_bundled`）。
2. **地方平時改用出生地**：tz 標為 `LMT` 的期間（＝當地尚未實施標準時間），偏移改為「出生地經度 × 4 分鐘」（取整秒）。只在 tz 自己標 LMT 時替換；tz 有記載的法定或通行平時（例如布拉格平時、Madras Time、阿姆斯特丹平時、Córdoba Mean Time）照 tz，不替換——這就是「預設以出生地的法定時間為準」。
3. **`historical_zone_uncertain` 旗標**（新增，放在 flags 最後；時間未知時以當地 12:00 判斷）。`data.reasons`：
   - `pre_standard_time_lmt`：已改用出生地地方平時（並列出 tz 原本給的代表城市偏移）；
   - `backzone`：該時刻的資料來自 backzone（tz 官方稱之為「範圍外、常有錯誤」）；
   - `longitude_offset_mismatch`：1970 年前，時區標準偏移與出生地平太陽時相差超過 90 分鐘（例如喀什出生卻選 `Asia/Shanghai`），該 IANA 時區可能不代表出生地當時的法定時間；
   - `zone_not_bundled`：退回執行環境 `Intl`，不保證跨環境一致。
   旗標附 `requiresConfirmation: true`、tz 版本、採用偏移、tz 原偏移、出生地平太陽時偏移。**1970 年後不會出現**（`zone_not_bundled` 除外）。
4. 夏令判斷：維持舊語意（1/1、7/1 取小），但該年 tz 標準偏移有變時改用 tz 資料的標準偏移。
5. 牆鐘→UTC 換算時偏移以整秒取整，避免地方平時（循環小數分鐘）的浮點誤差。

## 四、取捨

| 選擇 | 理由 | 代價 |
|---|---|---|
| 內建資料而不是依賴 `Intl` | D-014：同一輸入必須在 Bun、Node、瀏覽器得到相同結果；舊做法已被證實不一致 | 約 31 KB（gzip）；tz 更新需手動重建 |
| 自寫 zic 編譯器而不是加 npm 套件（如 moment-timezone、@js-joda/timezone） | 不新增依賴；可控制 backzone 與 LMT 旗標；以 87 萬點對 Node 驗證 | 多約 30 KB 原始碼要維護 |
| 採用 backzone | 主資料把冰島、挪威、荷蘭、瑞典、丹麥等的 1970 年前歷史換成別國，是確定錯誤；backzone 至少是該國自己的記錄 | tz 官方標示 backzone「常有錯誤」→ 一律標 `backzone` 不確定，不默默採信 |
| `PACKRATLIST=zone.tab`（不是整份 backzone） | 只恢復國家／地區代表時區；整份 backzone 會讓 `Asia/Kashgar`、`Europe/Tiraspol` 等冷門名稱改變現代結果 | 冷門舊名仍跟主資料 |
| 只在 tz「LMT」期間改用出生地平時 | tz 的 LMT 就是「沒有標準時間」的明確標記；城市平時（AMT、PMT…）在 tz 有法令或通行依據 | Van Gogh（1853 Zundert）仍與 ADB 差 52 秒；1909 年前荷蘭鄉間究竟用阿姆斯特丹平時還是當地平時，史料不足，以旗標交給使用者確認 |
| 經度矛盾門檻 90 分鐘、只看 1970 年前 | 西班牙、法國西部等「合法但偏離經度」的時區偏差多在 60–80 分鐘，不該被當成不確定；1970 年後由 tz 主資料保證 | 1970 年前、偏差 60–90 分鐘的錯選時區不會被標示 |
| D-026「時區交給 tzdata、禁止手寫 DST 表」 | 資料由官方 tz 原始檔機械編譯，沒有任何手寫偏移或規則；只是由「執行環境內建的 tzdata」改為「固定版本的 tzdata」 | ROADMAPS V1-02／DECISIONS D-026 的文字（「IANA tzdata／Intl」）需要更新（本任務不可修改，請負責人處理） |

## 五、影響範圍（哪些輸出會變）

### 5.1 現代資料（1970 年後）

- **1995-07-16 22:00 台南不變**：`timeFix.modernGolden.json` 的 17 個現代案例（台南 1995、台北 1975 夏令、1979 缺口與重疊、紐約 2000 缺口與重疊、倫敦、雪梨、加爾各答、香港、上海 1988、東京、柏林 2024 缺口、聖保羅、加德滿都、時間未知兩例）是用**修正前的程式**產生，修正後逐欄位完全相同，且沒有新旗標。
- 既有 golden（`reportGolden.json`、`export.golden.json`、各計算器測試）全部未改、全部通過。
- 6,000 個隨機輸入中，1970–2026 年的 866 個與修正前（Node／tz 2026a）相比只有 2 個不同，都是 2.4 的夏令判斷修正（`Bahia_Banderas` 2010、`Kaliningrad` 1989），只改 `dst` 與 `dst_applied` 的標準偏移，UT 不變。
- 與修正前的 **Bun** 相比另有少數不同，都是 Bun 舊 ICU 資料過時（例如哈薩克 2024 年改制），新值與 tz 2026e 一致。
- 2026 年 11 月以後的未來時刻：因 tz 2026b–2026e 的官方更新而與舊結果不同——卑詩省、亞伯達、西北地方、曼尼托巴改採永久時間，摩洛哥 2026-09-20 起改為永久 UTC+0。這些是正確的新資料（出生日期多在過去，影響主要是未來日期的測試資料）。另外 tz 2026e 修正了愛爾蘭 1925、哥倫比亞 1992、伊朗 1979 的轉換時刻，以及 `EST5EDT` 等舊名 1966 年以前的資料。

### 5.2 1970 年前

隨機抽樣（6,000 個中 2,543 個在 1970 年前）：

| 年代 | 樣本數 | UT 改變 | 標 `historical_zone_uncertain` |
|---|---|---|---|
| 1800–1899 | 1,528 | 1,377（多為 LMT 改用出生地經度） | 1,503 |
| 1900–1969 | 1,015 | 151 | 900（隨機經緯度與時區無關，`longitude_offset_mismatch` 偏多；真實使用者會少很多） |

### 5.3 已知案例逐一說明

| 案例 | 修正前（Bun） | 修正後 | 為什麼新值才對 | 下游影響 |
|---|---|---|---|---|
| Björk 1965-11-21 08:10 Reykjavík | +00:00，UT 08:10 | **−01:00，UT 09:10** | 冰島 1968-04-07 前為 −1（tz backzone、ADB「-01 h1w」） | 真太陽時 06:56→07:56，**八字／紫微時辰由卯時變辰時**；吠陀月亮 pada、上升星宿與 pada、2026-10-01 大運／小運恢復為 Ketu/Ketu |
| Liv Aakvik 1948-06-23 19:15 Oslo | +02:00，UT 17:15 | **+01:00，UT 18:15** | 挪威 1948 年無夏令（tz backzone、ADB、Daily HD 一致） | 人類圖個性月亮 60.1→**60.2**（與 ADB／D 相同）；真太陽時 17:55→18:55（同為酉時） |
| Einstein 1879-03-14 11:30 Ulm | +00:53:28，UT 10:36:32 | **+00:40，UT 10:50:00** | 德國 1893 年前無標準時間，民用時間是當地平時（ADB 同） | 吠陀上升 pada 恢復；大運起點回到 ADB 位置（差 61 日→0） |
| Van Gogh 1853-03-30 11:00 Zundert | +00:17:30（布魯塞爾），UT 10:42:30 | **+00:19:32（阿姆斯特丹平時），UT 10:40:28** | 用荷蘭自己的記錄，不再借用比利時城市 | 無離散欄位改變；與 ADB 差 −52 秒（原 +70 秒） |

驗證測試的更新（只改這些條目，未放寬任何容差）：

- `jyotish-validation.test.ts` 的 `TIME_LAYER_DIVERGENCES`：`einstein`、`bjork` 改為「已修正」（秒差 0、無受影響欄位，維持 ±1 秒的嚴格檢查）；`van-gogh` 改為「部分修正」（−52 秒、無受影響欄位）。
- `humandesign-validation.test.ts`：`einstein`、`aakvik` 的時區條目註明我方完整流程已修正；「完整流程與 ADB 位移一致」測試由「只允許 Einstein、Aakvik 例外」**收緊**為 38 案全部一致。

### 5.4 packages/mcp（未修改，只回報）

- `get_time_context` 直接回傳 `ctx.flags`，1970 年前的出生資料（以及 LMT 期間）會多出 `historical_zone_uncertain` 旗標（含 `data.reasons`）。
- `envelope.ts` 的 `caveatsFor()` 會自動把它變成 `time:historical_zone_uncertain` caveat，訊息是中文的 `detail`。不需要改程式，但若 MCP 工具說明或文件有列舉時間旗標代碼，建議補上。
- `local`／`utc`／`jd`／`solar` 對受影響的歷史案例會改變（見 5.3），連帶 `get_chart`、`get_timeline` 等所有需要出生時刻的工具。
- `packages/ai` 的 `timeFlags` 也會帶入新旗標的說明；說明含時區名稱與偏移，不含地名標籤（偏移資訊本來就可由既有 `solar.lmtIso` 推得，沒有新增可識別資訊的種類）。

## 六、剩餘限制與建議（需他人處理的部分）

1. **Van Gogh 52 秒**：1909 年前荷蘭非北荷蘭省地區的通行時間史料不足，維持 tz backzone 的阿姆斯特丹平時並標示不確定。若要改成「1909 年前一律用出生地平時」，需要逐國建立「法定標準時間起始日」表，超出 tz 範圍，不建議無依據地做。
2. **backzone 的可信度**：tz 官方明言 backzone 範圍外、常有錯誤；我們一律標示，但 1970 年前的結果仍可能有錯，應以出生證明確認。
3. **`profile/validate.ts` 仍用 `Intl` 檢查時區名稱**（不在本任務可改範圍）：Bun 拒絕 `CET`、`EST5EDT`、`America/Coyhaique`，Node 接受。建議改用 `time/tzdb` 的 `canonicalZoneName()`，讓驗證也與執行環境無關。
4. **計算器未把新旗標轉成各系統 warning**（`calculators/**` 不在本任務範圍）：八字、紫微、吠陀、人類圖的 `warnings` 目前不會出現歷史時區不確定；TimeContext 與 MCP caveat 有。建議在 `birthData.ts`／各計算器的 `flagWarnings` 加入 `historical_zone_uncertain`，並考慮像時辰交界一樣提供「改用 tz 原偏移」的替代盤。
5. LMT→標準時間的換軌時刻若遇到牆鐘缺口（例如 Ulm 的牆鐘在 1893-03-31 23:46:30 直接跳到 04-01 00:06:32），會沿用 `dst_gap` 旗標與「撥快時鐘」的說明文字；嚴格說那是改用標準時間，不是夏令。順延後的時刻已在標準時間內，所以這種情況不會再帶 `historical_zone_uncertain`。
6. **文件**：ROADMAPS V1-02、DECISIONS D-026、ARCHITECTURE-V2 §3 提到「IANA tzdata（Intl）」的地方，應改為「內建固定版本 tz（含 backzone）」，並記錄 tz 版本更新流程（本任務不可修改）。
7. tz 每年更新數次；內建資料不會自動更新，未來的政策變更（例如各地取消夏令）需要手動重建。舊版本報告重現時，結果會隨 tz 版本變動——`historical_zone_uncertain.data.tzdbVersion` 記錄了使用的版本。
8. 只有內建資料沒有的名稱（例如 `US/Pacific-New`、Node 接受的 `PST`）才會退回 `Intl`，並以 `zone_not_bundled` 標示。
