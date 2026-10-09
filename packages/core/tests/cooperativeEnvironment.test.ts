import { expect, test } from 'bun:test';
import { astro } from 'iztro';
import i18next from 'iztro/lib/i18n';
import { finishCooperatively, readIztroLanguageState, supportedTimelineEnvironment, TimelineEnvironmentChangedError } from '../src/timeline/cooperative';
import { ZiweiEngine } from '../src/engines/ZiweiEngine';
import { BirthData } from '../src/core/models/BirthData';
import { finishCalculation } from '../src/core/calculationSteps';

const birth = new BirthData({ name: 'Synthetic guard QA', year: 1995, month: 7, day: 16,
  hour: 22, minute: 0, gender: 'male' });
const restoreLanguage = (language: string) => { i18next.changeLanguage(language); };

test('language reader handles only the two known module shapes and reads live values', () => {
  const state = { language: 'zh-TW', resolvedLanguage: 'zh-TW' };
  const wrapped = { default: state };
  expect(readIztroLanguageState(state)).toEqual(state);
  expect(readIztroLanguageState(wrapped)).toEqual(state);
  state.language = 'zh-CN'; // Read current values, never substitute supported values.
  expect(readIztroLanguageState(wrapped)).toEqual({ language: 'zh-CN', resolvedLanguage: 'zh-TW' });
  state.resolvedLanguage = 'zh-CN';
  expect(readIztroLanguageState(state)).toEqual({ language: 'zh-CN', resolvedLanguage: 'zh-CN' });
  for (const invalid of [null, undefined, 0, 'zh-TW', {}, { default: {} }, { default: { default: state } },
    { language: 'zh-TW' }, { language: 'zh-TW', resolvedLanguage: null }]) {
    expect(() => readIztroLanguageState(invalid)).toThrow(TimelineEnvironmentChangedError);
  }
});

test('supported guard rejects either mismatched language field without rewriting it', () => {
  const original = { language: i18next.language, resolvedLanguage: i18next.resolvedLanguage };
  try {
    new ZiweiEngine({ asOf: '2026-09-25' }).run(birth);
    for (const field of ['language', 'resolvedLanguage'] as const) {
      const before = i18next[field];
      i18next[field] = 'zh-CN';
      expect(() => supportedTimelineEnvironment()).toThrow(TimelineEnvironmentChangedError);
      expect(i18next[field]).toBe('zh-CN');
      i18next[field] = before!; // The preceding supported engine establishes both fields.
    }
  } finally {
    i18next.language = original.language;
    i18next.resolvedLanguage = original.resolvedLanguage;
  }
});

test('read-only guard detects supported public engine language interference', () => {
  const original = i18next.language;
  try {
    new ZiweiEngine({ asOf: '2026-09-25' }).run(birth);
    const verify = supportedTimelineEnvironment();
    new ZiweiEngine({ language: 'zh-CN', asOf: '2026-09-25' }).run(birth);
    expect(() => verify()).toThrow(TimelineEnvironmentChangedError);
    expect(i18next.language).toBe('zh-CN'); // guard does not restore another caller's language
  } finally { restoreLanguage(original); }
});

test('guard rejects setting mutation and never restores it', () => {
  const original = i18next.language;
  const config = structuredClone(astro.getConfig());
  try {
    new ZiweiEngine({ asOf: '2026-09-25' }).run(birth);
    const verify = supportedTimelineEnvironment();
    astro.config({ horoscopeDivide: 'exact' });
    expect(() => verify()).toThrow(TimelineEnvironmentChangedError);
    expect(astro.getConfig().horoscopeDivide).toBe('exact');
  } finally { astro.config({ horoscopeDivide: config.horoscopeDivide }); restoreLanguage(original); }
});

test('guard snapshots mutable nested configuration maps rather than retaining references', () => {
  const original = i18next.language;
  const map = astro.getConfig().mutagens as Record<string, unknown>;
  const previous = Object.getOwnPropertyDescriptor(map, 'cooperative-test');
  try {
    new ZiweiEngine({ asOf: '2026-09-25' }).run(birth);
    const verify = supportedTimelineEnvironment();
    map['cooperative-test'] = ['synthetic negative control'];
    expect(() => verify()).toThrow(TimelineEnvironmentChangedError);
  } finally {
    if (previous) Object.defineProperty(map, 'cooperative-test', previous);
    else delete map['cooperative-test'];
    restoreLanguage(original);
  }
});

