# Locked forecasts

Append-only store for locked (prospective) forecasts. See
[docs/validation/locked-forecasts-61.md](../../docs/validation/locked-forecasts-61.md).

This directory currently contains no forecasts. `LOCKED FORECAST V1 2026-10-03`
named in `docs/DECISIONS.md` has not been filed here; nothing in this directory
represents it.

## Rules (enforced by `scripts/ci/locked-forecasts.ts` in CI)

- Each forecast is one file `<forecastId>.json` directly in this directory.
  No subdirectories and no other files, apart from this README.
- The file must match the v1 schema (`LockedForecastV1` in the script). Unknown
  fields are rejected. Required fields: `schemaVersion` (1), `forecastId`,
  `issuedAt`, `dataCutoff`, `targetEvent { domain, proposition }`, `direction`,
  `window { start, end }`, `outcomeDefinitions { hit, miss, undecidable }`,
  `calculation { specHash, snapshotId }`,
  `versions { core, rules, catalog, aggregation }` and `contentSha256`.
  `supersedes` is optional.
- `contentSha256` is the SHA-256 hex digest of the canonical JSON of the file with
  `contentSha256` removed. Canonical means object keys are sorted at every level,
  with no whitespace.
- Compared with the merge base, only additions are allowed here. Edits,
  deletions, renames, copies and type changes all fail, and that includes this
  README.
- To correct a forecast, add a new file whose `supersedes` names the old
  `forecastId`. The old file stays as it is, and its definitions are never loosened
  after the fact.
