# 吠陀占星（Jyotish）計算器驗證報告（M5-01／M5-02）

- 日期：2026-10-03
- 範圍：`packages/core/src/calculators/jyotish/**`（計算器版本 1.0.0）的預設設定：Lahiri 歲差、平均交點（Rahu＝平均升交點、Ketu＝Rahu＋180°）、整宮制、Vimshottari 大運年長 365.25 日，輸出 D1／D9／D10 與大運／小運。
- 測試：`packages/core/tests/jyotish-validation.test.ts`（16 項，全綠）
- 對照演算法：`packages/core/tests/jyotish-validation.reference.ts`（不 import 任何 `src/calculators/**`）
- 資料：`jyotish-cases.json`（案例）、`jyotish-thirdparty.json`（第三方回傳原始值）

## 一、結論摘要

| 項目 | 結果 |
|---|---|
| 案例數 | 30 個 Astro-Databank（ADB）Rodden 評級 AA 公眾人物 |
| 計算層離散欄位一致率 | **100%**（星座、星宿、pada、D9、D10、宮位、逆行、大運主星與順序、當前大運／小運，共 2,190 個比較） |
| 產品端到端（IANA 時區）一致率 | 3 個案例因「時區層」不同而有差異（見第四節），全部不在 jyotish 計算器內 |
| 在 jyotish 計算器中發現的錯誤 | **0 個**，因此未修改 `src/calculators/jyotish/**`，既有輸出與 golden 不變 |
| 第三方抽查 | NASA/JPL Horizons API 7 案例、Astrodienst swetest.cgi 10 案例、ADB 頁面 30 案例 |
| 是否達到 M5-01 字面標準 | **未達到**（見第六節） |

## 二、案例組成

30 案例（原本挑 31 個；Goethe 1749 年超出產品 `BirthProfile` 支援範圍 1800–2200 年而移除）：

- 北半球 23、南半球 7（阿根廷 4、巴西 3；ADB 上澳洲、紐西蘭、南非我們查到的名人沒有 AA 評級，所以南半球只有南美洲）。
- 高緯度：Björk（雷克雅維克 64°09′N）、Greta Garbo（斯德哥爾摩 59°20′N）、Barry Gibb（54°09′N）。
- 1900 年以前 5 個：Van Gogh 1853、Freud 1856、Einstein 1879、Subhas Chandra Bose 1897、Borges 1899（含地方平時 LMT、布拉格平時、Madras Time、Córdoba Mean Time 等歷史時區）。
- 2000 年以後 3 個：Billie Eilish 2001、Prince George 2013、Princess Charlotte 2015。
- 夏令時間 9 個（英國、曼島、法國、比利時、紐約、阿根廷），UTC 偏移共 13 種（−10 到 +5:21:10）。
- 接近邊界（依對照值量測）：Princess Charlotte 月亮距 pada／D9 邊界 6″、Kurt Cobain 月亮距星宿邊界 13″、Senna 土星距 D10 邊界 24″、Cobain 上升距星座邊界 171″、Obama 月亮距星宿邊界 142″；另有 4 個案例有行星接近停滯（Trump 木星速度 −0.0004°/日）。

每個案例都附 ADB 連結、評級、資料來源（BC/BR in hand 或 Quoted BC/BR）、ADB 原文的地點與時區字串。

## 三、方法

### 3.1 計算層（主要驗證）

同一個 UT 瞬間（由 ADB 標示的 UTC 偏移獨立換算，不經 IANA），把我們的計算器輸出與獨立對照演算法比較。

**對照演算法**（`jyotish-validation.reference.ts`）：

1. 星曆：`astronomy-engine` 2.1.19（MIT 授權，純 JS；行星為截斷 VSOP87、月亮為 Brown／Improved Lunar Ephemeris 理論、章動為 IAU 2000B 截斷）。與我們使用的 Swiss Ephemeris（WASM、Moshier 解析星曆）是不同程式碼與不同理論。視位置：`GeoVector(…, aberration=true)` → `Ecliptic()`（真黃道、真春分點）；太陽 `SunPosition()`、月亮 `EclipticGeoMoon()`。
2. 平均交點：Meeus《Astronomical Algorithms》第 2 版式 47.7  
   Ω = 125.0445479° − 1934.1362891 T + 0.0020754 T² + T³/467441 − T⁴/60616000，再加章動 Δψ。
