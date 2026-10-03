import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { checkMcpServer, checkProfiles, desktopConfigCandidates, inspectDesktopConfig, type FsProbe } from '../src/cli/doctor';

// 用 resolve 產生目前平台的絕對路徑，Windows 與 Linux（CI）都適用
const BIN = resolve('/repo/packages/mcp/src/bin.ts');
const BUN = resolve('/bun/bun.exe');
const fsOf = (existing: string[], which: Record<string, string> = {}): FsProbe => ({
  exists: p => existing.includes(p),
  which: cmd => which[cmd] ?? null,
});
const config = (entry: unknown) => ({ mcpServers: { fortune: entry } });
const statusOf = (results: { name: string; status: string }[], name: string) => results.find(r => r.name === name)?.status;

describe('inspectDesktopConfig', () => {
  test('正確的設定全部通過', () => {
    const results = inspectDesktopConfig(
      config({ command: BUN, args: ['run', BIN] }),
      fsOf([BUN, BIN]),
      BIN,
    );
    expect(results.every(r => r.status === 'ok')).toBe(true);
  });

  test('反斜線被吃掉的路徑要抓出來（這個專案踩過）', () => {
    // 實際發生過的壞值：JSON 沒有跳脫，反斜線全部消失
    const mangled = 'C:UsersUserDocumentsProjectfortunetellingpackagesmcpsrcbin.ts';
    const results = inspectDesktopConfig(
      config({ command: BUN, args: ['run', mangled] }),
      fsOf([BUN]),
      BIN,
    );
    expect(statusOf(results, '桌面版 args')).toBe('fail');
    expect(results.find(r => r.name === '桌面版 args')?.detail).toContain('反斜線');
  });

  test('沒有 fortune、找不到指令、檔案不存在、指向別的 checkout', () => {
    expect(statusOf(inspectDesktopConfig({ mcpServers: {} }, fsOf([]), BIN), '桌面版設定 fortune')).toBe('fail');
    expect(statusOf(inspectDesktopConfig(config({ command: 'bun', args: ['run', BIN] }), fsOf([BIN]), BIN), '桌面版 command')).toBe('fail');
    expect(
      statusOf(inspectDesktopConfig(config({ command: 'bun', args: ['run', BIN] }), fsOf([], { bun: '/x/bun' }), BIN), '桌面版 args'),
    ).toBe('fail');
    const other = resolve('/other/packages/mcp/src/bin.ts');
    expect(
      statusOf(inspectDesktopConfig(config({ command: 'bun', args: ['run', other] }), fsOf([other], { bun: '/x/bun' }), BIN), '桌面版 args'),
    ).toBe('warn');
  });

  test('FORTUNE_PROFILES_DIR 指到不存在的目錄會失敗', () => {
    const results = inspectDesktopConfig(
      config({ command: 'bun', args: ['run', BIN], env: { FORTUNE_PROFILES_DIR: 'C:\\nope' } }),
      fsOf([BIN], { bun: '/x/bun' }),
      BIN,
    );
    expect(statusOf(results, '桌面版 FORTUNE_PROFILES_DIR')).toBe('fail');
  });
});

describe('desktopConfigCandidates', () => {
  test('Windows 會一併找 Microsoft Store 版的 Packages 目錄', () => {
    const paths = desktopConfigCandidates(
      'win32',
      { APPDATA: 'C:\\A', LOCALAPPDATA: 'C:\\L' },
      () => ['Other_x', 'Claude_abc123'],
    );
    expect(paths.some(p => p.includes('Packages') && p.includes('Claude_abc123'))).toBe(true);
    expect(paths.some(p => p.startsWith('C:\\A'))).toBe(true);
    expect(paths.some(p => p.includes('Other_x'))).toBe(false);
  });
});

describe('checkProfiles', () => {
  test('目錄不存在：本機警告、CI 略過', async () => {
    const dir = join(tmpdir(), 'fortune-doctor-missing-dir');
    expect((await checkProfiles(dir, false))[0].status).toBe('warn');
    expect((await checkProfiles(dir, true))[0].status).toBe('skip');
  });

  test('壞掉的 profile 檔會失敗', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fortune-doctor-test-'));
    try {
      await writeFile(join(dir, 'bad.fortune.json'), '{ not json');
      expect((await checkProfiles(dir, false))[0].status).toBe('fail');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('checkMcpServer', () => {
  test('真實 stdio 啟動後全部通過', async () => {
    const results = await checkMcpServer();
    expect(results.filter(r => r.status !== 'ok')).toEqual([]);
  }, 60_000);
});
