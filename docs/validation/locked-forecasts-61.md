# Locked forecast files and CI append-only guard (#61, bounded slice)

## What this slice delivers

- `forecasts/locked/`, which contains only a README. **No forecast payload was
  created.** `LOCKED FORECAST V1 2026-10-03` (DECISIONS.md) has not been filed,
  and nothing here represents or reconstructs it.
- The v1 schema `LockedForecastV1` and a validator in
  `scripts/ci/locked-forecasts.ts`. It requires `schemaVersion`, `forecastId`,
  `issuedAt`, `dataCutoff`, `targetEvent`, `direction`, `window`, hit/miss/undecidable
  definitions, `specHash`, `snapshotId`, core/rules/catalog/aggregation versions
  and `contentSha256`. `supersedes` is optional and links a correction to the
  original (#15 B).
- `contentSha256` is the SHA-256 of a sorted-key canonical JSON of the payload
  without the hash field. The test pins the canonical string and digest as literals
  that were checked independently with `sha256sum`.
- The guard is a separate step in the CI `plan` job, which already checks out
  full history (`fetch-depth: 0`). The step runs before classification, so a
  failing guard fails `plan`, and the existing aggregate then rejects the run.
  No existing gate, lane or aggregate rule changed.

## Rules

1. Every entry in `forecasts/locked/` other than `README.md` must be a regular file
   `<forecastId>.json` that parses, matches the schema, and matches its
   `contentSha256`.
2. The guard diffs the whole tree with `-M -C` from `git merge-base <base> HEAD`.
   Any entry with a path under `forecasts/locked/` whose status is not `A` fails
   with a message. This covers M, D, R (into, within or out of the directory),
   C and T. The README is covered too, so after merge it is effectively immutable.
3. The base depends on the event:
   - `pull_request` uses `base.sha`.
   - `push` uses `before`. A missing or all-zero value fails, and so does an
     unreachable SHA after a force push.
   - `workflow_dispatch` validates contents only and logs that it did so.
   - Any other event fails.

Tests are in `scripts/ci/locked-forecasts.test.ts` and use synthetic data only:

- Injected name-status cases for M, D, T, the three R cases and C.
- Malformed diffs and event resolution.
- Schema violations and hash mismatch.
- Real temporary git repositories with global config isolated. These cover the
  add, unchanged, edit, edit-with-rehash, delete, rename, README edit and
  superseding-correction cases, plus merge base versus base tip.

## Not delivered / limits

- **Reproduction from the recorded spec (second AC) is not implemented.** Until
  #51 historical replay exists, the only thing that can be checked is re-running
  the *current* build against a recorded spec. That cannot re-run an older engine
  or catalog. Evaluating a forecast against its event after the window closes is
  also not implemented.
- A local hash detects content changes. It is not a trusted third-party
  timestamp, and `issuedAt` is self-reported (#15 B).
- The guard sees only the history CI is given. It cannot prevent admin force
  pushes, history rewrites, or a change to this workflow or script itself. Those
  remain review and branch-protection matters.
- These are v1 choices that need owner review: the `direction` values
  (`positive`/`negative`), the field names, the flat layout, the
  `specHash`/`snapshotId` strings without prefix checks, and the immutable README.
- #61 and #15 stay open.