3. 上升點：λ = atan2(cos θ, −(sin θ cos ε + tan φ sin ε))，θ＝地方視恆星時，ε＝真黃赤交角。
4. **Lahiri 歲差**：採印度曆法改革委員會（Calendar Reform Committee, 1955）定義——1956-03-21 00:00 ET 的歲差為 **23°15′00.658″**（含章動的真值）。  
   平均值 A_mean(t) = (23°15′00.658″ − Δψ(t₀)) + [p_A(t) − p_A(t₀)]；  
   p_A 為黃經總歲差，採 IAU 2006（Capitaine et al. 2003；IERS Conventions 2010 式 5.40）：  
   p_A = 5028.796195 T + 1.1054348 T² + 0.00007964 T³ − 0.000023857 T⁴ − 0.0000000383 T⁵（角秒，T 為自 J2000.0 起的 TT 儒略世紀數）；  
   真值 A_true(t) = A_mean(t) + Δψ(t)；恆星黃經＝視回歸黃經 − A_true。  
   參考：Swiss Ephemeris 說明文件 §2.7.2（Lahiri 也以同一 1956 定義值為基準，但用其歲差矩陣投影實作，並把 t₀ 的章動 16.77″ 扣掉；astronomy-engine 算出的 Δψ(t₀) 為 16.81″）。
5. 星宿、pada、Vimshottari：依經典規則重寫——27 宿各 13°20′、pada 3°20′；主星序 Ketu 7／Venus 20／Sun 6／Moon 10／Mars 7／Rahu 18／Jupiter 16／Saturn 19／Mercury 17；出生大運主星＝月亮星宿主星，已走比例＝月亮在該宿已走比例；小運自大運主星起、長度＝大運×年數÷120；年長 365.25 日。
6. D9 依《BPHS》第 6 章原文規則（動宮自本宮、固定宮自第 9 宮、變動宮自第 5 宮），不用「連續數」捷徑（另以測試證明兩者等價）；D10 奇數宮自本宮、偶數宮自第 9 宮。

### 3.2 容差（先量測、再訂）

| 量 | 30 個 AA 案例最大差 | 3000 個隨機時地最大差（1800–2030，\|緯度\|≤66°） | 容差 |
|---|---|---|---|
| Lahiri 歲差 | 0.37″（平均 +0.18″） | — | 1″ |
| 太陽 | 0.94″ | 2.0″ | 3″ |
| 月亮 | 4.7″ | 8.2″ | 12″ |
| 水星 | 5.6″ | 12.3″ | 15″ |
| 金星 | 4.4″ | 19.7″ | 25″ |
| 火星 | 5.0″ | 13.8″ | 18″ |
| 木星 | 6.5″ | 11.1″ | 15″ |
| 土星 | 13.4″ | 13.6″ | 18″ |
| 平均交點（Rahu／Ketu） | 0.16″ | 0.16″ | 0.5″ |
| 上升 | 0.23″ | 1.3″ | 2″ |
| 大運日期 | 0.46 日 | — | 2 日 |

理由：差異主要來自**對照端**——astronomy-engine 對 JPL Horizons 的誤差最大 6.3″，我們這端對 JPL 最大 1.0″（見 3.4）。容差取隨機樣本最大值再加約 25%。大運 2 日＝月亮 12″（星宿的 2.5×10⁻⁴）乘最長 20 年。

**離散欄位規則**：完全一致；只有對照值距離邊界小於該欄位的度數容差時才記為「無法判定」，並必須由第三方資料判定，不得放寬容差消音。逆行旗標只在 |速度| < 1×10⁻⁴°/日（實質停滯）時無法判定。

### 3.3 時區層

產品實際路徑是 `BirthProfile`（IANA 時區）→ `createTimeContext()` → UT。測試比較這個 UT 與 ADB 偏移換算的 UT；差 ≥ 1 秒者必須列在 `TIME_LAYER_DIVERGENCES`（附原因與受影響欄位），否則測試失敗。

### 3.4 第三方抽查（有公開 API、免登入，2026-10-03 取得）

1. **NASA/JPL Horizons API**：`https://ssd.jpl.nasa.gov/api/horizons.api`，`QUANTITIES='31'`（地心 IAU76/80 真黃道視黃經，含光行時、光偏折、光行差），DE441，7 案例 × 7 顆行星。
2. **Astrodienst swetest.cgi**：`https://www.astro.com/cgi/swetest.cgi`，參數 `-sid1`（Lahiri）、`-p0123456m`（含平均交點）、`-house<lng>,<lat>,W`（整宮），Swiss Ephemeris 2.10.03 + 壓縮 DE441。10 案例。**注意：與我們同屬 Swiss Ephemeris 程式家族，只算部分獨立。**
3. **ADB 頁面**：每個案例頁面上 Astrodienst 計算並公開的回歸太陽／月亮／上升（四捨五入到角分），30 案例。
4. 另針對無法判定的邊界欄位，向 JPL Horizons 補查 2 筆（Charlotte 月亮、Senna 土星）。

## 四、結果

### 4.1 計算層（30 案例，同一 UT）

