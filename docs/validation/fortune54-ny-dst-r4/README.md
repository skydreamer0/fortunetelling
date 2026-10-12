# New York civil DST: R4 current-base evidence candidate (#54)

R4 is a new, unpublished evidence identity for the exact source commit below.
It preserves the R3 program and civil expectations while binding a verified newer
source snapshot. It does not amend the historical R2/R3 artifacts or their
results. The exact three-file R3 package's new-base A3 gate remains FAIL because
that historical package intentionally requires its older source commit.

The `.test.ts.txt` suffixes are deliberate. Ordinary repository CI does not run
these artifacts. This package changes no product source, dependencies, workflows,
public exports, time-oracle values, or business assertions. Local R4 preparation
does not inherit permission to publish the previous R3 package. No branch,
commit, push, PR update, Issue comment, merge, or deployment is authorized here.

## Exact source and candidate identities

- Source commit: `f61a6c281c4b6a0a155de1ee2946b0c576c85ee9`
- Source tree: `0573ca7bf5a2cb532bb9785b09bc0e49b4ad41fb`
- Source leaves: 734, all bytes and executable modes verified
- Lockfile SHA-256: `994b5695ec941c8b957824483c08e1fed93910503cf994b9288b402fc7feba15`
- R4 main SHA-256: `81ff78a37bc01c01966d3267562bca2ab1fcaa94cb11f285a2c53f47018e941f`
- R4 guard SHA-256: `846dfc10eb5a9fe679b69a3c4642a351879d8c19ae4317cf1d7cc757ceae2ec5`
- Receipt schema: `fortune54-ny-dst-r4`

Pinned source: https://github.com/skydreamer0/fortunetelling/commit/f61a6c281c4b6a0a155de1ee2946b0c576c85ee9

The source identity was read from the repository on 2026-10-12 at 05:31 UTC.
The complete, non-truncated remote tree and original signed commit were verified
again locally. A private disposable snapshot was reconstructed with the same
commit and complete tree. A moving branch name is never an alternative source
pin; if master advances again, this evidence still covers only the commit above.

Historical R3 source commit: `c48d351d9df7daee369757a251d08280012837fc`.
Historical R3 source tree: `5e53cea370303327af6e8849521d224919d372b8`.
Historical R3 main SHA-256:
`012e432cd5e055a7e57ef0cd8127574d7231b028984067790b1b8c7ff50b263b`.
Historical R2/R3 guard SHA-256:
`32619b0ff8ff7969676be6569c7cd82664a33cba6a899bc937f99c4ce6cbc755`.
Original R2 artifacts remain in https://github.com/skydreamer0/fortunetelling/pull/131.

## Why this is a separate revision

On the newer source, the unchanged R3 main and guard fail their explicit
source-SHA assertions before any civil-oracle case executes. This known
provenance mismatch is retained as a historical FAIL. No unexplained product
failure was repaired by changing an expected result.

The complete R3-to-R4 harness diff is limited to:

- Main: revision comment, exact source SHA and tree, and receipt schema
- Guard: revision/invocation comments, exact source SHA, and unique output prefix

The fixture literals, embedded program, complete business-assertion section,
checkout-root preflight, containment rules, exclusive output creation, clean-tree
checks, and all other code are unchanged. The two R3 embedded TypeScript
annotations remain intact. The ten repository-local runtime leaves reachable by
literal imports from the time-module entrypoint are byte-identical between the
old and new source snapshots, and bun.lock is unchanged. This bounded import
audit does not claim discovery of nonliteral dynamic imports.

## Author verification on 2026-10-12

The exact R4 bytes above passed on one assistant-owned Linux x64 runtime:

- Main: 6 tests, 131 assertions, zero failures
- Checkout-root guard: 1 test, 9 assertions, zero failures
- Outer harness strict TypeScript check
- Separately materialized embedded-program strict TypeScript check
- Unmodified source core strict TypeScript check
- Five source time/calendar suites: 86 tests, 5,728 assertions, zero failures

The five source suites are timeContext, timeTzdb, timeHistorical,
calendarHostTimezone, and natalCalendarMatrix. Their results are bounded
source-regression evidence, not a full-repository aggregate.

Mandatory negative controls also behaved as intended:

- A nested FORTUNE54_REPO with external output is rejected before creating any
  output directory or receipt.
