# Web Report8 current-build replay

Related: #26 / #51, regression #20 and documentation #24. Stacked on Draft #151;
that PR is not merged by this package. Core 0.11.0 adds an opt-in Report8 API;
legacy `analyze()` still returns Report7. Profile2, Export2, Timeline2,
CalculationSpec1 and ChartSnapshot1 retain their versions.

## Actual entry chain

The Web bridge now calls `analyzeReplayReport`. It creates one owned immutable
sync snapshot, feeds its providers into the actual report engines/timeline, and
adds `calculation` and `replay` to an otherwise identical report. The latter
contains the full CalculationSpec and ChartSnapshot, not a persistent cache or
historical engine. `REPLAY_REPORT_SCHEMA_VERSION` describes this opt-in shape;
`REPORT_SCHEMA_VERSION` still describes ordinary `analyze()`.

Question month/year providers, citation lookup (including cooperative scans),
and LifeEvents backtest resolve the report through `createReportReplaySession`.
Within the live report they share the original natal providers. Period/asOf
projections retain the recorded system set, weights and directional thresholds;
no asynchronous system is admitted because WASM happens to become available.
Question and Backtest results and citation lookup expose the same scoped
calculation identity. The existing Profile2 download reproduces the same sync
identity in the actual MCP Analyzer and export route, without exporting the
full Report8 replay block.

The scope remains `analyze-sync-natal`, explicitly excluding Jyotish/HumanDesign.
There is no claim that those systems' charts or periods share this snapshot.

## Ownership and JSON reload

The new input/report boundary reads own data descriptors, rejects accessors,
nonplain objects, cycles and malformed JSON data, and copies data before use.
Projection calls reject identity-setting overrides. The outward report remains
mutable like older reports; changing consumed source/replay data invalidates its
WeakMap entry. Previously obtained sessions retain their own source and results. Report8 citation
lookups likewise own their cached signals/proofs and return deep copies, including
lazy/cooperatively prepared results; a retained AnswerCheck lookup cannot acquire
subsequent caller mutations. A fresh lookup revalidates the report.

After JSON serialization, the loader reconstructs the current spec/snapshot once,
checks the complete saved spec and snapshot identity/content, and checks the
report input, timeContext, asOf, complete timeline and signals against that
reconstruction. It does not authenticate arbitrary saved presentation sections,
prove when a report was created, or validate a historical engine by trusting a
hash. `generatedAt` is metadata and is not a replay identity. Subsequent
projections reuse the verified providers. A version/content/source mismatch
fails closed; a retained or partial replay/calculation envelope cannot be relabelled
as Report7 to enter legacy behavior. Removing all provenance is not detectable
authentication and is outside this contract. The Web does not fall back to legacy recomputation or saved
citations for an invalid Report8.

Report7 and earlier keep their existing recorded-options path. Missing or
contradictory historical metadata still disables recomputation. They are not
automatically migrated, given a fabricated snapshotId, or reinterpreted using
new main-chart settings. No new database, account, browser persistence or
file-upload/import feature is added.

Full replay data includes name-dependent Numerology and exact birth information.
Do not treat snapshotId/specHash as anonymization or authentication. Existing
redacted export and AI payload selection must not acquire the private replay
block. Only explicit application callers receive the full Report8 object.

## Acceptance and remaining scope

| Original acceptance | Delivered by this package | Remains open |
| --- | --- | --- |
| #51 Report calculation/snapshot | Explicit Report8 and actual Web creation; ordinary Report7 preserved | Complete async identity |
| #51 Report/Question/Backtest/export same snapshotId | Real Web Question/citation/LifeEvents, Profile2, MCP and export sync chain | Async whole-result identity and unrelated future entries |
| #51 same settings/content and setting changes | Four clock/zi combinations, cross-hour input, owned current JSON replay, invalidation/forgery rejection, unknown time | Historical calculator/dependency execution and persistence/cache migration |
| #26 options and execution boundaries | Recorded systems/weights/thresholds, actual provider reuse and cooperative cancellation retained | Remaining independent calendar/scientific oracles and #53 async contract |
| #20/#24 regression/provenance | Baseline Web7 failure; fixed-clock complete Report7 parity; explicit old/new fixture deltas and bounded evidence | No device/browser-pixel or scientific-accuracy claim from these unit tests |

Original fixtures and older deltas remain immutable. The new Report7/compatibility
golden delta is only thirteen core-version strings. Export's new delta is only
core version and the chart's version-derived calculation identity hash. All eight
complete MCP response data/caveat hashes remain equal; versions/envelope identities
have explicit new literals. These do not replace the new Report8 whole-object,
real consumer-chain, tampering and ownership tests.
