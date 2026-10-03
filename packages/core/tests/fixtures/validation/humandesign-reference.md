# 人類圖對照資料（M5-01 資料蒐集段）

> 本文件說明 `humandesign-reference.json` 的蒐集方法、來源、不一致處與限制。
> 蒐集日期：2026-10-03。只抄來源上的事實，**沒有改任何程式**，也沒有自己算數值。

## 一、用途與範圍

ROADMAPS.md M5-01 與 D-039 要求人類圖計算器（`packages/core/src/calculators/humanDesign/**`）與至少兩個公開計算器交叉驗證、至少 20 個案例，之後才能脫離 `experimental`。本檔是「對照資料」，由另一段工作拿去驗證我們的程式。

我們的計算器輸出的欄位（本檔都有對應）：類型、內在權威、人生角色（profile）、定義方式、已定義中心、閘門與通道、個性（黑）與設計（紅）13 個行星各自的「閘門.線」、輪迴交叉的四個閘門。

## 二、案例（共 38 個）

出生資料全部來自 Astro-Databank（以下稱 ADB），**Rodden 評級皆為 AA**（有出生證明或同等級原始紀錄）。皆為公眾人物（演員、運動員、政治人物、音樂人等）；沒有任何私人資料。每筆的 ADB 連結與評級在 JSON 的 `astroDatabank` 欄位。

涵蓋範圍（依 JSON 內容統計）：

- 類型（以兩個可取得完整輸出的來源一致為準）：生產者 10、顯示生產者 11、投射者 10、顯示者 3、反映者 4，五種各至少 2 個。
- 時區：美國東／中／西／夏威夷、阿根廷、巴西、英國、歐洲大陸、挪威、塞爾維亞、澳洲東岸、印度、菲律賓。
- 夏令時間（含戰時）生效：13 個（見表中「夏令」「戰時」）。
- 南半球：6 個（Maradona、Messi、Senna、Pelé、Eva Perón、Mick Fanning）。
- 年代：1879（愛因斯坦）到 2001（Billie Eilish）。
- 接近線（line）邊界：多個案例的個性太陽、設計太陽或月亮距線界小於 0.05 度（例如 Steve Jobs 個性太陽約 0.002 度）。**這個距離是用我方計算器算的，只是選案依據，不是來源數值**，在 JSON 的 `selection.nearLineBoundary` 內並附說明。
- 反映者難找（約 1%）：這 4 個是先用我方計算器在 ADB AA 資料中掃出來的，再去問三個來源；三個來源對這 4 個也都判成反映者。

