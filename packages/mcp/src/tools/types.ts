import type { z } from 'zod';
import type { Analyzer } from '../compute';
import type { Envelope } from '../envelope';
import type { ProfileStore } from '../store';

export type ToolContext = { store: ProfileStore; analyzer: Analyzer };

/**
 * One tool = name + description + zod input + handler. Handlers are plain async functions
 * (no MCP SDK types) so they can be tested by calling `callTool` directly.
 */
export type ToolDef<S extends z.ZodRawShape = z.ZodRawShape> = {
  name: string;
  description: string;
  input: S;
  handler: (args: z.infer<z.ZodObject<S>>, ctx: ToolContext) => Promise<Envelope>;
};

/** Identity helper so `input` infers as a literal shape. */
export function defineTool<S extends z.ZodRawShape>(tool: ToolDef<S>): ToolDef<S> {
  return tool;
}
