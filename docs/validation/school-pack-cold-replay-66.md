# SchoolPack cold-process reconstruction boundary (#66)

This is a reproducible acceptance probe for the remaining replay boundary of
[#66](https://github.com/skydreamer0/fortunetelling/issues/66). It is not a new
production archive format, report consumer, real SchoolPack, or evidence of
predictive validity. Existing runtime code and frozen report fixtures are unchanged.

## What the probe establishes

`packages/core/tests/schoolPackColdReplay.test.ts` starts a producer using the
actual core source, writes complete plain JSON to a temporary file, and waits for
that process to exit. Two separately started Bun processes then read only that
file. Distinct producer/verifier PIDs and equal reconstructed outputs are checked.
No registry, WeakSet membership, snapshot runtime provider, or in-memory FactStore
can pass across the process boundary.

The test-only worker reconstructs a current CalculationSpec from the saved input,
compares its complete canonical bytes to the saved spec, and uses the existing
ChartSnapshotSession to compare the persisted snapshot against a fresh current
snapshot. It creates a fresh owned FactStore and compares all saved store bytes.
It then creates the exact selected InterpretationSpec, validates all saved spec
content, runs the retained implementation, and validates the complete saved
FactBoundAnalysis against the newly owned result. Output SHA-256 values are
diagnostic receipts; validation uses complete canonical content, not hash equality.

The five cases are:

- Known time, synthetic Bazi `a` version `1`: support.
- The same birth/calculation/snapshot, synthetic Bazi `a` version `2`: oppose.
- Unknown time, synthetic Bazi `a` version `1`: explicitly unavailable.
- Known time, all five production default packs: unknown/abstain placeholders.
- Unknown time, all production defaults: Bazi/Ziwei unavailable; three abstentions.

The version pair must have different analysis IDs and opposite conclusions while
preserving the same CalculationSpec hash and snapshot ID. That establishes
retention of both synthetic versions in this current code build. It does not
prove compatibility with older core, calculator, catalog, or runtime versions.

## Fail-closed cases

Independent JSON mutations preserve the saved diagnostic IDs while changing
the conclusion, fact payload/source path, snapshot identity/natal bytes, result
context, interpretation catalog/comparison version, or selected pack version.
They must fail before any success receipt. `latest`, metadata-only version `0`,
synthetic tuples presented to production, unsupported core/calculator/runtime
versions, and replacing an unknown-time analysis with an available one also fail.

The worker explicitly checks that deserialized snapshots, InterpretationSpecs,
FactStores, and expected analysis objects cannot be used as owned capabilities.
Reconstructing them is a current-code computation followed by full-content
validation. Passing this probe therefore does not establish archive-only replay.
The test fixture envelope is not an authenticated archive: coherent replacement
of every input and result is not a detectable provenance attack under this test.
No trusted timestamp, signature, or tamper-proof historical record is claimed.

## Remaining original-scope gap

At the reviewed baseline `c48d351d9df7daee369757a251d08280012837fc`:

- `src/core/chartSnapshotSession.ts` explicitly reconstructs one current snapshot;
  it does not load retained historical calculator implementations.
- `src/schools/boundAnalysis.ts` uses owned capabilities and provides no persisted
  report consumer. Deserialized data are validated only against owned expectations.
- `src/core/analyze.ts` still defines Report schema 7 without SchoolPack selection
  or InterpretationSpec/report replay fields; `analyze` has no pack-selection option.
- `src/export/buildExport.ts` / `src/export/types.ts` export the existing profile,
  chart, signals, timeline, consensus, manifest and README. They do not preserve
  and replay this bound interpretation contract as a report.
- `src/index.ts` does not expose a production SchoolPack report-replay entrypoint.

Thus the original two synthetic contract ACs remain complete, and #66 remains
open for its original pack-version / historical-report consumer objective. Real
Bazi/Ziwei packs continue under #32/#33; completing those entire issues is not an
extra condition for closing #66. This probe neither rebuilds the already delivered
registry nor adds a new closure requirement.

## Run

Use the repository's existing locked dependencies and supported Bun runtime:

    bun --no-install test packages/core/tests/schoolPackColdReplay.test.ts
    bun --no-install test packages/core/tests/boundAnalysis.test.ts packages/core/tests/factBoundAnalysis.test.ts
    bun --no-install run --cwd packages/core typecheck

For an inspectable fixture outside the test runner:

    bun --no-install packages/core/tests/fixtures/schoolPackColdReplayWorker.ts capture /tmp/fortune66-archive.json
    bun --no-install packages/core/tests/fixtures/schoolPackColdReplayWorker.ts reconstruct /tmp/fortune66-archive.json

The fixture contains synthetic birth data only. It is deliberately named
`test-only-current-build-cold-reconstruction`. Preserve that boundary in any
receipt. Exact command outcomes, source tree, runtime/dependency identities,
independent review and any tests not run belong in the delivery evidence.
