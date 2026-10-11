import { expect, test } from 'bun:test';
import { HonestyGuard, type HonestyReportInput } from '../src/analysis/HonestyGuard';
import type { Report } from '../src/core/analyze';

type Input = NonNullable<Parameters<typeof HonestyGuard.auditReport>[0]>;
type Accept<T extends true> = T;
type Reject<T extends false> = T;
type IsAny<T> = 0 extends (1 & T) ? true : false;
type State = NonNullable<Input['stateTable']>;
type Scenario = NonNullable<NonNullable<State['scenarios']>[number]>;
type Cell = NonNullable<NonNullable<Scenario['cells']>[number]>;
type Evolution = NonNullable<Input['evolution']>;
type Period = NonNullable<NonNullable<Evolution['periods']>[number]>;
type Insights = NonNullable<Input['insights']>;
type Domain = NonNullable<NonNullable<Insights['domains']>[number]>;
type Theme = NonNullable<NonNullable<NonNullable<Insights['annual']>['themes']>[number]>;
type Balance = NonNullable<NonNullable<Insights['guidance']>['balance']>;
type Signal = NonNullable<NonNullable<Input['signals']>[number]>;
type Evidence = NonNullable<Signal['evidence']>;
type Modifier = NonNullable<NonNullable<Evidence['modifiers']>[number]>;
type Flag = NonNullable<NonNullable<NonNullable<Input['timeContext']>['flags']>[number]>;
export type Contract = [
  Accept<Report extends Input ? true : false>,
  Accept<HonestyReportInput extends Input ? true : false>,
  Accept<{} extends Input ? true : false>,
  Accept<{ stateTable: null; evolution: undefined; insights: null; signals: null; timeContext: null } extends Input ? true : false>,
  Accept<{ cells: readonly [null, undefined, { expression: null }] } extends Scenario ? true : false>,
  Accept<{ summary: readonly ['你是', null, undefined] } extends Period ? true : false>,
  Accept<{ summary: string } extends Period ? true : false>,
  Reject<IsAny<Input>>, Reject<IsAny<Cell['expression']>>,
  Reject<IsAny<Evidence['text']>>, Reject<IsAny<Modifier['reason']>>,
  Reject<{ stateTable: number } extends Input ? true : false>,
  Reject<{ scenarios: string } extends State ? true : false>,
  Reject<{ cells: boolean } extends Scenario ? true : false>,
  Reject<{ expression: number } extends Cell ? true : false>,
  Reject<{ periods: string } extends Evolution ? true : false>,
  Reject<{ summary: number[] } extends Period ? true : false>,
  Reject<{ narrative: boolean } extends Evolution ? true : false>,
  Reject<{ insight: number } extends Domain ? true : false>,
  Reject<{ stage: object } extends Domain ? true : false>,
  Reject<{ text: boolean } extends Theme ? true : false>,
  Reject<{ text: number } extends Balance ? true : false>,
  Reject<{ signals: string } extends Input ? true : false>,
  Reject<{ window: { grain: number } } extends Signal ? true : false>,
  Reject<{ text: number } extends Evidence ? true : false>,
  Reject<{ modifiers: number } extends Evidence ? true : false>,
  Reject<{ reason: boolean } extends Modifier ? true : false>,
  Reject<{ detail: number } extends Flag ? true : false>,
];

