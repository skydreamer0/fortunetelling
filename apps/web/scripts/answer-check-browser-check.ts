/** #19/#46 only: real built app and engines on the approved stock-Chrome runner. */
import assert from 'node:assert/strict';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, sep } from 'node:path';
import { cpus } from 'node:os';
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright';

const ROOT = resolve('apps/web/dist');
const OUTPUT = resolve('answer-browser-results');
const MISSING = 'sig_ffffffff';
const B = 'B：只核對目前輸入，沒有引用訊號。';
const TEXTAREA = '.ask__entry--mcp textarea';
const CHECK = '.ask__entry--mcp .ask__paste-block .ask__actions button';
const NOTICE = '__FORTUNE_ANSWER_QA__';
const RUN_DEADLINE_MS = 180_000;
const fixture = { name: 'QA Synthetic', date: '1995-07-16', time: '22:00', gender: 'male', city: 'tainan', accuracy: 'exact' };
type Mode = 'complete' | 'cancel-aba' | 'unmount';
type Observation = { kind: string; at: number; value: string; busy: boolean; mounted: boolean;
  summary: string | null; flags: string[]; trusted?: boolean; eventTimestamp?: number;
  clientX?: number; clientY?: number; scrollX?: number; scrollY?: number };
type Point = { x: number; y: number; scrollX: number; scrollY: number };
type Trace = { events: Observation[]; longTasks: { start: number; duration: number }[];
  longTasksSupported: boolean; overflow: boolean; finishedAt: number | null };
type Evidence = { mode: Mode; answer: string; trace: Trace; errors: string[]; timedOut: boolean;
  cleanupErrors: string[]; asOf: string; knownId: string; reportYears: number;
  inputCommandToVerifiedDomMs?: number; replacementReportSeen?: boolean;
  pointerTargets?: { check: Point; text: Point; back?: Point } };
declare global { interface Window { __answerQa: { finish(): Trace; armViewport(y: number): void } } }

function remainingRunMs(deadlineAt: number, now = performance.now()): number {
  const remaining = deadlineAt - now;
  assert(remaining > 0, 'Browser test deadline exceeded before result wait');
  return Math.ceil(remaining); // Never pass zero, which would disable Playwright's timeout.
}

function tasksAfterFirstCheck(trace: Trace): Trace['longTasks'] | null {
  const first = trace.events.find(event => event.kind === 'check');
  // No finish observation means unknown coverage, not zero blocking.
  if (!first || trace.finishedAt === null) return null;
  return trace.longTasks.filter(task => task.start + task.duration > first.at && task.start < trace.finishedAt!);
}

function validateSchedulerProfile(profile: Awaited<ReturnType<typeof measureSchedulerProfile>>, errors: readonly string[] = []) {
  assert.deepEqual(errors, [], 'scheduler diagnostic page/evaluation/cleanup errors cannot pass');
  const order = profile.apiSupported ? ['timer', 'scheduler-yield', 'scheduler-yield', 'timer'] : ['timer'];
  assert.deepEqual(profile.order, order);
  assert.equal(profile.samples.length, order.length);
  assert.match(profile.referenceSha256, /^[0-9a-f]{64}$/);
  assert(profile.referenceBytes > 0);
  assert.equal(profile.options.topSignalsPerDomain, 'Infinity', 'unbounded selection must survive JSON serialization');
  for (const [index, sample] of profile.samples.entries()) {
    assert.equal(sample.kind, order[index]);
    assert.equal(sample.exactFullJsonMatches, true);
    assert.equal(sample.outputSha256, profile.referenceSha256);
    assert.equal(sample.outputBytes, profile.referenceBytes);
    assert(sample.awaitWaitMs.length > 60);
    assert.equal(sample.awaitWaitMs.length, profile.samples[0].awaitWaitMs.length);
    assert.equal(sample.workSegmentsMs.length, sample.awaitWaitMs.length + 1);
    assert([...sample.awaitWaitMs, ...sample.workSegmentsMs, sample.elapsedMs].every(value => Number.isFinite(value) && value >= 0));
    const partitionMs = [...sample.workSegmentsMs, ...sample.awaitWaitMs].reduce((sum, value) => sum + value, 0);
    // These intervals partition one clock timeline. Tolerance is floating-point
    // summation noise only (one nanosecond), never a performance acceptance limit.
    assert(Math.abs(partitionMs - sample.elapsedMs) <= 1e-6, 'work + await must account for the complete elapsed interval');
  }
}

