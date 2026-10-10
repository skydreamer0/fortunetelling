# Fact-backed internal interpretation checkpoint (#27)

`createBoundSchoolRegistry().bindFacts(snapshot, interpretation, factStore,
context)` connects the existing owned primary natal FactStore to one internal
interpretation consumer. The synthetic registry exposes the same seam for
contract tests. Issue #27 remains open: this is not Signal V2, evidence grouping,
sharedFact metadata, validationRef, Report 8, Profile 2, history/replay, async
systems, public exports or UI integration. No production predictive rules are
added: the production catalog still abstains with its existing placeholders.

## Input and output contract

- The caller must supply an owned snapshot, an owned exact InterpretationSpec
  from that registry and an owned FactStore bound to the complete same snapshot.
  Serialized lookalikes and matching diagnostic hashes are insufficient.
- The requested context remains exactly `factIds` and `availableConditions`.
  Both are explicit sets; missing/duplicate/malformed references fail. Conditions
  remain caller declarations, not independently validated chart facts.
- The consumer resolves the requested IDs before evaluation. Its immutable
  identity context contains both canonical IDs and the actual adapter-produced
  facts, including structured payloads and source references. It also retains the
  complete store (including coverage) and snapshot. This is private birth data,
  not anonymized data or a public transport format.
- Each retained evaluator receives a system-local view of the resolved facts
  and IDs. Bazi cannot cite Ziwei data merely because its ID sorts first. Empty
  system-local input abstains; missing birth time remains `time_unknown` rather
  than inventing facts. Unsupported systems retain their production placeholders.
- Every returned conclusion includes its resolved `facts` alongside `factIds`.
  The existing registry enforces conclusion membership in the requested set;
  all returned references are resolved again against the same owned store and
  snapshot. Full source components remain available through `resolveFactSource`.
- Comparisons retain the existing exact-proposition semantics. Supporting and
  opposing synthetic branches are both retained. They are not independent votes
  or external predictive-validity evidence. Transport assessments cannot be
  reused as a trusted standalone comparison capability.

## Distinct identity and ownership

The separate `ifa1` identity includes schema 1, the explicit production or
synthetic fact-backed scope, complete snapshot/store, exact interpretation and
resolved context. It never upgrades legacy `ia1` or opaque `SchoolContext` IDs.
Legacy `bind`/`validate` remain unchanged; use `bindFacts`/`validateFacts` for the
new seam. Existing cs1/sn1, f1, Signal IDs, Report 7, golden fixtures and locked
forecasts are unchanged.

`validateFacts(candidate, expected)` requires an owned result from the same
registry, rechecks the current snapshot environment and compares the entire
candidate to that result. Altered fact payloads, source paths, coverage,
conclusions or references fail even when their IDs match. This is validation
against a current owned result, not historical deserialization or authentication
by a short hash. No caller-supplied evaluators or identity overrides are accepted.

## Verification boundary

Focused tests cover real input/output fact and source resolution, canonical
ordering, pack A→B→A, retained opposing branches, missing/duplicate references,
foreign snapshots with identical fact IDs, forged stores/results, forced hash
collisions, stale iztro configuration, immutable data, placeholder/unknown-time
behavior and zero natal recalculation across bind/run/validate. Exact full-suite,
typecheck, CI and independent-review outcomes belong in the PR evidence.