| id | 姓名 | 出生（當地） | 地點 | 時區(ADB 位移小時) | Daily HD 類型／角色 | THDS 類型／角色 | HDChart.org 類型／角色 | 選案特徵 |
|---|---|---|---|---|---|---|---|---|
| jobs | Steve Jobs | 1955-02-24 19:15 | San Francisco, California | America/Los_Angeles (-8) | 生產者 6/3 | 生產者 6/3 | 投射者 1/3 | 近線界 |
| obama | Barack Obama | 1961-08-04 19:24 | Honolulu, Hawaii | Pacific/Honolulu (-10) | 投射者 6/2 | 投射者 6/2 | 投射者 5/1 | 近線界 |
| monroe | Marilyn Monroe | 1926-06-01 09:30 | Los Angeles, California | America/Los_Angeles (-8) | 投射者 6/2 | 投射者 6/2 | — — | 1941前、近線界 |
| presley | Elvis Presley | 1935-01-08 04:35 | Tupelo, Mississippi | America/Chicago (-6) | 生產者 3/5 | 生產者 3/5 | — — | 1941前、近線界 |
| madonna | Madonna | 1958-08-16 07:05 | Bay City, Michigan | America/Detroit (-5) | 生產者 5/1 | 生產者 5/1 | 顯示者 5/1 |  |
| ali | Muhammad Ali | 1942-01-17 18:35 | Louisville, Kentucky | America/Kentucky/Louisville (-6) | 顯示生產者 1/4 | 顯示生產者 1/4 | 顯示生產者 1/3 | 近線界 |
| maradona | Diego Maradona | 1960-10-30 07:05 | Lanús (Buenos Aires), Argentina | America/Argentina/Buenos_Aires (-3) | 投射者 6/2 | 投射者 6/2 | 顯示者 6/2 | 南半球、夏令、近線界 |
| brucelee | Bruce Lee | 1940-11-27 07:12 | San Francisco, California | America/Los_Angeles (-8) | 顯示生產者 6/2 | 顯示生產者 6/2 | — — | 1941前、近線界 |
| hendrix | Jimi Hendrix | 1942-11-27 10:15 | Seattle, Washington | America/Los_Angeles (-7) | 顯示生產者 6/2 | 顯示生產者 6/2 | 顯示生產者 6/2 | 戰時、近線界 |
| houston | Whitney Houston | 1963-08-09 20:55 | Newark, New Jersey | America/New_York (-4) | 顯示生產者 4/6 | 顯示生產者 4/6 | 顯示生產者 4/6 | 夏令 |
| streisand | Barbra Streisand | 1942-04-24 05:08 | Brooklyn (Kings County), New York | America/New_York (-4) | 投射者 2/4 | 投射者 2/4 | 投射者 2/4 | 戰時 |
| dicaprio | Leonardo DiCaprio | 1974-11-11 02:47 | Los Angeles, California | America/Los_Angeles (-8) | 投射者 6/2 | 投射者 6/2 | 顯示者 6/2 |  |
| depp | Johnny Depp | 1963-06-09 08:44 | Owensboro, Kentucky | America/Chicago (-5) | 顯示者 2/4 | 顯示者 2/4 | 顯示者 1/3 | 夏令、近線界 |
| hepburn | Audrey Hepburn | 1929-05-04 03:00 | Ixelles, Belgium | Europe/Brussels (+1) | 生產者 6/2 | 生產者 6/2 | — — | 夏令、1941前、近線界 |
| macron | Emmanuel Macron | 1977-12-21 10:40 | Amiens, France | Europe/Paris (+1) | 生產者 2/4 | 生產者 2/4 | 生產者 2/4 |  |
| spielberg | Steven Spielberg | 1946-12-18 18:16 | Cincinnati, Ohio | America/New_York (-5) | 投射者 5/1 | 投射者 5/1 | 顯示者 4/6 |  |
| hemingway | Ernest Hemingway | 1899-07-21 08:00 | Oak Park, Illinois | America/Chicago (-6) | 顯示生產者 3/5 | 顯示生產者 3/5 | — — | 1941前 |
| dali | Salvador Dalí | 1904-05-11 08:45 | Figueras, Spain | Europe/Madrid (+0) | 投射者 2/4 | 投射者 2/4 | — — | 1941前 |
| nadal | Rafael Nadal | 1986-06-03 18:20 | Manacor, Spain | Europe/Madrid (+2) | 顯示者 2/4 | 顯示者 2/4 | 顯示者 2/4 | 夏令 |
| messi | Lionel Messi | 1987-06-24 20:30 | Rosario (Santa Fé), Argentina | America/Argentina/Cordoba (-3) | 顯示生產者 5/2 | 顯示生產者 5/2 | 顯示生產者 5/2 | 南半球、近線界 |
| senna | Ayrton Senna | 1960-03-21 02:35 | São Paulo, Brazil | America/Sao_Paulo (-3) | 生產者 1/5 | 生產者 3/5 | 生產者 3/5 | 南半球、近線界 |
| pele | Pelé | 1940-10-21 03:00 | Três Corações (Minas Gerais), Brazil | America/Sao_Paulo (-3) | 顯示生產者 2/4 | 顯示生產者 2/4 | — — | 南半球、1941前 |
| eilish | Billie Eilish | 2001-12-18 12:17 | Los Angeles, California | America/Los_Angeles (-8) | 生產者 5/1 | 生產者 5/1 | 生產者 5/1 | 1990後 |
| watson | Emma Watson | 1990-04-15 18:00 | Paris, France | Europe/Paris (+2) | 投射者 5/2 | 投射者 5/2 | 投射者 5/2 | 夏令、1990後、近線界 |
| djokovic | Novak Djokovic | 1987-05-22 23:25 | Belgrade, Serbia | Europe/Belgrade (+2) | 顯示生產者 2/4 | 顯示生產者 2/4 | 顯示生產者 2/4 | 夏令 |
| aniston | Jennifer Aniston | 1969-02-11 22:22 | Los Angeles, California | America/Los_Angeles (-8) | 顯示者 5/1 | 顯示者 5/1 | 顯示者 5/1 |  |
| stewart | Kristen Stewart | 1990-04-09 09:21 | Los Angeles, California | America/Los_Angeles (-7) | 投射者 5/1 | 投射者 5/1 | 投射者 5/1 | 夏令、1990後 |
| jolie | Angelina Jolie | 1975-06-04 09:09 | Los Angeles Cedars of Lebanon, California | America/Los_Angeles (-7) | 顯示生產者 3/5 | 顯示生產者 3/5 | 顯示生產者 2/5 | 夏令 |
| chalamet | Timothée Chalamet | 1995-12-27 21:16 | Manhattan, New York | America/New_York (-5) | 生產者 3/5 | 生產者 3/5 | 生產者 3/5 | 1990後、近線界 |
| einstein | Albert Einstein | 1879-03-14 11:30 | Ulm, Germany | Europe/Berlin (+0.6667) | 生產者 1/4 | 生產者 1/4 | — — | 當地平均時、1941前 |
| peron | Eva Perón | 1919-05-07 05:00 | Buenos Aires, Argentina | America/Argentina/Buenos_Aires (-4.28) | 顯示生產者 3/5 | 顯示生產者 3/5 | — — | 南半球、當地平均時、1941前、近線界 |
| amundsen | Arne Amundsen | 1952-08-07 13:25 | Oslo, Norway | Europe/Oslo (+1) | 反映者 2/4 | 反映者 2/4 | 反映者 2/4 |  |
| barclay | Sandy Barclay | 1948-06-13 06:30 | Ayr, Scotland | Europe/London (+1) | 反映者 6/2 | 反映者 6/2 | 反映者 6/2 | 夏令 |
| chatham | Rhys Chatham | 1952-09-19 00:48 | Manhattan, New York | America/New_York (-4) | 反映者 4/6 | 反映者 4/6 | 反映者 4/6 | 夏令 |
| aakvik | Liv Aakvik | 1948-06-23 19:15 | Oslo, Norway | Europe/Oslo (+1) | 反映者 5/1 | 反映者 5/1 | 反映者 5/1 |  |
| fanning | Mick Fanning | 1981-06-13 04:21 | Penrith, Australia | Australia/Sydney (+10) | 投射者 5/2 | 投射者 5/2 | 投射者 5/2 | 南半球、亞洲、近線界 |
| rgandhi | Rahul Gandhi | 1970-06-19 14:28 | Neu-Delhi, India | Asia/Kolkata (+5.5) | 生產者 6/6 | 生產者 6/2 | 生產者 6/2 | 亞洲 |
| blanco | Rico Blanco | 1973-03-17 21:30 | Manila, Philippines | Asia/Manila (+8) | 顯示生產者 5/1 | 顯示生產者 5/1 | 顯示生產者 5/1 | 亞洲 |

