/**
 * 輕量健康檢查：`bun run doctor`（本機）、`bun run doctor --ci`（CI，略過只存在你電腦上的項目）。
 *
 * 只檢查這個專案真的會出事的地方：
 *   1. 本機 profile 目錄（格式、檔名與 profileId 一致、指紋是否過期）
 *   2. MCP server 能真的啟動，工具齊全、外殼與錯誤格式正確（用真實 stdio 客戶端，隔離的暫存 profile）
 *   3. Claude 桌面版設定檔（路徑、指令存在、反斜線沒被吃掉、Microsoft Store 版的位置）
 *
 * 結果分四種：ok／warn／fail／skip。只有 fail 會讓結束碼為 1。
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { delimiter, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createProfileFile, PROFILE_FILE_EXTENSION, serializeProfileFile } from '@fortune/core';
import { defaultProfilesDir, ProfileStore } from '../store';
import { TOOLS } from '../tools/index';

export type Status = 'ok' | 'warn' | 'fail' | 'skip';
export type CheckResult = { name: string; status: Status; detail: string };

const BIN_PATH = fileURLToPath(new URL('../bin.ts', import.meta.url));

// ─── 1. profile 目錄 ────────────────────────────────────────────────────────

export async function checkProfiles(dir: string, ci: boolean): Promise<CheckResult[]> {
  const name = 'profile 目錄';
  if (!existsSync(dir)) {
    return [{ name, status: ci ? 'skip' : 'warn', detail: `${dir} 不存在；用 add-profile 建立你的 profile` }];
  }
  const listing = await new ProfileStore(dir).list();
  const results: CheckResult[] = [];
  if (listing.invalid.length > 0) {
    const bad = listing.invalid.map(i => `${i.file}（${i.errors.join('；')}）`).join('、');
    results.push({ name, status: 'fail', detail: `有無法讀取的 profile：${bad}` });
  } else if (listing.profiles.length === 0) {
    results.push({ name, status: 'warn', detail: `${dir} 裡沒有 ${PROFILE_FILE_EXTENSION} 檔` });
  } else {
    results.push({ name, status: 'ok', detail: `${listing.profiles.map(p => p.profileId).join('、')}（共 ${listing.profiles.length} 份）` });
  }
  for (const p of listing.profiles.filter(x => x.warnings.length > 0)) {
    results.push({ name: `profile ${p.profileId}`, status: 'warn', detail: p.warnings.join('；') });
  }
  return results;
}

// ─── 2. MCP server 冒煙測試 ─────────────────────────────────────────────────

const SMOKE_ID = 'doctor-smoke';
const SMOKE_AS_OF = '2026-01-01';

type ToolReply = { isError?: boolean; content: { type: string; text?: string }[] };
const textOf = (r: ToolReply): string => r.content.find(c => c.type === 'text')?.text ?? '';

export async function checkMcpServer(): Promise<CheckResult[]> {
  const name = 'MCP server';
  const dir = await mkdtemp(join(tmpdir(), 'fortune-doctor-'));
  const client = new Client({ name: 'fortune-doctor', version: '0' });
  try {
    const file = createProfileFile(SMOKE_ID, {
      date: '1990-05-17',
      time: '08:30',
      timeAccuracy: 'exact',
      gender: 'female',
      birthplace: { label: '台南', lat: 22.9999, lng: 120.2269, timezone: 'Asia/Taipei' },
    });
    await Bun.write(join(dir, `${SMOKE_ID}${PROFILE_FILE_EXTENSION}`), serializeProfileFile(file));

    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: ['run', BIN_PATH],
        env: { ...(process.env as Record<string, string>), FORTUNE_PROFILES_DIR: dir },
        stderr: 'pipe',
      }),
    );

    const results: CheckResult[] = [];
    const listed = (await client.listTools()).tools.map(t => t.name).sort();
    const expected = TOOLS.map(t => t.name).sort();
    const missing = expected.filter(n => !listed.includes(n));
    results.push(
      missing.length === 0
        ? { name, status: 'ok', detail: `啟動成功，${listed.length} 個工具` }
        : { name, status: 'fail', detail: `缺少工具：${missing.join('、')}` },
    );

    const instructions = client.getInstructions();
    results.push({
      name: 'MCP 使用守則',
      status: instructions && instructions.length > 0 ? 'ok' : 'fail',
      detail: instructions ? `server 送出 ${instructions.length} 字的 instructions` : 'server 沒有送出 instructions',
    });

    const call = async (tool: string, args: Record<string, unknown>) =>
      (await client.callTool({ name: tool, arguments: args })) as ToolReply;

    const profiles = await call('list_profiles', {});
    const profileOk = !profiles.isError && textOf(profiles).includes(SMOKE_ID);
    results.push({ name: '工具 list_profiles', status: profileOk ? 'ok' : 'fail', detail: profileOk ? '回傳正常' : textOf(profiles).slice(0, 120) });

    const chart = await call('get_chart', { profileId: SMOKE_ID, asOf: SMOKE_AS_OF, system: 'bazi' });
    let envelopeOk = false;
    try {
      const body = JSON.parse(textOf(chart));
      envelopeOk = !chart.isError && body.asOf === SMOKE_AS_OF && Array.isArray(body.caveats) && body.data !== undefined;
    } catch {
      envelopeOk = false;
    }
    results.push({ name: '回應外殼', status: envelopeOk ? 'ok' : 'fail', detail: envelopeOk ? 'asOf／caveats／data 齊全' : textOf(chart).slice(0, 120) });

    const unknown = await call('get_profile', { profileId: 'no-such-profile' });
    const structured = Boolean(unknown.isError) && textOf(unknown).includes('profile_not_found');
    results.push({ name: '錯誤格式', status: structured ? 'ok' : 'fail', detail: structured ? '未知 profile 回結構化錯誤' : textOf(unknown).slice(0, 120) });

    return results;
  } catch (error) {
    return [{ name, status: 'fail', detail: `無法啟動或呼叫：${(error as Error).message}` }];
  } finally {
    await client.close().catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
}

// ─── 3. Claude 桌面版設定檔 ─────────────────────────────────────────────────

/** 可能放設定檔的位置（Windows 的 Microsoft Store 版放在 Packages 底下）。 */
export function desktopConfigCandidates(
  platform: NodeJS.Platform = process.platform,
  env: Record<string, string | undefined> = process.env,
  listDir: (p: string) => string[] = p => (existsSync(p) ? readdirSync(p) : []),
): string[] {
  const file = 'claude_desktop_config.json';
  if (platform === 'win32') {
    const out: string[] = [];
    if (env.APPDATA) out.push(join(env.APPDATA, 'Claude', file));
    if (env.LOCALAPPDATA) {
      const packages = join(env.LOCALAPPDATA, 'Packages');
      for (const d of listDir(packages).filter(n => n.startsWith('Claude_'))) {
        out.push(join(packages, d, 'LocalCache', 'Roaming', 'Claude', file));
      }
    }
    return out;
  }
  if (platform === 'darwin') return [join(homedir(), 'Library', 'Application Support', 'Claude', file)];
  return [join(env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'Claude', file)];
}

