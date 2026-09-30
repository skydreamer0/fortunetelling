import { chartTools } from './chart';
import { profileTools } from './profiles';
import { questionTools } from './questions';
import { signalTools } from './signals';
import type { ToolContext, ToolDef } from './types';
import { z } from 'zod';
import { render, renderError } from '../envelope';
import { ToolError } from '../errors';

export const TOOLS: readonly ToolDef<any>[] = [...profileTools, ...chartTools, ...signalTools, ...questionTools];

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
