import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { join } from 'node:path';
import { MCP_SERVER_INSTRUCTIONS } from '@fortune/ai/mcp';
import { createProfileFile, serializeProfileFile } from '@fortune/core';
import { makeFixture, SAMPLE_PROFILE } from './helpers';

const EXPECTED_TOOLS = [
  'list_profiles', 'get_profile',
  'get_chart', 'get_time_context',
  'list_signals', 'get_signal', 'get_timeline', 'get_consensus', 'list_conflicts',
  'answer_question', 'list_question_categories', 'compare_profiles',
  'check_answer', 'import_profile',
];

let fx: Awaited<ReturnType<typeof makeFixture>>;
let client: Client;

beforeAll(async () => {
  fx = await makeFixture();
  client = new Client({ name: 'e2e', version: '0.0.0' });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ['run', join(import.meta.dir, '../src/bin.ts')],
      env: { ...(process.env as Record<string, string>), FORTUNE_PROFILES_DIR: fx.dir },
    }),
  );
});
afterAll(async () => {
  await client.close();
  await fx.cleanup();
});

const textOf = (result: any): string => result.content[0].text;

describe('stdio server (what Claude Desktop actually talks to)', () => {
  test('exposes every planned tool', async () => {
    const { tools } = await client.listTools();
    expect(tools.map(t => t.name).sort()).toEqual([...EXPECTED_TOOLS].sort());
    expect(tools.every(t => t.description && t.description.length > 20)).toBe(true);
  });

  test('list_profiles over the wire', async () => {
    const json = JSON.parse(textOf(await client.callTool({ name: 'list_profiles', arguments: {} })));
    expect(json.data.profiles.map((p: any) => p.profileId)).toEqual(['sky']);
    // list_profiles is the entry point that carries the full version block
    expect(json.versions.coreVersion).toBeTruthy();
    expect(json.versionsHash).toMatch(/^[0-9a-f]{12}$/);
  });

  test('acceptance: 2027 vehicle purchase → answer_question → cited signals exist', async () => {
    const answer = JSON.parse(textOf(await client.callTool({
      name: 'answer_question',
      arguments: { profileId: 'sky', category: 'vehicle_purchase', range: { start: '2027-01', end: '2027-12' }, asOf: '2026-09-30' },
    })));
    expect(answer.asOf).toBe('2026-09-30');
    expect(answer.versions).toBeUndefined();
    expect(answer.versionsHash).toMatch(/^[0-9a-f]{12}$/);
    expect(answer.caveats.some((c: any) => c.code === 'scores_uncalibrated')).toBe(true);
    const top = answer.data.top ?? answer.data.answer?.top;
    expect(top.length).toBeGreaterThan(0);

    // every signal id the answer cites must be fetchable
    const cited = [...new Set(JSON.stringify(top).match(/sig_[0-9a-f]+/g) ?? [])];
    for (const id of cited.slice(0, 5)) {
      const signal = JSON.parse(textOf(await client.callTool({
        name: 'get_signal', arguments: { profileId: 'sky', asOf: '2026-09-30', signalId: id },
      })));
      expect(signal.error).toBeUndefined();
      expect(signal.data.id ?? signal.data.signal?.id).toBe(id);
    }
  }, 60_000);

  test('server 連線時送出使用守則（instructions，500 字內）', async () => {
    const text = client.getInstructions();
    expect(text).toBe(MCP_SERVER_INSTRUCTIONS);
    expect(text!.length).toBeLessThanOrEqual(500);
    expect(text).toContain('list_profiles');
  });

  test('check_answer over the wire：引用真實 id 通過、假 id 被標出', async () => {
    const list = JSON.parse(textOf(await client.callTool({
      name: 'list_signals', arguments: { profileId: 'sky', asOf: '2026-09-30', limit: 1 },
    })));
    const id = list.data.signals[0].id;
    const good = JSON.parse(textOf(await client.callTool({
      name: 'check_answer', arguments: { profileId: 'sky', asOf: '2026-09-30', answerText: `這段時期傾向有支撐〔${id}〕。` },
    })));
    expect(good.data.ok).toBe(true);
    const bad = JSON.parse(textOf(await client.callTool({
      name: 'check_answer', arguments: { profileId: 'sky', asOf: '2026-09-30', answerText: '一定會成功〔sig_fake0000〕。' },
    })));
    expect(bad.data.unknownCitations).toEqual(['sig_fake0000']);
    expect(bad.data.issues.map((i: any) => i.code).sort()).toEqual(['honesty_violation', 'unknown_citation']);
  }, 60_000);

  test('import_profile over the wire：匯入後 get_profile 查得到，重複匯入被拒', async () => {
    const content = serializeProfileFile(createProfileFile('wire', SAMPLE_PROFILE));
    const imported = JSON.parse(textOf(await client.callTool({ name: 'import_profile', arguments: { content } })));
    expect(imported.data).toMatchObject({ profileId: 'wire', overwritten: false });
    const got = JSON.parse(textOf(await client.callTool({ name: 'get_profile', arguments: { profileId: 'wire' } })));
    expect(got.data.profileId).toBe('wire');
    const again: any = await client.callTool({ name: 'import_profile', arguments: { content } });
    expect(again.isError).toBe(true);
    expect(JSON.parse(textOf(again)).error.code).toBe('profile_exists');
  });

  test('errors come back as isError with a structured body', async () => {
    const result: any = await client.callTool({ name: 'get_profile', arguments: { profileId: 'ghost' } });
    expect(result.isError).toBe(true);
    expect(JSON.parse(textOf(result)).error.code).toBe('profile_not_found');
  });
});
