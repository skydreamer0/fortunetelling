# Standalone Jyotish capture/replay v1

This is a separate opt-in API, not a change to `aes1`, `cs1`, async timeline,
Profile v2, Report v8, or their consumers. Source baseline: Core 0.11.0,
`d9133cf63070791bb3e6480357ab2d363eafcb8c`. Proposal: PR #162.

```ts
import { captureStandaloneJyotish, replayStandaloneJyotish } from '@fortune/core';
const record = await captureStandaloneJyotish(timeContext, {
  asOf: '2026-07-11', dashaYearDays: 360,
});
const verified = await replayStandaloneJyotish(JSON.parse(JSON.stringify(record)));
```

## Contract

- Only Jyotish. Capture takes a complete current `createTimeContext` result and
  `asOf`, with optional `ayanamsa`, `node`, `dashaYearDays`. Unknown options fail.
  Context must match current reconstruction for either DST-overlap resolution;
  additional context metadata requires a future explicit contract, not silent dropping.
- Raw descriptors distinguish absent / own undefined / null / value. Only asOf
  allows Date, encoded as a canonical ISO descriptor. Strings retain their raw
  value; normalized UTC day is also recorded. No implicit today.
- Nullish settings retain the existing resolver defaults. Year length accepts any
  finite positive number, not only three special values. Actual calculator overflow,
  nonfinite results, or unrepresentable dates fail capture; this is not a promise
  that every positive finite value produces a record. In current runtime both
  Number.MAX_VALUE and Number.MIN_VALUE fail safely with invalid-date errors.
- Ownership occurs before first await. Caller context/config/Date stay mutable.
  Returned record is recursively frozen. Plain acyclic finite JSON only; accessors,
  symbols, hidden fields, sparse arrays and custom prototypes are rejected without
  evaluating accessor values. Date exception is limited to the asOf input slot.
- Unknown birth time preserves null JD/time and empty planets/components/dasha/lagna
  with time_unknown. Calendar reference noon is not a fabricated birth instant.
- Envelope schema 1, scope standalone-jyotish, implementation
  standalone-jyotish-replay-v1. Records contain full context, raw and effective
  settings, normalized asOf, Core/calculator/tzdb versions, locked calculation and
  ephemeris package versions/integrities, loaded ephemeris version/mode, and complete
  ChartResult (including components and warnings).
- Replay first rejects unknown/missing top-level fields before context preparation or
  WASM initialization, then reconstructs raw input, rebuilds effective settings, rejects current-build
  version/dependency mismatch, reruns the real calculator, and compares every field
  of the record. Unknown fields are not ignored. No historic runtime download or
  record migration. Dependency integrity describes the pinned distribution;
  this API is not a remote attestation mechanism for a modified installed runtime.
- `resultHash` is sjr1-prefixed FNV-1a diagnostic identity, **not** a signature,
  security proof, scientific oracle, or permission to share private birth data.
  A wholly replaced but internally consistent record can pass replay.

## Storage and privacy

Capture/replay have no storage or telemetry API and do not export/upload birth data.
The ephemeris loader retains its existing WASM initialization behavior; this is not
an assertion that a browser never fetches a runtime asset. Existing Web localStorage
queries/life events and MCP local `.fortune.json` files are unchanged. No database,
IndexedDB, migrations, consumer integration, or new UI is included.

## Verification boundary

The new 24-case synthetic suite is executable, not an astronomical correctness oracle.
It checks descriptors, custom year propagation, unknown time, input ownership,
roundtrip, malformed data, current versions, tampering and existing strict aes1.
The public-entry test checks only the two new named exports. Existing successful
unchanged suites are not rerun; legacy source blobs are compared to the fixed base.
Independent review and actual test receipts determine acceptance, not this document.
