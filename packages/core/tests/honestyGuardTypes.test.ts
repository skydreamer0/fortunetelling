import { expect, test } from 'bun:test';
import { HonestyGuard, type HonestyReportInput } from '../src/analysis/HonestyGuard';
import { HonestyGuard as Legacy } from './fixtures/honestyGuard.before-types';
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

// Frozen source from master b26ec306fe2ac6a487234dbcd5d70d14255480ab.
// Both guards use Bun's TS module loader. Transpiler + new Function rewrites
// expressions differently, changing engine-generated TypeError messages.
const transpiler = new Bun.Transpiler({ loader: 'ts' });
const BASE_SOURCE = await Bun.file(new URL('./fixtures/honestyGuard.before-types.ts', import.meta.url)).text();
const baselineJs = transpiler.transformSync(BASE_SOURCE);
const outcome = (guard: typeof HonestyGuard | typeof Legacy, input: unknown) => {
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
