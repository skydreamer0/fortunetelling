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
