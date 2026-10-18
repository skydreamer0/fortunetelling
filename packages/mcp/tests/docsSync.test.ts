import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MCP_SERVER_INSTRUCTIONS } from '@fortune/ai/mcp';
import { TOOLS } from '../src/tools/index';

const doc = readFileSync(join(import.meta.dirname, '../../../docs/MCP-SETUP.md'), 'utf8').replace(/\r\n/g, '\n');

describe('docs/MCP-SETUP.md 與程式同源', () => {
  test('「建議的對話指示」逐字等於 MCP_SERVER_INSTRUCTIONS', () => {
    expect(doc).toContain(`\`\`\`text\n${MCP_SERVER_INSTRUCTIONS}\n\`\`\``);
  });
  test('版本明細說明涵蓋直接比較與 batch 邊界', () => {
    expect(doc).toContain('`list_profiles`、`get_profile` 與 `compare_bazi_conventions` 的直接成功回應');
    expect(doc).toContain('`batch` 的子結果不保留完整 `versions`');
    for (const name of ['list_profiles', 'get_profile']) {
      const description = TOOLS.find(tool => tool.name === name)!.description;
      expect(description).toContain('direct compare_bazi_conventions');
      expect(description).not.toContain('other tools only return versionsHash');
    }
  });
  test('工具一覽表涵蓋每個工具', () => {
    for (const tool of TOOLS) expect(doc).toContain(`\`${tool.name}\``);
  });
});