> Daily HD = dailyhumandesign.com；THDS = thehumandesignsystem.com；HDChart.org = humandesignchart.org。「—」表示該站無法計算。

## 三、來源

三個來源都不需註冊或登入，只填公眾人物資料，沒有建立帳號、沒有下載檔案。

| 代號 | 網址 | 提供的欄位 | 備註 |
|---|---|---|---|
| `dailyhumandesign_com` | https://dailyhumandesign.com/chart | 類型、權威、角色、定義、已定義中心、通道、輪迴交叉閘門、13 行星×兩側「閘門.線」、回傳的 UTC 時間 | 網頁表單會呼叫 `POST /hd/calculate`；我是用該頁相同的端點，輸入與表單相同（城市先經頁面的 `/hd/geocode` 解析）。涵蓋 1856～2001 皆可算 |
| `thehumandesignsystem_com` | https://thehumandesignsystem.com/free-chart | 類型、權威、角色、定義、已定義中心、通道（含由誰啟動）、輪迴交叉閘門、獨立閘門標記、畫面顯示的 UTC 位移與夏令判定 | 在瀏覽器端計算；**沒有行星與爻資訊**；時區用 IANA 名稱，可看見它採用的位移 |
| `humandesignchart_org` | https://humandesignchart.org/chart | 類型、權威、角色、定義、通道、13 行星×兩側「閘門.線」；中心由 SVG 填色判讀 | **1940-11 以前回「Ephemeris data not found」**（9 個案例無資料）；輸出與另兩站差異大（見第五節） |

