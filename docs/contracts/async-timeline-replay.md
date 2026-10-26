# Async timeline execution records (#53 / #26)

## Supported public entry points

The existing two-argument `await buildTimelineAsync(context, options)` still returns
Timeline schema 2. It now owns plain input data, including nested arrays, weights,
birthplace and ephemeris settings, **before** the WASM initialization await. Caller
mutation while initialization is pending cannot alter this invocation. Accessors,
inherited custom prototypes, cycles, hidden/symbol fields and sparse arrays are
rejected rather than executed or retained. The synchronous entry is unchanged.

An explicit third argument `{ captureReplay: true }` returns an
`AsyncTimelineRecord` instead. `await replayAsyncTimeline(JSON.parse(json))`
recomputes the real async timeline and validates the entire record. These APIs are
exported through the core timeline and root barrels. There is no persistent cache.

```ts
const record = await buildTimelineAsync(context, options, { captureReplay: true });
const json = JSON.stringify(record);
const checked = await replayAsyncTimeline(JSON.parse(json));
```

## Identity, ownership and compatibility

Record schema 1 / implementation `async-timeline-replay-v1` is a separate contract
from Timeline 2, Profile files, Report files and synchronous natal snapshots.
It contains the full supplied TimeContext, requested period and options, explicit
resolved ephemeris settings and existing `aes1` calculation conventions. The
identity also includes the exact Core and tzdb versions, locked dependency versions
and integrity values, rule/catalog digests, and effective iztro configuration.
The existing async defaults and actual calculations are reused, not reimplemented.
Raw supplied options are retained conservatively: omitted defaults and explicitly
supplied equivalent defaults need not share an identity. `Infinity` for unlimited
signals is serialized as `all` and restored only for that option. Unknown birth
time remains null and retains the existing skipped-system behavior.

Input, returned records and nested proofs/signals do not share mutable aliases.
Records are deeply frozen. Replay owns its input before awaiting, reconstructs the
current specification, recalculates the complete output, and compares every field.
Unknown record fields, changed results, mismatched versions/dependencies/settings
or shared iztro configuration changes during the await fail closed. Diagnostic
FNV identifiers are not signatures or authenticity claims. A party able to replace
an entire consistent record can supply a different calculation; this is not an
anti-forgery or provenance service. The supplied TimeContext is recorded as source,
not independently attested as a canonical derivation of the profile.

## Delivery and remaining acceptance

Historical package baseline: #154 started from master
`ea811be95f6784d507c10b94077179e1aabfe3ed` / Core 0.9.1 independently of the
then-unmerged #151 (Profile2/Core0.10) and #153 (Report8/Core0.11). Those versions
and pending statuses describe the original package, not the current build.

Current documentation checkpoint: master
[`d9133cf63070791bb3e6480357ab2d363eafcb8c`](https://github.com/skydreamer0/fortunetelling/commit/d9133cf63070791bb3e6480357ab2d363eafcb8c).
The reviewed #154 content and #151 via #153 were composed through merged
[#160](https://github.com/skydreamer0/fortunetelling/pull/160). This is content
integration, not a claim that the individual component PR commits were merged.
[`VERSION`](https://github.com/skydreamer0/fortunetelling/blob/d9133cf63070791bb3e6480357ab2d363eafcb8c/packages/core/src/core/version.ts)
is now 0.11.0;
[`asyncReplay.ts`](https://github.com/skydreamer0/fortunetelling/blob/d9133cf63070791bb3e6480357ab2d363eafcb8c/packages/core/src/timeline/asyncReplay.ts)
uses that exact Core version in `spec.versions.core`, together with the full
context/options and dependency/rule identity. Record schema 1 and implementation
`async-timeline-replay-v1` have not changed. Version-mismatched records fail closed
rather than being silently upgraded. No old runtime is downloaded or selected.

Completed scope: actual async ownership bug regression; full execution identity;
owned JSON replay through real calculation; dependency binding; complete-result
parity; changed-option isolation; unknown-time and rejection acceptance.

The [existing synthetic consumer integration](../validation/report-replay-consumer-integration.md)
checks the Report8/Profile2/MCP sync chain and a **separate** current-build async
record. Report8/Profile2 identify `analyze-sync-natal`, excluding Jyotish/HumanDesign;
that integration does not make them full async replay consumers. Likewise,
settings-only `aes1` is not the full record identity. See the
[settings boundary and historical receipts](../validation/async-ephemeris-spec-53.md)
and the [#53 post-merge status](https://github.com/skydreamer0/fortunetelling/issues/53#issuecomment-6308858144).

Remaining parent-issue scope: historical executable/ruleset storage and routing,
async natal snapshots and Report/Profile/UI/MCP replay integration, persistent
cache policy, standalone dasha-year customization, external scientific validation
and historical accuracy. This record does not establish any of those claims and
does not complete all acceptance criteria in #26 or #53. It adds no cancellation
contract to the existing async entry.

This 2026-10-24 correction is static documentation only: no replay tests,
calibration, typechecks, build, browser or device checks were rerun. Existing
acceptance receipts retain their original heads and scope. #22/#23 Holds and
#31/#64 source/semantic restrictions remain unchanged; documentation does not
authorize publication, deployment or parent-issue closure.

## Privacy and validation

A record contains full birth/profile information and derived timeline evidence.
Treat it as personal data. Capture is opt-in and does not upload or write anything.
Only synthetic profiles are used in repository tests.

Historically, `asyncTimelineOwnership.test.ts` first failed against the untouched
`ea811be` package baseline because a
caller-mutated systems array changes the pending result. `asyncTimelineReplay`
exercises real WASM calculations, mixed-system A/B/ABA, JSON round trips, complete
output comparisons, version/source/result negative controls and ownership.
Existing timeline, consensus, required-option and ephemeris tests provide related
regression coverage. This is reproducibility validation, not scientific validation.

Explicit own `undefined` values are preserved while owning inputs: malformed
nested ephemeris choices/sampling and individual system weights still reach the
existing strict validators and reject. Legitimate optional `undefined` values
(e.g. optional name, years or the whole weights/ephemeris option) keep their old
default semantics. Only after successful actual calculation are legal optional
object fields omitted for JSON storage. Replay accepts JSON data, not records
containing undefined fields; it never defaults malformed stored values.
