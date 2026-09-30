# Roadmap 草案 v2 — 程式先算完，AI 在對話中查詢與比對

> 狀態：**已確認，進行中**（2026-09-30）。已整合 PR #8 的審閱修正；第七節五個問題已定案；M0.5 核心契約已實作。確認後取代 [ROADMAPS.md](ROADMAPS.md) 的「核心原則」與 V5，V1–V4 的既有成果全部保留。

## 一、方向

**產品形狀**：圖形介面（整理與呈現命盤資料）＋ 本機 AI 對話（下結論、討論）。

```
輸入（生日／時間／出生地／性別）
  → 程式：把「能邏輯化的」全部算完
       TimeContext → Calculators → Rule Engine → Signal → 共識／矛盾 → Timeline → 問事排名
  → 兩條出口
       ① 圖形介面（網站，給人看）
       ② 本機 MCP server／匯出檔（給 Claude 桌面版查詢，給 AI 討論）
  → 你在 Claude 桌面版對話，AI 按需查詢、比對、下結論
```

**原則**

1. **能確定的交給程式**：排盤、規則、訊號、共識、逐月分數。AI 不重新排盤、不心算。
2. **AI 負責最後一段**：跨系統比對、綜合判斷、回答問題、對話追問。
3. **按需查詢，不一次吞下全部**：每個模組只是多一個工具；工具輸出有大小上限。
4. **本機優先**：不需要 API key、不需要伺服器。
5. **保留矛盾、標示不確定**：系統間方向相反就並列；分數未校準（D-033）、未驗證系統（`verified: false`）要讓 AI 知道。
6. **MCP 只包裝 core**：不自行重算第二套邏輯。

## 二、現況（已核對程式碼）

| 區塊 | 狀態 |
|---|---|
| 時間層、profile、八字／紫微／靈數／Kin／命卦 | ✅ 保留；在 `CALCULATORS` registry 內，同步 `analyze()` 可用 |
| Jyotish／Human Design | 🟡 calculator 與 `rules.ts` 已存在，`buildTimelineAsync()` 已納入；**未與公開計算器交叉驗證**，且不在 `CALCULATORS` registry／同步 `analyze()` 內 → 視為 `experimental` |
| 規則、Signal、共識、Timeline、問事、回驗 | ✅ 保留，視為「給 AI 的結構化訊號」 |
| 網站 UI | ✅ 保留。profile 與人生事件只存瀏覽器 `localStorage`，本機 MCP 讀不到 → 需要匯入匯出橋（M0.5） |
| `analyze()` | 含 `generatedAt`（非決定性欄位）；同步路徑與需 ephemeris 的 async 路徑不同 |
| `packages/ai` 的去識別化、24000 字預算、Anthropic client、section 後驗證 | 🟡 為「網站呼叫 API／複製貼上」設計 → M3 整理 |
| 「複製 prompt」 | 🟡 保留為沒有桌面版時的備援 |

## 三、里程碑

### M0.5 — Profile 與序列化契約（M1 的前置）

避免 M1、M2、M4 各自產生不同格式。

| ID | 任務 | 產出 |
|---|---|---|
| M0.5-01 ✅ | `ProfileSchemaV1`：`profileId`（使用者可命名的穩定 slug，如 `sky`）＋`chartFingerprint`（規範化出生欄位的雜湊）＋版本欄位 | 單一 profile 格式 |
| M0.5-02 ✅ | canonical serializer：鍵序固定、排除 `generatedAt`／執行時間等非決定性欄位 | MCP、網站匯出、測試共用 |
| M0.5-03 🟡 | import／export（檔案格式與 parse 完成；網站下載按鈕在 M4-02、MCP 讀取在 M1-02）：網站下載 `.fortune.json`；MCP 讀固定 profiles 目錄或 `import_profile` | 瀏覽器 → 本機的橋 |
| M0.5-04 ✅ | 版本資訊：`coreVersion`、`profileSchemaVersion`、規則／catalog version、`asOf`、ephemeris 狀態 | 每份輸出都帶 |

**決定**：`profileId` 不是內容雜湊。改一個時辰不應換掉「這個人」；`chartFingerprint` 才是內容雜湊，供人生事件等「依命盤」的資料當 key（沿用 `lifeEvents` 現況）。

### M1 — 本機 MCP server（核心，最優先）

新增 `packages/mcp`（`@fortune/mcp`），stdio 跑在本機，Claude 桌面版當工具用。**Stateless**：沒有「目前載入哪個人」，每次呼叫都帶 `profileId`。所有時間相關工具顯式帶 `asOf`（延續 D-014）。

