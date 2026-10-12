# MCP systems baseline attribution (#20 partial)

The original `systemsBaseline.json` and the D-045 v0.6.0 / D-051 v0.7.0 delta chain
are unchanged. All eight existing assertions in `systems.test.ts` remain in force.
An envelope-only change can still fail a legacy envelope digest. The new classifier
does not approve that change or regenerate a golden value.

## Two separate views

- **Legacy digest:** preserves the exact existing recipe, including `stripNew`,
  full-ID expansion, version-hash substitution and the three `|noYears` scopes.
  Answer detail hashes `JSON.stringify(data)`. Timeline/consensus hashes
  `JSON.stringify(canonicalStringify(envelope))` (including JSON string encoding).
- **Raw response attribution:** `projectSystemsBaseline` splits only top-level
  `data`, `caveats`, `versionsHash`/`versions`, and the rest of the envelope.
  It does not reuse legacy omissions. In particular, eligibility, sensitivity,
  all year data, nested caveats/version fields and unknown data remain visible.
  `asOf` and unaccounted top-level fields remain in the envelope partition.

`classifySystemsBaselineChange` reports unchanged, caveats-only, versions-only,
caveats-and-versions, envelope-change or data-change, plus all four changed flags.
Data takes precedence in mixed changes; no other changed flag is discarded.
Object property order is insignificant, but array order remains significant.
No recursive key omissions are made, including for `generatedAt`.

“Data-change” identifies a location, not a cause: changing text or formatting
inside data also requires review. “Caveats-only” describes two supplied responses;
it must not be applied to an entire source commit without broader evidence.
Neither label is permission to accept a change or overwrite a baseline.

## Historical evidence

`systemsBaseline.provenance.json` records exact parent/commit references, fixture
blob IDs, source links and literal recorded digest pairs. These are not historical
response payloads. No payload is reconstructed from a digest.

- **M5-03, 129dab4f:** two projected answer-data digests stay unchanged; six
  envelope digests change. Source also changes Human Design eligibility for
  verifiedOnly and sensitivity. The whole commit is not caveat-only.
- **M5-04, caec7dd3:** source replaces the repeated Human Design natal baseline
  with transit.gates and changes the HD catalog from v1 to v2. All eight recorded
  digests change. The old fixture's claim that non-HD aggregates were separately
  compared is retained as a historical report, not a replay performed here.
- **33743600:** the baseline changes three timeline scopes to `|noYears`; five
  comparable digests stay equal. This describes baseline-format normalization,
  not the scope of the entire commit (which also added tools). Hashes from the
  three different scopes cannot establish equivalence of the omitted year data.

Historical replay remains **NOT_RUN**. Classifier unit tests use labelled synthetic
examples, and `systems.test.ts` adds mutations to current real responses before
legacy projection. Neither is a substitute for running old revisions.

## Verification and future differences

Run with the repository's approved Bun runtime and installed dependencies:

```sh
bun test packages/mcp/tests/systemsBaselineSemantics.test.ts
bun test packages/mcp/tests/systems.test.ts
bun run --filter @fortune/mcp typecheck
```

For a future mismatch, obtain actual before/after responses under the same input
and applicable versions, then classify those responses and review every changed
partition. Preserve source/spec/rule/model version evidence and explicitly review
new caveats. A digest alone cannot supply the missing before payload. Keep existing
baselines and reviewed deltas intact; do not use metadata exclusion to make a
failing legacy assertion pass. This slice does not complete #20's full V2 matrix.
