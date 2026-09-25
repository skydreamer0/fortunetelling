# @fortune/ai — AI 解讀層（V5-03／V5-04／V5-05）

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

## 網站怎麼用 AI：複製 prompt（D-035）

`apps/web` 是靜態網站（GitHub Pages），**無法安全保存 API key**，也不架伺服器。決定（D-035）：網站**不呼叫任何模型**，
而是組出一段自足的 prompt，讓使用者貼到自己慣用的聊天 AI（ChatGPT、Claude、Gemini…）。

網站只 import 瀏覽器安全的子路徑 **`@fortune/ai/copy`**（`src/copy.ts` → `copyPrompt.ts`＋`pasteCheck.ts`），
不會帶進 `client.ts`／`anthropic.ts`，建置產物不含 `@anthropic-ai`（`tests/copyPrompt.test.ts` 守護 import 圖）。

```ts
import { buildCopyPrompt, checkPastedAnswer } from '@fortune/ai/copy';

const prompt = buildCopyPrompt(report, {
  focus: 'question',                  // 'overview' | 'year' | 'question'
  question: '2026～2027 什麼時候適合買車？',
  questionAnswer,                     // 選用：網站本地 answerQuestion() 的結果
  maxChars: 24_000,                   // 預設；整段文字的長度上限
});
prompt.text; prompt.charCount; prompt.truncated; prompt.promptVersion; // 'copy-v1'

const check = checkPastedAnswer(prompt.payload, pastedAnswer); // 或傳整份 report（以完整資料比對）
check.paragraphs[i].flags; // [{ code, label, values }]
```

### `buildCopyPrompt`（純函式、決定論）

一整段繁體中文，依序：

1. **角色與規則**（改寫自 §9 系統指令）：只用下方資料、禁止重新排盤（資料裡沒有的干支／星曜／行星不要提）、
   每個重要結論標〔sig_…〕、三套以上系統同向才說「高共識」、保留矛盾、隨時間變動的內容是傾向不是命定（禁「你是…」「注定」、吉凶）、
   分數是未校準的研究訊號（D-033）、資料無法回答就直說。
2. **輸出格式**：Markdown 標題 總覽／本年與未來五年／各領域／共識與分歧／（問題的回答）／資料限制，每段附引用。
3. **資料**：`buildInterpretationPayload` 的去識別化 JSON（D-029：無姓名、出生地、出生日期時間、經緯度；問題文字中的姓名／地名也會遮蔽）。
   為了符合聊天輸入長度，依序嘗試：完整命盤 → 命盤摘要 → 不附命盤 → 不附逐月 → 只附訊號；
   過去月份的訊號不送；每一層都由 `buildInterpretationPayload` 先丟強度最低的訊號（問題的來源訊號優先保留）。
   省略了什麼會寫在 prompt 裡，並要求 AI 在「資料限制」說明。
4. **問題**（選填）與網站用 Question Engine 算出的月份排名，標明「確定性計算，不是 AI 產生」。

### `checkPastedAnswer`（貼回檢查，建議性）

網站攔截不到外部 AI 的輸出，所以這裡只**標示**、不刪改。逐段（空行分段；標題行只更新所屬章節）檢查：

| code | 標示 | 條件 |
|---|---|---|
| `unknown_citation` | 引用不存在 | 段落中的 `sig_…` 不在資料的 signals |
| `unverified_term` | 提到資料中沒有的干支／星曜／行星 | 同 `validate.ts` 的 vocab 比對（「紫微斗數」作為系統名不算星曜） |
| `no_citation` | 沒有引用來源 | 20 字以上的內容段落沒有任何 `sig_…`（「資料限制」等說明段落除外） |
| `fatalism` | 宿命論用語 | HonestyGuard `L2` 或 `FATALISM_PATTERNS` |
| `high_consensus_unsupported` | 高共識但少於三套系統 | 寫「高共識」但引用的訊號來自少於 3 套系統 |

### 日後的程式呼叫路徑（仍保留）

Serverless 代理（函式持有 key，只收去識別化 payload，伺服器端組固定 prompt＋`validateSections`＋快取）或
BYOK（使用者自備 key，只存 `sessionStorage`，`createAnthropicComplete({ apiKey, dangerouslyAllowBrowser: true })`）
都可以直接用上面的 `interpret()`，強制後驗證照舊；兩者皆為選用層（D-029）。

## 測試

```
bun test packages/ai            # 全部 mock，不連網
ANTHROPIC_API_KEY=… bun test packages/ai/tests/live.test.ts   # 真實 API smoke test（可用 FORTUNE_AI_MODEL 覆寫模型）
bun run --filter @fortune/ai typecheck
```

`tests/fixtures/report-v4.json` 是一次 `analyze()` 真實輸出的精簡版（timeline `topSignals` 只留 id、
訊號去掉 modifiers），`question-vehicle.json` 是對應的 `answerQuestion` 結果；測試本身不執行任何計算器。