// This is observation only: no engine, timer, report, React state or event is replaced.
function installRecorder() {
  const events: Observation[] = [];
  const longTasks: Trace['longTasks'] = [];
  let overflow = false, previous = '', frame = 0, checkNumber = 0, framedCheck = -1;
  let viewportTarget: number | null = null;
  const snapshot = (kind: string): Observation => {
    const root = document.querySelector('.ask__entry--mcp');
    const text = root?.querySelector('textarea') as HTMLTextAreaElement | null;
    return { kind, at: performance.now(), value: text?.value ?? '', mounted: Boolean(text),
      busy: Boolean(root?.querySelector('[role="status"][aria-busy="true"]')),
      summary: root?.querySelector('.ask__summary')?.textContent ?? null,
      flags: [...(root?.querySelectorAll('[data-flag]') ?? [])].map(node => node.getAttribute('data-flag')!) };
  };
  const append = (event: Observation) => { if (events.length >= 2000) overflow = true; else events.push(event); };
  const observe = () => {
    const value = snapshot('state');
    const key = JSON.stringify([value.value, value.mounted, value.busy, value.summary, value.flags]);
    if (key !== previous) { previous = key; append(value); }
  };
  const mutation = new MutationObserver(observe);
  mutation.observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
  const input = (event: Event) => {
    if (!(event.target instanceof HTMLTextAreaElement) || !event.target.matches('.ask__entry--mcp textarea')) return;
    append({ ...snapshot('input'), trusted: event.isTrusted, eventTimestamp: event.timeStamp });
  };
  const click = (event: Event) => {
    const button = event.target instanceof Element ? event.target.closest('button') : null;
    if (!button) return;
    if (button.matches('.ask__entry--mcp .ask__paste-block .ask__actions button')) {
      checkNumber++;
      append({ ...snapshot('check'), trusted: event.isTrusted, eventTimestamp: event.timeStamp,
        clientX: (event as MouseEvent).clientX, clientY: (event as MouseEvent).clientY, scrollX, scrollY });
    } else if (button.textContent?.includes('重新輸入')) {
      append({ ...snapshot('back'), trusted: event.isTrusted, eventTimestamp: event.timeStamp,
        clientX: (event as MouseEvent).clientX, clientY: (event as MouseEvent).clientY, scrollX, scrollY });
    }
  };
  const pointer = (event: PointerEvent) => {
    if (event.target instanceof HTMLTextAreaElement && event.target.matches('.ask__entry--mcp textarea')) {
      append({ ...snapshot('textarea-pointer'), trusted: event.isTrusted, eventTimestamp: event.timeStamp,
        clientX: event.clientX, clientY: event.clientY, scrollX, scrollY });
    }
  };
  document.addEventListener('input', input, true);
  document.addEventListener('click', click, true);
  document.addEventListener('pointerdown', pointer, true);
  // A read-only DevTools console event reaches the host without requiring a new
  // injected evaluation behind the production scheduler's continuation queue.
  const notify = (event: Observation) => console.debug('__FORTUNE_ANSWER_QA__' + JSON.stringify(event));
  const tick = () => {
    const current = snapshot('busy-animation-frame');
    if (current.busy && framedCheck !== checkNumber) { framedCheck = checkNumber; append(current); notify(current); }
    if (current.busy && viewportTarget !== null && scrollY === viewportTarget) {
      const event = { ...snapshot('viewport-target-frame'), scrollX, scrollY };
      viewportTarget = null; append(event); notify(event);
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  const longTasksSupported = PerformanceObserver.supportedEntryTypes.includes('longtask');
  const collect = (entries: PerformanceEntry[]) => {
    for (const entry of entries) {
      if (longTasks.length >= 2000) overflow = true;
      else longTasks.push({ start: entry.startTime, duration: entry.duration });
    }
  };
  const tasks = new PerformanceObserver(list => collect(list.getEntries()));
  if (longTasksSupported) tasks.observe({ type: 'longtask', buffered: true });
  window.__answerQa = { armViewport(y) { viewportTarget = y; }, finish() {
    observe(); collect(tasks.takeRecords()); tasks.disconnect(); mutation.disconnect();
    cancelAnimationFrame(frame);
    document.removeEventListener('input', input, true); document.removeEventListener('click', click, true);
    document.removeEventListener('pointerdown', pointer, true);
    return { events, longTasks, longTasksSupported, overflow, finishedAt: performance.now() };
  } };
}

/** Supplementary hit-target gate; original functional validator stays unchanged. */
function validatePointerTargets(e: Evidence) {
  const targets = e.pointerTargets;
  assert(targets, 'precalculation geometry missing');
  const hit = (event: Observation | undefined, point: Point | undefined) => {
    assert(event?.trusted && point, 'trusted hit-target receipt missing');
    assert.deepEqual([event.clientX, event.clientY, event.scrollX, event.scrollY],
      [point.x, point.y, point.scrollX, point.scrollY], 'actual pointer target/viewport differs from prepared geometry');
  };
  for (const check of e.trace.events.filter(event => event.kind === 'check')) hit(check, targets.check);
  if (e.mode === 'cancel-aba') {
    const busy = e.trace.events.find(event => event.kind === 'busy-animation-frame');
    const edit = e.trace.events.find(event => event.kind === 'input' && event.value === B);
    const pointer = e.trace.events.find(event => event.kind === 'textarea-pointer' && event.at > (busy?.at ?? Infinity));
    assert(pointer?.busy && edit && pointer.at < edit.at, 'textarea must actually receive the pointer during calculation');
    hit(pointer, targets.text);
  } else if (e.mode === 'unmount') {
    const back = e.trace.events.find(event => event.kind === 'back');
    const viewport = e.trace.events.find(event => event.kind === 'viewport-target-frame');
    assert(viewport?.busy && back && viewport.at < back.at, 'native scroll target was not observed during calculation');
    assert.deepEqual([viewport.scrollX, viewport.scrollY], [targets.back?.scrollX, targets.back?.scrollY]);
    hit(back, targets.back);
  }
}

/** Functional evidence gates, deliberately separate from any performance budget. */
function validate(e: Evidence) {
  assert.equal(e.timedOut, false, 'timeout is incomplete, never PASS');
  assert.deepEqual(e.cleanupErrors, [], 'cleanup failure cannot pass');
  assert.deepEqual(e.errors, [], 'page errors or orchestration errors cannot pass');
  assert.equal(e.reportYears, 5, 'must first render the real five-year report');
  assert.match(e.asOf, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(e.knownId, /^sig_[0-9a-f]{8,16}$/);
  assert.equal(e.trace.longTasksSupported, true, 'missing Long Tasks support is incomplete');
  assert.equal(e.trace.overflow, false, 'truncated evidence cannot pass');
  const events = e.trace.events;
  const first = events.find(event => event.kind === 'check');
  assert(first?.trusted && first.value === e.answer, 'real check action missing');
  const busy = events.find(event => event.kind === 'busy-animation-frame' && event.at > first.at && event.value === e.answer);
  assert(busy?.busy, 'busy DOM was not observed on an animation frame');
  const results = events.filter(event => event.kind === 'state' && event.summary !== null);
  const isAResult = (event: Observation) => event.value === e.answer && event.flags.includes('unknown_citation') && event.flags.includes('honesty_violation');
  if (e.mode === 'complete') {
    assert(results.some(event => event.at > busy.at && isAResult(event) && !event.busy), 'real cold scan result missing');
    return;
  }
  if (e.mode === 'cancel-aba') {
    const edit = events.find(event => event.kind === 'input' && event.value === B && event.at > busy.at);
    assert(edit?.trusted && edit.busy, 'trusted replacement must arrive while the original scan is still pending');
    assert(!results.some(event => event.at < edit.at), 'scan already completed before cancellation input');
    const cleared = events.find(event => event.kind === 'state' && event.at >= edit.at && event.value === B && !event.busy && event.summary === null);
    assert(cleared, 'input returned but busy/result did not actually clear');
    const fresh = events.find(event => event.kind === 'check' && event.at > cleared.at && event.value === e.answer);
    assert(fresh?.trusted, 'A → B → A must start a new real check');
    assert(!results.some(event => event.at > edit.at && event.at < fresh.at), 'stale result reappeared before retry');
    const retryBusy = events.find(event => event.kind === 'busy-animation-frame' && event.at > fresh.at && event.value === e.answer);
    assert(retryBusy?.busy, 'retry click returned without a new busy observation');
    assert(results.some(event => event.at > retryBusy.at && isAResult(event) && !event.busy),
      'no A result observed after retry busy; producing request identity is not observed');
    assert(Number.isFinite(e.inputCommandToVerifiedDomMs), 'actual input-to-DOM command observation missing');
  } else {
    const back = events.find(event => event.kind === 'back' && event.at > busy.at);
    assert(back?.trusted && back.busy, 'leave-report action must happen during the cold scan');
    assert(!results.some(event => event.at < back.at), 'scan completed before unmount action');
    const removed = events.find(event => event.kind === 'state' && event.at >= back.at && !event.mounted);
    assert(removed && e.replacementReportSeen, 'report was not actually removed and replaced');
    assert(!results.some(event => event.at > back.at), 'old result appeared after report replacement');
  }
}

function selfTest() {
  assert.equal(remainingRunMs(180_000, 179_000), 1_000);
  assert.equal(remainingRunMs(180_000, 179_999.5), 1);
  assert.throws(() => remainingRunMs(180_000, 180_000));
  assert.throws(() => remainingRunMs(180_000, 180_001));
  const event = (kind: string, at: number, value: string, busy = false, summary: string | null = null): Observation =>
    ({ kind, at, value, busy, summary, flags: summary ? ['unknown_citation', 'honesty_violation'] : [], mounted: true, trusted: true });
  const seed: Evidence = { mode: 'cancel-aba', answer: 'A', knownId: 'sig_12345678', asOf: '2026-09-25', reportYears: 5,
    errors: [], cleanupErrors: [], timedOut: false, inputCommandToVerifiedDomMs: 10,
    trace: { longTasksSupported: true, overflow: false, longTasks: [], finishedAt: 8, events: [
      event('check', 1, 'A'), event('busy-animation-frame', 2, 'A', true), event('input', 3, B, true),
      event('state', 4, B), event('check', 5, 'A'), event('busy-animation-frame', 6, 'A', true), event('state', 7, 'A', false, 'result'),
    ] } };
  validate(seed);
  const mutations: [string, (e: Evidence) => void][] = [
    ['no trusted input', e => { e.trace.events[2].trusted = false; }],
    ['input after scan', e => { e.trace.events[2].busy = false; }],
    ['click returned without DOM effect', e => { e.trace.events.splice(3, 1); }],
    ['stale result before retry', e => { e.trace.events.push(event('state', 4.5, 'A', false, 'stale')); }],
    ['retry click without new busy', e => { e.trace.events.splice(5, 1); }],
    ['no final result', e => { e.trace.events.pop(); }],
    ['missing busy frame', e => { e.trace.events.splice(1, 1); }],
    ['timeout', e => { e.timedOut = true; }],
    ['cleanup rejection', e => { e.cleanupErrors.push('context close failed'); }],
    ['page error', e => { e.errors.push('engine failed'); }],
    ['truncated evidence', e => { e.trace.overflow = true; }],
    ['unsupported observation', e => { e.trace.longTasksSupported = false; }],
  ];
  for (const [name, mutate] of mutations) {
    const value = structuredClone(seed); mutate(value); assert.throws(() => validate(value), Error, name);
  }
  const unmount = structuredClone(seed); unmount.mode = 'unmount'; unmount.replacementReportSeen = true;
  unmount.trace.events = [event('check', 1, 'A'), event('busy-animation-frame', 2, 'A', true),
    event('back', 3, 'A', true), { ...event('state', 4, ''), mounted: false }, event('state', 5, '')];
  validate(unmount); unmount.trace.events.push(event('state', 6, 'A', false, 'stale'));
  assert.throws(() => validate(unmount));
  const complete = structuredClone(seed); complete.mode = 'complete';
  complete.trace.events = [event('check', 1, 'A'), event('busy-animation-frame', 2, 'A', true), event('state', 7, 'A', false, 'result')];
  validate(complete); complete.trace.events[2].at = 1.5;
  assert.throws(() => validate(complete));
  const timeout = structuredClone(seed); timeout.timedOut = true;
  timeout.trace.finishedAt = 100;
  timeout.trace.longTasks = [{ start: 20, duration: 60 }]; // After the last DOM change at 7.
  assert.deepEqual(tasksAfterFirstCheck(timeout.trace), [{ start: 20, duration: 60 }]);
  assert.throws(() => validate(timeout)); // Accurate statistics do not convert a timeout to PASS.
  timeout.trace.finishedAt = null;
  assert.equal(tasksAfterFirstCheck(timeout.trace), null, 'unknown window is never zero blocking');
  const profile: Awaited<ReturnType<typeof measureSchedulerProfile>> = {
    scope: 'Synthetic validator records only; no browser or engine executed', comparison: 'self-test only',
    options: { asOf: '2021-01-01', years: 1, includeMonths: true, topSignalsPerDomain: 'Infinity',
      systems: ['bazi', 'ziwei', 'numerology'], useTrueSolarTime: true, ziHourConvention: 'late' },
    limitations: ['These fixtures test validation, not scheduler performance.'],
    apiSupported: true, order: ['timer', 'scheduler-yield', 'scheduler-yield', 'timer'],
    referenceSha256: 'a'.repeat(64), referenceBytes: 100,
    samples: (['timer', 'scheduler-yield', 'scheduler-yield', 'timer'] as const).map(kind => ({ kind, elapsedMs: 306,
      awaitWaitMs: Array(61).fill(4), workSegmentsMs: Array(62).fill(1), exactFullJsonMatches: true,
      outputSha256: 'a'.repeat(64), outputBytes: 100 })) };
  validateSchedulerProfile(profile);
  const profileMutations: [string, (value: typeof profile) => void][] = [
    ['unsupported pretending paired comparison', value => { value.apiSupported = false; }],
    ['missing scheduler sample', value => { value.samples.pop(); }],
    ['changed complete output', value => { value.samples[0].exactFullJsonMatches = false; }],
    ['different complete output hash', value => { value.samples[0].outputSha256 = 'b'.repeat(64); }],
    ['no real units', value => { value.samples[0].awaitWaitMs = []; }],
    ['different unit counts', value => { value.samples[1].awaitWaitMs.push(1); }],
    ['missing final work segment', value => { value.samples[0].workSegmentsMs.pop(); }],
    ['invalid timing', value => { value.samples[0].awaitWaitMs[0] = NaN; }],
    ['zero elapsed with positive partition', value => { value.samples[0].elapsedMs = 0; }],
    ['positive elapsed with zero partition', value => {
      value.samples[0].workSegmentsMs.fill(0); value.samples[0].awaitWaitMs.fill(0);
    }],
    ['lost Infinity source option', value => { Object.assign(value.options, { topSignalsPerDomain: null }); }],
  ];
  for (const [name, mutate] of profileMutations) {
    const value = structuredClone(profile); mutate(value); assert.throws(() => validateSchedulerProfile(value), Error, name);
  }
  const unsupported = structuredClone(profile); unsupported.apiSupported = false;
  unsupported.order = ['timer']; unsupported.samples = [unsupported.samples[0]];
  validateSchedulerProfile(unsupported);
  assert.throws(() => validateSchedulerProfile(profile, ['synthetic diagnostic page error']));
  const pointerFixture = structuredClone(seed);
  pointerFixture.pointerTargets = { check: { x: 10, y: 20, scrollX: 0, scrollY: 40 }, text: { x: 15, y: 10, scrollX: 0, scrollY: 40 } };
  const coordinates = (point: Point) => ({ clientX: point.x, clientY: point.y, scrollX: point.scrollX, scrollY: point.scrollY });
  for (const item of pointerFixture.trace.events.filter(item => item.kind === 'check')) Object.assign(item, coordinates(pointerFixture.pointerTargets.check));
  pointerFixture.trace.events.push({ ...event('textarea-pointer', 2.5, 'A', true), ...coordinates(pointerFixture.pointerTargets.text) });
  validate(pointerFixture); validatePointerTargets(pointerFixture);
  const pointerMutations: [string, (value: Evidence) => void][] = [
    ['missing prepared geometry', value => { delete value.pointerTargets; }],
    ['wrong check coordinates', value => { value.trace.events[0].clientX = 99; }],
    ['wrong actual viewport', value => { value.trace.events[0].scrollY = 0; }],
    ['no actual textarea pointer', value => { value.trace.events.pop(); }],
    ['pointer after computation', value => { value.trace.events.at(-1)!.busy = false; }],
    ['untrusted pointer', value => { value.trace.events.at(-1)!.trusted = false; }],
  ];
  for (const [name, mutate] of pointerMutations) {
    const value = structuredClone(pointerFixture); mutate(value); assert.throws(() => validatePointerTargets(value), Error, name);
  }
  const backFixture = structuredClone(pointerFixture); backFixture.mode = 'unmount'; backFixture.replacementReportSeen = true;
  backFixture.pointerTargets!.back = { x: 10, y: 15, scrollX: 0, scrollY: 0 };
  backFixture.trace.events = [backFixture.trace.events[0], event('busy-animation-frame', 2, 'A', true),
    { ...event('viewport-target-frame', 2.5, 'A', true), scrollX: 0, scrollY: 0 },
    { ...event('back', 3, 'A', true), ...coordinates(backFixture.pointerTargets!.back) },
    { ...event('state', 4, ''), mounted: false }];
  validate(backFixture); validatePointerTargets(backFixture);
  backFixture.trace.events[2].scrollY = 99;
  assert.throws(() => validatePointerTargets(backFixture), Error, 'wrong observed scroll target');
  backFixture.trace.events[2].scrollY = 0;
  backFixture.trace.events.splice(2, 1);
  assert.throws(() => validatePointerTargets(backFixture), Error, 'back without observed scroll frame');
  console.log(JSON.stringify({ scope: 'evidence-validator self-test only; no browser executed', positiveFixtures: 3,
    rejectedMutations: mutations.map(([name]) => name).concat('stale result after unmount', 'result preceded busy observation'),
    resultDeadlineControls: 'remaining global budget; expired/zero budget rejected',
    longTaskWindowControls: 'post-DOM-change task retained on timeout; missing finish stays unknown',
    pointerTargetRejectedMutations: pointerMutations.map(([name]) => name).concat('wrong observed scroll target', 'back without observed scroll frame'),
    schedulerProfileRejectedMutations: profileMutations.map(([name]) => name).concat('diagnostic page error'), passed: true }));
}

async function makeReport(page: Page) {
  await page.locator('#f-name').fill(fixture.name);
  await page.locator('input[name="gender"][value="male"]').check();
  await page.locator('#f-date').fill(fixture.date);
  await page.locator('#f-clock').fill(fixture.time);
  await page.locator('input[name="time-accuracy"][value="exact"]').check();
  await page.getByLabel('出生城市', { exact: true }).selectOption(fixture.city);
  await page.getByRole('button', { name: '排盤', exact: true }).click();
  await page.locator('.report__title').waitFor();
  assert.equal(await page.locator('.report__title').textContent(), fixture.name);
  const meta = await page.locator('.report__meta').innerText();
  const asOf = meta.match(/基準日 (\d{4}-\d{2}-\d{2})/)?.[1];
  assert(asOf, 'report must expose its actual asOf, not an assumed fixture date');
  const yearHeading = page.getByRole('heading', { name: /^\d{4}–\d{4} 各領域訊號強度$/ });
  assert.equal(await yearHeading.count(), 1, 'unique year-range heading required');
  const heading = await yearHeading.innerText();
  const years = heading.match(/(\d{4})–(\d{4})/);
  assert(years, 'five-year report heading missing');
  // Read the genuine prompt already produced by the report, not an injected ID.
  const prompt = await page.getByLabel('AI prompt 預覽', { exact: true }).inputValue();
  const knownId = prompt.match(/sig_[0-9a-f]{8,16}/)?.[0];
  assert(knownId && knownId !== MISSING);
  return { asOf, knownId, reportYears: Number(years[2]) - Number(years[1]) + 1 };
}

async function settleFrames(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function stablePoints(page: Page, selectors: string[]): Promise<Point[]> {
  const read = () => page.evaluate(selectors => selectors.map(selector => {
    const node = document.querySelector(selector) as HTMLElement | null;
    if (!node) throw new Error('Geometry target missing');
    const rect = node.getBoundingClientRect(), x = Math.floor(rect.left + rect.width / 2), y = Math.floor(rect.top + rect.height / 2);
    const top = document.elementFromPoint(x, y);
    if (!rect.width || !rect.height || x < 0 || y < 0 || x >= innerWidth || y >= innerHeight ||
      !top || (top !== node && !node.contains(top)) || (node as HTMLButtonElement).disabled) throw new Error('Geometry target not interactable');
    return { x, y, scrollX, scrollY, rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } };
  }), selectors);
  await settleFrames(page); const first = await read();
  await settleFrames(page); const second = await read();
  assert.deepEqual(second, first, 'precalculation target geometry must be stable');
  return second;
}

/** Separate, post-UI diagnostic. Uses the public yield hook, never patches globals or the app. */
async function measureSchedulerProfile(page: Page, moduleUrl: string) {
  return page.evaluate(async moduleUrl => {
    const module = await import(moduleUrl);
    const bridges = Object.values(module).filter((value: any) =>
      typeof value?.analyze === 'function' && typeof value?.buildTimelineCooperatively === 'function');
    if (bridges.length !== 1) throw new Error('Expected one production core bridge');
    const core = bridges[0] as any;
    const report = core.analyze({ name: 'Synthetic scheduler QA', year: 1995, month: 7, day: 16,
      hour: 22, minute: 0, timeKnown: true, gender: 'male', calendarType: 'solar', cityId: 'tainan', timeAccuracy: 'exact' });
    const options = { asOf: '2021-01-01', years: 1, includeMonths: true, topSignalsPerDomain: Infinity,
      systems: ['bazi', 'ziwei', 'numerology'], useTrueSolarTime: true, ziHourConvention: 'late' };
    const expected = JSON.stringify(core.buildTimeline(report.timeContext, options));
    const bytes = new TextEncoder().encode(expected);
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
      .map(byte => byte.toString(16).padStart(2, '0')).join('');
    const native = (globalThis as typeof globalThis & { scheduler?: { yield?: () => Promise<void> } }).scheduler;
    const supported = typeof native?.yield === 'function';
    const order = supported ? ['timer', 'scheduler-yield', 'scheduler-yield', 'timer'] as const : ['timer'] as const;
    const samples = [];
    for (const kind of order) {
      const workSegmentsMs: number[] = [], awaitWaitMs: number[] = [];
      const start = performance.now(); let previousWaitEnd = start;
      const actual = await core.buildTimelineCooperatively(report.timeContext, options,
        { signal: new AbortController().signal, yieldTask: async () => {
          const waitStart = performance.now();
          workSegmentsMs.push(waitStart - previousWaitEnd);
          if (kind === 'scheduler-yield') await native!.yield!();
          else await new Promise<void>(resolve => setTimeout(resolve, 0));
          previousWaitEnd = performance.now();
          awaitWaitMs.push(previousWaitEnd - waitStart);
        } });
      const end = performance.now();
      workSegmentsMs.push(end - previousWaitEnd); // final unit/guard/Promise return, too
      if (JSON.stringify(actual) !== expected) throw new Error(`${kind} changed complete Timeline JSON`);
      if (awaitWaitMs.length <= 60) throw new Error('Real Ziwei preparation units were not observed');
      if (samples.length && awaitWaitMs.length !== samples[0].awaitWaitMs.length) throw new Error('Scheduler unit counts differ');
      samples.push({ kind, elapsedMs: end - start, workSegmentsMs, awaitWaitMs,
        exactFullJsonMatches: true, outputSha256: digest, outputBytes: bytes.length });
    }
    return { scope: 'Separate real production-module scheduler diagnostic; not UI acceptance or a cold-engine benchmark',
      apiSupported: supported, comparison: supported ? 'paired counter-order samples' : 'UNSUPPORTED: native scheduler.yield absent; timer only',
      order, options: { ...options, topSignalsPerDomain: 'Infinity' }, samples, referenceSha256: digest, referenceBytes: bytes.length,
      limitations: ['Report generation and synchronous reference warm engine/JIT before all samples.',
        'Fixed counter-order mitigates but does not remove JIT/order/shared-runner effects.',
        'Await wait includes browser queue/scheduling/measurement overhead, not a pure timer-clamp reading.',
        'Work segments include bridge guards and bookkeeping; this direct Timeline probe does not measure Web cache/commit overhead.',
        'Only one synthetic annual scope is profiled. The six earlier UI cases retain the real default scheduler and full 16-year reach.'] };
  }, moduleUrl);
}

async function run() {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.ANSWER_BROWSER_CHECK !== '1') {
    throw new Error('Browser execution is restricted to the approved GitHub Actions job. Do not set runner flags locally.');
  }
  await mkdir(OUTPUT, { recursive: true });
  const results: { functionalObservationGatePassed: boolean; [key: string]: unknown }[] = [], diagnostics: object[] = [];
  let browser: Browser | undefined, server: ReturnType<typeof Bun.serve> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined, deadlineCleanup: Promise<void> | undefined;
  let timedOut = false, passed = false, browserVersion: string | null = null;
  let schedulerProfile: Awaited<ReturnType<typeof measureSchedulerProfile>> | null = null;
  const schedulerProfileErrors: string[] = [];
  let stopPromise: Promise<void> | undefined;
  const stop = () => stopPromise ??= Promise.resolve().then(() => server?.stop(true));
  const sourceHashes: Record<string, string> = {};
  const runtime: Record<string, unknown> = { bun: Bun.version, platform: process.platform, arch: process.arch,
    cpuModel: cpus()[0]?.model ?? null, logicalCpus: cpus().length,
    uid: process.getuid?.(), imageOS: process.env.ImageOS ?? null, imageVersion: process.env.ImageVersion ?? null,
    expectedPrHead: process.env.ANSWER_HEAD_SHA ?? null, eventMergeCommit: process.env.GITHUB_SHA ?? null,
    playwright: (createRequire(import.meta.url)('playwright/package.json') as { version: string }).version,
    chromePath: '/opt/google/chrome/chrome', channel: 'chrome', chromiumSandbox: true };
  try {
    assert.notEqual(runtime.uid, 0, 'root execution refused');
    await access('/opt/google/chrome/chrome', constants.X_OK);
    const version = Bun.spawnSync(['/opt/google/chrome/chrome', '--version']);
    assert.equal(version.exitCode, 0); runtime.chromeVersion = version.stdout.toString().trim();
    const checkout = Bun.spawnSync(['git', 'rev-parse', 'HEAD']);
    assert.equal(checkout.exitCode, 0); runtime.actualCheckoutCommit = checkout.stdout.toString().trim();
    assert(/^[0-9a-f]{40}$/.test(String(runtime.expectedPrHead)), 'exact PR head SHA required');
    assert.equal(runtime.actualCheckoutCommit, runtime.expectedPrHead, 'checkout must be the exact PR head, not the event merge ref');
    const tree = Bun.spawnSync(['git', 'rev-parse', 'HEAD^{tree}']);
    assert.equal(tree.exitCode, 0); runtime.actualCheckoutTree = tree.stdout.toString().trim();
    const commit = Bun.spawnSync(['git', 'cat-file', '-p', 'HEAD']);
    assert.equal(commit.exitCode, 0);
    runtime.actualCheckoutParents = [...commit.stdout.toString().matchAll(/^parent ([0-9a-f]{40})$/gm)].map(match => match[1]);
    const status = Bun.spawnSync(['git', 'status', '--porcelain']);
    assert.equal(status.exitCode, 0); assert.equal(status.stdout.toString().trim(), '', 'tracked or untracked source changes invalidate candidate identity');
    for (const file of ['apps/web/src/components/report/AnswerCheck.tsx', 'apps/web/src/model/askAi.ts',
      'apps/web/scripts/answer-check-browser-check.ts', 'bun.lock']) {
      sourceHashes[file] = new Bun.CryptoHasher('sha256').update(await readFile(file)).digest('hex');
    }
    const buildFiles: Record<string, string> = {};
    async function hashBuild(path: string) {
      for (const item of await readdir(path, { withFileTypes: true })) {
        const full = resolve(path, item.name);
        if (item.isDirectory()) await hashBuild(full);
        else if (item.isFile()) buildFiles[full.slice(ROOT.length + 1)] = new Bun.CryptoHasher('sha256').update(await readFile(full)).digest('hex');
      }
    }
    await hashBuild(ROOT); assert(buildFiles['index.html'], 'production build is required'); runtime.buildSha256 = buildFiles;
    server = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(request) {
      const pathname = decodeURIComponent(new URL(request.url).pathname);
      if (!pathname.startsWith('/fortunetelling/')) return new Response('not found', { status: 404 });
      const relative = pathname.slice('/fortunetelling/'.length) || 'index.html';
      const full = resolve(ROOT, relative);
      if (!full.startsWith(ROOT + sep)) return new Response('not found', { status: 404 });
      const file = Bun.file(full);
      return await file.exists() ? new Response(file, { headers: { 'Cache-Control': 'no-store' } }) : new Response('not found', { status: 404 });
    } });
    const origin = `http://127.0.0.1:${server.port}`;
    browser = await chromium.launch({ channel: 'chrome', chromiumSandbox: true, timeout: 15_000 });
    browserVersion = browser.version();
    const deadlineAt = performance.now() + RUN_DEADLINE_MS;
    timer = setTimeout(() => {
      timedOut = true;
      deadlineCleanup = (async () => {
        for (const entry of await Promise.allSettled([stop(), browser!.close()])) {
          if (entry.status === 'rejected') diagnostics.push({ deadlineCleanup: String(entry.reason) });
        }
      })();
    }, RUN_DEADLINE_MS);
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      for (const mode of ['complete', 'cancel-aba', 'unmount'] as const) {
        if (timedOut) throw new Error('Browser test deadline exceeded');
        let context: BrowserContext | undefined, page: Page | undefined;
        const evidence: Evidence = { mode, answer: '', trace: { events: [], longTasks: [], longTasksSupported: false, overflow: false, finishedAt: null },
          errors: [], timedOut: false, cleanupErrors: [], asOf: '', knownId: '', reportYears: 0 };
        const metadata: Record<string, unknown> = { viewport, lookupStateAtFirstCheck: 'fresh context and freshly generated report; no prior citation lookup',
          engineAndJitCold: false, serviceWorkers: 'blocked to isolate this non-PWA task', externalFonts: 'blocked; fallback-font geometry only',
          producingRequestIdentityObserved: false, backgroundAbortEffectiveness: 'UNVERIFIED',
          identicalAStaleRequestExclusion: 'UNVERIFIED; matching DOM text does not identify the producing request' };
        const hostActions: { name: string; startedAt: number; returnedAt?: number; waitEndedAt?: number; error?: string; pageEvent?: Observation }[] = [];
        metadata.hostActions = hostActions; // Host clock, never subtracted directly from page timestamps.
        const outstanding: Promise<unknown>[] = [];
        const command = async (name: string, action: () => Promise<unknown>) => {
          const entry: (typeof hostActions)[number] = { name, startedAt: performance.now() }; hostActions.push(entry);
          let timeout: ReturnType<typeof setTimeout> | undefined;
          const operation = Promise.resolve().then(action).then(value => {
            entry.returnedAt = performance.now(); return value;
          }, error => { entry.returnedAt = performance.now(); entry.error = String(error); throw error; });
          outstanding.push(operation.catch(() => {}));
          try {
            await Promise.race([operation, new Promise<never>((_, reject) => {
              timeout = setTimeout(() => reject(new Error(`${name}: existing 15s interaction limit exceeded`)), 15_000);
            })]);
          } catch (error) { entry.error = String(error); throw error; }
          finally { if (timeout) clearTimeout(timeout); entry.waitEndedAt = performance.now(); }
        };
        const arm = (kind: string) => {
          const entry: (typeof hostActions)[number] = { name: `arm:${kind}`, startedAt: performance.now() }; hostActions.push(entry);
          // Install before dispatch. Console events use the existing recorder's
          // actual RAF snapshot, not polling or an artificial delay/value change.
          const observed = page!.waitForEvent('console', { timeout: 15_000, predicate: message => {
            if (!message.text().startsWith(NOTICE)) return false;
            const event = JSON.parse(message.text().slice(NOTICE.length)) as Observation;
            return event.kind === kind && event.busy && event.value === evidence.answer;
          } }).then(message => {
            entry.returnedAt = performance.now(); entry.pageEvent = JSON.parse(message.text().slice(NOTICE.length));
            return { event: entry.pageEvent };
          }, error => { entry.returnedAt = performance.now(); entry.error = String(error); return { error }; });
          outstanding.push(observed);
          return async () => { const result = await observed; if ('error' in result) throw result.error; return result.event; };
        };
        try {
          context = await browser.newContext({ viewport, serviceWorkers: 'block', reducedMotion: 'reduce' });
          context.setDefaultTimeout(15_000);
          await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
          await context.addInitScript(installRecorder);
          page = await context.newPage();
          page.on('pageerror', error => evidence.errors.push(String(error)));
          await page.goto(`${origin}/fortunetelling/`);
          Object.assign(evidence, await makeReport(page));
          evidence.answer = `A：這段時期傾向有支撐〔${evidence.knownId}〕。\n\n你一定會成功〔${MISSING}〕。`;
          metadata.expectedLookupYears = { first: Number(evidence.asOf.slice(0, 4)) - 5, last: Number(evidence.asOf.slice(0, 4)) + 10, count: 16 };
          metadata.successfulAnnualCalculationsDirectlyObserved = false;
          await page.locator(TEXTAREA).fill(evidence.answer);
          let back: Point | undefined;
          if (mode === 'unmount') {
            const selector = '.report__actions button:first-child';
            await page.locator(selector).scrollIntoViewIfNeeded();
            [back] = await stablePoints(page, [selector]);
          }
          await page.locator(CHECK).scrollIntoViewIfNeeded();
          const [check, text] = await stablePoints(page, [CHECK, TEXTAREA]);
          evidence.pointerTargets = { check, text, back };
          if (back) await page.evaluate(y => window.__answerQa.armViewport(y), back.scrollY);
          const busyReceipt = arm('busy-animation-frame');
          const viewportReceipt = back ? arm('viewport-target-frame') : null;
          await command('check-mouse', () => page!.mouse.click(check.x, check.y));
          await busyReceipt();
          if (mode === 'cancel-aba') {
            const started = performance.now();
            // Browser keyboard input, not a scripted value assignment or dispatchEvent.
            await command('textarea-mouse', () => page!.mouse.click(text.x, text.y));
            await command('select-A', () => page!.keyboard.press('ControlOrMeta+A'));
            await command('insert-B', () => page!.keyboard.insertText(B));
            await page.waitForFunction(({ selector, value }): boolean => {
              const text = document.querySelector(selector) as HTMLTextAreaElement | null;
              const root = document.querySelector('.ask__entry--mcp');
              return text?.value === value && !root?.querySelector('[aria-busy="true"]') && !root?.querySelector('.ask__check') &&
                (root?.querySelector('.ask__paste-block .ask__actions button') as HTMLButtonElement | null)?.disabled === false;
            }, { selector: TEXTAREA, value: B });
            evidence.inputCommandToVerifiedDomMs = performance.now() - started;
            await settleFrames(page);
            await command('select-B', () => page!.keyboard.press('ControlOrMeta+A'));
            await command('insert-A', () => page!.keyboard.insertText(evidence.answer));
            const retryBusy = arm('busy-animation-frame');
            await command('retry-check-mouse', () => page!.mouse.click(check.x, check.y));
            await retryBusy();
            metadata.retryLookupState = 'same lookup after cancelled partial scan; not a second cold scan';
          } else if (mode === 'unmount') {
            assert(back);
            await command('back-wheel', () => page!.mouse.wheel(0, back!.scrollY - check.scrollY));
            await viewportReceipt!();
            await command('back-mouse', () => page!.mouse.click(back!.x, back!.y));
            await page.locator('#f-name').waitFor();
            const replacement = await makeReport(page);
            metadata.replacementReport = replacement;
            assert.equal(await page.locator(TEXTAREA).inputValue(), '');
            assert.equal(await page.locator('.ask__entry--mcp .ask__check').count(), 0);
            assert.equal(await page.locator('.ask__entry--mcp [aria-busy="true"]').count(), 0);
            evidence.replacementReportSeen = true;
          }
          if (mode !== 'unmount') {
            // Calculation completion uses the existing whole-run budget; normal
            // input/navigation operations keep the 15s default. This is not a
            // performance success threshold, and no case gets a fresh 180s.
            metadata.resultCompletionWaitMs = remainingRunMs(deadlineAt);
            await page.locator('.ask__entry--mcp .ask__check').waitFor({ timeout: Number(metadata.resultCompletionWaitMs) });
            const unknownCitation: Locator = page.locator('.ask__entry--mcp [data-flag="unknown_citation"]');
            assert.equal(await unknownCitation.count(), 1);
            const text = await unknownCitation.innerText();
            assert(text.includes(MISSING) && !text.includes(evidence.knownId));
            assert.equal(await page.locator('.ask__entry--mcp [data-flag="honesty_violation"]').count(), 1);
          }
          await settleFrames(page);
          metadata.layout = await page.locator('.ask__entry--mcp .ask__paste-block').evaluate(root => {
            const box = root.getBoundingClientRect();
            return { width: innerWidth, root: { left: box.left, right: box.right, width: box.width },
              controls: [...root.querySelectorAll('textarea, button, .ask__summary, .ask__flag-item')].map(node => {
                const r = node.getBoundingClientRect(); return { tag: node.tagName, left: r.left, right: r.right, width: r.width,
                  scrollWidth: node.scrollWidth, clientWidth: node.clientWidth };
              }) };
          });
        } catch (error) { evidence.errors.push(String(error)); }
        finally {
          evidence.timedOut = timedOut;
          if (page && !page.isClosed()) {
            try { evidence.trace = await page.evaluate(() => window.__answerQa.finish()); }
            catch (error) { evidence.errors.push(`evidence collection: ${String(error)}`); }
          }
          try { await context?.close(); } catch (error) { evidence.cleanupErrors.push(String(error)); }
          await Promise.allSettled(outstanding); // Context closure also settles pending input/notice operations.
        }
        let accepted = false;
        try { validate(evidence); validatePointerTargets(evidence); accepted = true; } catch (error) { diagnostics.push({ viewport, mode, validation: String(error) }); }
        const tasks = tasksAfterFirstCheck(evidence.trace);
        const checks = evidence.trace.events.filter(event => event.kind === 'check');
        const checkWindows = checks.map((check, index) => {
          const nextCheck = checks[index + 1]?.at ?? Infinity;
          const end = evidence.trace.events.find(event => event.at > check.at && event.at < nextCheck &&
            event.kind === 'state' && (event.summary !== null || !event.mounted || (event.value !== check.value && !event.busy)));
          return { checkAtPageMs: check.at, terminalAtPageMs: end?.at ?? null,
            terminalKind: !end ? 'not-observed' : !end.mounted ? 'unmounted' : end.summary !== null ? 'result' : 'edited-and-cleared',
            checkToTerminalMs: end ? end.at - check.at : null };
        });
        results.push({ functionalObservationGatePassed: accepted, metadata, evidence, checkWindows, observedLongTasksAfterFirstCheck: tasks,
          longTaskObservationEndAtPageMs: evidence.trace.finishedAt,
          maxObservedLongTaskMs: tasks?.length ? Math.max(...tasks.map(task => task.duration)) : null,
          verdict: accepted ? 'bounded DOM/input observations passed; request identity/background abort, numeric responsiveness and visual acceptance remain unverified' : 'NOT ACCEPTED; inspect errors and event ordering' });
        if (!accepted) throw new Error(`${viewport.width}px ${mode} failed; remaining cases NOT RUN`);
      }
    }
    assert.equal(results.length, 6, 'all planned cases must finish');
    // Run after the six genuine UI observations, so diagnostic warming cannot
    // alter their cold-lookup measurements. Still under the SAME run deadline.
    remainingRunMs(deadlineAt);
    const bridges: string[] = [];
    for (const file of Object.keys(buildFiles)) {
      if (/^assets\/core-.*\.js$/.test(file) && (await readFile(resolve(ROOT, file), 'utf8')).includes('buildTimelineCooperatively:')) bridges.push(file);
    }
    assert.equal(bridges.length, 1, 'exact production bridge required for the bounded profile');
    const profilingContext = await browser.newContext({ serviceWorkers: 'block' });
    try {
      profilingContext.setDefaultTimeout(15_000);
      await profilingContext.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());
      const page = await profilingContext.newPage();
      page.on('pageerror', error => schedulerProfileErrors.push(`pageerror: ${String(error)}`));
      await page.goto(`${origin}/fortunetelling/`);
      schedulerProfile = await measureSchedulerProfile(page, `${origin}/fortunetelling/${bridges[0]}`);
      remainingRunMs(deadlineAt);
    } catch (error) { schedulerProfileErrors.push(`evaluation: ${String(error)}`); }
    finally {
      try { await profilingContext.close(); }
      catch (error) { schedulerProfileErrors.push(`cleanup: ${String(error)}`); }
    }
    assert(schedulerProfile, 'scheduler diagnostic did not return a complete observation');
    validateSchedulerProfile(schedulerProfile, schedulerProfileErrors);
    passed = true;
  } catch (error) { diagnostics.push({ fatal: String(error) }); process.exitCode = 1; }
  finally {
    if (timer) clearTimeout(timer);
    await deadlineCleanup;
    for (const [name, action] of [['server.stop', stop], ['browser.close', () => browser?.close()]] as const) {
      try { await action(); } catch (error) { diagnostics.push({ cleanup: name, error: String(error) }); passed = false; process.exitCode = 1; }
    }
    if (timedOut) { passed = false; process.exitCode = 1; }
    await writeFile(resolve(OUTPUT, 'results.json'), JSON.stringify({ passed, timedOut, runtime, browserVersion, sourceHashes, fixture, schedulerProfile, schedulerProfileErrors,
      plannedCases: 6, attemptedCases: results.length,
      passingObservationCases: results.filter(result => result.functionalObservationGatePassed).length,
      notRunCases: 6 - results.length, results, diagnostics,
      scope: 'real built application with synthetic input; original #19/#46 cold citation cases only',
      issueAcceptance: 'INCOMPLETE: functional observations cannot prove identical-A request provenance or underlying background abort',
      limits: ['No physical-phone, iOS/WebKit, deployed Pages, PWA, or retained screenshot/trace acceptance.',
        'Cold lookup is not cold engine/JIT. Sixteen years are the source-defined fake-ID reach; swallowed annual exceptions are not proved absent.',
        'Busy animation-frame observation is a paint opportunity, not screenshot/pixel verification.',
        'Host command-to-verified-DOM duration includes automation overhead; it is not physical input latency.',
        'No arbitrary performance budget. Long Tasks and interaction observations require an explicit UX review.',
        'A → B → A resumes a partially prepared lookup. DOM observations cannot identify whether old or new A produced a matching result; background abort and identical-A stale-request exclusion remain UNVERIFIED.',
        'Controlled late-success/failure ordering remains separate evidence from the existing lifecycle tests; no runtime production mutation is executed here.'],
    }, null, 2));
  }
}

