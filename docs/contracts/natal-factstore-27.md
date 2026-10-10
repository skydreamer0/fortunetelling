# Primary natal FactStore checkpoint (#27)

This internal, Fact-only slice consumes an owned validated ChartSnapshot without
recalculating a chart. It is not complete Signal V2, EvidenceStore/grouping,
validationRef, a SchoolPack, Report 8, Profile 2, historical replay, async work,
a public export or UI. Issue #27 remains open. Existing Report 7, cs1/sn1,
signal IDs, golden fixtures and locked forecasts are unchanged.

## Data and identity

- Store schema 1, `primary-sync-natal-facts`, adapter version 1.
- Each fact has a system, a discriminated kind/payload, primary chart branch,
  explicit `{ kind: 'natal' }` scope, calculation versions and source references.
  Natal scope is not a calendar interval. No start/end or flow period is invented.
- `f1` hashes canonical semantic content, schema/adapter/calculation versions.
  It excludes names, all direct input, snapshot/spec hashes and source positions.
  Identical natal facts can therefore share an ID across name changes or charts.
  This does not mean the facts are independent evidence or permit cross-chart use.
- The complete private snapshot is retained separately in `binding.snapshot`.
  Fact and source `snapshotId` fields are diagnostic labels, never authentication.
  The store contains private birth input and is not an anonymized/public artifact.
- Source refs are exact JSON pointers into the bound snapshot DTO, not invented
  legacy Signal component IDs. The resolver requires the owned store plus the
  complete owned snapshot context, checks full chart bytes and then resolves only
  adapter-produced paths. A naked f1/sn1 pair is insufficient, even on a collision.

## Finite real coverage

- Bazi: primary year/month/day/hour pillars, retaining gan-zhi, stem and branch.
  Alternative pillars, luck/flow periods, relations, hidden stems and rule
  interpretations are explicitly uncovered.
- Ziwei: primary major/minor/adjective star placements and natal transformations.
  A transformation links to the original transformation, its unique matching
  star/mutagen and its palace. Missing or ambiguous sources fail explicitly.
  Alternative charts, decades/flow periods, palace relations, brightness and
  interpretations are explicitly uncovered.
- Per-adapter coverage lists supported kinds, exclusions and omitted alternative
  counts. Alternatives remain in the snapshot; they are never mixed into primary.
- Missing birth time yields no Bazi/Ziwei facts and `time_unknown` coverage.
  The adapter never substitutes noon or creates missing chart data. The remaining
  five systems are out of scope and listed, not treated as resolved provenance.

## Validation and determinism

`createNatalFactStore(snapshot)` accepts only an owned snapshot and retains no
caller callbacks. All DTOs are immutable. `validateNatalFactStore(candidate,
expected)` validates a serialized candidate against an owned current store,
comparing its full snapshot, facts, versions, coverage and sources. Only fact and
source-ref set order is normalized; duplicate IDs/refs are rejected, not dropped.

`resolveFactReferences(store, snapshot, factIds)` requires a full owned snapshot
context and resolves the requested set in canonical ID order. Missing, duplicate
and cross-snapshot references fail. `resolveFactSource(store, snapshot, ref)`
returns the immutable original source component; arbitrary snapshot paths fail.
Changing the runtime calculator environment also invalidates access.

Hash equality is never enough: conflicting semantic content with the same fact
ID fails construction, while source and payload forgeries fail full validation.
No old persisted store is silently upgraded or granted runtime ownership.

## Verification boundary

Focused tests compare the actual Bazi and iztro-derived snapshot data with every
emitted pillar, placement and transformation, resolve their sources, check
missing time, alternative omission, name-independent IDs, A→B→A, source/fact
ordering, invalid references, immutable data, complete-content forgery and forced
digest collisions. Calculation spies prove adaptation performs no new Bazi or
iztro calls. These are software-contract checks, not external astrology accuracy
or predictive-validity evidence. Exact full-regression, typecheck, CI and
independent-review outcomes are recorded in PR evidence, not assumed here.
