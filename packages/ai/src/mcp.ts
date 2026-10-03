/**
 * 「mcp」主線進入點（`@fortune/ai/mcp`）：Claude 桌面版接本機 MCP 時要用的部分。
 * 只有純函式與靜態字串：貼回答案檢查、對話助手系統指令、可關閉的 payload 選項。
 * 不含 Anthropic client（選用，請用 `@fortune/ai/client`）。
 */
export * from './checkAnswer';
export * from './instructions';
export { buildInterpretationPayload, LOCAL_PAYLOAD_OPTIONS } from './payload';
export type { BuildPayloadOptions, BuiltPayload } from './payload';
