# Internal snapshot-bound interpretation checkpoint (#51 / #66)

This is a thin internal contract, not Report 8, a real SchoolPack, historical
report replay, Fact V2, an async engine, a cache, or evidence of predictive value.
CalculationSpec `cs1`, ChartSnapshot `sn1`, Report 7, the public package barrel,
all existing golden fixtures and locked forecasts remain unchanged.

## Identity and execution

- The production factory has no registration/evaluator arguments and owns one
  fixed, versioned implementation catalog. Its seven existing default descriptors
  remain unknown/abstain placeholders. Only the five synchronous natal systems
  may be selected; selecting Jyotish/Human Design is an error, not initialization.
- InterpretationSpec has its own schema/scope, catalog identity, interpretation
  and comparison versions. Selections require exact `(system, packId, packVersion)`
  tuples. Duplicate packs, mixed selected versions, empty selections, unknown
  versions and missing retained code fail explicitly. There is no `latest` lookup.
- A bound identity holds exactly one owned, validated ChartSnapshot, the complete
  InterpretationSpec and the complete canonical SchoolContext. Calculation
  identity/specHash/snapshotId derive from that snapshot. `ia1` is a diagnostic
  FNV label only: validation compares all bytes, never just IDs or hash equality.
- Context fact IDs and available conditions are opaque caller-provided sets,
  not newly generated Fact V2 IDs or evidence that the facts are true. Duplicates
  are rejected before sorting. The retained evaluator receives the same normalized,
  immutable context held by the bound identity. Inputs and outputs are data-only;
  accessors, hidden/symbol properties, undefined, sparse/extended arrays, toJSON
  hooks, extra fields and non-finite numbers cannot be silently normalized away.
- Missing birth time makes Bazi/Ziwei explicitly unavailable and does not run
  their evaluators. Available placeholders still abstain. Comparisons are only
  within this one chart/context/spec run; returned assessment DTOs do not retain
  the older registry's context-only comparison capability. Abstention does not
  contribute agreement, and school count never becomes independent system votes.
- The operation reuses the owned snapshot without recalculation and checks its
  existing runtime/environment guard before execution and after each evaluator.
  It does not expose or serialize live calculator capabilities.

## Synthetic verification boundary

The fixed code-owned fixture catalog is deliberately labelled
`synthetic-sync-natal` / `synthetic-contract-fixtures-v1`; it cannot be injected
into the production factory or passed as a production spec. It covers opposite,
aligned, different-proposition and one-applicable cases. Version 2 differs from
version 1; version 0 has metadata but intentionally no retained implementation.
No caller can install or swap callbacks in either factory. Reconstructing the
same catalog preserves semantics; semantic changes require a new catalog identity
or version. There is no function-source hash or mutable global registration.

These are synthetic assertions, not real interpretation rules. Only current,
supported snapshots plus retained code are covered. The complete #51 all-entry
snapshot contract and #66 production consumer/pack work remain open.

## Verification gate

Focused tests include actual Bazi/iztro call spies, A→B→A, full-content forgery,
context/selection permutations, historical-code absence, malformed data,
immutable copies, isolated catalogs, and four comparison scenarios. The first
tests-only checkpoint was 0 pass / 8 fail before implementation existed.

Exact full-regression inventory, four workspace typechecks, CI, and independent
review outcomes belong in the PR evidence. This document does not claim those
gates passed merely because focused tests passed. No UI or deployment claim is
made by this internal checkpoint.
