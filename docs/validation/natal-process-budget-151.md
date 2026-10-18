# PR #151: natal probe setup budget

GitHub-hosted `macos-15-intel` on head `a81e130` failed twice in
[run 39140669961](https://github.com/skydreamer0/fortunetelling/actions/runs/39140669961).
The natal file spent 228114 ms / about 239 s collecting twelve fresh processes,
then its single 180000 ms `beforeAll` failed and all six assertions were skipped.
No calendar assertion mismatch was observed. Passing sibling jobs are not proof
that this failed native lane passed.

The harness incorrectly coupled all twelve independent process runs to one
aggregate hook budget. It now registers twelve serial `beforeAll` hooks, one
per existing host/mode pair. Each hook and its subprocess retain a 60000 ms
limit; no subprocess limit, CI job limit or outer runner limit is increased.
There is no added parallelism, reused process, shared host timezone mutation,
or reduced fixture work. A single nonzero/timeout process still fails setup.

The original six natal assertions, four hosts, A/B/A→B→A modes, source-backed
fixtures and output serialization are unchanged. The separate snapshot suite,
256 reloads, 512 negative controls and strict twelve-test native acceptance
summary are untouched. The new harness regression loads the actual test source,
checks twelve independent hook registrations and exact subprocess arguments,
and proves a nonzero exit is rejected; it does not mock calendar correctness.

Before/after real natal runs must pass and produce byte-identical `natal.json`.
The macOS outcome still requires the new commit's native CI and cross-OS gate;
this change does not relabel either earlier failure or authorize another retry
of the unchanged failed SHA.

Local exact before/after runs each passed all six tests (62.79 s / 65.01 s).
Their entire natal.json files are byte-identical, SHA-256
`4c05e0f832a4a918395bb666ab510b3deb5d4d2d9328adc7c33794559b9b220c`.
This is a harness isolation fix, not a claimed speedup. The harness guards
passed all seven tests; workspace typechecks passed.
