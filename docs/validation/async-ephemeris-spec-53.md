# Async ephemeris settings: bounded #53 consumer slice

Historical slice base: `0d5eafaed93bf5b3f30fafdf31d70113b3d61849`.
Historical integration: master `612f5cedc76abde13f192ddff0421b22e535b19c` (#126).

## Current boundary at d9133cf (2026-10-24 documentation check)

This clarification is pinned to master
[`d9133cf63070791bb3e6480357ab2d363eafcb8c`](https://github.com/skydreamer0/fortunetelling/commit/d9133cf63070791bb3e6480357ab2d363eafcb8c),
Core 0.11.0. It is a static documentation check, not a new test run or parent-issue
acceptance. The original bases, commands and receipts below retain their historical
meaning; they are not statements that the current build lacks async identity.

| Contract | Delivered boundary at this source | Not established |
| --- | --- | --- |
| Settings-only `aes1` | Explicit timeline ephemeris settings and conventions | Birth/context/period identity; standalone custom `dashaYearDays` |
| `async-timeline` record | Owned full context/options before await; birth/period, Core/tzdb/dependency and rule identity; real current-build JSON replay | Historical runtime execution, durable persistence/cache, async natal or full Report/Profile/UI/MCP async replay |
| Report8 / Profile2 sync chain | Separate `analyze-sync-natal` snapshot and current-build consumer integration | Inclusion of Jyotish/HumanDesign in that sync snapshot, or a shared all-path async identity |

The reviewed #154 content was composed through merged
[#160](https://github.com/skydreamer0/fortunetelling/pull/160), not individually
merged as #154. See the [async replay contract](../contracts/async-timeline-replay.md),
the [existing synthetic consumer integration](report-replay-consumer-integration.md),
and the [#53 post-merge boundary](https://github.com/skydreamer0/fortunetelling/issues/53#issuecomment-6308858144).
These existing receipts are not rerun here. Record schema 1 and implementation
`async-timeline-replay-v1` remain unchanged. #53/#26 acceptance is not closed;
#22/#23 Holds and #31/#64 source/semantic restrictions remain in force.

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

## Historical slice verification and limits

The original Bun-era tests covered canonical identity, deep immutability and caller
isolation, hash changes for every selectable setting, invalid values, rejection
before WASM initialization, actual rule consumption, deterministic repeats, and
capturing settings before the async yield. Default year/month signals are
compared with the pre-existing calculator/rule default paths; complete omitted
and explicit-default timeline JSON must match. Existing sync golden tests remain
the default full-report compatibility gate.

At original authoring, no Bun executable was available in that assistant environment.
Local tests, typechecks, build and browser checks were **not run** there; GitHub CI
and independent review were required for the exact remote candidate. The tests use this repository's
Swiss Ephemeris implementation as an execution oracle, not an independently
verified astronomical oracle. Passing them does not prove prediction validity.

First remote candidate `fe831c44` ran all ten new tests successfully and passed
typechecks, doctor, build and the browser observation workflow. Its full suite
had one failure: the exact public-export inventory did not yet include the two
new API names. The correction explicitly adds those names without relaxing the
set assertion or changing historical fixtures. This first-run evidence does not
substitute for rerunning CI on the integrated revision.

## Historical gap and remaining #53 / #63 work

Both issues remain open. The original slice removed hidden defaults only from
timeline settings selection. The standalone follow-on below centralizes the
legacy chart boundary defaults without changing those public contracts. Async
birth/context/period/dependency identity and persisted replay/export strategy
were unimplemented at that slice. The later current-build async timeline record
now supplies the bounded identity and JSON replay described above; it does not
supply historical runtime loading, durable persistence/cache or full async
Report/Profile/MCP integration. Standalone custom dasha-year spec coverage and
async natal snapshots remain outside that delivered boundary. No existing report
may be silently backfilled from defaults.

HD sampling remains unconverged. #63 records a real 2026 Jupiter gate-39 stay
missed by 15-day sampling; 7.5-day sampling catches it but still has substantial
boundary timing error. This slice makes step choice explicit and hash-visible;
it neither halves production defaults nor claims convergence. Further step
halving/root-finding and Jyotish continuous-transit implementation remain #63.

## Historical standalone chart boundary follow-on (base c48d351d)

This section records that follow-on's scope, not a complete inventory of later
registry ownership work or the separate current-build async timeline record.

`core/ephemerisSettings.ts` owns the effective Jyotish chart defaults (Lahiri,
mean nodes, 365.25-day dasha years, whole-sign houses) and HD chart default (true
nodes). Its pure resolvers import no calculators and load no WASM. The strict
timeline spec validates choices before using these same resolvers; its identity
shape, convention values and default `aes1` bytes remain unchanged.

`buildJyotishChart` resolves its legacy options once before calculating, including
the unknown-time empty chart. `jyotishCalculator.calculate` delegates to that
boundary. `humanDesignCalculator.calculate` likewise resolves its node before
its existing unknown-time/uninitialized checks. These legacy APIs keep nullish
fallback, mutable returned chart settings, and custom `dashaYearDays` (for
example 360 or 365.2422). No new validation or narrowed dasha-year choices are
silently imposed on them. Lower-level astronomical helpers retain their existing
public defaults; calculator internals pass effective values explicitly.

`runEphemerisCalculators(ctx, { asOf, name, ephemeris? })` accepts the same strict
settings options as the timeline boundary. It constructs the spec and copies
the complete calculator configs before awaiting initialization, including an
independent copy when `asOf` is a mutable Date. Its registry order, verification
flags, result shape and warning behavior remain unchanged. HD sample steps are
timeline rule settings; chart-only registry execution does not sample transits.
The registry deliberately retains the timeline's fixed 365.25-day convention;
custom dasha years belong to the existing standalone Jyotish config, outside
`aes1`. It does not snapshot birth context or introduce a chart/cache identity.

`standaloneEphemerisSettings.test.ts` covers full JSON equality for omitted and
explicit defaults, direct and registry nondefault consumption, deterministic
repeats, custom dasha periods, legacy nullish behavior, unknown time, uninitialized
WASM, malformed strict settings before initialization, and caller mutation across
both warm and first-initialization awaits. Existing timeline spec tests remain
the compatibility gate for strict validation and full timeline JSON. These use
the existing Swiss implementation and are not an external astronomical oracle.

Historical focused verification commands (repository root; retained as evidence,
not current runtime instructions):

```sh
bun test packages/core/tests/standaloneEphemerisSettings.test.ts packages/core/tests/asyncEphemerisCalculationSpec.test.ts packages/core/tests/ephemerisRegistry.test.ts packages/core/tests/jyotish.test.ts packages/core/tests/humanDesign.test.ts
bun run --filter @fortune/core typecheck
```

The original accompanying candidate receipt records exact runtime results and any unrun
full-suite, browser, independent oracle or integration checks. No Report/schema,
golden fixture, MCP/UI, dependency or CI change is part of this follow-on.

Current repository tooling is Node.js 24 LTS / npm 11 per
[the project rules](../../.agents/AGENTS.md). This docs-only correction runs no
tests, typechecks, build, browser or device checks and does not relabel the
historical Bun commands or any earlier receipt as a current execution.
