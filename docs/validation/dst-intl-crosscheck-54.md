# Issue #54: DST gap/overlap Intl implementation cross-check

Test-only slice. Test: `packages/core/tests/dstIntlCrossCheck.test.ts`.
It does not complete #54. No runtime, golden, fixture or barrel changes.

## What it checks

For each transition below, the product's bundled tz database
(`packages/core/src/time/zone.ts`, `source: 'tzdb'`) is compared with offsets
read from the runtime's `Intl.DateTimeFormat` (`timeZoneName: 'longOffset'`):

| Zone | Transition (UTC) | Kind | Wall time probed |
| --- | --- | --- | --- |
| Asia/Taipei | 1974-03-31T16:00Z | gap | 1974-04-01 00:30 |
| Asia/Taipei | 1974-09-30T15:00Z | overlap | 1974-09-30 23:30 |
| Asia/Taipei | 1975-09-30T15:00Z | overlap | 1975-09-30 23:30 |
| America/New_York | 2025-03-09T07:00Z | gap | 2025-03-09 02:30 |
| America/New_York | 2025-11-02T06:00Z | overlap | 2025-11-02 01:30 |
| Europe/London | 2025-03-30T01:00Z | gap | 2025-03-30 01:30 |
| Europe/London | 2025-10-26T01:00Z | overlap | 2025-10-26 01:30 |
| Asia/Taipei 2025 | none (control) | none | samples every 6 h, plus the wall times above |

- Intl must itself show a change exactly at each listed instant.
- `zoneInfoAt` offset equals the Intl offset at ±1 s, ±1 min and ±1 h, and every
  minute over ±3 h.
- `resolveWallTime` gap/overlap results equal the documented policy applied to
  candidates built from Intl offsets, not from product output. For a gap, the
  wall time is shifted forward by the gap (pre-transition offset). For an
  overlap, both candidates are returned, `earlier` is the default and `later`
  works when asked for. Intl also confirms the wall time is nonexistent or
  ambiguous.
- Wall times one minute outside each gap/overlap resolve as `normal`.

Result on Node v24.22.1 (`process.versions.tz` 2026e, ICU 78.3; product
`TZDB_VERSION` 2026e) and Node v22.22.3 (tz 2026a, ICU 78.2): all cases agree.
No disagreement was found. The test name records the runtime versions on each run.

## Limits

- **Shared upstream.** ICU's zone data also comes from IANA tzdb. This is an
  implementation cross-check (our compiler, lookup and wall-time resolution vs.
  ICU's). It is **not** an independent historical source. An upstream IANA error
  would show up identically on both sides.
- Runtime tz versions may differ from the bundled 2026e. The chosen transitions
  have not changed between those releases, but a future upstream edit could make
  this test fail on one runtime and not another. A failure here means the two
  sides differ. It does not say which one is right.
- Only the zones and years above are covered. There are no pre-1970/backzone,
  LMT or `lmtLongitude` cases, and no other zones.
- No leap-month or month-end additions. No new HKO/CWA data. The existing
  `natalCalendarCases.ts` fixtures are untouched.
- The suite is skipped (`describe.skipIf`) when the runtime lacks full ICU
  time-zone data. In that case it checks nothing.
