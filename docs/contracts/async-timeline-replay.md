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

This additive package starts from master ea811be and does not require unmerged
PR151 (Profile2/Core0.10) or PR153 (Report8/Core0.11). Its executable schema and
implementation are explicitly versioned; the base Core package version remains
0.9.1. Integration with those pending version changes must retain the resulting
Core version in identity; old records fail closed rather than being silently
upgraded. No old runtime is downloaded or selected.

Completed scope: actual async ownership bug regression; full execution identity;
owned JSON replay through real calculation; dependency binding; complete-result
parity; changed-option isolation; unknown-time and rejection acceptance.

Remaining parent-issue scope: historical executable/ruleset storage and routing,
async natal snapshots and Report/Profile/UI/MCP replay integration, persistent
cache policy, standalone dasha-year customization, external scientific validation
and historical accuracy. This record does not establish any of those claims and
does not complete all acceptance criteria in #26 or #53. It adds no cancellation
contract to the existing async entry.

## Privacy and validation

A record contains full birth/profile information and derived timeline evidence.
Treat it as personal data. Capture is opt-in and does not upload or write anything.
Only synthetic profiles are used in repository tests.

`asyncTimelineOwnership.test.ts` first fails against untouched master because a
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