案例總數 38：有兩個以上來源數值的案例＝38 個（29 個有三個來源、9 個有兩個來源）。

## 四、蒐集方法

1. 在 ADB 案例頁讀出出生日期、時間、地點、經緯度、時區縮寫與 UTC 位移、Rodden 評級（原文放 `astroDatabank.rawLine`）。ADB 的位移已含夏令；`input.dstInEffect` 依 ADB 的「is daylight saving time／war time」標示。
2. 三個來源都以「當地時間＋城市」輸入，不給 UTC。這是為了貼近一般使用者的使用方式，同時也讓「來源如何判定歷史時區」成為可比較項目。`input.timezoneIana` 是蒐集者依地點指定的名稱（ADB 只有縮寫），不是來源回報。
3. 只抄來源畫面或回應上的欄位。HDChart.org 的畫面文字與 SVG 逐欄抄；Daily HD 取其回應欄位；THDS 取畫面文字與標記的 `data-*` 屬性。
4. 中心與通道、類型、權威、定義的字串另外給一份「正規化」欄位（例如 `manifestingGenerator`、`solarPlexus`、`1-8`），原文放 `*Raw`。正規化只是改名，沒有重算。
5. 抄完後有做一次「抄寫自洽檢查」：用我方的 `deriveStructure` 對 Daily HD 與 HDChart.org 抄下的 13+13 個閘門推導通道、中心、類型，比對該來源自己列出的通道與中心。結果：兩站的通道、中心、類型全部與各自的閘門自洽（抄寫沒有錯），僅 HDChart.org 的「定義」欄位有 14 個案例自己與自己不一致（例如通道全都相連卻標成 Split），另有 Jennifer Aniston 的權威標成 Ego Projected 而其通道連到喉嚨（應為 Ego Manifested，以我方推導規則而言）。這個檢查只用於確認抄寫，不寫入 JSON 的來源數值。
6. 找不到的值一律 `null` 並在欄位旁或 `limitations` 說明。

### 查不到、標 null 的項目

- **設計日期時間**：三個來源都沒有顯示，全部 `designDatetime: null`。我方 `designJdUt` 因此沒有對照值。
- **輪迴交叉名稱**：沒有任何來源給名稱；Daily HD 與 THDS 只給閘門（例如 `55/59 | 9/16`），HDChart.org 沒有，為 `null`。
- **THDS 的行星與爻**：沒有，`personality`／`design` 為 `null`；只有 `profile`（兩個太陽的爻）。
- **Daily HD 的通道**：Mick Fanning、Rico Blanco、Rahul Gandhi 三個案例，最終擷取時網站暫時拒絕重複查詢，沒取到通道欄位，標 `null`（類型、已定義中心與行星值仍有）。反映者沒有通道，為空陣列，不是 null。

## 五、不一致處（重點）

細節在每個案例的 `diffNotes`（由程式比對產生，列出哪個欄位、哪個來源是什麼值）。整體觀察：

