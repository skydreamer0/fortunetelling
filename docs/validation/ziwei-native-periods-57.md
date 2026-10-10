# Ziwei native-period adapters (#57)

This implements the adapter scope of [Issue #57](https://github.com/skydreamer0/fortunetelling/issues/57)
on the existing [#55 contract](./native-period-55.md). It is additive: it does not
change the original inclusive-date sequences, Report 7, Timeline 2, rule windows,
goldens, calculation conventions or the run-local natal reuse added by #92.
Native-period evaluation and consumer wiring remain #58.

## API and identity

The public core barrel now exports `ziweiDecadeNativePeriod`,
`ziweiYearlyNativePeriod`, `ziweiMonthlyNativePeriod`, and
`ZiweiNativePeriodOptions` through the existing Ziwei barrel. Each function
takes one corresponding typed source period plus an explicit `timezone` copied
from the profile's `birthplace.timezone`. No profile, host or UTC default is chosen.

The result is a frozen `NativePeriod` with `system: 'ziwei'`, `precision: 'day'`,
and `kind: 'decade' | 'year' | 'month'`. The source `id` is preserved verbatim as
`periodId`, so consumers can join the bounds back to the original chart period
and its palace, stem/branch, age range and mutagens without duplicating them.
These IDs are **source/chart-scoped**, not globally unique facts or snapshots.
Keep the chart/calculation context and timezone with them; a bare `periodId`
must not be used as a cross-profile, cross-zone or cross-version cache key.
This adapter does not settle the later #27 fact/signal identity contract.

Both source dates are validated before arithmetic. The inclusive end is moved
to the next **civil date**, and both dates are then resolved separately through
the bundled tzdb using `nativePeriodFromDates`. No fixed 24-hour instant addition
is used. Invalid/reversed dates and a result outside the supported date domain
are rejected. Inputs and existing serialized charts are not modified.

As in #55, a missing midnight is rejected instead of silently moved. Repeated
midnight requires explicit `startOverlap` / `endOverlap`; the latter selects
midnight on the day **after** the inclusive end. Adjacent periods must use the
same choice at their shared boundary. No first-valid-instant policy is introduced.
`day` records source boundary precision; it is not a 24-hour duration or a claim
of second-level astrological precision.

## Sources and comparison

Calendar literals were checked on 2026-10-10 against the Hong Kong Observatory
tables for [2023](https://www.hko.gov.hk/tc/gts/time/calendar/text/files/T2023c.txt),
[2025](https://www.hko.gov.hk/tc/gts/time/calendar/text/files/T2025c.txt) and
[2026](https://www.hko.gov.hk/tc/gts/time/calendar/text/files/T2026c.txt):

- 2023-01-22, 2025-01-29 and 2026-02-17 are lunar New Year dates.
- 2025-06-25 starts month six; 07-24 ends that regular month; 07-25 starts leap
  month six; 08-08 and 08-09 are its fifteenth and sixteenth days.
- 2025-08-23 starts regular month seven; 09-22 starts month eight.

The day-15/16 **interpretation split** is the project's existing iztro convention,
not a separate astronomical claim. Tests use installed iztro **2.5.8** directly
(`astro.bySolar('1991-10-5', 7, '女', true, 'zh-TW').horoscope(...)`) beside the
repository's sequence functions. Its installed
`lib/astro/FunctionalAstrolabe.js` implements the leap-day adjustment with
`isLeap && lunarDay > 15`; its default lunar-year age/horoscope conventions are
preserved. The upstream project is [SylarLong/iztro](https://github.com/SylarLong/iztro).
Current online documentation can describe a later version; the installed/locked
version, not the documentation's latest version, is the tested oracle.

The synthetic birth is 1991-10-05, time index 7, female. Direct probes compare
palace index, heavenly stem, earthly branch and all four mutagens at the selected
leap-month dates, both endpoints of every 2025 monthly period, the 2026 New Year,
and the chart's 2023 decade transition (nominal ages 32 to 33). Literal Taiwan
UTC+08 boundaries separately verify conversion. This is library compatibility
plus external calendar provenance, not independent validation of natal star
positions or predictive accuracy.

## Checks

```sh
bun test packages/core/tests/ziweiNativePeriods.test.ts packages/core/tests/ziweiNativePeriodsHostTimezone.test.ts
bun test packages/core/tests/nativePeriod.test.ts packages/core/tests/nativePeriodHostTimezone.test.ts packages/core/tests/ziweiTimeContext.test.ts packages/core/tests/ziweiNatalBasis.test.ts packages/core/tests/reportGolden.test.ts
bun run --filter @fortune/core typecheck
```

Coverage includes half-open membership immediately before/on the leap, year and
decade boundaries; adjacency; explicit profile zones and aliases; 23/25-hour civil
days; skipped/repeated midnight; invalid/reversed dates; frozen/detached output;
and unchanged source serialization. Fresh Bun subprocesses under UTC,
Asia/Taipei, America/New_York and Pacific/Apia compare full adapter outputs for
three profile zones with host `Intl.DateTimeFormat` disabled. Distinct native
offsets prove that the subprocess host TZ actually changed. This is not a claim
of Windows, browser, deployment or downstream segmented-timeline acceptance.

The initial tests-only checkpoint had eight failing adapter tests before the
exports existed. Exact candidate SHA, focused results, independent review and
final CI status are recorded in the PR/verification receipt, not inferred here.