// Frozen, unmodified source from master b26ec306fe2ac6a487234dbcd5d70d14255480ab.
const BASE_SOURCE = "import type { LayerCode } from './LayerClassifier';\n/**\n * @fileoverview HonestyGuard（區塊 H④）— 動靜誠實的語言守門員。\n *\n * 依 L0–L3 分層語言規則檢查產出文字：\n *   L0 恆定結構層 允許最強斷言（「你是…」）；\n *   L1/L2/L3 時間與情境層禁止定性斷言（「你是」「你天生」「注定」「永遠」等），\n *   只能用「這段時期你會偏向…」「在某情境下你會…」等弱斷言語氣。\n *\n * 兩個入口：\n *   - `HonestyGuard.lint(text, layerCode)`：單段文字檢查，供 StateSwitchTable（D2）\n *     與 EvolutionCalculator（D4）在產文當下自檢。\n *   - `HonestyGuard.auditReport(report)`：整份 Report 稽核，掃描\n *     `stateTable.scenarios[].cells[].expression`、`evolution.periods[].summary`、\n *     `evolution.narrative`，產出 `Violation[]`（形狀見 ARCHITECTURE.md §4.2）。\n *\n * 純函數、無依賴（analysis 層不得 import engines 或命理函式庫，D-016）。\n *\n * @module analysis/HonestyGuard\n */\n\n// ─── Type Definitions ───────────────────────────────────────────────────────\n\n/**\n * 定性斷言模式：在 `layers` 所列分層中出現即違規。\n */\nexport interface QualitativePattern {\n  /** 模式識別碼（穩定，供測試與擴充引用） */\n  id: string;\n  /** 比對規則（不帶 g flag，無狀態） */\n  pattern: RegExp;\n  /** 適用（＝禁止出現）的分層 */\n  layers: LayerCode[];\n  /** 違規說明模板；`{layer}` 會被實際分層代入 */\n  problem: string;\n}\n\n/**\n * Violation — honesty.violations 元素（ARCHITECTURE.md §4.2，四欄不可增減）。\n */\nexport interface Violation {\n  /** 違規文字所屬分層 */\n  layer: LayerCode;\n  /** 出處（如 'stateTable.scenarios[2].cells[0]'） */\n  location: string;\n  /** 違規原文 */\n  text: string;\n  /** 例如 'L2 內容使用了「你是」定性語氣' */\n  problem: string;\n}\n\nexport interface LintResult {\n  /** true = 無違規 */\n  ok: boolean;\n  /** 每個命中模式一則說明 */\n  problems: string[];\n}\n\n// ─── Pattern Registry ───────────────────────────────────────────────────────\n\n/** 時間與情境層（禁止定性斷言的分層）。 */\nconst TEMPORAL_LAYERS: LayerCode[] = ['L1', 'L2', 'L3'];\n\n/**\n * 定性斷言模式表（可擴充：push 新項即可，`lint`/`auditReport` 都會讀取）。\n * L0 為恆定結構層，「你是」屬合法語氣，故所有模式僅適用 L1/L2/L3。\n */\nexport const QUALITATIVE_PATTERNS: QualitativePattern[] = [\n  {\n    id: 'ni-shi',\n    pattern: /你是/,\n    layers: TEMPORAL_LAYERS,\n    problem: '{layer} 內容使用了「你是」定性語氣',\n  },\n  {\n    id: 'ni-tian-sheng',\n    pattern: /你天生/,\n    layers: TEMPORAL_LAYERS,\n    problem: '{layer} 內容使用了「你天生」定性語氣',\n  },\n  {\n    id: 'zhu-ding',\n    pattern: /注定/,\n    layers: TEMPORAL_LAYERS,\n    problem: '{layer} 內容使用了「注定」宿命斷言',\n  },\n  {\n    id: 'yong-yuan',\n    pattern: /永遠/,\n    layers: TEMPORAL_LAYERS,\n    problem: '{layer} 內容使用了「永遠」絕對化語氣',\n  },\n  {\n    id: 'jue-dui',\n    pattern: /絕對/,\n    layers: TEMPORAL_LAYERS,\n    problem: '{layer} 內容使用了「絕對」絕對化語氣',\n  },\n  {\n    id: 'yi-ding-hui',\n    pattern: /一定會/,\n    layers: TEMPORAL_LAYERS,\n    problem: '{layer} 內容使用了「一定會」絕對化語氣',\n  },\n  {\n    id: 'cong-bu',\n    pattern: /從不/,\n    layers: TEMPORAL_LAYERS,\n    problem: '{layer} 內容使用了「從不」絕對化語氣',\n  },\n];\n\n// ─── HonestyGuard ───────────────────────────────────────────────────────────\n\n/**\n * 語言守門員。全部為靜態純函數，無內部狀態。\n */\nexport class HonestyGuard {\n  /**\n   * 檢查一段文字在指定分層下是否含定性斷言。\n   *\n   * @param text - 待檢文字（非字串或空字串視為無違規）\n   * @param layerCode - 文字所屬分層\n   */\n  static lint(text: unknown, layerCode: LayerCode): LintResult {\n    const problems: string[] = [];\n    if (typeof text === 'string' && text.length > 0) {\n      for (const { pattern, layers, problem } of QUALITATIVE_PATTERNS) {\n        if (layers.includes(layerCode) && pattern.test(text)) {\n          problems.push(problem.replace('{layer}', layerCode));\n        }\n      }\n    }\n    return { ok: problems.length === 0, problems };\n  }\n\n  /**\n   * 稽核整份 Report 中狀態、演化與使用者問題視圖的產文欄位。\n   * 空殼 Report（scenarios/periods 為空、narrative 為空字串）回傳 `[]`。\n   *\n   * 掃描範圍與各自分層：\n   *   - `stateTable.scenarios[].cells[].expression` → L3（情境語氣）\n   *   - `evolution.periods[].summary`（兩行摘要，逐行檢查）→ L1\n   *   - `evolution.narrative` → L1\n   *   - `insights.*` 敘事 → L1／L2／L3\n   *   - v4：`signals[].evidence.text` 與 `modifiers[].reason` → 依 window.grain（natal L0、decade L1、year/month L2）\n   *   - v4：`timeContext.flags[].detail` → L2\n   *\n   * @param report - `analyze()` 產出的 Report（或同形狀物件）\n   */\n  static auditReport(report: Record<string, any>): Violation[] {\n    const violations: Violation[] = [];\n    if (!report || typeof report !== 'object') return violations;\n\n    const check = (text: any, layer: LayerCode, location: string) => {\n      const { ok, problems } = HonestyGuard.lint(text, layer);\n      if (ok) return;\n      for (const problem of problems) {\n        violations.push({ layer, location, text, problem });\n      }\n    };\n\n    const scenarios = report.stateTable?.scenarios ?? [];\n    scenarios.forEach((scenario: any, si: number) => {\n      (scenario?.cells ?? []).forEach((cell: any, ci: number) => {\n        check(cell?.expression, 'L3', `stateTable.scenarios[${si}].cells[${ci}]`);\n      });\n    });\n\n    const periods = report.evolution?.periods ?? [];\n    periods.forEach((period: any, pi: number) => {\n      const summary = period?.summary;\n      const lines = Array.isArray(summary) ? summary : summary != null ? [summary] : [];\n      lines.forEach((line: unknown, li: number) => {\n        check(line, 'L1', `evolution.periods[${pi}].summary[${li}]`);\n      });\n    });\n\n    check(report.evolution?.narrative, 'L1', 'evolution.narrative');\n\n    (report.insights?.domains ?? []).forEach((domain: any, index: number) => {\n      check(domain?.insight, 'L3', `insights.domains[${index}].insight`);\n      check(domain?.stage, 'L1', `insights.domains[${index}].stage`);\n    });\n    (report.insights?.annual?.themes ?? []).forEach((theme: any, index: number) => {\n      check(theme?.text, 'L2', `insights.annual.themes[${index}].text`);\n    });\n    check(report.insights?.guidance?.balance?.text, 'L3', 'insights.guidance.balance.text');\n\n    // ── Report v4（D-032）：訊號證據文字與時間旗標說明 ──\n    // 訊號依 window.grain 分層：natal→L0、decade→L1、year/month→L2。\n    // timeline 各格的 topSignals 與 `signals` 是同一批物件（signals 為其去重聯集），\n    // 另外逐格檢查只會重複回報，因此只稽核 `signals`。\n    const SIGNAL_LAYER: Record<string, LayerCode> = { natal: 'L0', decade: 'L1', year: 'L2', month: 'L2' };\n    (Array.isArray(report.signals) ? report.signals : []).forEach((signal: any, index: number) => {\n      const layer = SIGNAL_LAYER[signal?.window?.grain] ?? 'L2';\n      check(signal?.evidence?.text, layer, `signals[${index}].evidence.text`);\n      (signal?.evidence?.modifiers ?? []).forEach((modifier: any, mi: number) => {\n        check(modifier?.reason, layer, `signals[${index}].evidence.modifiers[${mi}].reason`);\n      });\n    });\n    (report.timeContext?.flags ?? []).forEach((flag: any, index: number) => {\n      check(flag?.detail, 'L2', `timeContext.flags[${index}].detail`);\n    });\n\n    return violations;\n  }\n}\n";
const transpiler = new Bun.Transpiler({ loader: 'ts' });
const baselineJs = transpiler.transformSync(BASE_SOURCE);
const Legacy = new Function(baselineJs.replace(/export /g, '') + '\nreturn HonestyGuard;')() as typeof HonestyGuard;
const outcome = (guard: typeof HonestyGuard, input: unknown) => {
  try { return { value: guard.auditReport(input as Input) }; }
  catch (error) { return { name: (error as Error).name, message: (error as Error).message }; }
};