// Deliberately separate process/contexts, invoked only AFTER the unchanged timed
// run. Screenshot work never occurs in its six cases or scheduler profile.
const VISUAL_OUTPUT = resolve(OUTPUT, 'visual');
const VISUAL_PHASES = ['ready', 'busy', 'result', 'cleared'] as const;
type VisualPhase = typeof VISUAL_PHASES[number];
type VisualSnapshot = {
  at: number; value: string; busy: boolean; buttonDisabled: boolean; summary: string | null;
  flags: string[]; unknownText: string; alert: boolean; viewport: { width: number; height: number };
  scroll: { x: number; y: number }; target: { left: number; top: number; right: number; bottom: number; width: number; height: number };
  controls: { tag: string; left: number; right: number; width: number; scrollWidth: number; clientWidth: number }[];
};
type VisualFont = { selector: string; text: string; computedFamily: string; fonts: { familyName: string; isCustomFont: boolean; glyphCount: number }[] };
type VisualAttempt = { file: string; phase: VisualPhase; viewport: { width: number; height: number };
  stage: 'attempted' | 'captured' | 'validated'; error?: string; framing?: { viewportHeight: number; targetTop: number; targetHeight: number; requestedScrollY: number };
  before?: VisualSnapshot; after?: VisualSnapshot; png?: VisualShot['png']; font?: VisualFont };