- The guard rejects a nested source root even when OUT would be a sibling of
  that nested path inside the true checkout root. The checkout remains clean.
- On the complete historical c48d source, both R4 main and guard fail the exact
  SHA assertion. The main receipt records setup FAIL and every host oracle
  NOT_RUN; no complete-context file exists. Raw failing logs remain FAIL.
  The negative-control verdict is PASS because the wrong source was rejected.

The five host processes (UTC, Asia/Taipei, America/New_York, Europe/London,
Pacific/Apia) produce the same complete contexts as historical R3. All 46,138
bytes match, SHA-256:
`c1ce6c47d2dae64188c13872493401cca7fb07f679a307f5e2a37c132cd859d4`.
The R3 and R4 embedded programs are byte-identical when materialized with the
same actual source URL. No source-code stub, any cast, or diagnostic suppression
is used in the embedded strict check.

Runtime: Bun 1.4.3, revision c6da4a4d3010e5553438c60f6bd76d981976867c;
Linux x64, ICU 78.3, bundled product tzdb 2026e, host tzdb UNKNOWN.
Existing dependency bytes were copied without installation: lunar-javascript
1.7.7, iztro 2.5.8, TypeScript 7.0.2, @types/bun 1.4.2. All application/test
invocations use --no-install. Both source snapshots remain clean.

Independent review is a separate record naming exact artifact hashes. The raw
single-OS receipts deliberately retain independentReviewResult, crossOSResult,
and aggregateAcceptanceResult as NOT_RUN; later reports never rewrite them.

## Execution recipe, only in an authorized environment

1. Use a verified clean disposable checkout of the exact source commit and tree
   above, with existing pinned Bun and dependencies. Do not use an active work
   checkout for path-negative controls. No installation is included in this
   recipe or authorization.
2. Copy both text files outside the source checkout, remove only their final
   `.txt` suffix, keep them together, and recheck their SHA-256 values above.
3. Set FORTUNE54_REPO to the absolute canonical Git checkout root. Set
   FORTUNE54_OUT to a never-created leaf under an existing external directory.
4. Run `bun --no-install test <external>/ny-dst-oracle.test.ts`.
   Separately run `bun --no-install test <external>/checkout-root-guard.test.ts`
   with the same FORTUNE54_REPO. Preserve each attempt; do not overwrite receipts
   or automatically delete output from a failed negative control.
5. For the outer strict check, extend the pinned core tsconfig, use the existing
   Bun types, and explicitly include both external harnesses.
6. For the separate embedded strict check, extract the unchanged code template
   with its original cases and actual source file URL. Use the pinned core
   strict settings, moduleDetection=force, and source declaration files. Map only
   that exact file:// URL through compilerOptions.paths to the identical real
   source .ts file. A passing outer check does not typecheck a string's program.
7. Repeat the wrongroot and oldbase negative controls with fresh output leaves.
   A successful current-base run alone is insufficient evidence that the source
   identity and path guards still fail closed.

The extraction/typecheck diagnostic is intentionally not included as a reusable
acceptance runner. Its callers must verify source and external output safety.

## Oracle scope and remaining work

The unchanged civil facts come from these USNO references:

- https://aa.usno.navy.mil/calculated/daylightsaving?submit=Get+Data&year=2025
- https://aa.usno.navy.mil/data/daylight_time
- https://aa.usno.navy.mil/faq/us_tzones

The fixtures cover the 2025 New York spring gap, default-earlier autumn overlap,
and explicit-later overlap. Gap shifting and overlap selection follow existing
product policies. Other TimeContext fields participate in complete-byte equality
only and do not become independent astronomical oracles.

Native Windows/macOS execution, Windows junction/case controls, native
three-OS/cross-OS comparison, and aggregate acceptance remain NOT_RUN. Full
repository regression/build, a broader no-install/network adversary control,
and adversarial concurrent-race behavior were not established by this revision.
The original eight-fixture native calendar matrix was not rerun across target
OSes; the focused Linux calendar suites above are not a replacement.

No independent true-solar, lunar-conversion, or Ziwei star/palace oracle is
provided. Full A/B/ABA settings integration and the remaining Issue #54
acceptance criteria remain separate work. No whole-issue completion,
readiness-to-merge, new-base A3 approval, or publication is claimed.
