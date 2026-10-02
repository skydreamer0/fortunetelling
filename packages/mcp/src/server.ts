import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Analyzer } from './compute';
import { ProfileStore } from './store';
import { callTool, TOOLS } from './tools/index';

export function createServer(store: ProfileStore = new ProfileStore()): McpServer {
  const ctx = { store, analyzer: new Analyzer(store) };
  const server = new McpServer({ name: 'fortune', version: '0.1.0' });
  for (const tool of TOOLS) {
    server.tool(tool.name, tool.description, tool.input, async (args: Record<string, unknown>) => {
      const { text, isError } = await callTool(tool.name, args, ctx);
      return { content: [{ type: 'text' as const, text }], isError };
    });
  }
  return server;
}