type VisualShot = { file: string; phase: VisualPhase; viewport: { width: number; height: number };
  png: { width: number; height: number; bytes: number; sha256: string };
  before: VisualSnapshot; after: VisualSnapshot; font: VisualFont };
type VisualCase = { viewport: { width: number; height: number }; asOf: string; knownId: string; reportYears: number;
  answer: string; events: Observation[]; errors: string[]; cleanupErrors: string[]; recorderFinished: boolean };

function pngIdentity(bytes: Buffer) {
  assert(bytes.length > 24 && bytes.length <= 4 * 1024 * 1024, 'PNG absent or exceeds the 4 MiB per-image bound');
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(bytes.subarray(12, 16).toString(), 'IHDR');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bytes: bytes.length,
    sha256: new Bun.CryptoHasher('sha256').update(bytes).digest('hex') };
}

function visualFontTarget(phase: VisualPhase) {
  if (phase === 'result') return { selector: '.ask__entry--mcp .ask__paste-block .ask__summary',
    text: '共 2 段，引用了 2 個訊號；2 個地方需要留意：' };
  if (phase === 'busy') return { selector: '.ask__entry--mcp .ask__paste-block [role="status"][aria-busy="true"]',
    text: '正在對照訊號編號（最久約十幾秒）…' };
  return { selector: CHECK, text: '檢查引用的訊號' };
}

