# Issue #54: internal sync snapshot cross-host reload slice

This tests-only continuation uses the existing #99 internal synchronous
five-system ChartSnapshot and session. It adds no runtime API, DTO field,
storage/cache/migration, Report version, algorithm, golden, or CI workflow.
Issue #54 remains open.

## Reused cases and source boundary

The unchanged `tests/fixtures/natalCalendarCases.ts` supplies all eight synthetic
Taipei inputs and both existing settings: A is civil/late; B is true-solar/early.
The six 2025 lunar/month-end cases and the 1974 DST gap/overlap were accepted in
[PR #94](https://github.com/skydreamer0/fortunetelling/pull/94). See the existing
[source-backed calendar note](natal-calendar-matrix-54.md) for the exact HKO,
CWA and IANA sources, dates and arithmetic. No new chart baseline is invented.
Those sources verify calendar facts, not natal star/palace correctness. IANA
still shares an upstream with the bundled timezone data.

## Reproducible matrix

Run `bun test packages/core/tests/chartSnapshotHostTimezone.test.ts`.

- Twelve independent producers: four native host TZs (UTC, Asia/Taipei,
  America/New_York and Pacific/Apia) times A-only, B-only and A → B → A.
  Each process visits all eight fixtures. Subprocess imports use `URL.href`.
- Compare full `JSON.stringify` bytes, including identity, specHash, snapshotId
  and every natal field. There is no timestamp omission, digest-only equality,
  or regenerated stored golden. Literal schema/system/population checks prevent
  equally empty outputs from satisfying the matrix. At least one fixture must
  have genuinely different natal content between A and B.
- Four independent consumers each receive the exact A-only/B-only serialized
  strings from all four origins through stdin. This covers all sixteen ordered
  origin/destination host pairs: 256 reloads, including 192 cross-host reloads.
  Each uses `createChartSnapshotSession(spec, parsedCandidate)`, whose existing
  contract reconstructs one trusted current snapshot before validating. Full
  returned bytes must equal the transferred bytes and the result must be owned
  and frozen. This does not claim zero recomputation or persistent storage.
- For every transferred candidate, change the full identity or one natal number
  while preserving both diagnostic IDs. The existing validator must reject the
  exact identity/content mismatch. A matching hash never proves acceptance.
- Every child reports its native Date offset at the same fixed instant. Exact
  expected offsets confirm that TZ reached the process, rather than just being
  included as a label in the output. Timeouts or abnormal child exits fail.

## Acceptance limits

These are fresh-process engineering equivalence and current-version JSON reload
tests. They do not independently establish natal-chart correctness, run native
Windows, exercise alternative iztro global configurations, implement persisted
storage, replay historical versions, cover async ephemeris settings, or prove
all Report/Question/Backtest/export entry points share a snapshot. Those #51,
#52, #53 and #54 gaps remain. PR #89's older Windows receipt does not certify this
new suite. Record the exact SHA/runtime and focused versus full-suite/CI results
separately; a focused pass is not complete repository acceptance.
