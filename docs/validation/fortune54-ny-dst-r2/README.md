# New York civil DST oracle: R2 review artifacts (#54)

These files preserve the R2 source candidate as text for review. They are not
wired into CI and have not been executed or typechecked. The `.test.ts.txt`
suffix is intentional: the repository's current CI inventory must not discover
an external, opt-in acceptance candidate as an ordinary test.

## Files and exact source identities

- `ny-dst-oracle.test.ts.txt`: SHA-256
  `ccba34c2fcf83e2881eaba99a61cb5911607dee34c113d81c085fa0dec0639ef`
- `checkout-root-guard.test.ts.txt`: SHA-256
  `32619b0ff8ff7969676be6569c7cd82664a33cba6a899bc937f99c4ce6cbc755`

Both text files preserve the reviewed source bytes exactly. The storage suffix
and this README are publication packaging; they add no execution evidence.
Independent source inspection accepted the bounded R2 correction and negative
regression design. No application-runtime acceptance is claimed.

## Scope

The main candidate checks two synthetic New York wall-time fixtures: the
2025 spring gap and autumn overlap. The overlap also has an explicit later-choice
control. It compares complete TimeContext outputs across five host TZ settings:
UTC, Asia/Taipei, America/New_York, Europe/London, and Pacific/Apia.

The civil transition rules and Eastern UTC offsets are sourced from:
- https://aa.usno.navy.mil/calculated/daylightsaving?submit=Get+Data&year=2025
- https://aa.usno.navy.mil/data/daylight_time
- https://aa.usno.navy.mil/faq/us_tzones

Gap shifting and earlier/later selection are existing product policies.
Other TimeContext fields participate in equality checks only. This is not an
astronomical, true-solar, lunar-conversion, or star/palace oracle.

R2 validates the canonical Git checkout root before output-path creation or
evidence writes. The separate regression describes rejection of a nested REPO
and sibling OUT within the actual checkout, requiring absent output and unchanged
Git status. That behavior has not been exercised under Bun.

## Execution prerequisites, when separately authorized

Use an already authorized existing setup. This document does not authorize
provisioning a checkout, computer, environment, credentials, or dependencies.
The negative regression requires an explicitly authorized disposable checkout;
do not run it against an active working copy.

1. Copy both text artifacts outside the target checkout, retaining their names
   except for removing the final `.txt` suffix. Keep them in the same directory
   and verify the hashes above. Do not rename them in the repository.
2. Use an existing clean checkout at commit
   `c48d351d9df7daee369757a251d08280012837fc`, tree
   `5e53cea370303327af6e8849521d224919d372b8`.
   This is the source-under-test baseline, not a future publication commit.
3. Existing Bun must be 1.4.3. Dependencies must already be installed.
   The pinned lockfile SHA-256 is
   `994b5695ec941c8b957824483c08e1fed93910503cf994b9288b402fc7feba15`.
   Do not install, fetch packages automatically, or substitute Node.
4. Set FORTUNE54_REPO to the absolute verified checkout root. For the main
   candidate, set FORTUNE54_OUT to a new, never-created leaf under an existing
   external output parent. Existing outputs are rejected and never overwritten.
5. Invoke each external test explicitly with `bun --no-install test`.
   The main file needs REPO and OUT. The guard needs the authorized disposable
   REPO and supplies its own unique forbidden output path.
6. Preserve any actual failure and output. Do not automatically clean up or
   retry a failed guard against another checkout.

No runnable wrapper, workflow change, or test-discovery exception is added here.

## Status and remaining acceptance

All R2 runtime stages remain NOT_RUN:
- Application execution and outer TypeScript validation
- Separate validation of the embedded eval probe
- Checkout-root regression and other path/identity/no-install negative controls
- Windows junction and case controls
- Native Linux, Windows, and macOS execution
- Complete-context cross-OS comparison and aggregate acceptance

Static inspection is not a substitute for these stages. A passing existing
repository workflow would still not execute these text artifacts or prove R2.

Existing native calendar results remain separate historical evidence. This
artifact does not close #54, #51, #52, or #53. London birthplace integration,
precision-approved solar-term boundaries, Zi-hour and additional setting
integration, independent chart goldens, and persisted replay remain outside
this slice.

## Publication boundary

Only the two text files and this README belong in this change. Raw source-page
archives, local runtime receipts, raw test output, private review records, and
machine paths are excluded. No application source, CI configuration, database,
or deployment configuration is changed.

