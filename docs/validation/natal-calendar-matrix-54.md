# Issue #54: source-backed natal calendar slice

This tests-only slice builds on PR #92's run-local natal basis. It does not
complete #54, introduce a persisted ChartSnapshot, change runtime conventions,
or update any semantic golden. All birth inputs are synthetic.

## Calendar facts checked on 2026-10-10

The literal fixture values in `tests/fixtures/natalCalendarCases.ts` were checked
against the [HKO 2025 daily conversion table](https://www.hko.gov.hk/tc/gts/time/calendar/text/files/T2025c.txt)
and the July/August entries of the [CWA 2025 calendar, page 1](https://www.cwa.gov.tw/Data/astronomy/2025cal.pdf).
HKO explicitly labels the first days; CWA also identifies the leap sixth month.

| Gregorian date | Lunar date in 2025 |
| --- | --- |
| July 24 | regular month 6, day 30 |
| July 25 | leap month 6, day 1 |
| August 8 | leap month 6, day 15 |
| August 9 | leap month 6, day 16 |
| August 22 | leap month 6, day 29 |
| August 23 | regular month 7, day 1 |

These literals check both conversion directions and noon civil TimeContext in
Taipei/Hong Kong. The leap month has 29 days; invalid day 30 retains the existing
API rejection, including its generic leap-month error wording. Lunar labels are
calendar facts, **not** independently verified Ziwei palace/star positions.
In particular, iztro's `fixLeap` split at day 15/16 is a library/school convention.

[IANA tzdb 2026e `asia`, Taiwan rules and Asia/Taipei zone](https://data.iana.org/time-zones/tzdb-2026e/asia)
states that in 1974–1975 DST starts April 1 at 00:00 (+1 hour) and ends October 1
at 00:00, with a standard +08:00 offset. Applying the existing product policy:

- April 1, 1974 00:30 is a 60-minute gap. Shift-forward gives 01:30 +09:00,
  hence March 31 16:30Z.
- September 30, 1974 23:30 repeats: 14:30Z (+09:00) and 15:30Z (+08:00).
  The current spec chooses the earlier instant. Both retain confirmation flags.

UTC values are arithmetic from published rules. IANA shares upstream data with
the bundled tzdb; this is provenance and policy integration, not an independent
second timezone oracle. No new DST choice is added.

## Engineering equivalence matrix

`natalCalendarMatrix.test.ts` starts three fresh Bun subprocesses per host TZ:
UTC, Asia/Taipei, America/New_York and Pacific/Apia. Imports retain `URL.href`.
Each process handles all eight Taipei natal inputs above (six calendar, two DST).
Distinct native-clock offsets confirm TZ was actually applied to the children.

- A-only: civil clock / late Zi hour, uncached standalone calculations.
- B-only: true-solar clock / early Zi hour, uncached standalone calculations.
- Interleaved: cached A → B → A, retaining A's provider across B.

Every row compares full normalized natal views (including alternatives), main
engine result, source spec/context, resolved time and flags. SHA-256 digests cover
complete serialized outputs; only computedAt, durationMs, generatedAt,
classifiedAt and exportedAt metadata is omitted. Literal health assertions guard
against equal empty/error outputs. The baselines are computed in independent
single-setting processes without the provider, not stored chart goldens.
At least one fixture must produce different natal content between A and B, so
the interleaving check cannot pass by testing only equivalent chart settings.

To keep repository CI bounded, full typed period outputs are sampled at DST
overlap and leap-month day 16 for both settings and every interleaved step. One
complete `analyze` report for leap-month day 16 per TZ is compared across hosts,
with its main Ziwei projection checked against the independently computed row.
Other rows do not claim full-report integration coverage.

## Remaining acceptance

#54 stays open: persisted snapshot cross-host acceptance depends on the remaining
#51 work; independent/human verification of actual natal star/palace positions
is not supplied here. This does not rerun or replace PR #89's already successful
native Windows 55-test receipt. This new slice's Windows execution must be stated
separately; Linux four-TZ equality alone is not Windows acceptance.

Run this slice with `bun test packages/core/tests/natalCalendarMatrix.test.ts`.
Record the exact candidate SHA, test counts, tool version and runtime separately
from any full-suite/CI result. A focused pass is not a full repository pass.
