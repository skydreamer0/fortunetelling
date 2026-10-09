import { describe, expect, test } from 'bun:test';
import { PROFILE_ID_RE, isValidProfileId, parseProfileFile } from '@fortune/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { McpEntry, mcpConfigSnippet } from '../src/components/report/McpEntry';
import { analyze } from '../src/lib/core';
import { LIFE_EVENTS_STORE_KEY, createLifeEventStore, legacyProfileKeyOf, profileKeyOf } from '../src/lib/lifeEvents';
import { buildProfileDownload, fingerprintOfReport, profileIdError, profileOfReport } from '../src/lib/profileFile';
import type { BirthInput, Report } from '../src/model/types';

const INPUT: BirthInput = {
  name: '王小明', year: 1995, month: 7, day: 16, hour: 22, minute: 0, timeKnown: true,
  gender: 'male', calendarType: 'solar', cityId: 'tainan', timeAccuracy: 'exact',
};
const report: Report = analyze(INPUT);

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
}

describe('profileId validation (same rule as MCP add-profile)', () => {
  test('accepts lowercase letters, digits, - and _, up to 32 chars', () => {
    for (const id of ['sky', 'a', '0', 'mom-2', 'a_b', 'x'.repeat(32)]) {
      expect({ id, error: profileIdError(id) }).toEqual({ id, error: null });
      expect(isValidProfileId(id)).toBe(true);
    }
  });

  test('rejects empty, too long, uppercase, spaces, leading symbol, non-ASCII, path characters', () => {
    for (const id of ['', 'x'.repeat(33), 'Sky', 'a b', '-a', '_a', '小明', '../x', 'a/b', 'a.b', 'a\\b']) {
      expect({ id, bad: profileIdError(id) !== null }).toEqual({ id, bad: true });
      expect(isValidProfileId(id)).toBe(false);
    }
  });

  test('the web rule never disagrees with core PROFILE_ID_RE', () => {
    for (const id of ['sky', 'Sky', '', 'a-b_c', '1abc', '-x', 'x'.repeat(32), 'x'.repeat(33), 'a b']) {
      expect(profileIdError(id) === null).toBe(PROFILE_ID_RE.test(id));
    }
  });
});

describe('.fortune.json download', () => {
  test('produces <profileId>.fortune.json that core and the MCP can parse back', () => {
    const result = buildProfileDownload(report, 'sky');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.filename).toBe('sky.fortune.json');
    expect(result.text.endsWith('\n')).toBe(true);
    const parsed = parseProfileFile(result.text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.warnings).toEqual([]);
    expect(parsed.file.profileId).toBe('sky');
    expect(parsed.file.chartFingerprint).toBe(result.chartFingerprint);
    expect(parsed.file.profile).toMatchObject({
      date: '1995-07-16', time: '22:00', timeAccuracy: 'exact', gender: 'male', name: '王小明',
      birthplace: { timezone: 'Asia/Taipei' },
    });
  });

  test('bit-stable: a separately generated report (different generatedAt) gives identical text', () => {
    const a = buildProfileDownload(report, 'sky');
    const b = buildProfileDownload(analyze(INPUT), 'sky');
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(b.text).toBe(a.text);
  });

  test('renaming a person keeps the chartFingerprint; changing the birth day changes it', () => {
    const renamed = analyze({ ...INPUT, name: '別名' });
    expect(fingerprintOfReport(renamed)).toBe(fingerprintOfReport(report));
    expect(fingerprintOfReport(analyze({ ...INPUT, day: 17 }))).not.toBe(fingerprintOfReport(report));
  });

  test('time unknown → time null, accuracy unknown', () => {
    const unknown = analyze({ ...INPUT, timeKnown: false, timeAccuracy: 'unknown' });
    expect(profileOfReport(unknown)).toMatchObject({ time: null, timeAccuracy: 'unknown' });
    expect(buildProfileDownload(unknown, 'sky').ok).toBe(true);
  });

  test('a v3 report without timeContext is rebuilt from its input', () => {
    const { timeContext: _t, ...rest } = report;
    const v3 = { ...rest, schemaVersion: 3 } as Report;
    const result = buildProfileDownload(v3, 'old');
    expect(result.ok).toBe(true);
    expect(profileOfReport(v3)).toMatchObject({ date: '1995-07-16', time: '22:00', birthplace: { timezone: 'Asia/Taipei' } });
  });

  test('invalid profileId → no file, with a message', () => {
    const result = buildProfileDownload(report, 'Bad Id');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('小寫');
  });
});

describe('MCP config snippet', () => {
  test('is valid JSON for both systems; Windows backslashes are escaped', () => {
    for (const os of ['windows', 'mac'] as const) {
      const parsed = JSON.parse(mcpConfigSnippet(os));
      expect(parsed.mcpServers.fortune.command).toBe('bun');
      expect(parsed.mcpServers.fortune.args[0]).toBe('run');
    }
    const windows = mcpConfigSnippet('windows');
    expect(windows).toContain('C:\\\\Users\\\\你\\\\fortunetelling\\\\packages\\\\mcp\\\\src\\\\bin.ts');
    expect(windows).not.toMatch(/[^\\]\\[^\\]/);
    expect(mcpConfigSnippet('mac')).toContain('/Users/你/.fortune/profiles');
  });
});

