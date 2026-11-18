import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { VERSION } from '../../core/src/core/version';
import { TOOLS } from '../src/tools/index';

const readme = readFileSync(new URL('../../../README.md', import.meta.url), 'utf8');

describe('root README.md consistency', () => {
  test('documents the current core version', () => {
    const version = /目前[ \t]+core[ \t]+為[ \t]*\*\*([^*\r\n]+)\*\*/.exec(readme)?.[1];
    if (!version) throw new Error('README.md is missing the core version statement (目前 core 為 **X.Y.Z**).');

    expect(version.trim(), 'README.md core version differs from VERSION').toBe(VERSION);
  });

  test('documents the number of registered MCP tools', () => {
    const count = /目前共有[ \t]*\*\*([0-9]+)[ \t]*個工具\*\*/.exec(readme)?.[1];
    if (!count) throw new Error('README.md is missing the MCP tool count statement (目前共有 **N 個工具**).');

    expect(Number(count), 'README.md tool count differs from the MCP registry').toBe(TOOLS.length);
  });

  test('lists exactly the registered MCP tool names', () => {
    const lines = readme.split(/\r?\n/);
    const header = lines.findIndex(line => /^\s*\|\s*類型\s*\|\s*工具\s*\|\s*$/.test(line));
    if (header === -1) throw new Error('README.md is missing the MCP tool table (| 類型 | 工具 |).');

    const documentedNames = new Set<string>();
    for (const row of lines.slice(header + 2)) {
      if (!row.trimStart().startsWith('|')) break;

      const toolCell = row.split('|')[2] ?? '';
      for (const entry of toolCell.split(/[、,，]/)) {
        const name = entry.trim().replace(/^`([^`]+)`$/, '$1');
        if (name) documentedNames.add(name);
      }
    }
    if (documentedNames.size === 0) throw new Error('README.md MCP tool table has no tool names.');

    const registeredNames = TOOLS.map(tool => tool.name);
    const missing = registeredNames.filter(name => !documentedNames.has(name)).sort();
    const extra = [...documentedNames].filter(name => !registeredNames.includes(name)).sort();
    expect(
      { missing, extra },
      `README.md MCP tool table differs from the registry. Missing: ${missing.join(', ') || '(none)'}. Extra: ${extra.join(', ') || '(none)'}.`,
    ).toEqual({ missing: [], extra: [] });
  });
});
