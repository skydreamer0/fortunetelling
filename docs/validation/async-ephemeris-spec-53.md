# Async ephemeris settings: bounded #53 consumer slice

Base: `0d5eafaed93bf5b3f30fafdf31d70113b3d61849`.
Integrated with master `612f5cedc76abde13f192ddff0421b22e535b19c` (#126).

## Implemented boundary

`createAsyncEphemerisCalculationSpec(options)` constructs a deeply immutable,
versioned **settings-only** intent. `aes1` is a diagnostic hash, not a birth,
chart, report, forecast, or complete timeline identity and never a result-cache
key. It does not certify persisted/untrusted specs. Sync CalculationSpec/cs1
and existing Report/Timeline schemas remain unchanged.

`TimelineOptions.ephemeris` is optional. Both initialized synchronous timelines
and `buildTimelineAsync` resolve it before preparing calculators/rules. The async
entry copies and freezes its selected settings before awaiting WASM initialization.
The resulting effective settings are explicitly passed to the Jyotish and Human
Design calculators and to the existing HD transit rule factory. Timeline output
does not gain a settings hash or imply new persisted replay guarantees.

- Jyotish choices: `lahiri`, `raman`, `krishnamurti`; `mean` or `true` nodes.
- Jyotish fixed facts: whole-sign houses, 365.25-day dasha years, mid-window
  transit snapshots. Other houses and continuous sampling are not implemented.
- HD choices: `true` or `mean` nodes and year/month sample days.
- Omitted choices preserve existing defaults. HD 15/3-day defaults come from
  the existing catalog, not a duplicate literal in the resolver.
- Explicit malformed/nullish nested settings and unsupported fields are rejected.
  Top-level omitted/undefined options mean defaults, consistent with an optional API.
- HD steps are restricted to 1/24 through 366 days at this new public boundary.
  This is a resource/progress bound (roughly 8,800 samples per calendar year),
  not an accuracy tolerance. The existing internal factory is unchanged.
  Opting into the minimum step with the maximum 50-year horizon can request
  roughly 449,000 samples including month cells. This extreme combination has
  not been performance-benchmarked and can block responsiveness; this API offers
  no cancellation or execution-time budget guarantee. Defaults remain 15/3 days.

## Verification and limits

The new Bun tests cover canonical identity, deep immutability and caller
isolation, hash changes for every selectable setting, invalid values, rejection
before WASM initialization, actual rule consumption, deterministic repeats, and
capturing settings before the async yield. Default year/month signals are
compared with the pre-existing calculator/rule default paths; complete omitted
and explicit-default timeline JSON must match. Existing sync golden tests remain
the default full-report compatibility gate.

No Bun executable is available in the author assistant environment. Local tests,
typechecks, build and browser checks are **not run**. GitHub CI and independent
review must verify the exact remote candidate. The tests use this repository's
Swiss Ephemeris implementation as an execution oracle, not an independently
verified astronomical oracle. Passing them does not prove prediction validity.

First remote candidate `fe831c44` ran all ten new tests successfully and passed
typechecks, doctor, build and the browser observation workflow. Its full suite
had one failure: the exact public-export inventory did not yet include the two
new API names. The correction explicitly adds those names without relaxing the
set assertion or changing historical fixtures. This first-run evidence does not
substitute for rerunning CI on the integrated revision.

## Remaining #53 / #63 work

Both issues remain open. Standalone calculators still have their legacy defaults;
this slice removes hidden defaults only from timeline settings selection. To
complete #53, route the standalone/chart entry points through the same explicit
settings resolver without breaking their public contracts, then define an async
birth/context/period/dependency identity and persisted replay/export strategy.
No existing report may be silently backfilled from these defaults.

HD sampling remains unconverged. #63 records a real 2026 Jupiter gate-39 stay
missed by 15-day sampling; 7.5-day sampling catches it but still has substantial
boundary timing error. This slice makes step choice explicit and hash-visible;
it neither halves production defaults nor claims convergence. Further step
halving/root-finding and Jyotish continuous-transit implementation remain #63.