function visualCounts(attempts: VisualAttempt[]) {
  assert(attempts.length <= 8); assert.equal(new Set(attempts.map(a => a.file)).size, attempts.length);
  for (const attempt of attempts) {
    assert([1280, 390].includes(attempt.viewport.width) && VISUAL_PHASES.includes(attempt.phase));
    assert.equal(attempt.file, `${attempt.viewport.width}-${attempt.phase}.png`);
    assert(['attempted', 'captured', 'validated'].includes(attempt.stage));
    if (attempt.stage !== 'attempted') assert(attempt.png, 'captured bytes require PNG identity');
    if (attempt.stage === 'validated') assert(!Object.hasOwn(attempt, 'error') && attempt.before && attempt.after && attempt.font);
  }
  return { plannedScreenshots: 8, attemptedScreenshots: attempts.length,
    capturedScreenshots: attempts.filter(a => a.stage !== 'attempted').length,
    validatedScreenshots: attempts.filter(a => a.stage === 'validated').length,
    failedAttempts: attempts.filter(a => Object.hasOwn(a, 'error')).length, notRunScreenshots: 8 - attempts.length };
}

function validateVisualShot(shot: VisualShot, entry: VisualCase) {
  const expectedFont = visualFontTarget(shot.phase);
  assert.equal(shot.font.selector, expectedFont.selector, 'font probe selector must match this phase');
  assert.equal(shot.font.text, expectedFont.text, 'font probe must use this phase’s actual CJK label');
  assert(shot.font.fonts.some(font => font.familyName.startsWith('Noto Sans CJK') && !font.isCustomFont && font.glyphCount > 0),
    'actual Chrome text rendering lacks installed CJK fallback glyphs');
  assert.equal(shot.file, `${entry.viewport.width}-${shot.phase}.png`);
  assert(VISUAL_PHASES.includes(shot.phase));
  assert.deepEqual(shot.viewport, entry.viewport);
  assert.equal(shot.png.width, entry.viewport.width); assert.equal(shot.png.height, entry.viewport.height);
  assert(shot.png.bytes > 24 && shot.png.bytes <= 4 * 1024 * 1024);
  assert.match(shot.png.sha256, /^[0-9a-f]{64}$/);
  assert(Number.isFinite(shot.before.at) && shot.after.at >= shot.before.at);
  for (const state of [shot.before, shot.after]) {
    assert.deepEqual(state.viewport, entry.viewport);
    assert.equal(state.alert, false);
    assert.equal(state.value, shot.phase === 'cleared' ? B : entry.answer);
    assert.equal(state.busy, shot.phase === 'busy');
    assert.equal(state.buttonDisabled, shot.phase === 'busy');
    // Screenshots must contain the entire intended review region, not a clipped
    // offscreen status/flag presented as visual evidence. No pixels are altered.
    const r = state.target;
    assert(Object.values(r).every(Number.isFinite));
    assert(r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 &&
      r.right <= entry.viewport.width && r.bottom <= entry.viewport.height, 'review target clipped outside viewport');
    assert(state.controls.length > 0, 'review controls absent');
    for (const control of state.controls) {
      assert(control.width > 0 && control.left >= 0 && control.right <= entry.viewport.width, 'horizontal control clipping');
      assert(control.scrollWidth <= control.clientWidth + 1, 'horizontal content overflow');
    }
    if (shot.phase === 'result') {
      assert(state.summary?.includes('2 個地方需要留意'));
      assert.deepEqual([...state.flags].sort(), ['honesty_violation', 'unknown_citation']);
      assert(state.unknownText.includes(MISSING) && !state.unknownText.includes(entry.knownId));
    } else {
      assert.equal(state.summary, null); assert.deepEqual(state.flags, []);
    }
  }
  assert.deepEqual(shot.after.target, shot.before.target, 'target moved during capture');
  assert.deepEqual(shot.after.scroll, shot.before.scroll, 'viewport scrolled during capture');
}