test('cooperative checkpoints propagate a custom abort reason before further work', async () => {
  const controller = new AbortController(); const reason = { custom: 'stop' };
  let units = 0, yields = 0;
  function* steps() { units++; yield; units++; return 'complete'; }
  const pending = finishCooperatively(steps(), controller.signal, async () => {
    if (++yields === 2) controller.abort(reason);
  }, () => {});
  await expect(pending).rejects.toBe(reason);
  expect(units).toBe(1);
});

test('boundary guard cannot audit a change away and back entirely between checks', () => {
  const original = i18next.language;
  try {
    new ZiweiEngine({ asOf: '2026-09-25' }).run(birth);
    const verify = supportedTimelineEnvironment();
    new ZiweiEngine({ language: 'zh-CN', asOf: '2026-09-25' }).run(birth);
    new ZiweiEngine({ asOf: '2026-09-25' }).run(birth);
    expect(() => verify()).not.toThrow();
  } finally { restoreLanguage(original); }
});

// These are private runner/guard contracts, not annual calculation, rollback,
// browser responsiveness, or cross-global-configuration isolation evidence.
test('sync and cooperative runners retain exact result bytes and ordered units', async () => {
  const syncUnits: number[] = [], cooperativeUnits: number[] = [];
  const makeSteps = function* (units: number[]) {
    units.push(1); yield;
    units.push(2); yield;
    return { units, nested: { value: 'synthetic', optional: undefined } };
  };
  let yields = 0, guards = 0;
  const sync = finishCalculation(makeSteps(syncUnits));
  const cooperative = await finishCooperatively(makeSteps(cooperativeUnits), new AbortController().signal,
    async () => { yields++; }, () => { guards++; });
  expect(cooperative).toEqual(sync);
  expect(JSON.stringify(cooperative)).toBe(JSON.stringify(sync));
  expect(yields).toBe(3);
  expect(guards).toBe(9); // before yield, after yield, after next, including completion
});

test('already-aborted signal wins before environment check, scheduling or work', async () => {
  const controller = new AbortController(); const reason = { stop: 'before start' };
  controller.abort(reason);
  let entered = false, yields = 0, guards = 0;
  function* steps() { entered = true; yield; return 1; }
  await expect(finishCooperatively(steps(), controller.signal,
    async () => { yields++; }, () => { guards++; throw new Error('unreachable guard'); })).rejects.toBe(reason);
  expect([entered, yields, guards]).toEqual([false, 0, 0]);
});

test('initial environment failure prevents scheduling and work', async () => {
  const reason = new TimelineEnvironmentChangedError(); let units = 0, yields = 0;
  function* steps() { units++; yield; return 1; }
  await expect(finishCooperatively(steps(), new AbortController().signal,
    async () => { yields++; }, () => { throw reason; })).rejects.toBe(reason);
  expect([units, yields]).toEqual([0, 0]);
});

test('public non-default engine during a yield fails closed before the next unit', async () => {
  const original = i18next.language;
  let units = 0, yields = 0, closed = 0;
  function* steps() { try { units++; yield; units++; return 'must not publish'; } finally { closed++; } }
  try {
    new ZiweiEngine({ asOf: '2026-09-25' }).run(birth);
    const verify = supportedTimelineEnvironment();
    await expect(finishCooperatively(steps(), new AbortController().signal, async () => {
      if (++yields === 2) new ZiweiEngine({ language: 'zh-CN', asOf: '2026-09-25' }).run(birth);
    }, verify)).rejects.toBeInstanceOf(TimelineEnvironmentChangedError);
    expect([units, yields, closed]).toEqual([1, 2, 1]);
    expect(i18next.language).toBe('zh-CN');
  } finally { restoreLanguage(original); }
});

test('post-unit guard also rejects a final result instead of returning it', async () => {
  const reason = new TimelineEnvironmentChangedError(); let changed = false, units = 0;
  function* steps() { units++; changed = true; return 'must not publish'; }
  await expect(finishCooperatively(steps(), new AbortController().signal, async () => {},
    () => { if (changed) throw reason; })).rejects.toBe(reason);
  expect(units).toBe(1);
});

test('abort raised within the final unit rejects the exact custom reason', async () => {
  const controller = new AbortController(); const reason = Symbol('custom cancellation');
  function* steps() { controller.abort(reason); return 'must not publish'; }
  await expect(finishCooperatively(steps(), controller.signal, async () => {}, () => {})).rejects.toBe(reason);
});