export type FsProbe = { exists: (p: string) => boolean; which: (cmd: string) => string | null };

/** 檢查一份已解析的設定檔內容；純函式，方便測試各種壞掉的寫法。 */
export function inspectDesktopConfig(config: unknown, fs: FsProbe, expectedBin: string = BIN_PATH): CheckResult[] {
  const name = '桌面版設定 fortune';
  const entry = (config as { mcpServers?: Record<string, unknown> } | null)?.mcpServers?.fortune as
    | { command?: unknown; args?: unknown; env?: Record<string, unknown> }
    | undefined;
  if (!entry) return [{ name, status: 'fail', detail: 'mcpServers 裡沒有 fortune' }];

  const results: CheckResult[] = [];
  const command = typeof entry.command === 'string' ? entry.command : '';
  const commandFound = command !== '' && (isAbsolute(command) ? fs.exists(command) : fs.which(command) !== null);
  results.push(
    commandFound
      ? { name: '桌面版 command', status: 'ok', detail: command }
      : { name: '桌面版 command', status: 'fail', detail: `找不到指令 ${JSON.stringify(command)}；請改成 bun 的完整路徑` },
  );

  const args = Array.isArray(entry.args) ? entry.args.filter((a): a is string => typeof a === 'string') : [];
  const script = args.find(a => /\.(ts|js)$/.test(a));
  if (!script) {
    results.push({ name: '桌面版 args', status: 'fail', detail: 'args 裡找不到 bin.ts 的路徑' });
  } else if (/^[A-Za-z]:[^\\/]/.test(script)) {
    results.push({ name: '桌面版 args', status: 'fail', detail: `路徑的反斜線被吃掉了：${script}；JSON 裡要寫成 C:\\\\Users\\\\...` });
  } else if (!fs.exists(script)) {
    results.push({ name: '桌面版 args', status: 'fail', detail: `檔案不存在：${script}` });
  } else if (resolve(script) !== resolve(expectedBin)) {
    results.push({ name: '桌面版 args', status: 'warn', detail: `指向別的 checkout：${script}（目前專案是 ${expectedBin}）` });
  } else {
    results.push({ name: '桌面版 args', status: 'ok', detail: script });
  }

  const profilesDir = entry.env?.FORTUNE_PROFILES_DIR;
  if (typeof profilesDir === 'string') {
    results.push(
      fs.exists(profilesDir)
        ? { name: '桌面版 FORTUNE_PROFILES_DIR', status: 'ok', detail: profilesDir }
        : { name: '桌面版 FORTUNE_PROFILES_DIR', status: 'fail', detail: `目錄不存在：${profilesDir}` },
    );
  }
  return results;
}