function validateVisualCases(cases: VisualCase[], shots: VisualShot[]) {
  assert.deepEqual(cases.map(c => c.viewport), [{ width: 1280, height: 900 }, { width: 390, height: 844 }]);
  assert.equal(shots.length, 8, 'all eight PNGs required; partial capture cannot pass');
  for (const entry of cases) {
    assert.deepEqual(entry.errors, []); assert.deepEqual(entry.cleanupErrors, []);
    assert(entry.recorderFinished); assert.equal(entry.reportYears, 5);
    assert.match(entry.asOf, /^\d{4}-\d{2}-\d{2}$/); assert.match(entry.knownId, /^sig_[0-9a-f]{8,16}$/);
    const selected = shots.filter(shot => shot.viewport.width === entry.viewport.width);
    assert.deepEqual(selected.map(shot => shot.phase), VISUAL_PHASES);
    for (const shot of selected) validateVisualShot(shot, entry);
    const check = entry.events.find(event => event.kind === 'check' && event.trusted && event.value === entry.answer);
    const frame = entry.events.find(event => event.kind === 'busy-animation-frame' && event.busy && event.value === entry.answer);
    const edit = entry.events.find(event => event.kind === 'input' && event.trusted && event.value === B);
    assert(check && frame && edit && check.at < frame.at, 'real check/busy/input receipts required');
    assert(selected[0].after.at < check.at, 'ready screenshot must finish before the trusted check');
    assert(frame.at <= selected[1].before.at);
    assert(selected[1].after.at < selected[2].before.at && selected[2].after.at < edit.at && edit.at <= selected[3].before.at,
      'busy/result/real-edit/clear capture ordering invalid');
  }
}

async function visualSnapshot(page: Page, phase: VisualPhase): Promise<VisualSnapshot> {
  return page.evaluate(phase => {
    const root = document.querySelector('.ask__entry--mcp .ask__paste-block');
    const textarea = root?.querySelector('textarea') as HTMLTextAreaElement | null;
    const button = root?.querySelector('.ask__actions button') as HTMLButtonElement | null;
    const target = phase === 'result' ? root?.querySelector('.ask__check') : root;
    if (!root || !textarea || !button || !target) throw new Error('visual target absent');
    const r = target.getBoundingClientRect();
    return { at: performance.now(), value: textarea.value, busy: Boolean(root.querySelector('[aria-busy="true"]')),
      buttonDisabled: button.disabled, summary: root.querySelector('.ask__summary')?.textContent ?? null,
      flags: [...root.querySelectorAll('[data-flag]')].map(n => n.getAttribute('data-flag')!),
      unknownText: root.querySelector('[data-flag="unknown_citation"]')?.textContent ?? '',
      alert: Boolean(root.querySelector('[role="alert"]')), viewport: { width: innerWidth, height: innerHeight },
      scroll: { x: scrollX, y: scrollY }, target: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
      controls: [...target.querySelectorAll('textarea, button, [role="status"], .ask__summary, .ask__flag-item, .ask__method')].map(node => {
        const box = node.getBoundingClientRect();
        return { tag: node.tagName, left: box.left, right: box.right, width: box.width,
          scrollWidth: node.scrollWidth, clientWidth: node.clientWidth };
      }) };
  }, phase);
}