// Called only by the compiler: invalid calls must fail on the public method itself.
export function invalidCalls() {
  // @ts-expect-error non-report scalar
  HonestyGuard.auditReport(42);
  // @ts-expect-error structural typo must not disappear through generic inference
  HonestyGuard.auditReport({ stateTable: { scenarios: 'invalid' } });
  // @ts-expect-error text fields reject wrong producer types
  HonestyGuard.auditReport({ evolution: { narrative: 42 } });
  // @ts-expect-error signal reason is textual
  HonestyGuard.auditReport({ signals: [{ evidence: { modifiers: [{ reason: false }] } }] });
}

test('all audited paths, signal layers, duplicates and serialized violation order match frozen source', () => {
  const input = {
    unrelated: { preserved: true },
    stateTable: { pending: false, scenarios: [{ id: 'extra', cells: [{ expression: '你是永遠注定' }, { expression: '' }] }] },
    evolution: { periods: [{ summary: ['你是', '永遠'] }, { summary: '注定' }], narrative: '絕對' },
    insights: { domains: [{ insight: '你是', stage: '你天生' }], annual: { themes: [{ text: '一定會' }] }, guidance: { balance: { text: '從不' } } },
    signals: ['natal', 'decade', 'year', 'month', 'unknown', '', null, undefined].map(grain => ({
      window: { grain }, evidence: { text: '你是', modifiers: [{ reason: '永遠' }, { reason: '永遠' }] },
    })),
    timeContext: { flags: [{ detail: '注定' }] },
  };
  const before = JSON.stringify(input);
  const actual = HonestyGuard.auditReport(input);
  expect(actual).toEqual(Legacy.auditReport(input));
  expect(JSON.stringify(actual)).toBe(JSON.stringify(Legacy.auditReport(input)));
  expect(JSON.stringify(input)).toBe(before);
  expect(actual.slice(0, 3).map(v => v.problem)).toEqual([
    'L3 內容使用了「你是」定性語氣', 'L3 內容使用了「注定」宿命斷言', 'L3 內容使用了「永遠」絕對化語氣',
  ]);
  expect(actual.filter(v => v.location.startsWith('signals[0]'))).toEqual([]);
  expect(actual.find(v => v.location === 'signals[1].evidence.text')?.layer).toBe('L1');
  expect(actual.find(v => v.location === 'signals[4].evidence.text')?.layer).toBe('L2');
  expect(actual.at(-1)?.location).toBe('timeContext.flags[0].detail');
  for (const violation of actual) expect(Object.keys(violation)).toEqual(['layer', 'location', 'text', 'problem']);
});