1. **Daily HD 與 THDS 幾乎完全一致**：38 個案例中，類型、權威、定義、已定義中心、通道、輪迴交叉閘門有 36 個完全相同；只有 Ayrton Senna（角色 1/5 與 3/5）與 Rahul Gandhi（6/6 與 6/2）的角色不同。這兩站都沒給設計日期，無法進一步看原因（可能是接近線界時秒級差異或時區判定）。
2. **HDChart.org 與另兩站差異大，且自身不自洽**：在它能算的 29 個案例中，類型與 Daily HD 不同的有 5 個、權威 7 個、角色 8 個、已定義中心 10 個、定義 14 個。例如 Steve Jobs 它給個性太陽 61.1，其餘兩站為 55.6；兩個太陽差了數十度，不是時區能解釋的。它也多次把單一定義標成 Split。**建議把它當「弱證據」：兩站一致而它不同時，不要視為我方錯誤**。
3. **歷史時區判定各站不同**（是 `diffNotes` 的另一大類）：
   - Albert Einstein（1879 烏爾姆）：ADB 為當地平均時（UTC+0:40）；Daily HD 用 UTC+0:54，THDS 用 UTC+0:53（疑似改用柏林的當地平均時）。
   - Eva Perón（1919 布宜諾斯艾利斯）：ADB 為 UTC−4:16:48，Daily HD 為 −4:16，THDS 為 −4:17，位移差不到 1 分鐘。
   - Liv Aakvik（1948-06-23 奧斯陸）：ADB 與 Daily HD 為 UTC+1（無夏令），**THDS 為 UTC+2（夏令生效）**，差 1 小時，但這案例 THDS 的輸出仍與 Daily HD 一致（反映者）。
   - Diego Maradona（1960-10-30 拉努斯）：ADB 標「-03、夏令時間」，THDS 讀數寫「UTC-03:00，no daylight saving」；位移相同，只有夏令標示不同。
4. **部分地點在來源的城市庫查無**：THDS 找不到 Lanús、Brooklyn、Ixelles、Figueres、Manacor、Três Corações、Penrith，改用同時區的鄰近城市（見 JSON `query.search`）；僅影響時區判定。
5. **AA 資料不等於所有來源都採同一個歷史時區**：本批案例中，戰時（PWT／EWT）、當地平均時（1879、1919）與 1940 年代南美洲時區是最容易分歧的，建議驗證段落先看 `diffNotes` 裡有「UTC 位移不一致」或「夏令時間標示不同」的案例，再判斷是我方錯還是來源錯。

## 六、限制與資料可信度疑慮

- **只有兩站（Daily HD、THDS）實質可當對照**，而它們在非時區因素上高度一致；三站都未公開演算法與天文曆細節，無法確認彼此是否真正獨立，一致不等於一定正確。
- HDChart.org 可信度低（見第五節）；9 個 1941 年前的案例它無資料，所以「兩個以上來源」在這些案例其實是 Daily HD＋THDS 兩站，而 THDS 沒有行星／爻，行星層級的逐項對照在這些案例只有 Daily HD 一個來源。
- **行星／爻層級只有 Daily HD（38 案）與 HDChart.org（29 案）**；THDS 只能驗證類型、權威、角色、定義、中心、通道與輪迴交叉閘門。
- 三站都沒有顯示設計日期時間，我方 `designJdUt` 只能間接以設計側閘門／爻對照。
- 節點採真交點還是平均交點：三站都沒說明。驗證時若只有南北交點的爻對不上，請先考慮這個因素。
- 案例選擇上，反映者是用我方計算器預先掃描選出的，其餘為手選；選案過程有偏誤，不適合拿來估算「各類型出現比例」。
- 部分人物較不知名（例如挪威的演員、足球員、蘇格蘭騎師）；全部為 ADB 列為公眾人物之條目。已排除過於私人的條目（例如一位已逝的青少年病患）。
- 蒐集過程：ADB 資料用瀏覽器內建分頁讀取；三個計算器用瀏覽器頁面操作或呼叫頁面自身端點取得，沒有登入、沒有下載、沒有送出任何真實個人資料。Daily HD 的表單要求填姓名，一律填占位文字，未使用任何人的真實姓名。
- 瀏覽器分頁資料在擷取後即丟棄；JSON 內的數值是擷取當下的畫面或回應，網站日後更新演算法或資料庫，結果可能改變，所以每個來源都標了擷取日期。