function visualSelfTest() {
  // Evidence-object mutations only. These do not generate or review screenshots.
  const cases: VisualCase[] = [{ width: 1280, height: 900 }, { width: 390, height: 844 }].map(viewport => ({
    viewport, asOf: '2026-10-10', knownId: 'sig_12345678', reportYears: 5, answer: 'A', errors: [], cleanupErrors: [], recorderFinished: true,
    events: [{ kind: 'check', at: 2, value: 'A', trusted: true, busy: false, mounted: true, summary: null, flags: [] },
      { kind: 'busy-animation-frame', at: 3, value: 'A', busy: true, mounted: true, summary: null, flags: [] },
      { kind: 'input', at: 8, value: B, trusted: true, busy: false, mounted: true, summary: null, flags: [] }] }));
  const shots: VisualShot[] = cases.flatMap(entry => VISUAL_PHASES.map((phase, index) => {
    const at = [1, 4, 6, 9][index];
    const state: VisualSnapshot = { at, value: phase === 'cleared' ? B : 'A', busy: phase === 'busy', buttonDisabled: phase === 'busy',
      summary: phase === 'result' ? '2 個地方需要留意' : null,
      flags: phase === 'result' ? ['unknown_citation', 'honesty_violation'] : [], unknownText: phase === 'result' ? MISSING : '', alert: false,
      viewport: entry.viewport, scroll: { x: 0, y: 0 }, target: { left: 1, right: 101, top: 1, bottom: 101, width: 100, height: 100 },
      controls: [{ tag: 'TEXTAREA', left: 1, right: 101, width: 100, scrollWidth: 100, clientWidth: 100 }] };
    return { file: `${entry.viewport.width}-${phase}.png`, phase, viewport: entry.viewport,
      png: { ...entry.viewport, bytes: 100, sha256: 'a'.repeat(64) },
      font: { ...visualFontTarget(phase), computedFamily: 'sans-serif',
        fonts: [{ familyName: 'Noto Sans CJK TC', isCustomFont: false, glyphCount: 7 }] }, before: state, after: { ...structuredClone(state), at: at + 0.5 } };
  }));
  validateVisualCases(cases, shots);
  const mutations: [string, (c: VisualCase[], s: VisualShot[]) => void][] = [
    ['wrong phase font selector', (_, s) => { s[1].font.selector = CHECK; }],
    ['unrelated CJK label', (_, s) => { s[0].font.text = '無關文字'; }],
    ['unrelated font element and label', (_, s) => { s[0].font.selector = 'footer'; s[0].font.text = '無關文字'; }],
    ['no CJK rendered glyphs', (_, s) => { s[0].font.fonts[0].glyphCount = 0; }],
    ['non-CJK fallback', (_, s) => { s[0].font.fonts[0].familyName = 'Arial'; }],
    ['external custom font', (_, s) => { s[0].font.fonts[0].isCustomFont = true; }],
    ['font probe without CJK text', (_, s) => { s[0].font.text = 'ASCII'; }],
    ['missing screenshot', (_, s) => { s.pop(); }], ['wrong viewport pixels', (_, s) => { s[0].png.width = 1; }],
    ['ready after check', (_, s) => { s[0].before.at = 2; s[0].after.at = 2.5; }],
    ['ready after all phases', (_, s) => { s[0].before.at = 10; s[0].after.at = 10.5; }],
    ['busy ended during screenshot', (_, s) => { s[1].after.busy = false; }],
    ['missing flags', (_, s) => { s[2].after.flags = []; }], ['old result after edit', (_, s) => { s[3].after.summary = 'stale'; }],
    ['offscreen screenshot target', (_, s) => { s[0].before.target.top = -1; }],
    ['centered oversized target', (_, s) => { s[0].before.target.top = -50; s[0].before.target.bottom = 950; s[0].before.target.height = 1000; }],
    ['horizontal text overflow', (_, s) => { s[2].after.controls[0].scrollWidth = 200; }],
    ['non-whitelisted PNG', (_, s) => { s[0].file = '../private.png'; }],
    ['oversized PNG', (_, s) => { s[0].png.bytes = 4 * 1024 * 1024 + 1; }],
    ['missing hash', (_, s) => { s[0].png.sha256 = ''; }], ['page error', c => { c[0].errors.push('pageerror'); }],
    ['cleanup error', c => { c[0].cleanupErrors.push('close'); }], ['no finish receipt', c => { c[0].recorderFinished = false; }],
    ['scripted edit', c => { c[0].events[2].trusted = false; }],
    ['edit before result capture', c => { c[0].events[2].at = 5; }],
    ['no busy frame', c => { c[0].events.splice(1, 1); }],
  ];
  for (const [name, mutate] of mutations) { const c = structuredClone(cases), s = structuredClone(shots); mutate(c, s); assert.throws(() => validateVisualCases(c, s), Error, name); }
  assert.throws(() => pngIdentity(Buffer.alloc(32)), Error, 'invalid PNG signature');
  const failedCapture: VisualAttempt = { ...shots[0], stage: 'captured', error: 'clipped' };
  assert.deepEqual(visualCounts([failedCapture]), { plannedScreenshots: 8, attemptedScreenshots: 1, capturedScreenshots: 1,
    validatedScreenshots: 0, failedAttempts: 1, notRunScreenshots: 7 });
  assert.equal(visualCounts([{ ...failedCapture, stage: 'attempted', png: undefined }]).capturedScreenshots, 0);
  assert.throws(() => visualCounts([{ ...failedCapture, stage: 'validated' }]), Error, 'failed capture cannot be validated');
  assert.throws(() => visualCounts([{ ...failedCapture, png: undefined }]), Error, 'captured without retained PNG identity');
  assert.throws(() => visualCounts([failedCapture, failedCapture]), Error, 'duplicate attempted filename');
  assert.equal(visualCounts([{ ...failedCapture, error: '' }]).failedAttempts, 1, 'empty thrown reason still failed');
  assert.throws(() => visualCounts([{ ...failedCapture, error: '', stage: 'validated' }]), Error, 'empty error cannot be validated');
  console.log(JSON.stringify({ scope: 'visual evidence validation only; no screenshot or browser execution',
    rejectedMutations: mutations.map(([name]) => name).concat('invalid PNG signature', 'failed capture marked validated', 'captured without PNG identity', 'duplicate attempt', 'empty error marked validated'), passed: true }));
}

