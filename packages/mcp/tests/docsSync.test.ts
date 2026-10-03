import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MCP_SERVER_INSTRUCTIONS } from '@fortune/ai/mcp';
import { TOOLS } from '../src/tools/index';

const doc = readFileSync(join(import.meta.dir, '../../../docs/MCP-SETUP.md'), 'utf8').replace(/\r\n/g, '\n');

describe('docs/MCP-SETUP.md 與程式同源', () => {
  test('「建議的對話指示」逐字等於 MCP_SERVER_INSTRUCTIONS', () => {
    expect(doc).toContain(`\`\`\`text\n${MCP_SERVER_INSTRUCTIONS}\n\`\`\``);
  });
  test('工具一覽表涵蓋每個工具', () => {
    for (const tool of TOOLS) expect(doc).toContain(`\`${tool.name}\``);
  });
});
