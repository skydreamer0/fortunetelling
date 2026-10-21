import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { join } from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { MCP_SERVER_INSTRUCTIONS } from '@fortune/ai/mcp';
import { createProfileFile, serializeProfileFile } from '@fortune/core';
import { makeFixture, SAMPLE_PROFILE } from './helpers';

const EXPECTED_TOOLS = [
  'list_profiles', 'get_profile',
  'get_chart', 'get_time_context', 'compare_bazi_conventions',
  'list_signals', 'get_signal', 'get_timeline', 'get_consensus', 'list_conflicts',
  'answer_question', 'answer_question_v4', 'list_question_categories', 'compare_profiles',
  'check_answer', 'check_answer_v4', 'import_profile', 'batch',
];

let fx: Awaited<ReturnType<typeof makeFixture>>;
let client: Client;

beforeAll(async () => {
  fx = await makeFixture();
  client = new Client({ name: 'e2e', version: '0.0.0' });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [join(import.meta.dirname, '../dist/bin.js')],
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
      arguments: { profileId: 'sky', category: 'vehicle_purchase', range: { start: '2027-01', end: '2027-12' }, asOf: '2026-09-30', detail: true },
    })));
    expect(answer.asOf).toBe('2026-09-30');
    expect(answer.versions).toBeUndefined();
    expect(answer.versionsHash).toMatch(/^[0-9a-f]{12}$/);
    expect(answer.caveats.some((c: any) => c.code === 'scores_uncalibrated')).toBe(true);
    const top = answer.data.top ?? answer.data.answer?.top;
    expect(top).toEqual([]);
    expect(answer.data.status).toBe('no_clear_advantage');

    // every signal id the answer cites must be fetchable
    const cited = [...new Set(JSON.stringify(answer.data.ranking).match(/sig_[0-9a-f]+/g) ?? [])];
    // 輸出一律是短編號（sig_ + 8 位）；碰撞才會是完整編號（此範例不碰撞）
    expect(cited.length).toBeGreaterThan(0);
    for (const id of cited) expect(id).toMatch(/^sig_[0-9a-f]{8}$/);
    for (const id of cited.slice(0, 5)) {
      const signal = JSON.parse(textOf(await client.callTool({
        name: 'get_signal', arguments: { profileId: 'sky', asOf: '2026-09-30', signalId: id },
      })));
      expect(signal.error).toBeUndefined();
      expect(signal.data.shortId).toBe(id);
      expect(signal.data.signal.id.startsWith(id)).toBe(true);
      expect(signal.data.signal.id).toMatch(/^sig_[0-9a-f]{16}$/);
    }
  }, 60_000);

  test('answer_question over the wire：精簡回應 < 4 KB、verifiedOnly、敏感度、未知系統', async () => {
    const args = { profileId: 'sky', category: 'vehicle_purchase', range: { start: '2027-01', end: '2027-12' }, asOf: '2026-09-30' };
    const raw = textOf(await client.callTool({ name: 'answer_question', arguments: args }));
    expect(Buffer.byteLength(raw, 'utf8')).toBeLessThan(4096);
    const all = JSON.parse(raw);
    expect(all.data.experimentalIncluded).toBe(true);
    expect(all.data.experimentalSensitivity).toBeNull();
    expect(all.data.status).toBe('no_clear_advantage');
    const verified = JSON.parse(textOf(await client.callTool({ name: 'answer_question', arguments: { ...args, verifiedOnly: true } })));
    expect(verified.data.systemsUsed).toEqual(['bazi', 'ziwei', 'numerology', 'humanDesign']);
    expect(verified.data.experimentalIncluded).toBe(false);
    for (const id of verified.data.top.flatMap((t: any) => t.signalIds)) {
      const sig = JSON.parse(textOf(await client.callTool({ name: 'get_signal', arguments: { profileId: 'sky', asOf: '2026-09-30', signalId: id } })));
      expect(sig.data.shortId).toBe(id);
    }
    const bad: any = await client.callTool({ name: 'answer_question', arguments: { ...args, systems: ['astrology'] } });
    expect(bad.isError).toBe(true);
    expect(JSON.parse(textOf(bad)).error.details.availableSystems).toContain('bazi');
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
      name: 'check_answer', arguments: { profileId: 'sky', asOf: '2026-09-30', answerText: '一定會成功〔sig_deadbeef〕。' },
    })));
    expect(bad.data.unknownCitations).toEqual(['sig_deadbeef']);
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