test('omissions, nullish nodes, sparse arrays and nonstring JavaScript text retain their behavior', () => {
  const inputs: unknown[] = [null, undefined, false, 0, '', '你是', {}, [],
    { stateTable: null, evolution: null, insights: null, signals: null, timeContext: null },
    { stateTable: { scenarios: [null, undefined, {}, { cells: [null, undefined, {}, { expression: '你是' }] }] } },
    { evolution: { periods: [null, undefined, {}, { summary: [null, undefined, '', '你是'] }], narrative: null } },
    { insights: { domains: [null, {}], annual: { themes: [null, {}] }, guidance: { balance: null } } },
    { signals: [null, undefined, {}, { window: null, evidence: { modifiers: [null, {}] } }] },
    { signals: 'ignored', timeContext: { flags: [null, undefined, {}] } },
    { stateTable: { scenarios: [, { cells: [, { expression: '永遠' }] }] }, evolution: { periods: [, { summary: [, '注定'] }] } },
  ];
  for (const value of [42, false, {}, [], Symbol('text'), 1n, () => '你是']) {
    inputs.push({
      stateTable: { scenarios: [{ cells: [{ expression: value }] }] },
      evolution: { periods: [{ summary: value }, { summary: [value] }], narrative: value },
      insights: { domains: [{ insight: value, stage: value }], annual: { themes: [{ text: value }] }, guidance: { balance: { text: value } } },
      signals: [{ evidence: { text: value, modifiers: [{ reason: value }] } }],
      timeContext: { flags: [{ detail: value }] },
    });
  }
  for (const input of inputs) expect(outcome(HonestyGuard, input)).toEqual(outcome(Legacy, input));
});

test('malformed containers and unusual grain property lookups preserve errors and fallback semantics', () => {
  const inputs: unknown[] = [
    { stateTable: { scenarios: 1 } }, { stateTable: { scenarios: [{ cells: {} }] } },
    { evolution: { periods: 'bad' } }, { insights: { domains: {} } },
    { insights: { annual: { themes: 42 } } }, { timeContext: { flags: false } },
    { signals: [{ evidence: { modifiers: {} } }] },
    ...['constructor', 'toString', '__proto__', 0, false, Symbol('grain')].map(grain => ({ signals: [{ window: { grain }, evidence: { text: '你是' } }] })),
  ];
  for (const input of inputs) expect(outcome(HonestyGuard, input)).toEqual(outcome(Legacy, input));
});

test('erasing consumer types leaves the entire executable module byte-identical', async () => {
  const source = await Bun.file(new URL('../src/analysis/HonestyGuard.ts', import.meta.url)).text();
  expect(transpiler.transformSync(source)).toBe(baselineJs);
});
