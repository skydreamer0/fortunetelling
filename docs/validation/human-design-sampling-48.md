# #48 Human Design sampling validation

## Result

The new tests **characterize the current implementation; they do not establish sampling convergence or astronomical timing accuracy**. The year step remains 15 days and the month step remains 3 days. No weights, catalog entries, public package exports, or signal semantics were changed.

A real-ephemeris counterexample exists: in the 2026 calendar-year window, Jupiter briefly visits gate 39 around its station. The 15-day samples miss that visit; 7.5-day samples detect it. For the synthetic natal profile below, the actual rule output gains two signals when the step is halved. This is evidence for the existing [#48](https://github.com/skydreamer0/fortunetelling/issues/48) / [#63 continuous-ephemeris work](https://github.com/skydreamer0/fortunetelling/issues/63), not a sampling-algorithm fix in this change.

## Method and limits

- Source baseline: `bf14d736929f598da16be8a04f695894796fc93a`.
- Runtime: Bun 1.4.2; `@swisseph/browser` 1.3.1; Swiss Ephemeris WASM 2.10.03 with the existing Moshier fallback. No network or external astrology API is used.
- Reference synthetic profile: 1990-01-01 12:00, Asia/Taipei, latitude 25.033 / longitude 121.5654; female, exact time. It is an invented test input, not a person's record.
- Windows: calendar years 2024–2028, all 12 calendar months of 2026, and leap February 2024. Each is evaluated with both true and mean lunar nodes: 36 cases.
- Window dates retain the original UTC midnight convention: start inclusive; sample through midnight immediately after the inclusive end date. Annual steps are exactly 15 → 7.5 days and monthly steps 3 → 1.5 days.
- Every configured body is checked, not only Jupiter: 7 bodies for year and 9 for month. The original exclusions remain unchanged.
- Gates are the real production `gatesAlong` result from real longitude samples. Full `Signal` objects are compared through `evaluateHumanDesignRules`, including IDs, targets, weights, windows and evidence.
- Production currently emits a whole-window signal, not gate-entry or gate-exit instants. The diagnostic reconstructs each crossing using shortest-arc **linear interpolation** between the same samples. Its step-halving drift is not the error relative to the sky or a solved ephemeris root.
- The fixture records the current gate sets, crossing sequences, every paired crossing drift, sample counts and actual signal counts. A changed sequence is reported separately; it is never paired by array position or represented as zero timing error.
- The `toBeCloseTo(..., 6)` check for recorded drift is a reproducibility comparison in hours (about 3.6 ms at that decimal scale), **not an acceptable astronomical error**. No existing tolerance was loosened. Cases with large drift remain explicitly large.
- Only the specific Jupiter counterexample is independently bracketed and root-solved against the real ephemeris in this test. That numerical reference is stopped within one second; it does not validate the physical accuracy of Moshier or provide continuous convergence evidence for all bodies/windows.

## Counterexample: gate 39 and actual missing signals

Use synthetic natal input 1990-02-22 12:00 Asia/Taipei at the same coordinates. Compute its actual natal chart rather than constructing a gate array. The chart has gate 55, lacks gate 39, and does not define channel 39-55. Both true and mean node conventions reproduce the issue.

Window: 2026-01-01 through 2026-12-31.

| Result | 15 days | 7.5 days |
| --- | --- | --- |
| Sample count | 26 | 50 |
| Jupiter visited gates | 4, 7, 29, 31, 33, 53, 56, 62 | 4, 7, 29, 31, 33, **39**, 53, 56, 62 |
| Jupiter crossing count | 8 | 10 |
| Actual signal count, true-node natal | 7 | 9 |

The two additional signals are:

- `transit:jupiter:g39:complete:39-55:solarPlexus`: `relationship.change`, intensity 0.15, valence 0.
- `transit:jupiter:g39:complete:39-55:root`: `self.pressure`, intensity 0.15, valence 0.

All common signals remain identical; these are actual outputs from the existing signal evaluator, not inferred labels. A direct equality assertion between the two full signal arrays fails. The checked-in known-limitation test instead requires this exact counterexample to remain visible, so a green characterization suite must not be described as “sampling precision PASS.”

| Jupiter transition | Ephemeris root (UTC, rounded to second) | 7.5-day linear estimate (UTC) | Estimate minus root |
| --- | --- | --- | --- |
| 53 → 39 | 2026-03-06 08:26:18 | 2026-03-07 14:51:47 | +30.424812 hours |
| 39 → 53 | 2026-03-15 22:55:24 | 2026-03-14 08:33:38 | −38.362692 hours |

Reference root JDs are 2461105.8515970474 and 2461115.455133223. The test starts with separate ten-day brackets, verifies opposite longitude-residual signs, bisects to a one-second bracket, and checks the actual gate one minute on each side. The root estimates above were additionally recorded with sub-millisecond numerical brackets. This is a numerical-resolution statement, not physical-accuracy certification.

## Window-by-window observed linear drift

The table records the maximum absolute difference between matched crossing estimates, in hours. A dash would mean no comparable crossing. The 2026-year Jupiter sequences differ (8 vs 10), so their times are **not** folded into this maximum; the missing transitions are the counterexample above. True/mean columns cover all configured bodies under that node convention, not only the lunar nodes.

| Window | True-node maximum (body) | Mean-node maximum (body) | Reference signals true / mean |
| --- | --- | --- | --- |
| 2024-01-01–2024-12-31 | 102.537854 (northNode) | 25.982828 (pluto) | 25 / 25 |
| 2025-01-01–2025-12-31 | 117.508468 (jupiter) | 117.508468 (jupiter) | 14 / 16 |
| 2026-01-01–2026-12-31 | 126.016541 (northNode) | 12.706854 (neptune) | 14 / 16 |
| 2027-01-01–2027-12-31 | 78.850701 (neptune) | 78.850701 (neptune) | 12 / 14 |
| 2028-01-01–2028-12-31 | 146.360827 (northNode) | 5.695391 (jupiter) | 16 / 16 |
| 2026-01-01–2026-01-31 | 0.119707 (mercury) | 0.119707 (mercury) | 8 / 16 |
| 2026-02-01–2026-02-28 | 1.747802 (mercury) | 1.747802 (mercury) | 15 / 23 |
| 2026-03-01–2026-03-31 | 1.883044 (jupiter) | 1.883044 (jupiter) | 7 / 11 |
| 2026-04-01–2026-04-30 | 0.426888 (mercury) | 0.426888 (mercury) | 18 / 20 |
| 2026-05-01–2026-05-31 | 6.464790 (northNode) | 0.201385 (mercury) | 40 / 40 |
| 2026-06-01–2026-06-30 | 1.895723 (mercury) | 1.895723 (mercury) | 27 / 27 |
| 2026-07-01–2026-07-31 | 0.073652 (northNode) | 0.059024 (venus) | 21 / 22 |
| 2026-08-01–2026-08-31 | 2.578405 (mercury) | 2.578405 (mercury) | 29 / 33 |
| 2026-09-01–2026-09-30 | 3.595796 (venus) | 3.595796 (venus) | 17 / 15 |
| 2026-10-01–2026-10-31 | 4.649776 (mercury) | 4.649776 (mercury) | 21 / 21 |
| 2026-11-01–2026-11-30 | 4.225690 (mercury) | 4.225690 (mercury) | 20 / 20 |
| 2026-12-01–2026-12-31 | 0.400859 (venus) | 0.400859 (venus) | 15 / 15 |
| 2024-02-01–2024-02-29 | 0.222435 (mercury) | 0.222435 (mercury) | 17 / 27 |

The reference natal's complete signals happen to match at both steps in all 36 cases, despite the two gate-set counterexamples (2026 year, true and mean). That is why a second real synthetic natal is essential: agreement for one natal cannot prove the sampled gate set complete. Gate and crossing sequences agree in 34 of 36 cases; **no universal convergence claim follows**. The largest paired linear drift in these windows is 146.360827 hours (true north node, 2028 year); month drift reaches 6.464790 hours (true north node, May 2026).

## Production-preservation checks

The only production edit extracts the unchanged sampling loop into an internal direct-file helper and provides a narrowly named sampling-validation rule factory. The exported `HUMAN_DESIGN_RULES` still uses the catalog defaults. The helpers are not added to a package index.

Before and after extraction, the actual `longitudesAt(jd, node)` calls and complete signal JSON were recorded for 2026 year, February 2024, and May 2026 in fresh isolated processes. The records are byte-identical (SHA-256 `999c19ff3732c7dfe25e3a9950fcad7da555ae88ebb13df745a2b407cbe97a78`). The regression test also asserts the exact original sample schedule, real longitude values, explicit-default versus production-default signals, and pre-extraction signal digests.

## Reproduce

From the repository root:

```sh
bun test packages/core/tests/humanDesignSampling.test.ts
bun test packages/ai/tests/missingSdk.test.ts packages/ai/tests/client.test.ts apps/web/tests/lifeEvents.test.tsx
bun test
```

The existing CI already runs `bun test`; the test filenames enter that suite automatically and no workflow is changed. The SDK-load scenario runs in a separate Bun child process so `mock.module('@anthropic-ai/sdk')` cannot pollute other tests. It denies network access and verifies lazy import, first completion failure, install/injection instructions, retained cause, memoized failure and injected-client recovery. The life-event test uses two real synthetic analyzed profiles with the same name and different birthdays, colliding event IDs, reopened stores, and bidirectional edit/remove/clear isolation.