test('scheduler rejection closes suspended work and preserves its original identity', async () => {
  const reason = { scheduler: 'failed' }; let units = 0, yields = 0, closed = 0;
  function* steps() { try { units++; yield; units++; return 1; } finally { closed++; } }
  await expect(finishCooperatively(steps(), new AbortController().signal,
    async () => { if (++yields === 2) throw reason; }, () => {})).rejects.toBe(reason);
  expect([units, yields, closed]).toEqual([1, 2, 1]);
});

test('an AbortError-shaped work failure is not relabeled as signal cancellation', async () => {
  const signal = new AbortController().signal; const reason = new Error('engine failure');
  reason.name = 'AbortError';
  function* steps() { yield; throw reason; }
  await expect(finishCooperatively(steps(), signal, async () => {}, () => {})).rejects.toBe(reason);
  expect(signal.aborted).toBe(false);
});

test('cleanup failure does not mask a custom abort reason or run later work', async () => {
  const controller = new AbortController(); const reason = { stop: 'cleanup precedence' };
  let units = 0, yields = 0, closed = 0;
  function* steps() {
    try { units++; yield; units++; return 1; }
    finally { closed++; throw new Error('cleanup failure'); }
  }
  await expect(finishCooperatively(steps(), controller.signal,
    async () => { if (++yields === 2) controller.abort(reason); }, () => {})).rejects.toBe(reason);
  expect([units, closed]).toEqual([1, 1]);
});

test('independent runner invocations retain their own results and cancellation state', async () => {
  const controllerA = new AbortController(), controllerB = new AbortController();
  const reason = { stop: 'A only' }; const unitsA: string[] = [], unitsB: string[] = [];
  let yieldsA = 0;
  function* steps(label: string, units: string[]) { units.push(label); yield; units.push(label); return units; }
  const a = finishCooperatively(steps('A', unitsA), controllerA.signal,
    async () => { if (++yieldsA === 2) controllerA.abort(reason); }, () => {});
  const b = finishCooperatively(steps('B', unitsB), controllerB.signal, async () => {}, () => {});
  await expect(a).rejects.toBe(reason);
  expect(await b).toEqual(['B', 'B']);
  expect(unitsA).toEqual(['A']);
  expect(controllerB.signal.aborted).toBe(false);
});

test('cancellation cannot interrupt an unsettled scheduler promise', async () => {
  const controller = new AbortController(); const reason = { stop: 'while scheduling' };
  let release!: () => void, settled = false, units = 0;
  const scheduling = new Promise<void>(resolve => { release = resolve; });
  function* steps() { units++; yield; return 1; }
  const pending = finishCooperatively(steps(), controller.signal, () => scheduling, () => {})
    .finally(() => { settled = true; });
  controller.abort(reason);
  await Promise.resolve();
  expect(settled).toBe(false); // Boundary checks do not race/interrupt an arbitrary scheduler.
  release();
  await expect(pending).rejects.toBe(reason);
  expect(units).toBe(0);
});

test('actual abort reason wins over a simultaneous work throw', async () => {
  const controller = new AbortController(); const reason = { stop: 'work aborted' };
  function* steps() { controller.abort(reason); throw new Error('secondary work error'); yield; }
  await expect(finishCooperatively(steps(), controller.signal, async () => {}, () => {})).rejects.toBe(reason);
});

test('actual abort reason wins over a simultaneous scheduler rejection', async () => {
  const controller = new AbortController(); const reason = { stop: 'scheduler aborted' }; let units = 0;
  function* steps() { units++; yield; return 1; }
  await expect(finishCooperatively(steps(), controller.signal, async () => {
    controller.abort(reason); throw new Error('secondary scheduler error');
  }, () => {})).rejects.toBe(reason);
  expect(units).toBe(0);
});

test('guard rejects initially unsupported language without changing it', () => {
  const original = i18next.language;
  try {
    new ZiweiEngine({ language: 'zh-CN', asOf: '2026-09-25' }).run(birth);
    expect(() => supportedTimelineEnvironment()).toThrow(TimelineEnvironmentChangedError);
    expect(i18next.language).toBe('zh-CN');
  } finally { restoreLanguage(original); }
});

test('guard rejects initially non-default configuration without changing it', () => {
  const original = i18next.language; const config = structuredClone(astro.getConfig());
  try {
    new ZiweiEngine({ asOf: '2026-09-25' }).run(birth);
    astro.config({ ageDivide: 'birthday' });
    expect(() => supportedTimelineEnvironment()).toThrow(TimelineEnvironmentChangedError);
    expect(astro.getConfig().ageDivide).toBe('birthday');
  } finally { astro.config({ ageDivide: config.ageDivide }); restoreLanguage(original); }
});
