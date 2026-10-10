# Issue 51: shared natal checkpoint and remaining snapshot contract

Base: `10021b266fd57c9045e887a160b3a38b5220766b` (includes PR 91). This document
separates the implemented internal checkpoint from the proposed persisted
contract. It does not declare Issue 51's cross-entry snapshot acceptance complete.

## Implemented checkpoint

- Sync `analyze` gives its main Ziwei engine and timeline the same run-local natal
  provider. A standalone sync/cooperative timeline creates its own provider.
- The primary and each alternative astrolabe are computed once per run. Existing
  Bazi natal sharing remains in place. No calculator formula or period algorithm
  is replaced. Period/asOf projections still run separately.
- A private copy of the complete TimeContext and effective Ziwei clock options
  is compared canonically at every provider request. There is no hash-keyed
  cache, persisted ID, cross-run reuse, or global cache. Even source labels and
  names must match this conservative internal capability boundary.
- Resolved times and typed natal views are deeply frozen. Public projections
  are separate mutable copies. The live iztro FunctionalAstrolabe is a private
  implementation capability, **not** an immutable/serializable ChartSnapshot:
  iztro attaches palace/star links lazily and cannot be recursively frozen.
- Only successful calculations are cached. Unknown time remains unavailable.
  Public ZiweiEngine language options and standalone calculator settings retain
  their existing meanings.
- PR 91's generator yields, cooperative environment checks, input copies,
  cancellation reasons, and atomic-year publication are retained. A cancelled
  run discards its local capability; retry starts a new one. No Web scan or
  frozen forecast logic is changed.

No public shape, version literal, or golden is changed: core remains 0.9.0,
Report 7, Timeline 2, and calculator versions unchanged. This is an internal
deduplication, like the existing Bazi provider, with full-output equality as the
release gate. Any observed semantic difference blocks this checkpoint rather
than authorizing a golden rewrite.

## Evidence required for this checkpoint

- A real `astro.bySolar` spy delegates to the installed implementation: prior
  `analyze` primary count 4, new count 1. Alternatives also count once. The spy
  targets the CommonJS implementation because iztro re-exports an accessor.
- Main engine and typed calculator full outputs equal independent real results
  across civil/solar, early/late, and midnight boundaries; period/asOf changes do
  not recompute natal work. Public nested-array mutations cannot poison reuse.
- Complete source/options mismatch, foreign resolution, unknown time,
  A→B→A, cancellation/retry, and standalone/cooperative actual reuse are tested.
- Existing report golden and PR 91 complete-serialization hashes must pass
  without fixture edits, alongside legacy report replay and full regression.
  Test outcomes and execution limitations belong in the delivery evidence;
  this design document does not assert that a run has finished.

## Proposed next contract, not implemented here

1. **Identity.** Reuse CalculationSpec's existing canonical effective identity,
   including time settings, complete coordinates, canonical timezone and version
   dependencies. Name is already required by the Numerology calculation identity;
   this proposal adds no new personal-data hash use. A hash is not anonymization.
   Issue 27 factId's name-excluding policy remains separate. Raw source spellings
   stay source metadata rather than changing effective identity.
2. **Immutable snapshot.** `core/chartSnapshot.ts` should build a deeply immutable,
   serializable natal DTO from the resolved spec. It must exclude asOf, periods,
   mutable library objects and clock timestamps. The existing natal providers
   may supply its data; they are not a substitute for that DTO.
3. **Snapshot IDs.** A deterministic versioned ID can label the snapshot, but
   neither FNV specHash nor snapshotId can authorize cache reuse alone. Compare
   the complete canonical identity and validate the complete expected natal
   content/schema. A deliberate same-ID/different-identity fixture must be
   rejected. Settings changes must alter the identity and ID; A→B→A must recover
   exactly A without stale projections. The exact snapshot serialization/ID
   derivation must be reviewed with the DTO before code is persisted.
4. **Report 8 compatibility.** Propose adding `calculation: { specHash,
   snapshotId }` only when the report can retain/retrieve the validated snapshot
   needed by every applicable consumer. A reference without its reconstructible
   content is insufficient. Review whether the DTO is embedded or stored beside
   the report before changing serialization. New reports with missing, corrupt,
   or mismatched snapshot data must not silently fall back to guessed settings.
   Reports ≤7 keep the existing conservative historical replay path; do not
   invent/backfill snapshot IDs or reinterpret old signals as new calculations.
   Frozen forecasts and historical prediction/evaluation meaning stay unchanged.
5. **Actual consumer sharing.** Timeline, Question/askAi and Backtest must consume
   the same validated natal snapshot/runtime capability, not merely copy an ID
   while recalculating independently. Measure calculation counts across those
   real entry paths, including cooperative cancellation. Source results alone
   or equal output hashes do not prove that sharing happened.

## Dependencies and acceptance still open