```text
list_profiles()
get_profile({ profileId })                                     // 預設不回姓名
get_chart({ profileId, system, asOf, detail: "summary"|"full" })
list_signals({ profileId, domain?, system?, range?, minStrength?, limit?, cursor? })
get_signal({ profileId, signalId })                            // 完整 evidence／modifiers 在這裡取
get_timeline({ profileId, asOf, range?, domain? })
get_consensus({ profileId, asOf, range? })
list_conflicts({ profileId, asOf, range? })
answer_question({ profileId, category, range, asOf })
list_question_categories()
compare_profiles({ profileIdA, profileIdB, asOf })
```

每個回應都附 `asOf`、`versions`、`caveats`（分數未校準、時間精度與邊界 flags、未參與的系統、`verified: false` 的系統）。預設只回必要 evidence。

| ID | 任務 |
|---|---|
| M1-01 ✅ | 套件骨架、Bun 執行、`claude_desktop_config.json` 範例、`docs/MCP-SETUP.md`（另有 `add-profile` 指令，網站匯出在 M4-02 前的過渡） |
| M1-02 ✅ | profile 存取：`list_profiles`、`get_profile`（讀固定目錄，依 M0.5 契約） |
| M1-03 ✅ | `get_chart`（summary／full）、時間 flags（時辰／節氣邊界、DST、時間未知） |
| M1-04 ✅ | `list_signals`（limit／cursor）、`get_signal` |
| M1-05 ✅ | `get_timeline`、`get_consensus`、`list_conflicts`（range／domain 篩選） |
| M1-06 ✅ | `answer_question`、`list_question_categories`（重用 `answerQuestion`） |
| M1-07 ✅ | `compare_profiles`（重用 `analyzeCompatibility`） |
| M1-08 ✅ | 統一回應外殼：`asOf`、`versions`、`caveats`、大小上限 |
| M1-09 ✅ | **canonical contract 測試**：同一 `profile + asOf + config + 規則版本` 的 canonical payload 一致；sync 與 async 路徑各自 golden；未知 id 回結構化錯誤 |

**完成條件**：在 Claude 桌面版問「我 2027 年哪幾個月適合買車？」，Claude 先以 `profileId` 呼叫 `answer_question`，需要細節再呼叫 `list_signals`／`get_signal`。所有引用的 signal id 必須存在；回應附 `asOf`、版本與 caveats；同一輸入與版本重跑得到相同 canonical 結果。

### M2 — 匯出／匯入（備援，也是離線與分享用）

```text
manifest.json   exportSchemaVersion／profileSchemaVersion／coreVersion／規則與 catalog 版本／asOf／
                參與與略過的系統／ephemeris 模式與 warnings／redacted 與否
profile.json
chart.json
signals.json
timeline.json
consensus.json
README.md       給 AI 看：欄位說明、哪些是確定性計算、哪些分數未校準、建議分析步驟
```

| ID | 任務 |
|---|---|
| M2-01 | 兩種 preset：`local-full`（完整資料）、`share-redacted`（移除姓名與非必要出生地標籤） |
| M2-02 | 序列化與 MCP 共用 M0.5 的 canonical serializer（單一來源） |
| M2-03 | `share-redacted` 與 `packages/ai` 的 `buildInterpretationPayload` 共用同一份去識別化邏輯（D-029），不另寫一套 |

### M3 — 整理 AI 層（`packages/ai`）

| ID | 任務 |
|---|---|
| M3-01 | 標明兩條路：`copy`（備援）與 `mcp`（主線）；`client`／`anthropic` 改為選用，不進主線 |
| M3-02 | 去識別化與字數預算改為可選，本機匯出預設關閉 |
| M3-03 | 保留 `vocab`／HonestyGuard 檢查，獨立成 `check_answer`：貼回 AI 的回答自行檢查 |
| M3-04 | 系統指令改寫為「對話助手」版：可用工具、如何引用訊號、何時說高共識、如何呈現矛盾與 `experimental` 系統 |

### M4 — 網站對接

| ID | 任務 |
|---|---|
| M4-01 | 「問 AI」章節兩個入口：**用 Claude 桌面版討論**（MCP 設定步驟＋匯出）、**複製 prompt**（備援） |
| M4-02 | 網站下載 `.fortune.json`（M0.5-03），供 MCP 讀取；不假設網站能寫本機任意檔案 |
| M4-03 | （選用）貼回結論後用 `check_answer` 對照引用的訊號 |

### M5 — 計算端驗證與補齊（與 M1～M4 並行）