async function runVisual() {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.ANSWER_BROWSER_CHECK !== '1')
    throw new Error('Visual execution uses only the approved stock-Chrome GitHub job; do not spoof runner flags locally.');
  await mkdir(VISUAL_OUTPUT, { recursive: true });
  assert.deepEqual(await readdir(VISUAL_OUTPUT), [], 'stale visual output must never be reused');
  const attempts: VisualAttempt[] = [];
  const cases: VisualCase[] = [], screenshots: VisualShot[] = [], errors: string[] = [], cleanupErrors: string[] = [];
  const runtime: Record<string, unknown> = { bun: Bun.version, platform: process.platform, arch: process.arch,
    imageOS: process.env.ImageOS, imageVersion: process.env.ImageVersion, cpuModel: cpus()[0]?.model, logicalCpus: cpus().length,
    expectedPrHead: process.env.ANSWER_HEAD_SHA, eventMergeCommit: process.env.GITHUB_SHA,
    playwright: (createRequire(import.meta.url)('playwright/package.json') as { version: string }).version,
    channel: 'chrome', chromiumSandbox: true, deviceScaleFactor: 1 };
  let browser: Browser | undefined, server: ReturnType<typeof Bun.serve> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined, deadlineCleanup: Promise<void> | undefined;
  let timedOut = false, captureGatePassed = false;
  const outstanding: Promise<unknown>[] = [];
  try {
    assert.notEqual(process.getuid?.(), 0); await access('/opt/google/chrome/chrome', constants.X_OK);
    const command = (...args: string[]) => { const r = Bun.spawnSync(args); assert.equal(r.exitCode, 0); return r.stdout.toString().trim(); };
    const fontPackage = command('dpkg-query', '-W', '-f=${Package} ${Version} ${Status}', 'fonts-noto-cjk');
    assert(fontPackage.endsWith('install ok installed'));
    const [fontFamily, fontFile] = command('fc-match', '--format', '%{family}\n%{file}\n', 'sans-serif:lang=zh-tw').split('\n');
    assert(fontFamily?.includes('Noto Sans CJK') && fontFile?.startsWith('/usr/share/fonts/opentype/noto/'));
    await access(fontFile, constants.R_OK);
    runtime.cjkFallback = { package: fontPackage, family: fontFamily, file: fontFile,
      sha256: new Bun.CryptoHasher('sha256').update(await readFile(fontFile)).digest('hex'),
      scope: 'Official Ubuntu system fallback prepared after timed cases; not production Google Fonts validation' };
    const git = (...args: string[]) => { const r = Bun.spawnSync(['git', ...args]); assert.equal(r.exitCode, 0); return r.stdout.toString().trim(); };
    runtime.actualCheckoutCommit = git('rev-parse', 'HEAD'); runtime.actualCheckoutTree = git('rev-parse', 'HEAD^{tree}');
    runtime.actualCheckoutParents = [...git('cat-file', '-p', 'HEAD').matchAll(/^parent ([0-9a-f]{40})$/gm)].map(m => m[1]);
    assert.match(String(runtime.expectedPrHead), /^[0-9a-f]{40}$/); assert.equal(runtime.actualCheckoutCommit, runtime.expectedPrHead);
    // The preceding timed command intentionally wrote this one untracked file.
    // Reject every other source change, rather than disabling the clean-tree gate.
    const status = git('status', '--porcelain', '--untracked-files=all');
    assert(status === '' || status === '?? answer-browser-results/results.json', 'unexpected source/output changes');
    const timed = JSON.parse(await readFile(resolve(OUTPUT, 'results.json'), 'utf8'));
    assert.equal(timed.passed, true); assert.equal(timed.timedOut, false);
    assert.equal(timed.plannedCases, 6); assert.equal(timed.attemptedCases, 6); assert.equal(timed.passingObservationCases, 6);
    assert.equal(timed.runtime.actualCheckoutCommit, runtime.actualCheckoutCommit);
    assert.equal(timed.runtime.actualCheckoutTree, runtime.actualCheckoutTree);
    const build: Record<string, string> = {};
    async function hashBuild(path: string) {
      for (const entry of await readdir(path, { withFileTypes: true })) {
        const full = resolve(path, entry.name);
        if (entry.isDirectory()) await hashBuild(full);
        else { assert(entry.isFile()); build[full.slice(ROOT.length + 1)] = new Bun.CryptoHasher('sha256').update(await readFile(full)).digest('hex'); }
      }
    }
    await hashBuild(ROOT); assert(build['index.html']); assert.deepEqual(build, timed.runtime.buildSha256);
    runtime.buildSha256 = build; runtime.timedResultsSha256 = new Bun.CryptoHasher('sha256').update(await readFile(resolve(OUTPUT, 'results.json'))).digest('hex');
    runtime.sourceHashes = timed.sourceHashes;
    for (const [file, hash] of Object.entries(timed.sourceHashes)) assert.equal(new Bun.CryptoHasher('sha256').update(await readFile(file)).digest('hex'), hash);
    server = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(request) {
      const pathname = decodeURIComponent(new URL(request.url).pathname);
      if (!pathname.startsWith('/fortunetelling/')) return new Response('not found', { status: 404 });
      const full = resolve(ROOT, pathname.slice('/fortunetelling/'.length) || 'index.html');
      if (!full.startsWith(ROOT + sep)) return new Response('not found', { status: 404 });
      const file = Bun.file(full); return await file.exists() ? new Response(file, { headers: { 'Cache-Control': 'no-store' } }) : new Response('not found', { status: 404 });
    } });
    const origin = `http://127.0.0.1:${server.port}`;
    browser = await chromium.launch({ channel: 'chrome', chromiumSandbox: true, timeout: 15_000 });
    runtime.browserVersion = browser.version();
    const deadlineAt = performance.now() + RUN_DEADLINE_MS;
    timer = setTimeout(() => { timedOut = true; deadlineCleanup = (async () => {
      for (const value of await Promise.allSettled([Promise.resolve().then(() => server?.stop(true)), browser!.close()]))
        if (value.status === 'rejected') cleanupErrors.push(`deadline cleanup: ${String(value.reason)}`);
    })(); }, RUN_DEADLINE_MS);
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      remainingRunMs(deadlineAt);
      const entry: VisualCase = { viewport, asOf: '', knownId: '', reportYears: 0, answer: '', events: [], errors: [], cleanupErrors: [], recorderFinished: false };
      cases.push(entry);
      let context: BrowserContext | undefined, page: Page | undefined;
      const input = async (action: () => Promise<unknown>) => {
        let limit: ReturnType<typeof setTimeout> | undefined;
        const operation = Promise.resolve().then(action);
        outstanding.push(operation.catch(() => {}));
        try {
          await Promise.race([operation, new Promise<never>((_, reject) => {
            limit = setTimeout(() => reject(new Error('Visual input exceeded the unchanged 15s interaction limit')), 15_000);
          })]);
        } finally { if (limit) clearTimeout(limit); }
      };
      try {
        context = await browser.newContext({ viewport, deviceScaleFactor: 1, serviceWorkers: 'block', reducedMotion: 'reduce' });
        context.setDefaultTimeout(15_000);
        await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
        await context.addInitScript(installRecorder); page = await context.newPage();
        page.on('pageerror', error => entry.errors.push(String(error)));
        await page.goto(`${origin}/fortunetelling/`); await page.evaluate(() => document.fonts.ready.then(() => undefined));
        Object.assign(entry, await makeReport(page));
        entry.answer = `A：這段時期傾向有支撐〔${entry.knownId}〕。\n\n你一定會成功〔${MISSING}〕。`;
        await page.locator(TEXTAREA).fill(entry.answer);
        const cdp = await context.newCDPSession(page);
        await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
        const capture = async (phase: VisualPhase) => {
          const file = `${viewport.width}-${phase}.png`;
          const attempt: VisualAttempt = { file, phase, viewport, stage: 'attempted' }; attempts.push(attempt);
          try {
            remainingRunMs(deadlineAt);
            const selector = phase === 'result' ? '.ask__entry--mcp .ask__check' : '.ask__entry--mcp .ask__paste-block';
            // This separate visual pass frames real geometry only. No resize, CSS
            // change, clipping exemption, or claim of native wheel responsiveness.
            attempt.framing = await page!.locator(selector).evaluate(target => {
              const r = target.getBoundingClientRect();
              const requestedScrollY = scrollY + r.top + (r.height - innerHeight) / 2;
              const receipt = { viewportHeight: innerHeight, targetTop: r.top, targetHeight: r.height, requestedScrollY };
              scrollTo({ top: requestedScrollY, left: scrollX, behavior: 'instant' }); return receipt;
            });
            await settleFrames(page!);
            const before = attempt.before = await visualSnapshot(page!, phase);
            const bytes = await page!.screenshot({ type: 'png', fullPage: false, scale: 'css', animations: 'allow', caret: 'initial', timeout: 15_000 });
            const png = pngIdentity(bytes);
            // Retain genuine failed pixels and pre-capture geometry before any
            // state/clip/font gate. A filename names the attempt, never a PASS.
            await writeFile(resolve(VISUAL_OUTPUT, file), bytes);
            assert.deepEqual(await readFile(resolve(VISUAL_OUTPUT, file)), bytes);
            attempt.png = png; attempt.stage = 'captured';
            const after = attempt.after = await visualSnapshot(page!, phase);
            const fontSelector = visualFontTarget(phase).selector;
            const { root } = await cdp.send('DOM.getDocument');
            const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: fontSelector });
            assert(nodeId, 'actual font probe target absent');
            const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
            const font: VisualFont = attempt.font = { selector: fontSelector, fonts,
              ...await page!.locator(fontSelector).evaluate(node => ({ text: node.textContent ?? '', computedFamily: getComputedStyle(node).fontFamily })) };
            const shot: VisualShot = { file, phase, viewport, png, before, after, font }; screenshots.push(shot);
            validateVisualShot(shot, entry); attempt.stage = 'validated';
          } catch (error) { attempt.error = String(error); throw error; }
        };
        await capture('ready');
        const [point] = await stablePoints(page, [CHECK]);
        const busy = page.waitForEvent('console', { timeout: 15_000, predicate: message => {
          if (!message.text().startsWith(NOTICE)) return false;
          const value = JSON.parse(message.text().slice(NOTICE.length)) as Observation;
          return value.kind === 'busy-animation-frame' && value.busy && value.value === entry.answer;
        } }).then(() => ({ ok: true }), error => ({ error }));
        outstanding.push(busy);
        await input(() => page!.mouse.click(point.x, point.y)); const observed = await busy; if ('error' in observed) throw observed.error;
        await capture('busy');
        await page.locator('.ask__entry--mcp .ask__check').waitFor({ timeout: remainingRunMs(deadlineAt) });
        await capture('result');
        await page.locator(TEXTAREA).scrollIntoViewIfNeeded();
        const [textPoint] = await stablePoints(page, [TEXTAREA]);
        await input(() => page!.mouse.click(textPoint.x, textPoint.y));
        await input(() => page!.keyboard.press('ControlOrMeta+A')); await input(() => page!.keyboard.insertText(B));
        await page.waitForFunction(({ selector, value }) => {
          const text = document.querySelector(selector) as HTMLTextAreaElement | null;
          return text?.value === value && !document.querySelector('.ask__entry--mcp .ask__check') && !document.querySelector('.ask__entry--mcp [aria-busy="true"]');
        }, { selector: TEXTAREA, value: B });
        await capture('cleared');
      } catch (error) { entry.errors.push(String(error)); }
      finally {
        if (page && !page.isClosed()) try {
          const trace: Trace = await page.evaluate(() => window.__answerQa.finish());
          assert.equal(trace.overflow, false); assert(trace.finishedAt !== null);
          entry.events = trace.events; entry.recorderFinished = true;
        } catch (error) { entry.errors.push(`recorder: ${String(error)}`); }
        try { await context?.close(); } catch (error) { entry.cleanupErrors.push(String(error)); }
      }
      if (entry.errors.length || entry.cleanupErrors.length) throw new Error(`${viewport.width}px visual capture failed; remaining phases NOT RUN`);
    }
    validateVisualCases(cases, screenshots);
    assert.equal(visualCounts(attempts).validatedScreenshots, 8); captureGatePassed = true;
  } catch (error) { errors.push(String(error)); process.exitCode = 1; }
  finally {
    if (timer) clearTimeout(timer); await deadlineCleanup;
    for (const action of [() => server?.stop(true), () => browser?.close()]) try { await action(); } catch (error) { cleanupErrors.push(String(error)); }
    await Promise.allSettled(outstanding);
    if (timedOut || cleanupErrors.length) { captureGatePassed = false; process.exitCode = 1; }
    const counts = visualCounts(attempts);
    const manifest = { schema: 2, captureGatePassed, pixelReview: 'NOT_REVIEWED: actual downloaded PNG inspection by author and independent reviewer is required',
      timedOut, runtime, fixture, ...counts,
      attempts, screenshots, cases, errors, cleanupErrors,
      scope: 'Separate synthetic visual capture after the original timed run, same production build; desktop Chrome viewports only',
      limits: ['No screenshots or added work in the original six timed cases or scheduler profile.',
        'Screenshots may disturb this separate run; its event times are not benchmark or input-latency measurements.',
        'Same-origin built assets only; external fonts blocked, so fallback-font rendering only. Service workers blocked.',
        'Viewport framing centers measured target geometry; full clipping/overflow gates remain, including oversized targets.',
        'Framing is not native wheel responsiveness. Captured failed PNGs retain their attempted names; only validatedScreenshots passed capture gates.',
        'CJK font probe verifies rendered glyphs for the selected real label; actual review of every PNG is still required.',
        'No physical phone, iOS/WebKit, deployed public-site HTTP/UI, complete issue acceptance or background-abort proof.',
        'Only eight explicitly named PNGs and this synthetic manifest may be uploaded, with one-day retention.'] };
    const serialized = JSON.stringify(manifest, null, 2); assert(Buffer.byteLength(serialized) <= 512 * 1024, 'visual manifest exceeds bound');
    await writeFile(resolve(VISUAL_OUTPUT, 'manifest.json'), serialized);
    console.log(JSON.stringify({ captureGatePassed, ...counts, pixelReview: manifest.pixelReview, errors, cleanupErrors }));
  }
}

if (Bun.argv.includes('--self-test')) { selfTest(); visualSelfTest(); }
else if (Bun.argv.includes('--visual')) await runVisual();
else await run();
