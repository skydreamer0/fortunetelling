import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCopyPrompt, COPY_PROMPT_VERSION } from '../src/copyPrompt';
import { CONVERSATION_PROMPT_VERSION, CONVERSATION_SYSTEM_INSTRUCTION, MCP_SERVER_INSTRUCTIONS } from '../src/instructions';
import { checkPastedAnswer } from '../src/pasteCheck';
import { REDACTED_NAME, REDACTED_PLACE } from '../src/core-pure';
import { buildInterpretationPayload, LOCAL_PAYLOAD_OPTIONS } from '../src/payload';
import { INTERPRET_PROMPT_VERSION, INTERPRET_SYSTEM_PROMPT } from '../src/prompts';
import { loadQuestion, loadReport } from './helpers';

describe('buildInterpretationPayload — redact / budget 可選（M3-02）', () => {
  const leaky = () => {
    const report = loadReport();
    report.signals![0] = { ...report.signals![0], evidence: { ...report.signals![0].evidence, text: '王小明 出生於 台北市大安區' } };
    return report;
  };

  test('預設行為不變：去識別化、有字數預算', () => {
    const { payload, payloadJson } = buildInterpretationPayload(leaky(), { maxChars: 10_000_000 });
    expect(payloadJson).not.toContain('王小明');
    expect(payload.truncation.maxChars).toBe(10_000_000);
  });

  test('redact: false 保留原文', () => {
    const { payloadJson } = buildInterpretationPayload(leaky(), { maxChars: 10_000_000, redact: false });
    expect(payloadJson).toContain('王小明 出生於 台北市大安區');
    expect(payloadJson).not.toContain(REDACTED_NAME);
    expect(payloadJson).not.toContain(REDACTED_PLACE);
  });

  test('budget: false 不丟訊號，truncation.maxChars 為 null', () => {
    const tight = buildInterpretationPayload(loadReport(), { question: loadQuestion(), maxChars: 3_000 });
    expect(tight.payload.truncation.signalsDropped).toBeGreaterThan(0);
    const free = buildInterpretationPayload(loadReport(), { question: loadQuestion(), maxChars: 3_000, budget: false });
    expect(free.payload.truncation.signalsDropped).toBe(0);
    expect(free.payload.truncation.maxChars).toBeNull();
    expect(free.payload.truncation.overBudget).toBe(false);
  });

  test('LOCAL_PAYLOAD_OPTIONS = 兩者皆關', () => {
    expect(LOCAL_PAYLOAD_OPTIONS).toEqual({ redact: false, budget: false });
  });
});

describe('進入點分流（M3-01）', () => {
  const src = (f: string) => readFileSync(join(import.meta.dir, '..', 'src', f), 'utf8');
  test('index.ts 與 mcp.ts 不匯出 client／anthropic', () => {
    for (const f of ['index.ts', 'mcp.ts']) {
      expect(src(f)).not.toMatch(/export[^\n]*from '\.\/(client|anthropic)'/);
    }
  });
  test('package.json 有獨立的 ./client 與 ./mcp 子路徑', () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dir, '..', 'package.json'), 'utf8'));
    expect(pkg.exports['./client']).toBe('./src/client.ts');
    expect(pkg.exports['./mcp']).toBe('./src/mcp.ts');
    expect(pkg.exports['.']).toBe('./src/index.ts');
  });
});

describe('對話助手與 MCP 指示（M3-04）', () => {
  test('MCP server instructions 500 字內，含必要守則', () => {
    const t = MCP_SERVER_INSTRUCTIONS;
    expect(t.length).toBeLessThanOrEqual(500);
    for (const kw of ['list_profiles', 'asOf', 'answer_question', 'get_signal', '〔sig_', '高共識', 'Jyotish', 'Human Design', '未校準', '沒有哪個月特別突出', 'systems', 'verifiedOnly', 'experimentalSensitivity.changed', '未驗證系統']) {
      expect(t).toContain(kw);
    }
  });
  test('完整指示以它開頭（同源），並涵蓋工具、矛盾、experimental', () => {
    const t = CONVERSATION_SYSTEM_INSTRUCTION;
    expect(t.startsWith(MCP_SERVER_INSTRUCTIONS)).toBe(true);
    for (const tool of ['list_conflicts', 'get_consensus', 'check_answer', 'compare_profiles']) expect(t).toContain(tool);
    for (const kw of ['矛盾', 'experimental', '至少 3 套', '這個範圍內沒有特別突出的月份']) expect(t).toContain(kw);
    expect(CONVERSATION_PROMPT_VERSION).toBe('chat-v2');
  });
  test('用詞為台灣用語', () => {
    for (const bad of ['数据', '默认', '导出', '代码', '默認', '導出']) expect(CONVERSATION_SYSTEM_INSTRUCTION).not.toContain(bad);
  });
});

describe('實驗性系統不計入高共識；低分帶不硬推薦（M3 追加）', () => {
  test('版本字串已升版', () => {
    expect(COPY_PROMPT_VERSION).toBe('copy-v3');
    expect(INTERPRET_PROMPT_VERSION).toBe('interpret-v2');
  });

  test('兩份 prompt 都有 experimental 規則與「沒有特別突出」規則', () => {
    const copy = buildCopyPrompt(loadReport(), { question: '哪幾個月適合買車？', questionAnswer: loadQuestion() }).text;
    for (const text of [copy, INTERPRET_SYSTEM_PROMPT]) {
      expect(text).toContain('已驗證');
      expect(text).toContain('experimental');
      expect(text).toContain('不計入');
      expect(text).toContain('這個範圍內沒有特別突出的月份');
      expect(text).toContain('不得硬推薦');
    }
    expect(copy).toContain('吠陀占星');
    expect(copy).toContain('尚未驗證');
  });

  test('貼回檢查：兩套已驗證 + 一套 experimental 的「高共識」會被標示', () => {
    const report = loadReport();
    const ids = new Map<string, string>();
    for (const s of report.signals ?? []) if (!ids.has(s.system)) ids.set(s.system, s.id);
    const pick = [...ids.entries()].filter(([sys]) => sys !== 'jyotish' && sys !== 'humanDesign').slice(0, 2);
    expect(pick.length).toBe(2);
    const fake = report.signals!.map((s) => ({ ...s }));
    const target = fake.find((s) => s.id === [...ids.values()].find((id) => !pick.some(([, p]) => p === id))!)!;
    target.system = 'jyotish' as typeof target.system;
    const text = `這個領域屬高共識 ${pick.map(([, id]) => `〔${id}〕`).join('')}〔${target.id}〕`;
    const check = checkPastedAnswer({ ...report, signals: fake }, text);
    expect(check.paragraphs[0].flags.map((f) => f.code)).toContain('high_consensus_unsupported');
  });
});
