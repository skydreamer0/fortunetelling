# NativePeriod primitives (#55)

This is the foundation for [#55](https://github.com/skydreamer0/fortunetelling/issues/55), based on master `bf14d736929f598da16be8a04f695894796fc93a`. It adds types, interval/timezone utilities and tests. It does not change Report 7, Timeline 2, `SignalWindow`, rule evaluation, scores, or any identity/hash algorithm. Adapters and segmented evaluation remain #56–#58.

## Contract

- `NativePeriod` carries the caller's `periodId`, `system`, `kind`, `startInstant`, `endExclusive`, `precision`, and `timezone`. `kind` remains an adapter-owned string. No IDs or new rule semantics are generated here.
- Every interval is nonempty and half-open: `[startInstant, endExclusive)`. Touching intervals do not overlap. Intersection/split results contain only bounds, so a changed shape never accidentally reuses a native period's identity.
- Constructors return frozen objects. `splitPeriodInterval` returns a frozen list of frozen intervals; it sorts/deduplicates cuts without mutating the caller's list. Cuts at/outside the interval are ignored after validation.
- Input timestamps require an explicit offset and seconds; 1–3 fractional digits are accepted without rounding. Output is canonical UTC ISO with milliseconds. Date-only, offset-free, impossible Gregorian dates, `24:00`, leap seconds, and finer-than-millisecond timestamps are rejected. The existing Gregorian date domain is retained: UTC/local years 0100–9999.
- `precision` (`day`, `second`, `millisecond`) records the source boundary resolution. It does not measure confidence, imply an actual transit crossing, or promise that a day lasts 24 hours.

## Date and timezone normalization

`nativePeriodFromDates` takes explicit `startDate` and `endDateExclusive` civil dates. It does not convert an inclusive end implicitly or add a fixed 86,400,000 ms. Each midnight is resolved using the repository's bundled IANA tzdb through `resolveWallTime`; aliases are canonicalized. Unknown zones are rejected, with no host `Intl` fallback.

Examples fixed in tests:

- Taipei 2026-01-01 midnight → 2025-12-31T16:00:00.000Z.
- Kathmandu 2026-01-01 midnight → 2025-12-31T18:15:00.000Z.
- New York 2024-03-10 lasts 23 hours; 2024-11-03 lasts 25 hours.
- Apia 2011-12-30 is a skipped civil date. São Paulo 2018-11-04 has a missing midnight. Both boundaries are rejected rather than silently shifted.
- Havana 2024-11-03 has two midnights. A caller must explicitly choose `earlier` or `later`; omission throws. Date-period constructors accept `startOverlap` and `endOverlap` separately.

These are defensive normalization rules, not a chosen astrology/calendar convention. Adapters that need first-valid-instant or another gap policy must define that behavior explicitly in their own work; this utility does not guess it.

## Acceptance and reproducibility

Run from the repository root:

```sh
bun test packages/core/tests/nativePeriod.test.ts packages/core/tests/nativePeriodHostTimezone.test.ts
bun test packages/core/tests/reportGolden.test.ts
bun run --filter @fortune/core typecheck
```

The initial missing-module test run failed before implementation (0 pass, 2 fail, 1 import error). New tests cover adjacency, intersection symmetry, containment, exact split coverage, duplicate/unsorted/outside cuts, millisecond boundaries, invalid inputs, timezone aliases, non-UTC date conversion, DST, skipped dates and repeated midnight. A subprocess test compares serialized output under UTC, Asia/Taipei, America/New_York and Pacific/Apia while replacing `Intl.DateTimeFormat` with a throwing stub.

All fixtures are synthetic. Existing report fixtures and versioned golden deltas are unchanged. These tests verify interval mechanics and timezone determinism, not predictive validity or completion of the later native-period adapters.
