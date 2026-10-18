# Issue #54: external 2025 solar-term matrix

## Claim and provenance

This is an astronomy/time-adapter validation slice. It supplies 24 fixed,
external minute-resolution solar-term facts for 2025, plus tests of existing
TimeContext selection and uncertainty flags. No calculation algorithm, chart
convention, prediction interpretation, semantic golden, dependency or CI
workflow changes. Issue #54 stays open.

The constants were transcribed from the **Solar Terms** column of page 1 of each
monthly PDF in the [HKO Almanac 2025](https://www.hko.gov.hk/en/gts/astron2025/almanac2025_index.htm),
and all twelve downloaded pages were visually inspected on 2026-10-18 UTC.
[Source manifest](solar-term-oracle-54-sources.json) records each official URL
and SHA-256 of the downloaded PDF. The fixture records its source month.
Only the 24 factual date/time values and provenance are stored, not the PDFs.
Simplified names in the fixture match the existing adapter's identifiers.

The [HKO astronomical-data notes](https://www.hko.gov.hk/en/gts/astronomy/Solar_Term.htm)
identify HM Nautical Almanac Office and US Naval Observatory data, and explicitly
state Hong Kong Time = UTC+8. This is external to the project's lunar-javascript
1.7.7 implementation; neither application output, a same-library round trip,
nor a freshly generated application snapshot supplied these expectations.
It does not prove every underlying astronomical model is wholly unrelated.
The [HKO definition](https://www.hko.gov.hk/en/gts/time/24solarterms.htm) describes
15-degree solar-longitude intervals. HKO dates validate astronomical timing,
not the fortune-telling meaning assigned to it.

## Precision and fixed acceptance envelope

The publication displays minutes, not seconds. Its rounding convention is not
specified on the inspected monthly pages. Do not append zero seconds and call
that the exact astronomical instant. Before running the comparison, the test
budget was fixed at 120 seconds: 60 seconds for minute-only publication and
60 seconds for the adapter's existing approximately one-minute accuracy claim.
This is an engineering acceptance envelope, not an HKO error bar or a measured
confidence interval. It is not tuned from observed application residuals.

All 24 actual-minus-published residuals in the first focused run were nonzero,
ranging from -28 to +29 seconds. That agreement is **not zero-error proof**.
Future changes must retain the external literals and this documented budget;
a failure requires source/implementation investigation, not wider tolerance.

Selection probes are fixed at ±5 minutes from each published time, outside the
±2-minute comparison envelope. Inputs inside that envelope are intentionally
not assigned a source-proven before/after classification. Exact-second equality
and its inclusive boundary contract remain engineering tests, not external
astronomical validation.

## Automated matrix

- 24 distinct terms: 12 jie and 12 qi, all 12 months, including 立春 and UTC-day
  rollover. Test cardinality, names, kinds and order reject missing/extra terms.
- Every term's UTC instant is checked directly against its HKT literal.
- 24 terms × two fixed synthetic birth locations (Hong Kong/Taipei) × before/
  after: 96 TimeContext probes. Expected names come from the external row;
  each returned instant is separately checked against its external value.
- All 12 jie × exact/approx15m/approx1h × both sides × clearly inside/outside
  the existing 30/60-minute flag threshold: 144 uncertainty-flag probes.
  The five-minute margin avoids source uncertainty near the threshold itself.
  Qi probes must not accidentally raise a jie-boundary flag.
- Four fresh Node processes use UTC, Asia/Taipei, America/New_York and
  Europe/London. They compare the **complete solar-term table** and verify a
  native timezone offset probe. This is host equivalence, not another oracle.

Birthplace, time accuracy and earlier DST policy are explicit; all dates are
synthetic. TimeContext has no trueSolar/zi-hour calculator-option argument.
This slice therefore does not claim A/B/ABA chart settings, full chart snapshots,
full-report entrypoints, or persisted replay. No user birth data is used.

Run `npm test -- packages/core/tests/solarTermExternalOracle.test.ts`.
It is an ordinary discovered Vitest test, unlike the archived R2/R4 `.test.ts.txt`
artifacts. Node 24/npm 11 and the committed package-lock remain required.
Native OS coverage must be taken from actual exact-head CI job inventory, not
inferred from a Linux four-TZ pass or the old #128 native test allowlist.

## Remaining scientific and acceptance boundaries

The prior #94 leap-month/month-end calendar literals, #128 native snapshot
matrix, and merged #131/#137 archived NY-DST artifacts remain intact. This
matrix does not rerun or replace those claims. #131 is merged as
`e84c1c8a870b254d6bfd45142b4dc5b6b3e715ff`; older issue-body Draft prose is
historical, and archived text still does not acquire runtime acceptance.

Independent Ziwei star/palace placements, alternate iztro configurations,
true-solar/equation-of-time accuracy across the supported historical range,
other years, full native Windows/macOS execution of this new suite, and all
Issue #54 aggregate AC remain unproven here. Calendar/astronomical agreement
provides no evidence that personal-event predictions are valid. No new product
convention or DEC is adopted, and no existing uncertainty flag is suppressed.
