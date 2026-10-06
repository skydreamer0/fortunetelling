import { answerCheckTools } from './answerCheck';
import { chartTools } from './chart';
import { importProfileTools } from './importProfile';
import { profileTools } from './profiles';
import { questionTools } from './questions';
import { signalTools } from './signals';
import { defineTool, type ToolContext, type ToolDef } from './types';
import { z } from 'zod';
import { MAX_RESPONSE_CHARS, ok, render, renderError, type Caveat } from '../envelope';
import { ToolError } from '../errors';

const BASE_TOOLS: readonly ToolDef<any>[] = [...profileTools, ...chartTools, ...signalTools, ...questionTools, ...answerCheckTools, ...importProfileTools];

/** batch 一次最多幾個呼叫。 */
export const MAX_BATCH_CALLS = 8;
/** 會寫檔或改變狀態的工具，不可放進 batch（batch 本身也不可巢狀）。 */
export const BATCH_FORBIDDEN: readonly string[] = Object.freeze(['import_profile', 'batch']);
/** batch 保留給外層封包的字元數；累計到上限後，後面的呼叫回 response_too_large 而不是讓整批失敗。 */
const BATCH_ENVELOPE_RESERVE = 2_000;

const batchableNames = BASE_TOOLS.map(t => t.name).filter(n => !BATCH_FORBIDDEN.includes(n));

type BatchError = { code: string; message: string; hint?: string; details?: unknown };

const batchTool = defineTool({
  name: 'batch',
  description:
    `Run up to ${MAX_BATCH_CALLS} read-only tool calls in one round trip, in order, in-process (they share the analysis cache, so repeated profile/asOf is cheap). ` +
    `calls = [{ tool, args }]; tool is one of: ${batchableNames.join(', ')}. batch cannot nest and import_profile (writes a file) is not allowed. ` +
    'Response: results[] in call order, each { index, tool, ok: true, asOf, data } or { index, tool, ok: false, error: { code, message, hint?, details? } }; one failing call does not stop the others. ' +
    'caveats are merged and de-duplicated across the successful calls. ' +
    `The whole response is capped at ${MAX_RESPONSE_CHARS} chars: once the running total would exceed it, the remaining calls come back as response_too_large errors (narrow them or call separately).`,
  input: {
    calls: z
      .array(z.object({ tool: z.string().min(1), args: z.record(z.string(), z.unknown()).optional() }).strict())
      .min(1)
      .max(MAX_BATCH_CALLS)
      .describe(`1 to ${MAX_BATCH_CALLS} calls: { tool, args }.`),
  },
  async handler({ calls }, ctx) {
    const results: unknown[] = [];
    const caveats = new Map<string, Caveat>();
    let asOf: string | null = null;
    let used = 0;
    const budget = MAX_RESPONSE_CHARS - BATCH_ENVELOPE_RESERVE;
    for (const [index, call] of calls.entries()) {
      const fail = (error: BatchError) => {
        results.push({ index, tool: call.tool, ok: false, error });
        used += JSON.stringify(error).length + 60;
      };
      if (call.tool === 'batch') {
        fail({ code: 'invalid_args', message: 'batch cannot be nested', hint: 'Put the inner calls directly in calls.' });
        continue;
      }
      if (BATCH_FORBIDDEN.includes(call.tool)) {
        fail({ code: 'unsupported', message: `'${call.tool}' is not allowed in batch (it writes files); call it directly.` });
        continue;
      }
      if (used >= budget) {
        fail({ code: 'response_too_large', message: 'batch response budget exhausted before this call ran', hint: 'Call it separately or reduce earlier calls.' });
        continue;
      }
      const res = await callTool(call.tool, call.args ?? {}, ctx);
      const parsed = JSON.parse(res.text);
      if (res.isError) {
        fail(parsed.error);
        continue;
      }
      const item = { index, tool: call.tool, ok: true as const, asOf: parsed.asOf, data: parsed.data };
      const size = JSON.stringify(item).length;
      if (used + size > budget) {
        fail({ code: 'response_too_large', message: `result is ${size} chars, over the remaining batch budget`, hint: 'Narrow this call (domain/range/detail) or call it separately.' });
        continue;
      }
      used += size;
      results.push(item);
      asOf ??= parsed.asOf;
      for (const c of parsed.caveats as Caveat[]) if (!caveats.has(c.code)) caveats.set(c.code, c);
    }
    return ok({ asOf, caveats: [...caveats.values()], data: { count: calls.length, results } });
  },
});

export const TOOLS: readonly ToolDef<any>[] = [...BASE_TOOLS, batchTool];

export type ToolResponse = { text: string; isError: boolean };

/** Validate args, run the handler, render canonical JSON. Never throws; errors become `{ error }` text. */
export async function callTool(name: string, rawArgs: unknown, ctx: ToolContext): Promise<ToolResponse> {
  try {
    const tool = TOOLS.find(t => t.name === name);
    if (!tool) throw new ToolError('unsupported', `Unknown tool '${name}'`);
    const parsed = z.object(tool.input).strict().safeParse(rawArgs ?? {});
    if (!parsed.success) {
      throw new ToolError('invalid_args', parsed.error.issues.map(i => `${i.path.join('.') || '(args)'}: ${i.message}`).join('; '));
    }
    return { text: render(await tool.handler(parsed.data, ctx)), isError: false };
  } catch (error) {
    return { text: renderError(error), isError: true };
  }
}