- [Issue 51](https://github.com/skydreamer0/fortunetelling/issues/51): required
  timeline clock options shipped in PR 81. This checkpoint reduces repeated
  natal work but does not implement snapshotId, Report 8, cross-report reuse or
  the same-snapshot all-entry AC.
- [Issue 52](https://github.com/skydreamer0/fortunetelling/issues/52): Profile 1
  has no persisted time settings. MCP/export still use explicitly disclosed
  true-solar/late options; Profile 2 migration and full spec-driven cache/entry
  wiring are needed for non-default Web/MCP/export parity. No profile or export
  schema is changed here.
- [Issue 53](https://github.com/skydreamer0/fortunetelling/issues/53): current
  CalculationSpec scope is synchronous natal intent and excludes Jyotish/Human
  Design ephemeris settings. Async seven-system/export parity needs that spec
  expansion, not hidden defaults or relabelling the sync five-system snapshot.

The remaining design must be reviewed before persistence/schema work. Until
these dependencies and the old-report/collision/cross-entry tests are addressed,
Issue 51 stays open and no all-entry snapshot guarantee should be published.

## 2026-10-10 internal DTO checkpoint (not Report 8 or Issue closure)

`core/chartSnapshot.ts` now implements a candidate sync-five-system immutable
natal DTO. It is deliberately not exported from the public package index or
attached to Report 7. No existing report/Timeline/backtest output, version,
fixture, export or locked forecast is changed at this checkpoint.

- `sn1` hashes the complete canonical schema/scope, CalculationSpec identity,
  specHash, and natal content. Name remains part of the existing Numerology spec
  identity; snapshot IDs are private non-cryptographic diagnostics and are not
  fact IDs, privacy protection, or authentication. No factId algorithm changes.
- Only the exact current sync CalculationSpec identity is accepted. Historical
  versions, additional settings, async ephemeris scope and forged specHash are
  rejected. Original labels and spelling remain source metadata, outside DTO.
- Natal data is built directly, with no arbitrary period/asOf: Bazi pillars and
  natal luck basis; Ziwei resolved natal and alternatives; Numerology's existing
  natal routines; existing Tzolkin and MingGua charts. Missing birth time skips
  Bazi/Ziwei explicitly. Mutable iztro objects and engine timing are excluded.
- The new Numerology natal method calls existing private natal routines; the
  existing full engine order and outputs remain unchanged.
- Candidate readback is compared with a freshly calculated trusted snapshot by
  complete identity and complete content, including all fields. Same IDs do not
  bypass either comparison. The returned value is owned and deeply frozen.
  This is not a hash cache, persistence store, or historical replay engine.
- Default iztro configuration is checked before/after synchronous calculation;
  existing `createAstrolabe` explicitly selects zh-TW. A future retained runtime
  must also enforce environment guards on every period use and cooperative
  boundary. This checkpoint retains no long-lived live library object.

Next gate: independent contract review, then genuine same-snapshot runtime use
by existing sync Timeline/Question/Backtest and Report 8 compatibility. Do not
claim that copying snapshotId alone implements sharing. Report 8 must retain a
validated DTO; missing/corrupt new data must fail closed, while Reports <=7 keep
the existing conservative replay path without invented IDs. Profile 2 (#52)
and async ephemeris identity (#53) remain separate unresolved dependencies.

### Next internal checkpoint: real sync projection session

`chartSnapshotSession.ts` now retains the freshly computed snapshot's private
Bazi/Ziwei runtime in a per-object WeakMap. This supersedes only the preceding
checkpoint's statement that no runtime is retained. There is still no global
hash-keyed cache, Report migration, or public package export.

- A session owns its canonical TimeContext and derives time settings solely from
  snapshot identity. Display labels normalize to `CalculationSpec`; callers do
  not pass a second context/name or override birth settings. New API options
  explicitly reject such overrides and non-sync timeline systems.
- Timeline and Backtest (>50-year chunks included) now have internal provider
  seams. Existing entry points use their previous paths and serialization.
  The session's wrapper returns `calculation` plus the unchanged timeline result.
  This demonstrates genuine provider sharing; it is not yet Web AskAI wiring.
- Retained Ziwei uses the existing default-config/zh-TW guard at every projection
  and every cooperative boundary. Unsupported environment changes fail closed
  and are not reset by the session. Private live library objects never enter
  the serializable immutable DTO.
- A supplied serialized snapshot is validated once against one freshly computed
  current snapshot, then that reconstruction supplies all projections. Reloading
  does reconstruct natal once; it does not promise cross-process zero work or
  historical-version replay. Complete identity/content checks precede use.
- Cancelled cooperative projections publish no partial timeline. The session may
  retain its immutable successful natal basis; retry recalculates periods and
  must equal an independent complete projection.

Report 8, main report attachment, AskAI and export wiring remain pending. No
Report 7 receives invented fields; #51's all-entry acceptance remains open.

Independent API-surface correction: the early DTO Draft's named
`NumerologyEngine.natal()` was reachable through the existing exported class,
so its initial 'unchanged public API' wording was too broad. The follow-up makes
that method JavaScript-private and uses an internal per-instance WeakMap friend
capability. The public class prototype remains exactly constructor/_compute;
no natal method or registration helper is added to the public package surface.
The map registers implementation access, not profiles, identities, or results.
