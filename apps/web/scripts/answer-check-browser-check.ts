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
const RUN_DEADLINE_MS = 180_000;
const fixture = { name: 'QA Synthetic', date: '1995-07-16', time: '22:00', gender: 'male', city: 'tainan', accuracy: 'exact' };
type Mode = 'complete' | 'cancel-aba' | 'unmount';
type Observation = { kind: string; at: number; value: string; busy: boolean; mounted: boolean;
  summary: string | null; flags: string[]; trusted?: boolean; eventTimestamp?: number };
type Trace = { events: Observation[]; longTasks: { start: number; duration: number }[];
  longTasksSupported: boolean; overflow: boolean; finishedAt: number | null };
type Evidence = { mode: Mode; answer: string; trace: Trace; errors: string[]; timedOut: boolean;
  cleanupErrors: string[]; asOf: string; knownId: string; reportYears: number;
  inputCommandToVerifiedDomMs?: number; replacementReportSeen?: boolean };
declare global { interface Window { __answerQa: { finish(): Trace } } }

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
      append({ ...snapshot('check'), trusted: event.isTrusted, eventTimestamp: event.timeStamp });
    } else if (button.textContent?.includes('重新輸入')) {
      append({ ...snapshot('back'), trusted: event.isTrusted, eventTimestamp: event.timeStamp });
    }
  };
  document.addEventListener('input', input, true);
  document.addEventListener('click', click, true);
  const tick = () => {
    const current = snapshot('busy-animation-frame');
    if (current.busy && framedCheck !== checkNumber) { framedCheck = checkNumber; append(current); }
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
  window.__answerQa = { finish() {
    observe(); collect(tasks.takeRecords()); tasks.disconnect(); mutation.disconnect();
    cancelAnimationFrame(frame);
    document.removeEventListener('input', input, true); document.removeEventListener('click', click, true);
    return { events, longTasks, longTasksSupported, overflow, finishedAt: performance.now() };
  } };
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
  console.log(JSON.stringify({ scope: 'evidence-validator self-test only; no browser executed', positiveFixtures: 3,
    rejectedMutations: mutations.map(([name]) => name).concat('stale result after unmount', 'result preceded busy observation'),
    resultDeadlineControls: 'remaining global budget; expired/zero budget rejected',
    longTaskWindowControls: 'post-DOM-change task retained on timeout; missing finish stays unknown',
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
          await page.locator(CHECK).click();
          await page.locator('.ask__entry--mcp [role="status"][aria-busy="true"]').waitFor();
          await settleFrames(page);
          if (mode === 'cancel-aba') {
            const started = performance.now();
            // Browser keyboard input, not a scripted value assignment or dispatchEvent.
            await page.locator(TEXTAREA).focus();
            await page.keyboard.press('ControlOrMeta+A');
            await page.keyboard.insertText(B);
            await page.waitForFunction(({ selector, value }): boolean => {
              const text = document.querySelector(selector) as HTMLTextAreaElement | null;
              const root = document.querySelector('.ask__entry--mcp');
              return text?.value === value && !root?.querySelector('[aria-busy="true"]') && !root?.querySelector('.ask__check') &&
                (root?.querySelector('.ask__paste-block .ask__actions button') as HTMLButtonElement | null)?.disabled === false;
            }, { selector: TEXTAREA, value: B });
            evidence.inputCommandToVerifiedDomMs = performance.now() - started;
            await settleFrames(page);
            await page.keyboard.press('ControlOrMeta+A');
            await page.keyboard.insertText(evidence.answer);
            await page.locator(CHECK).click();
            metadata.retryLookupState = 'same lookup after cancelled partial scan; not a second cold scan';
          } else if (mode === 'unmount') {
            await page.getByRole('button', { name: '← 重新輸入', exact: true }).click();
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
        }
        let accepted = false;
        try { validate(evidence); accepted = true; } catch (error) { diagnostics.push({ viewport, mode, validation: String(error) }); }
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

if (Bun.argv.includes('--self-test')) selfTest();
else await run();
