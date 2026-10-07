/**
 * @fortune/ai — AI 層主線匯出（V5-03/V5-04、M3）。
 * 只讀 Report JSON，不 import 計算器或命理函式庫（D-021）。
 *
 * 兩條路：
 *   - mcp（主線）：Claude 桌面版接本機 MCP；用 `checkAnswer`、`CONVERSATION_SYSTEM_INSTRUCTION`
 *     （也可單獨 import `@fortune/ai/mcp`）。
 *   - copy（備援）：複製 prompt、貼回檢查；瀏覽器用 `@fortune/ai/copy`。
 *
 * Anthropic client（`interpret`、`parseQuestion`、`createAnthropicComplete`…）是選用層，
 * 不在這裡匯出，請改用 `@fortune/ai/client`，避免主線帶進 `@anthropic-ai/sdk`。
 */
// Keep internal prepared-selection helpers out of the public AI API.
export { PAYLOAD_VERSION, DEFAULT_MAX_PAYLOAD_CHARS, LOCAL_PAYLOAD_OPTIONS, PAYLOAD_NOTES,
  scrubReport, sensitiveParts, buildInterpretationPayload } from './payload';
export type { ReportComponentLike, ReportEngineLike, ReportLike, PayloadSignal,
  PayloadChartComponent, PayloadChart, PayloadTimelineDomain, PayloadTimelineCell,
  PayloadTimeline, PayloadRankedWindow, PayloadQuestion, PayloadTruncation,
  InterpretationPayload, BuildPayloadOptions, BuiltPayload } from './payload';
export * from './prompts';
export * from './schema';
export * from './vocab';
export * from './validate';
export * from './copyPrompt';
export * from './pasteCheck';
export * from './checkAnswer';
export * from './instructions';
export { canonicalJson, sha256Hex } from './canonical';
