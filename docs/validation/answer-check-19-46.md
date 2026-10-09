# AnswerCheck diagnostics and remaining browser acceptance (#19 / #46)

## Scope

PR #77's incremental lookup, cancellation, and stale-result guard are already on
master `68a29d6186882f3534d2b04e16449df8d128b702`. This follow-up adds an opt-in
real-engine measurement command only. It does not change production code,
ChartSnapshot, report schema, dependencies, or the Windows timezone fix (#54).

Neither issue can be closed from these measurements. A Bun process has no React
paint, browser main thread, touch input, or desktop/mobile layout. Existing
hook/ReactDOM/fixture tests are also not substitutes for browser acceptance.

## Reproduce the real-engine diagnostics

From the repository root, with Bun installed:

```sh
bun install --frozen-lockfile
bun run apps/web/tests/diagnostics/measureAnswerCheck.ts > answer-check.json
```

The command uses a fixed synthetic report (1995-07-16 22:00, Tainan,
asOf 2026-09-25) and the actual sync engine, `reportSignalLookup`, and
`checkAnswer`. It never loads a saved personal report, calls an external AI,
or uses a mocked annual engine. It emits JSON only after all assertions pass;
an assertion failure exits nonzero. Keep stderr alongside the JSON on failure.

The JSON records source HEAD and dirty-worktree paths, Bun/OS/CPU, load averages,
fixture and exact IDs, raw per-segment timings, totals, semantic results, and
limitations. Preserve the raw output with the checkout used for measurement.
For comparisons, keep Bun, fixture, source, and runner conditions the same;
prefer an otherwise idle runner and repeat measurements. No timing threshold
is enforced in CI or inferred from a single sample.

Scenarios, in execution order:

1. A known full ID on a fresh lookup needs zero yearly scans.
2. A mixed real/fake citation answer prepares all 16 years (2021–2036), then
   flags the fake ID and the guarantee wording while retaining the valid ID.
3. Repeating the prepared answer needs zero additional yearly scans.
4. A second fresh lookup cancels at a timer boundary after one real year.
5. Reusing that cancelled lookup prepares the remaining 15 years and still
   identifies only the fake citation as unknown.

The instrumented yield callback uses the same `setTimeout(0)` task boundary as
the production default. A synchronous segment starts when that timer resolves
and ends when the next yield is requested (or preparation completes). It includes
lookup bookkeeping around a year's calculation. An empty segment list and
`maxSynchronousSegmentMs: null` mean that no scan segment was measured, not that
the entire operation took zero time. The cancellation scenario proves cancellation
at a task boundary; it does not simulate a user's keystroke or measure input delay.

Only the lookup cache is cold. Report generation has already warmed the process,
JIT, and potentially library caches. The sync fixture's timeline systems are
BaZi, Ziwei, and Numerology; async ephemeris systems are outside this measurement.
The existing lookup catches annual calculation exceptions, so counting 16
segments alone cannot certify 16 successful annual calculations. All of these
limits are included in the JSON output.

## Recorded observation

A run on 2026-10-09 under Bun 1.4.2, Linux x64, AMD EPYC 9V74
(9 logical CPUs visible), against clean candidate
`716622fbdddc9eb670142b335fc7a8c7ed462664`:

- Report generation: 1.153 seconds
- Full 16-year preparation: 11.846 seconds; longest measured synchronous
  segment: 0.927 seconds
- Cached preparation: 0.032 milliseconds, no yearly scan
- Cancellation after one year: 0.672 seconds; resumption completed 15 years
- Semantic assertions: valid ID resolved; fake ID and guarantee wording flagged
- Existing AnswerCheck tests: 13 passed, 0 failed, 49 assertions
- Web typecheck: passed

The shared runner was not isolated. The focused test process had finished before
this run, but other work can still affect the timings. These values are diagnostic
observations, not a benchmark budget or browser pass. The [preserved raw JSON](./answer-check-19-46.bun.json)
identifies the clean source commit and diagnostic SHA-256. The subsequent receipt
commit only adds that JSON and updates this document; the measured script and
production sources are unchanged. Final candidate checks and independent review
belong with the Draft PR.

This confirms a remaining risk worth checking in the browser: yielding between
years leaves a long synchronous segment within each year. It does not establish
the browser's actual longest blocking time or that a particular device fails.

## Browser acceptance still required

Use the repository's normal `bun run dev`/preview workflow only in an environment
where browser access is permitted. A denied localhost/file route is a blocker;
do not change hosts, ports, or security flags to evade that denial. No browser
acceptance was performed for this follow-up.

For each desktop and mobile-width run, record the exact commit, browser/device,
viewport, synthetic input, asOf, cache state, and evidence files:

- Generate a real report. Paste one real `sig_` ID, one nonexistent ID, and
  guarantee wording. Confirm the rendered result identifies the right issues.
- On a fresh lookup, confirm the busy indicator paints before the scan finishes.
  Attempt text input during scanning and record whether/when it responds.
- Measure scan start-to-result time and the longest browser main-thread task
  using browser performance tooling. Preserve the trace; Bun segment times
  cannot fill these fields.
- Edit/replace the text mid-scan. Confirm busy/results clear and an old request
  cannot later restore a result. Retry with the new text; repeat A→B→A.
- Exercise repeated clicks, report switching, and leaving the report while work
  is pending. Confirm no stale result or stuck busy state appears.
- At mobile width, check textarea, status, result excerpts, and long signal IDs
  for clipping, overflow, and usable controls.
- Repeat after completion to distinguish a warmed lookup from the cold lookup.

Record findings in #19 and cross-reference #46. Keep both original browser ACs
unchecked until their actual desktop/mobile evidence exists. If a synchronous
year prevents usable input, choose an additional implementation change only
after establishing the browser result; no Web Worker or scan-range change is
introduced by this diagnostic.

## Bounded stock-Chrome continuation (prepared; browser NOT RUN)

Continuation baseline: master `c4c60cde612d9c756264398d11674fb2391a82b3`.
The historical Bun receipt above stays unchanged. Public-site evidence already
established genuine/unknown citation rendering, guarantee flags, a visible busy
state, and warm editing. This continuation does not repeat those warm checks or
the unrelated PWA regression. The remaining cold-input, cancellation, stale-result,
and desktop/mobile-width observations are the purpose of the new harness.

PR #88 established the stock Google Chrome route on the public GitHub-hosted
`ubuntu-24.04` runner. `apps/web/scripts/answer-check-browser-check.ts` reuses
Playwright 1.64.0 and Bun 1.4.2 already locked in this repository. It launches
`channel: 'chrome'`, explicitly requires `chromiumSandbox: true`, refuses root,
and requires the installed `/opt/google/chrome/chrome`. No browser or OS package
is installed, no security flags or settings are changed, and no saved browser
profile, birth profile, token, or personal data is loaded. Do not imitate runner
environment flags locally to bypass a denied browser route.

The dedicated, path-filtered PR workflow adds no manual dispatch, rerun, schedule,
deployment, or `pull_request_target` trigger. It has only `contents: read`, does
not persist checkout credentials, disables Setup Bun's cache, installs frozen
dependencies without lifecycle scripts, and uploads no artifacts or caches.
Checkout explicitly selects the PR head SHA, not the event's synthetic merge ref.
The receipt keeps the event merge SHA separate from the actual Git HEAD, tree and
raw parent SHA(s), requires HEAD to equal the supplied PR head, and rejects a dirty
worktree. Compare that receipt and its source hashes with the reviewed candidate
before interpreting a live run; this workflow does not test merge-tree integration.
The `packages/core/src/**` filter intentionally includes all calculation/time/signal
dependencies of this scan. It is not repository-wide CI: one bounded standard
public-runner job runs per matching PR update, with no schedule or paid-runner
configuration. No manual dispatch or rerun is added.
Existing CI, PWA, Pages and Windows workflows remain unchanged. Source review and
independent non-author review are required before publishing a candidate PR.

### Real application and cases

The harness serves the actual `bun run build` output under `/fortunetelling/`
using a runner-local Bun server. It records every build-file hash, relevant source
hashes, exact PR/check-out commits, runtime/browser versions, and runner image.
Each of six cases uses a fresh, nonpersistent browser context and creates the
report through the real form: QA Synthetic, male, 1995-07-16 22:00, exact, Tainan.
The report's actual asOf is read from its DOM; it is not silently equated with the
historical Bun fixture date. A five-year report heading and a real signal ID from
the generated prompt are required before citation testing.

At both 1280×900 and 390×844 CSS-pixel widths:

1. An untouched lookup checks a genuine signal mixed with `sig_ffffffff` and
   guarantee wording, waiting for the genuine result. Source-defined unknown-ID
   reach remains asOf −5 through +10, all 16 years. No reduced-range substitute
   or fake annual engine is used.
2. A second fresh report starts the cold check. Native keyboard replacement must
   produce a trusted input event while busy and before any result. The rendered
   textarea must become B, busy/results must clear, and the check button must be
   enabled. Replace B with the original A and check again; no stale result may
   appear between the edit and retry. A new busy animation-frame observation and
   then a correctly classified A result are required. The DOM cannot identify
   which request produced identical A: late original-A completion after that
   frame remains UNVERIFIED, not a stale-request acceptance PASS.
   This retry uses a partially prepared lookup, not a second cold lookup.
3. A third fresh report leaves via the real return button during scanning. The
   report must actually unmount, then a newly generated report must have an empty
   answer field, no busy state and no inherited result. Merely returning from a
   click is never acceptance.

No warm repeat is added. The recorder observes DOM mutations, trusted input/check/
return events, one busy animation-frame opportunity per check, and native Chrome
Long Tasks. It does not replace engines, React state, event dispatch, Date, timers
or task scheduling. Existing deterministic lifecycle tests remain the evidence
for forced late-success/failure ordering; real-engine A→B→A does not fabricate
those races or claim to cover every scheduler ordering.
The recorder cannot observe AbortController delivery or producing-request
identity. Clearing busy/results proves the visible input effect, not termination
of background work. Passing this job does not complete the original cancellation
or identical-A stale-result AC.

### Interpretation and boundaries

- Fresh citation lookup does not mean cold engine, JIT or browser-process caches.
  Report generation already ran real computations in that process.
- The lookup catches annual engine exceptions. Source-defined 16-year reach and
  a completed unknown-ID result alone do not prove 16 successful annual calls.
- Native Long Tasks are browser measurements, distinct from the earlier Bun
  yearly scan segments. Host keyboard-command-to-verified-DOM duration includes
  automation overhead and is not physical keyboard-to-pixel latency.
- Busy DOM on an animation frame is a paint opportunity, not inspected screenshot
  pixels. No screenshot or trace ZIP is captured or claimed. Job-log JSON retains
  event ordering and Long Task entries; it is not a full DevTools trace.
- Service workers and external network requests (including Google Fonts) are
  blocked only in the disposable test contexts to isolate this non-PWA task.
  Reduced motion is requested. Computed layout coordinates therefore describe
  fallback-font, reduced-motion Chrome at the listed CSS width; they do not prove
  deployed typography, physical-phone touch behavior, iOS/WebKit or PWA acceptance.
- No performance threshold is invented. A passing functional gate means the
  requested input/return really took effect while pending and the expected result
  ordering held. It does not mean smooth input or acceptable maximum blocking.
  Review measured Long Tasks and actual input behavior against #19/#46 before
  giving a UX verdict or marking any original issue AC complete.

### Gates, failures and local source validation

```sh
bun run --cwd apps/web --bun tsc -p tsconfig.answer-browser.json
bun apps/web/scripts/answer-check-browser-check.ts --self-test
```

The self-test runs only the evidence validator. Its labelled synthetic control
records are not a browser run or mocked-engine acceptance. Negative mutations
must be rejected for untrusted/late input, absent DOM effect, stale result,
missing original/retry busy frame or final result, timeout, cleanup error, page error, evidence
truncation and unsupported Long Tasks. A separate unmount control rejects a late
result. These validate the gates; they do not claim browser execution against a
mutated application implementation.

Runtime operation timeouts are bounded orchestration limits, not responsiveness
budgets: launch 15 seconds, Playwright operations 15 seconds, the six-case run
180 seconds, workflow step 4 minutes and job 10 minutes. The deadline closes the
browser and stops the server to interrupt pending commands; the actual test and
cleanup promises settle before the final result is written. A failed case stops
later cases, which remain NOT RUN. Timeout, missing evidence, page error or any
cleanup rejection cannot yield PASS. The server's stop promise is memoized with
its rejection retained. A forced runner kill may leave no JSON and is incomplete.

Only the approved GitHub job may run the browser command. No local browser was
launched in preparing this candidate. Publication, first live run, inspection of
its logs, and independent acceptance remain outstanding; both issues stay open.

Preparation checks on 2026-10-09: real dedicated TypeScript check passed; validator
self-test passed three positive records and rejected 14 negative mutations;
the parsed workflow passed trigger/permission/no-upload/no-cache scope checks;
production build passed with the existing Swiss-module/large-chunk warnings.
Calling the browser entry without the hosted opt-in exited nonzero before server
or browser creation. Production sources, dependencies/lock and existing workflows
are byte-unchanged. The previous full suite and Bun/React lifecycle tests were not
repeated for this harness-only continuation. None of these preparation checks is
a live-browser result; independent review is still required before publication.

The first source-review candidate `bfb5a9727848296bfb0225d09e1ce036d50f8876`
was BLOCKED before publication: its first-heading selector selected the consensus
heading, and its A→B→A validator accepted a second click without new busy evidence.
The revision selects the unique year-range heading and rejects that missing-busy
control. Neither fix proves identical-A request provenance or background abort;
those limitations are explicit in the JSON receipt and remain open. All negative
controls above mutate evidence records only, not production code at runtime.

## #46 cooperative runtime candidate (native repair acceptance pending)

The delivered PR90 diagnostic measured maximum cold citation Long Tasks of
814/827 ms on its desktop/mobile-width stock-Chrome runner. Follow-on synthetic
Bun profiling separated annual setup from cells: setup accounted for about 95%
and nested Ziwei for about 89% of the recorded instrumented total. These are
different runtimes/conditions, not a cross-device guarantee or a speedup claim.

The minimal runtime candidate shares canonical generator steps between existing
synchronous Ziwei sequence/calculator/timeline calls and a new cooperative bridge.
It retains all sequences, formulas, period scope, ordering and IDs. It introduces
no Worker/dependency and does not repurpose buildTimelineAsync. New cooperative
calls require the existing Web bazi/ziwei/numerology scope and known-time Ziwei's
already-established zh-TW/default iztro environment; existing synchronous public
APIs, including ZiweiEngine's language option, remain unchanged.

The guard only observes its documented language/getConfig snapshots. It cannot
audit plugins/resources or a change away and back between checks. It does not
restore globals. Each indivisible step is checked before/after; a suspended
scheduler itself must settle. Scheduler failure, actual signal cancellation and
environment rejection do not count as an empty successful year. Web preparation
keeps month signals/proofs local until a complete current-owned year can commit
together with the scanned cursor. A cancelled partial year is retried from its
beginning; completed-year caching and the full asOf−5…+10 reach are retained.

Local synthetic gates cover 23 baseline Timeline/Calculator outputs, all fields
and exact serialization, the explicit 0.8→0.9 release-only metadata/hash delta,
partial-year custom abort/rollback/retry, scheduler failure, foreign public zh-CN
engine interference, supported clock/zi report interleaving, old A after B/new A,
synchronous scan ownership and a real 16-year lookup against every expected
monthly signal. Microtask schedulers in these tests provide deterministic ordering,
not browser responsiveness evidence. Original golden and historical deltas remain
unchanged; see D-053 for provenance and persistence-compatibility boundaries.

The PR91 initial three-file NOT WIRED checkpoint and its first automatic run test
the unchanged production application. They are not post-repair measurements.
Before accepting this runtime candidate, inspect its exact source/tree, complete
checks, non-author review and the existing native harness's fresh automatic run.
Compare native Long Tasks/trusted-input/actual cancellation effects under the same
documented conditions; do not invent a performance success threshold. No new
browser/screenshot/physical-input claim is established by this preparation text.
Issue #19/#46 acceptance remains open pending that evidence and its UX review.
