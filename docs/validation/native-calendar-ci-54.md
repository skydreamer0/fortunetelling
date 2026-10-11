# Issue #54: native calendar CI slice

The existing natal calendar and full snapshot host-timezone suites run on native
`ubuntu-24.04`, `windows-2022`, and `macos-15-intel` standard GitHub runners with
Bun 1.4.3 and the frozen lockfile. This is a bounded extension of the existing
CI, not a new runtime implementation or a complete #54 acceptance claim.

Each OS runs the same 12 tests: eight synthetic births, UTC / Asia/Taipei /
America/New_York / Pacific/Apia hosts, A-only, B-only and A→B→A settings. Existing
calendar facts, calculation policies, fixed asOf and golden data are unchanged.
The suites still assert all 256 real session JSON reloads and 512 identity/content
negative controls per OS. No additional calculation pass is made for artifacts.

Opt-in test hooks save the already-computed natal probe results and complete
snapshot producer/reload JSON. The natal probe retains its existing normalized
digests; the snapshot strings retain every original field, including identity,
specHash, snapshotId, all natal chart content and source snapshots. Cross-OS
comparison uses the entire artifact bytes, not just IDs or hashes. Only hashes
and the first differing byte offset are used in mismatch diagnostics.

Artifacts include an initial NOT RUN / final PASS or FAIL manifest, complete test
logs, both evidence files, the actual checkout commit and tree, run/attempt,
native platform/architecture/OS image, Bun version/revision, runtime ICU/tz data
where reported, installed iztro/lunar-javascript versions and committed lockfile
SHA-256. The working-tree lockfile must match the source blob exactly or differ
only by Git's CRLF checkout expansion; snapshot evidence is never EOL-normalized.
Each evidence file is bounded to 64 MiB and artifacts expire after one day.
Download them from the CI run for longer-lived acceptance receipts. On PRs the
checkout SHA is GitHub's tested merge commit; its tree, rather than a claimed
feature-head identity, identifies the exact source that ran.

The comparison requires exactly three current-attempt artifacts from the same
source/run, all 12 tests passing with no skip/todo, all native clock offsets and
fixture/settings/reload inventories, matching Bun revision and lockfile, valid
artifact sizes/hashes, and byte-for-byte equal results across all OSes. Missing,
failed, cancelled or mismatched required work blocks `Test & Build`, hence the
existing accepted-master Pages gate. The already-audited docs/assets PR lanes
still intentionally skip both native jobs; every master push uses full mode.
Rerun the complete workflow when fresh evidence is needed: successful artifacts
from an earlier attempt cannot stand in for the current attempt.

Per-OS logs and manifests describe failures or unrun work. A successful comparison
prints each OS/TZ/fixture/settings result and source provenance in the run summary.
An uploaded manifest alone never means the aggregate gate passed.

This slice does not add Europe/London hosts, independent Ziwei star/palace oracles,
additional iztro global configurations, missing boundary fixtures, persistent
storage/historical replay, or all asynchronous/report/export entrypoints. The
[calendar source scope](natal-calendar-matrix-54.md) remains applicable. Issue #54
stays open until its broader requirements have separate evidence.

Local reproduction uses `bun scripts/ci/native-calendar.ts run <directory> <runner>`
with the actual matching native runner and GitHub provenance environment variables.
The normal suites remain runnable without the evidence environment variable.