const realFs: FsProbe = {
  exists: p => existsSync(p),
  which: cmd => Bun.which(cmd),
};

export function checkDesktopConfig(candidates: string[] = desktopConfigCandidates()): CheckResult[] {
  const found = candidates.filter(p => existsSync(p));
  if (found.length === 0) {
    return [{ name: '桌面版設定檔', status: 'warn', detail: `找不到 claude_desktop_config.json（找過：${candidates.join(delimiter) || '無'}）` }];
  }
  const withFortune: string[] = [];
  const results: CheckResult[] = [];
  for (const path of found) {
    let config: unknown;
    try {
      config = JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
      results.push({ name: '桌面版設定檔', status: 'fail', detail: `${path} 不是合法的 JSON：${(error as Error).message}` });
      continue;
    }
    if ((config as { mcpServers?: Record<string, unknown> })?.mcpServers?.fortune) withFortune.push(path);
    else if (found.length > 1) continue; // 另一份才有 fortune 時，這份不報錯
    results.push(...inspectDesktopConfig(config, realFs).map(r => ({ ...r, detail: `${r.detail}（${path}）` })));
  }
  if (found.length > 1 && withFortune.length === 0) {
    results.push({ name: '桌面版設定檔', status: 'fail', detail: `找到 ${found.length} 份設定檔，但都沒有 fortune：${found.join('、')}` });
  }
  return results;
}

// ─── 執行 ───────────────────────────────────────────────────────────────────

const ICON: Record<Status, string> = { ok: '✓', warn: '!', fail: '✗', skip: '-' };

export async function runDoctor(options: { ci: boolean }): Promise<{ results: CheckResult[]; failed: boolean }> {
  const results: CheckResult[] = [];
  results.push(...(await checkProfiles(defaultProfilesDir(), options.ci)));
  results.push(...(await checkMcpServer()));
  results.push(
    ...(options.ci
      ? [{ name: '桌面版設定檔', status: 'skip' as const, detail: 'CI 不檢查（只存在你的電腦上）' }]
      : checkDesktopConfig()),
  );
  return { results, failed: results.some(r => r.status === 'fail') };
}

if (import.meta.main) {
  const { results, failed } = await runDoctor({ ci: process.argv.includes('--ci') });
  for (const r of results) console.log(`${ICON[r.status]} ${r.name}：${r.detail}`);
  const count = (s: Status) => results.filter(r => r.status === s).length;
  console.log(`\n${count('ok')} 項正常、${count('warn')} 項警告、${count('fail')} 項失敗、${count('skip')} 項略過`);
  process.exit(failed ? 1 : 0);
}