| 欄位 | 一致 |
|---|---|
| 九曜星座 | 270／270 |
| 九曜星宿 | 270／270 |
| 九曜 pada | 270／270 |
| 九曜 D9 | 270／270 |
| 九曜 D10 | 270／270 |
| 九曜整宮宮位 | 270／270 |
| 逆行 | 270／270 |
| 上升星座／星宿／pada／D9／D10 | 各 30／30 |
| 出生大運主星、九個大運順序與起點（±2 日）、81 個小運起點 | 30／30 |
| 2026-10-01 當前大運／小運 | 30／30 |

另以 600 個隨機時地（1800–2030 年）做性質測試：可判定的 29,000 餘個離散欄位全部一致，度數全在容差內。

### 4.2 第三方抽查

| 來源 | 比較 | 結果 |
|---|---|---|
| JPL Horizons | 我們的回歸視黃經 | 最大 0.99″（月亮），其餘 ≤ 0.49″ |
| JPL Horizons | 對照演算法 | 最大 6.3″（木星） |
| swetest | Lahiri 歲差值 | 與我們**完全相同**（< 0.001″） |
| swetest | 七曜恆星黃經 | ≤ 1.18″（月亮；DE441 vs Moshier），其餘 ≤ 0.43″；星座／星宿／pada 全一致 |
| swetest | 平均交點、整宮上升 | ≤ 0.001″ |
| swetest | 對照演算法的 Lahiri | 差 ≤ 0.27″ |
| ADB 頁面 | 回歸太陽／月亮／上升 | 全部 ≤ 0.49′（ADB 四捨五入到角分，誤差上限 0.5′） |

### 4.3 無法判定項目

| 項目 | 狀況 | 判定 |
|---|---|---|
| Princess Charlotte 月亮 pada、D9 | 對照值距邊界 6″，小於月亮容差 12″ | JPL：恆星黃經距邊界 > 1″ 且與我們一致；swetest 也一致（距邊界 5.4″）→ **我們正確** |
| Senna 土星 D10 | 距邊界 24″（容差 18″ 之外，已可判定） | 仍保留 JPL 判定作額外檢查，一致 |

目前沒有任何「無法判定且未被第三方判定」的欄位。

### 4.4 時區層與端到端差異（不在 jyotish 計算器內）

| 案例 | 產品 UT − ADB UT | 原因 | 端到端受影響欄位 | 分類 |
|---|---|---|---|---|
| Van Gogh 1853 | +70 秒 | tzdata `Europe/Amsterdam` 用阿姆斯特丹 LMT（+0:19:32），ADB 用出生地 Zundert 的 LMT（+0:18:40） | 無（大運起點差 5 日） | 慣例差異 |
| Einstein 1879 | −808 秒 | tzdata `Europe/Berlin` 用柏林 LMT（+0:53:28），ADB 用 Ulm LMT（+0:40:00） | 上升 pada（上升移 2.8°），大運起點差 61 日 | 慣例差異（產品在標準時制定前以時區代表城市的 LMT 計算，而非出生地 LMT） |
| Björk 1965 | −3600 秒 | 冰島 1968 年以前為 UTC−1；Bun 執行環境的時區資料對 `Atlantic/Reykjavik` 在 1965 年回傳 UTC+0（近年 tzdata 依「1970 年後相同即合併」政策把 Reykjavik 併為 `Africa/Abidjan` 的連結，1970 年前歷史遺失） | 月亮 pada、上升星宿與 pada，大運起點差 275 日，當前大運／小運 Ketu/Ketu → Mercury/Saturn | **產品端錯誤（時區資料來源）**，但屬 `time/**`，不在本任務檔案範圍 |

其餘 27 案例（含布拉格平時、Madras Time、Córdoba Mean Time、各地夏令時間）時區層差 < 1 秒。

### 4.5 其他觀察

- **平均交點**：我們（Swiss Ephemeris）的平均交點與「Meeus 式 47.7 + 章動 Δψ」差 ≤ 0.16″，證實它是相對真春分點（含章動）的值；Ketu＝Rahu＋180° 成立。
- **ΔT 外推（2030 年以後）**：`createTimeContext` 算出的 ΔT 與 astronomy-engine 相同（Espenak–Meeus），但 Swiss Ephemeris 在 `swe_calc_ut` 內部用自己的 ΔT，不使用 `TimeContext.jd.tt`。1800–2030 年兩者一致，2050 年後開始分歧，2100 年月亮差約 1′、2199 年約 2.4′。屬「未來 ΔT 無法確知」的慣例差異；出生盤（過去日期）不受影響，但 `TimeContext` 報告的 ΔT 與實際使用的 ΔT 不同是一個內部一致性問題（`calculators/astro/**`，不在本任務範圍）。
- **星曆初始化**：正確做法是先 `await initEphemeris()`（載入 WASM，冪等）；MCP 回應中的 `ephemeris: 'not_initialized'` 只是不需要星曆的工具（列 profile、問題分類等）在版本資訊裡的標記，不代表計算失敗。

