/**
 * Opt-in, real-engine diagnostics for #19 / #46. Run from the repository root:
 *   bun run apps/web/tests/diagnostics/measureAnswerCheck.ts > answer-check.json
 *
 * This is a Bun process measurement, NOT browser paint, input latency, or a
 * Long Tasks measurement. It intentionally does not mark either issue passed.
 * No mocked engines, saved personal reports, network calls, or extra packages.
 */
import { strict as assert } from 'node:assert';
import { cpus, platform, arch, release, loadavg } from 'node:os';
import { analyze, VERSION } from '@fortune/core';
import { checkAnswer } from '@fortune/ai/mcp';
import { reportSignalLookup, type ReportSignalLookup } from '../../src/model/askAi';
import type { Report } from '../../src/model/types';

const AS_OF = '2026-09-25';
const INPUT = {
  name: 'Synthetic answer-check QA', year: 1995, month: 7, day: 16,
  hour: 22, minute: 0, timeKnown: true, gender: 'male' as const,
  calendarType: 'solar' as const, cityId: 'tainan', timeAccuracy: 'exact' as const,
};
const MISSING_ID = 'sig_fa0e0000';
const nextTask = () => new Promise<void>(resolve => setTimeout(resolve, 0));

/** Each segment is prepare's synchronous work between actual timer yields.
 * It includes lookup bookkeeping; it is not an isolated buildTimeline timer.
 */
async function measurePrepare(lookup: ReportSignalLookup, ids: readonly string[], cancelAfterSegments?: number) {
  const controller = new AbortController();
  const synchronousSegmentsMs: number[] = [];
  let segmentStarted: number | null = null;
  let yieldBoundaries = 0;
  let timerTurns = 0;
  let aborted = false;
  const started = performance.now();
  function finishSegment() {
    if (segmentStarted !== null) {
      synchronousSegmentsMs.push(performance.now() - segmentStarted);
      segmentStarted = null;
    }
  }
  try {
    await lookup.prepare(ids, controller.signal, async () => {
      finishSegment();
      yieldBoundaries++;
      await nextTask();
      timerTurns++;
      if (synchronousSegmentsMs.length === cancelAfterSegments) controller.abort();
      if (!controller.signal.aborted) segmentStarted = performance.now();
    });
  } catch (error) {
    if (!(error instanceof Error) || error.name !== 'AbortError') throw error;
    aborted = true;
  } finally {
    finishSegment();
  }
  return {
    elapsedMs: performance.now() - started,
    yieldBoundaries, timerTurns, aborted, synchronousSegmentsMs,
    maxSynchronousSegmentMs: synchronousSegmentsMs.length ? Math.max(...synchronousSegmentsMs) : null,
  };
}

const generatedAt = new Date().toISOString();
const loadAtStart = loadavg();
const reportStarted = performance.now();
const report = analyze(INPUT, { asOf: AS_OF }) as unknown as Report;
const reportGenerationMs = performance.now() - reportStarted;
const knownId = report.timeline?.years.flatMap(year => year.domains.flatMap(domain => domain.topSignals))[0]?.id;
assert.match(knownId ?? '', /^sig_[0-9a-f]{16}$/, 'The synthetic report must provide a real full signal ID');
const answer = `這段時期傾向有支撐〔${knownId}〕。\n\n一定會成功〔${MISSING_ID}〕。`;
const ids = checkAnswer(answer, { signalLookup: () => null }).citedIds;

// A fresh lookup with a full ID from the report must stay on the zero-scan path.
const knownLookup = reportSignalLookup(report);
const knownFullId = await measurePrepare(knownLookup, [knownId!]);
assert.equal(knownFullId.yieldBoundaries, 0);
assert.equal(knownLookup(knownId!)?.id, knownId);

// Only the lookup cache is cold. Report generation above has already warmed the
// process/JIT and may warm library caches; this is not a cold-process benchmark.
const lookup = reportSignalLookup(report);
const fullScan = await measurePrepare(lookup, ids);
assert.equal(fullScan.aborted, false);
assert.equal(fullScan.synchronousSegmentsMs.length, 16, 'The lookup must prepare every asOf -5…+10 year');
assert.equal(fullScan.timerTurns, 16);
const checked = checkAnswer(answer, { signalLookup: lookup, directionalEvidence: () => lookup.directionalEvidence() });
assert.deepEqual(checked.unknownCitations, [MISSING_ID]);
assert(checked.issues.some(issue => issue.code === 'honesty_violation'));

const cachedRepeat = await measurePrepare(lookup, ids);
assert.equal(cachedRepeat.yieldBoundaries, 0);
assert.deepEqual(checkAnswer(answer, { signalLookup: lookup }).unknownCitations, [MISSING_ID]);

// Cancel at the first timer opportunity after one real year, then reuse the
// same lookup. Completed years stay cached; the aborted task cannot finish.
const resumable = reportSignalLookup(report);
const cancelled = await measurePrepare(resumable, ids, 1);
assert.equal(cancelled.aborted, true);
assert.equal(cancelled.synchronousSegmentsMs.length, 1);
assert.equal(cancelled.timerTurns, 2);
const resumed = await measurePrepare(resumable, ids);
assert.equal(resumed.aborted, false);
assert.equal(resumed.synchronousSegmentsMs.length, 15);
assert.deepEqual(checkAnswer(answer, { signalLookup: resumable }).unknownCitations, [MISSING_ID]);

const head = Bun.spawnSync(['git', 'rev-parse', 'HEAD']);
const worktree = Bun.spawnSync(['git', 'status', '--porcelain']);
assert.equal(head.exitCode, 0, 'Run this diagnostic inside the repository');
assert.equal(worktree.exitCode, 0);
const diagnosticSha256 = new Bun.CryptoHasher('sha256').update(await Bun.file(import.meta.path).arrayBuffer()).digest('hex');
console.log(JSON.stringify({
  schemaVersion: 1, generatedAt,
  scope: 'Bun real-engine diagnostics only; browser acceptance remains unverified',
  source: { head: head.stdout.toString().trim(), worktree: worktree.stdout.toString().trim(), diagnosticSha256 },
  runtime: { bun: Bun.version, os: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model,
    logicalCpus: cpus().length, loadAverageAtStart: loadAtStart, loadAverageAtEnd: loadavg() },
  fixture: { input: INPUT, asOf: AS_OF, coreVersion: VERSION, reportSchemaVersion: report.schemaVersion,
    systems: report.timeline?.systems, knownId, missingId: MISSING_ID, answer },
  reportGenerationMs,
  scenarios: { knownFullId, fullScan, cachedRepeat, cancelled, resumed },
  answerResult: { paragraphCount: checked.paragraphCount, citedIds: checked.citedIds,
    unknownCitations: checked.unknownCitations, issueCodes: checked.issues.map(issue => issue.code) },
  assertions: 'passed',
  limitations: [
    'No React render, DOM, desktop/mobile layout, browser input or paint was measured.',
    'Synchronous segment durations include lookup overhead; they are not browser Long Tasks or input latency.',
    'Fresh lookup caches are measured in one already-warmed Bun process; this is not cold-process or cold-browser timing.',
    'The shared runner has no CPU isolation; competing work can affect these diagnostic timings.',
    'One synthetic sync report excludes async ephemeris systems and does not establish a universal performance budget.',
    'Yearly engine exceptions are swallowed by the existing lookup; a 16-segment scan alone does not prove every year succeeded.',
  ],
}, null, 2));