describe('Claude desktop entry', () => {
  test('explains that local MCP tool results still enter the AI conversation', () => {
    const html = renderToStaticMarkup(<McpEntry report={report} onDownload={() => {}} />);
    const privacy = html.match(/<p class="ask__privacy" role="note">([\s\S]*?)<\/p>/)?.[1];
    expect(privacy).toBeDefined();
    expect(privacy).toContain('MCP 工具回傳的資料會進入 Claude 的 AI 對話上下文');
    expect(privacy).toContain('get_profile');
    expect(privacy).toContain('預設不回姓名與原始出生欄位');
    expect(privacy).toContain('其他工具仍可能回傳可識別資訊');
    expect(privacy).toContain('get_time_context');
    expect(privacy).toContain('日期與時間');
    expect(privacy).toContain('檔案全文貼給 AI');
    expect(privacy).toContain('確認內容與接收對象');
    expect(privacy).not.toContain('只會存在你自己的電腦');
    expect(privacy).not.toContain('本機 MCP 預設不會把姓名與出生資料交給 Claude');
    expect(privacy).not.toContain(INPUT.name);
  });

  test('lists both config paths, the Store-version warning, and the profiles directory', () => {
    const html = renderToStaticMarkup(<McpEntry report={report} onDownload={() => {}} />);
    expect(html).toContain('用 Claude 桌面版討論');
    expect(html).toContain('%APPDATA%\\Claude\\claude_desktop_config.json');
    expect(html).toContain('%LOCALAPPDATA%\\Packages\\Claude_*\\LocalCache\\Roaming\\Claude\\claude_desktop_config.json');
    expect(html).toContain('Microsoft Store');
    expect(html).toContain('~/.fortune/profiles/');
    expect(html).toContain('下載 .fortune.json');
    expect(html).toContain('disabled');
    expect(html).not.toContain('王小明');
  });
});

describe('life event key migration (name-based key → chartFingerprint)', () => {
  const events = [
    { id: 'a', date: '2018-06', category: 'education', domains: ['career'], confidence: 'approx' },
    { id: 'b', date: '2022-06', category: 'job_change', domains: ['career'], description: '轉職', confidence: 'certain' },
  ] as never[];
  const legacy = legacyProfileKeyOf(report.input);
  const key = profileKeyOf(report);

  test('legacy key still depends on the name; the new key does not', () => {
    expect(legacy).toMatch(/^p[0-9a-z]+$/);
    expect(legacyProfileKeyOf(analyze({ ...INPUT, name: '別名' }).input)).not.toBe(legacy);
    expect(profileKeyOf(analyze({ ...INPUT, name: '別名' }))).toBe(key);
    expect(key).not.toBe(legacy);
  });

  test('old data moves to the new key, nothing lost, old key removed from localStorage', () => {
    const storage = memoryStorage();
    storage.setItem(LIFE_EVENTS_STORE_KEY, JSON.stringify({ version: 1, profiles: { [legacy]: { events }, other: { events: [events[0]] } } }));
    const store = createLifeEventStore(storage);
    expect(store.list(key)).toEqual([]);
    expect(store.migrate(legacy, key)).toBe(true);
    expect(store.list(key).map(event => event.id)).toEqual(['a', 'b']);
    expect(store.list(key)[1].description).toBe('轉職');
    const raw = JSON.parse(storage.data.get(LIFE_EVENTS_STORE_KEY)!);
    expect(Object.keys(raw.profiles).sort()).toEqual([key, 'other'].sort());
    expect(raw.profiles.other.events).toHaveLength(1); // other people untouched
    expect(store.migrate(legacy, key)).toBe(false); // idempotent
    expect(store.list(key)).toHaveLength(2);
  });

  test('merges with events already under the new key; the new key wins on a same-id clash', () => {
    const storage = memoryStorage();
    const store = createLifeEventStore(storage);
    store.upsert(key, { id: 'b', date: '2022-06', category: 'job_change', domains: ['career'], description: '新版', confidence: 'certain' } as never);
    store.upsert(key, { id: 'c', date: '2024-01', category: 'relocation', domains: ['movement'], confidence: 'certain' } as never);
    store.upsert(legacy, events[0]);
    store.upsert(legacy, events[1]);
    expect(store.migrate(legacy, key)).toBe(true);
    const merged = store.list(key);
    expect(merged.map(event => event.id)).toEqual(['a', 'b', 'c']);
    expect(merged.find(event => event.id === 'b')?.description).toBe('新版');
    expect(store.list(legacy)).toEqual([]);
  });

  test('no legacy data, same key, or broken storage → no change and no throw', () => {
    const store = createLifeEventStore(memoryStorage());
    expect(store.migrate(legacy, key)).toBe(false);
    expect(store.migrate(key, key)).toBe(false);
    const broken = memoryStorage();
    broken.setItem(LIFE_EVENTS_STORE_KEY, '{not json');
    expect(createLifeEventStore(broken).migrate(legacy, key)).toBe(false);
    expect(createLifeEventStore(undefined).migrate(legacy, key)).toBe(false);
  });
});