## 五、差異分類

| 分類 | 項目 |
|---|---|
| 我們的錯（jyotish 計算器） | 無 |
| 我們的錯（產品其他層） | Björk：冰島 1968 年前時區資料遺失（`time/**`／執行環境 tzdata） |
| 對照方法的錯或精度限制 | astronomy-engine 截斷理論造成的 ≤ 20″ 差（已由 JPL 證實誤差在對照端）；Lahiri 文獻公式與 Swiss Ephemeris 實作差 ≤ 0.37″ |
| 慣例差異 | 1900 年前時區代表城市 LMT vs 出生地 LMT（Van Gogh、Einstein）；2030 年後 ΔT 外推模型 |
| 無法判定 | 無（Charlotte 月亮邊界已由 JPL／swetest 判定） |

## 六、方法限制（誠實說明）

1. **astronomy-engine 與 Swiss Ephemeris 是不同實作**，所以本驗證能抓出星曆、ΔT、章動、座標轉換、上升點公式、交點定義與歲差數值實作的錯誤。
2. 但**「慣例」只能對照文獻，不等於被公開計算器交叉驗證**：Lahiri 的定義值、整宮制、星宿與 pada 的切分、D9／D10 的起數規則、Vimshottari 的序列與 365.25 日年長、小運的分配方式——這些都是我們依同一批文獻自己重寫一份來比對。若我們對文獻的理解本身有誤，兩邊會一起錯。
3. 第三方來源的性質：
   - JPL Horizons：只驗回歸黃道的天文位置，不涉及任何吠陀占星規則。
   - Astrodienst swetest：驗了 Lahiri 恆星黃經、平均交點、整宮上升，但它跟我們同屬 Swiss Ephemeris 程式家族，且不輸出星宿、D9、D10、大運。
   - ADB：只有回歸太陽／月亮／上升，到角分。
4. 因此 **ROADMAPS M5-01「與至少兩個公開計算器交叉驗證、≥ 20 案例」字面上未達成**。還差：
   - 以**至少兩個吠陀占星專用計算器**（例如 Jagannatha Hora、Drik Panchang、Prokerala、AstroSage）對 ≥ 20 案例比對**星宿／pada、D9、D10、大運與小運起訖日期**。網頁表單無法自動化（前一位代理已失敗），需要人工輸入，或在使用者同意下使用可信來源的離線軟體。
   - 比對時要先確認對方設定（Lahiri／Chitrapaksha、平均交點、整宮、大運年長）。許多軟體預設年長不是 365.25 日（例如 360 日或恆星年），大運日期可能差數日到一年以上，屬慣例差異。
5. 未涵蓋：真交點選項（`node: 'true'`）、Raman／Krishnamurti 歲差、`dashaYearDays` 非預設值、尊貴度（dignity）、宮主、過運／Sade Sati、規則與 Signal（`rules.ts`）。這些多為查表或同一套函式的延伸，目前只有既有單元測試。
6. 南半球案例全在南美洲；1800 年以前不在產品支援範圍；2030 年以後的日期（未來過運）受 ΔT 外推影響。

## 七、是否建議升級（移除 `experimental`）

**建議：暫不移除 `experimental`，但計算核心可視為「已通過天文與規則層驗證」。**

支持升級的依據：

- 30 個 AA 案例、2,190 個離散欄位與 600 張隨機盤在計算層 100% 一致；度數對 JPL 最大 1″；Lahiri 值與 Astrodienst 完全相同。
- 沒有發現 jyotish 計算器本身的任何錯誤。

尚不足以升級的依據：

- M5-01／D-039 要求「至少兩個公開計算器」，目前吠陀專用的輸出（星宿、D9、D10、大運日期）只對照了我們自己依文獻重寫的版本，沒有公開吠陀計算器背書。
- 端到端在歷史時區上仍有產品層問題（Björk：當前大運／小運判錯；1900 年前用時區代表城市 LMT），會直接影響使用者看到的大運。

建議下一步（由專案負責人決定）：

1. 人工在 2 個吠陀計算器上抽查本檔 ≥ 20 案例的 D9／D10／大運起訖（直接輸入 UT 或固定偏移可避開時區差異），結果補進 `jyotish-thirdparty.json`。
2. 另開任務處理 `time/**`：1970 年前 tzdata 被合併的時區（如 Reykjavik）與標準時制定前的出生地 LMT。
3. 另開任務評估是否讓 Swiss Ephemeris 使用 `TimeContext` 的 ΔT，消除內部不一致。

## 八、新增依賴

- `astronomy-engine` **2.1.19**，**MIT 授權**，作者 Don Cross；只加在 `packages/core` 的 `devDependencies`，只被 `tests/jyotish-validation.reference.ts` 匯入，不進 runtime bundle。
