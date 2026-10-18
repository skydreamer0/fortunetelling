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

/** Heterogeneous registry view: input remains a Zod shape; arguments cannot be
 * supplied to an erased handler without passing the matching schema first.
 * This is type erasure only, not a runtime wrapper or a second validator. */
export type RegisteredTool = {
  name: string;
  description: string;
  input: z.ZodRawShape;
  handler: (args: never, ctx: ToolContext) => Promise<Envelope>;
};