| ID | 任務 |
|---|---|
| M5-01 | Jyotish／HD 與至少兩個公開計算器交叉驗證，≥ 20 案例 |
| M5-02 | 驗證前標 `experimental`，MCP 回應附 `verified: false` 與 caveat；不與已驗證系統用相同信心標示 |
| M5-03 | 驗證後正式納入 public API／registry，明確 sync／async 行為邊界 |
| M5-04 | V2-05：Jyotish／HD 規則 → Signal 補齊（新模組進場：calculator → rules → Signal，不需改 AI 層） |
| M5-05 | 回驗累積多人資料 n ≥ 30 後才調權重（維持 D-033） |

M1 不被 M5 阻塞。

## 四、暫停或取消

- V3-04 Next.js 遷移：暫停，沒有需求。
- V4-01／02 資料庫與帳號同步：暫停；本機優先，MCP 直接讀本機檔案。
- V5-06 網站內直接呼叫模型／BYOK：取消，被 MCP 取代。

## 五、隱私分兩層

- **本機 profile**：可保留完整姓名、生日、出生地。
- **進入 Claude 對話的資料**：工具結果一被使用就進了 AI 上下文。MCP 預設以 `profileId` 與 derived data 為主，**姓名預設不回傳**；原始出生資料只在明確需要時由工具提供。
- **分享用匯出**走 `share-redacted`。

## 六、執行順序

```
M0.5 → M1 → M2 → M3 → M4
M5 與 M1～M4 並行
```

第一個可用版本：M0.5 ＋ M1-01～M1-06 ＋ 設定說明；Jyotish／HD 在驗證完成前標 `experimental`。

## 七、已確認事項（2026-09-30）

1. MCP 為主、匯出檔為備援。
2. 本機不去識別化；進對話的資料姓名預設不回傳。
3. 資料庫與帳號同步先暫停。
4. 使用情境：**只有你自己用**（不做安裝包與多人 profile 管理；之後要給別人再開新里程碑）。
5. `profileId` 為使用者命名的 slug，另設 `chartFingerprint`。

## 八、M0.5 實作紀錄

位置：`packages/core/src/portable/`，測試 `packages/core/tests/portable.test.ts`。

- `canonicalStringify`／`canonicalize`：鍵序固定、排除 `generatedAt`、拒收 NaN／函式／Date。與 `signals/signalId` 既有的寬鬆 `canonicalJson` 並存（訊號 id 依賴後者，不動）。
- `chartFingerprint`：`cf1-` + FNV-1a 64（沿用 `fnv1a64Hex`）。只含出生日期、時間、精度、性別、經緯度（4 位小數）、時區；**不含姓名與地名標籤**。
- `.fortune.json`：`createProfileFile`／`serializeProfileFile`／`parseProfileFile`；檔案無時間戳，輸出位元穩定；指紋缺漏或過期時重算並回警告。
- `buildVersionInfo({ asOf })`：core／schema／calculator／catalog 版本、ephemeris 狀態、`experimentalSystems`（Jyotish／HD）。

**已知差異**：網站 `lifeEvents` 現行的 key（`profileKeyOf`）包含姓名，與 `chartFingerprint` 不同。人生事件的 key 遷移放到 M4-02 一起處理，這一步不動網站。

## 九、M1 實作紀錄

位置：`packages/mcp`，說明 `docs/MCP-SETUP.md`。64 個測試（含真實 stdio 客戶端的端到端驗收）。

- 12 個工具：`list_profiles`、`get_profile`、`get_chart`、`get_time_context`、`list_signals`、`get_signal`、`get_timeline`、`get_consensus`、`list_conflicts`、`answer_question`、`list_question_categories`、`compare_profiles`。
- 姓名與出生資料預設不回傳（`get_profile` 需明確 `includeName`／`includeBirthData`；`compare_profiles` 只回 A／B 與衍生值）。
- 回應外殼 `{ asOf, versions, caveats, data }`；超過 60000 字元回 `response_too_large` 與縮小範圍提示，不截斷。
- **驗收抓到的缺口（已修）**：`answer_question` 引用的月份訊號，起初 `get_signal` 查不到（兩邊各算各的）。現在月份訊號由 `Analysis` 統一計算並快取，`get_signal` 在 asOf 年 −5 ～ +10 內都能解析；`answer_question` 的區間必須落在此範圍，否則回 `invalid_args`。回歸測試：問事答案引用的每個 id 都必須可取得。
- core 補匯出 `initEphemeris`、`jyotishCalculator`、`humanDesignCalculator`（仍標 `experimental`，不進 `CALCULATORS`）。

**尚未做**：`import_profile` 工具（M0.5-03 的 MCP 端匯入，目前只讀固定目錄）；`get_timeline` 預設不含逐月（帶 `range` 才含）。