// Separate store/client: these fixtures cannot change the original list_profiles contract.
// This is compiled-server protocol acceptance, not a real Claude Desktop session.
describe('compiled Node stdio BaZi convention comparison', () => {
  let comparisonFx: Awaited<ReturnType<typeof makeFixture>>;
  let comparisonClient: Client;
  const late = { useTrueSolarTime: false, ziHourConvention: 'late' };
  const early = { useTrueSolarTime: false, ziHourConvention: 'early' };
  const args = { profileId: 'synthetic-boundary', asOf: '2026-10-15', left: late, right: early };
  const readStore = async () => {
    const names = (await readdir(comparisonFx.dir)).sort();
    return Promise.all(names.map(async name => [name, await readFile(join(comparisonFx.dir, name), 'utf8')]));
  };
  let initialStore: Awaited<ReturnType<typeof readStore>>;
  beforeAll(async () => {
    comparisonFx = await makeFixture({
      'synthetic-boundary': { ...SAMPLE_PROFILE, name: 'SYNTHETIC ONLY', time: '23:10' },
      'synthetic-unknown': { ...SAMPLE_PROFILE, name: 'SYNTHETIC ONLY', time: null, timeAccuracy: 'unknown' },
    });
    initialStore = await readStore();
    comparisonClient = new Client({ name: 'comparison-stdio-acceptance', version: '0.0.0' });
    await comparisonClient.connect(new StdioClientTransport({
      command: process.execPath,
      args: [join(import.meta.dirname, '../dist/bin.js')],
      env: { ...(process.env as Record<string, string>), ANTHROPIC_API_KEY: '', FORTUNE_PROFILES_DIR: comparisonFx.dir },
    }));
  });
  afterAll(async () => {
    try { await comparisonClient?.close(); }
    finally { await comparisonFx?.cleanup(); }
  });
  const compare = async (patch: Record<string, unknown> = {}) => {
    const result = await comparisonClient.callTool({ name: 'compare_bazi_conventions', arguments: { ...args, ...patch } });
    const text = textOf(result);
    return { result, text, json: JSON.parse(text) };
  };

  test('early/late boundary returns differences, effective options, versions and caveats over stdio', async () => {
    const { result, text, json } = await compare();
    expect(result.isError).not.toBe(true);
    expect(json.data.available).toBe(true);
    expect(json.asOf).toBe(args.asOf);
    expect(json.data.changedOptions).toEqual(['ziHourConvention']);
    expect(json.data.left.effectiveOptions).toMatchObject(late);
    expect(json.data.right.effectiveOptions).toMatchObject(early);
    expect(json.data.left.natal.pillars.day).not.toBe(json.data.right.natal.pillars.day);
    expect(json.data.differences.map((difference: any) => difference.field)).toContain('pillars');
    for (const difference of json.data.differences) {
      expect(difference.left).toEqual(json.data.left.natal[difference.field]);
      expect(difference.right).toEqual(json.data.right.natal[difference.field]);
    }
    expect(json.versions.coreVersion).toBeTruthy();
    expect(json.versions.calculators.bazi).toBe(json.data.left.calculatorVersion);
    expect(json.versions.ephemeris).toBe('not_initialized');
    expect(json.versionsHash).toMatch(/^[0-9a-f]{12}$/);
    expect(json.caveats.map((caveat: any) => caveat.code)).toContain('comparison_scope');
    expect(json.caveats.map((caveat: any) => caveat.code)).toContain('time:zi_hour_convention');
    for (const privateField of ['SYNTHETIC ONLY', SAMPLE_PROFILE.date, '23:10', SAMPLE_PROFILE.birthplace.label!])
      expect(text).not.toContain(privateField);
  });

  test('same settings preserve deterministic equality without losing scope warnings', async () => {
    const first = await compare({ right: late });
    const second = await compare({ right: late });
    expect(first.result.isError).not.toBe(true);
    expect(first.text).toBe(second.text);
    expect(first.json.data.available).toBe(true);
    expect(first.json.data.changedOptions).toEqual([]);
    expect(first.json.data.differences).toEqual([]);
    expect(first.json.data.unchangedFields).toEqual(['pillars', 'dayMaster', 'fiveElements', 'tenGods']);
    expect(first.json.caveats.map((caveat: any) => caveat.code)).toContain('comparison_scope');
  });

  test('unknown time remains unavailable rather than equal, with full version metadata', async () => {
    const { result, json } = await compare({ profileId: 'synthetic-unknown' });
    expect(result.isError).not.toBe(true);
    expect(json.data.available).toBe(false);
    expect(json.data.reason).toBe('time_unknown');
    expect(json.data.left).toBeUndefined();
    expect(json.data.differences).toBeUndefined();
    expect(json.versions.coreVersion).toBeTruthy();
    expect(json.caveats.map((caveat: any) => caveat.code)).toContain('time:time_unknown');
  });

  test.each([
    { asOf: '2026-02-30' },
    { left: { ...late, schoolPack: 'unsupported' } },
  ])('rejects invalid comparison input over stdio: %j', async patch => {
    const result = await comparisonClient.callTool({ name: 'compare_bazi_conventions', arguments: { ...args, ...patch } });
    expect(result.isError).toBe(true);
    // SDK schema validation precedes our handler and returns a protocol error text, not its JSON envelope.
    expect(textOf(result)).toContain('MCP error -32602: Input validation error: Invalid arguments for tool compare_bazi_conventions');
    expect(textOf(result)).not.toContain('\"available\":true');
  });

  test('a missing profile returns the handler structured error over stdio', async () => {
    const { result, json } = await compare({ profileId: 'absent-synthetic' });
    expect(result.isError).toBe(true);
    expect(json.error.code).toBe('profile_not_found');
    expect(json.data).toBeUndefined();
  });

  test('comparison calls leave every profile filename and byte unchanged', async () => {
    await compare();
    await compare({ right: late });
    await compare({ profileId: 'synthetic-unknown' });
    expect(await readStore()).toEqual(initialStore);
  });
});
