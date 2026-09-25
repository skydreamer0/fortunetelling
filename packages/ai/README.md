# @fortune/ai — AI 解讀層（V5-03／V5-04）

AI 只做兩件事（ARCHITECTURE-V2 §8、§9）：

1. **自然語言 → `{ category, range }`**：`parseQuestion(text, { complete, today })`，輸出一律經 core
   `validateQuestionRequest` 驗證；不在目錄內 → `unsupported`，不即興發揮。
2. **讀 JSON 寫解讀**：`interpret(report, { complete, question? })`，只讀 `analyze()` 的 Report v4
   （與選用的 `answerQuestion()` 結果），輸出 `{ sections: [{ heading, text, citations }] }`。

排盤、訊號、分數全由 `@fortune/core` 確定性計算；本套件**不 import 任何計算器、引擎或命理函式庫**
（D-021，`tests/boundaries.test.ts` 守護）。對 core 的執行期依賴只有 `src/core-pure.ts` 裡的
`questions/engine`（驗證器＋目錄）與 `HonestyGuard`；其他都是 `import type`。

## 流程

```
Report v4 (+ QuestionAnswer)
  └─ buildInterpretationPayload  去識別化、決定性排序、長度預算（先丟強度最低的訊號並記錄）
       └─ cache key = sha256(payloadJson, promptVersion, model)
            └─ complete({ system: 固定指令, user: [payload(可快取), 指示], schema })
                 └─ validateSections  程式後驗證，不靠 AI 自律
                      └─ Interpretation { sections(通過), dropped[{section, reasons}], truncation, … }
```

### 後驗證（`validate.ts`）

段落出現下列任一情形即整段丟棄，並回報全部原因：

| code | 條件 |
|---|---|
| `no_citations` / `unknown_citation` | 沒有引用，或引用的 id 不在 `payload.signals` |
| `unverified_term` | 文字中的 60 甲子、紫微主星／輔星／四化、12 宮、行星（中／英／梵）、27 nakshatra、星座不在 payload 裡（防止 AI 自己排盤） |
| `honesty` | `HonestyGuard.lint(text, 'L2')`：你是／你天生／注定／永遠／絕對／一定會／從不 |
| `fatalism` | 大吉／大凶／凶兆／劫數／必定／必然會 |
| `high_consensus_unsupported` | 寫「高共識」但引用的訊號來自少於 3 套系統 |
| `malformed` / `empty` | 形狀不符或內文為空 |

快取存的是**模型原始輸出**，每次命中都重新驗證，所以收緊驗證規則會自動套用到舊快取。

### 去識別化（D-029）

payload 不含姓名、出生日期時間、出生地標籤與經緯度；`profile` 只有 `gender`、`timeAccuracy`、`timezone`。
報告中任何字串若出現姓名或出生地標籤，一律替換為 `〔已移除〕`。

## 使用

```ts
import { analyze, answerQuestion } from '@fortune/core';
import { createAnthropicComplete, interpret, parseQuestion } from '@fortune/ai';

const complete = createAnthropicComplete(); // 讀 ANTHROPIC_API_KEY；預設模型 claude-fable-5-1
const q = await parseQuestion('2027 年哪幾個月適合買車？', { complete, today: '2026-09-25' });
const report = analyze(input, { asOf: '2026-09-25' });
const answer = q.status === 'ok' ? answerQuestion(q.request, provider) : null;
const result = await interpret(report, { complete, question: answer });
// result.sections → 顯示；result.dropped → 記錄／除錯
```

`complete` 是注入的函式（`CompletionRequest → Promise<string>`），可以換成任何供應商或伺服器代理。

### Claude 實作（`createAnthropicComplete`）

- 官方 `@anthropic-ai/sdk`；`output_config.format` json_schema 結構化輸出。
- Prompt caching：固定系統指令與 payload 區塊都加 `cache_control: ephemeral`（同一份報告重複發問可重用前綴）。
  前綴低於模型最小可快取長度時不會快取；用 `usage.cache_read_input_tokens` 驗證。
- 串流 + `finalMessage()`，避免長輸出逾時。
- 支援的模型預設開啟伺服器端 refusal fallback（`fallbacks: 'default'`）；最終 `refusal`／`max_tokens` 會丟錯。
- 預設模型 `claude-fable-5-1`（目前最強的通用模型），可用 `{ model }` 覆寫。

## 為什麼這次不接網站

`apps/web` 是靜態網站（GitHub Pages），**無法安全保存 API key**。可選方案：

| 方案 | 做法 | 優點 | 缺點 |
|---|---|---|---|
| A. BYOK（瀏覽器） | 使用者貼自己的 key，只存在 `sessionStorage`；`createAnthropicComplete({ apiKey, dangerouslyAllowBrowser: true })` 直接呼叫 API | 不需伺服器、符合本地優先（D-029）；費用由使用者負擔 | key 暴露在瀏覽器（XSS 風險）；多數使用者沒有 key；payload 由使用者瀏覽器直接送出 |
| B. Serverless 代理 | Edge/Serverless function 保存 key，只接受 `CompletionRequest`（或更好：只接受 payload，伺服器端自己組 prompt 並跑 `validateSections`） | key 不外流；可做速率限制、快取、濫用防護；可在伺服器端強制後驗證 | 需要部署與費用；要處理個資（只收去識別化 payload，不落地） |
| C. 不接 AI | 只顯示確定性 Question Engine 結果 | 零風險 | 沒有文字解讀 |

建議：先做 **B**（代理只收去識別化 payload，伺服器端組 prompt＋後驗證＋快取），BYOK 作為進階選項；
兩者都讓 AI 維持選用（D-029）。決策草案見 D-035（待寫入 DECISIONS.md）。

## 測試

```
bun test packages/ai            # 全部 mock，不連網
ANTHROPIC_API_KEY=… bun test packages/ai/tests/live.test.ts   # 真實 API smoke test（可用 FORTUNE_AI_MODEL 覆寫模型）
bun run --filter @fortune/ai typecheck
```

`tests/fixtures/report-v4.json` 是一次 `analyze()` 真實輸出的精簡版（timeline `topSignals` 只留 id、
訊號去掉 modifiers），`question-vehicle.json` 是對應的 `answerQuestion` 結果；測試本身不執行任何計算器。
