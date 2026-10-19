# Local LifeEvents failure and recovery (#59 / #15)

This package finishes the existing v1 browser persistence workflow's failure path.
It does not implement schema2, Direction, confirmed negatives or cloud sync.

## Storage safety

Missing storage key is a readable empty store. Unavailable storage, a thrown read,
malformed JSON, unknown envelope version, invalid profiles map or malformed profile
container is blocked, not empty. Implicit upsert/replace/migration and profile
mutation cannot overwrite those original bytes. list still returns safe displayable
v1 events. The panel separately warns that the original data was preserved.

An explicit clearAll API still means delete the entire store; this patch does not
call it automatically or add a UI that offers to discard unreadable data. Existing
per-event unknown-version rules remain: unrelated profiles retain opaque records;
explicit removal in a supported envelope removes only the requested id; implicit
upsert/migration into an unknown-version profile is refused. Profile clear works
only with a readable envelope. Root metadata survives ordinary empty-profile writes.

Pending additions/edits are committed together in one read/modify/write operation,
merging with the current supported stored events. The 200-event cap refuses excess
instead of silently truncating pending records. This is synchronous localStorage,
not a cross-tab transactional database; simultaneous separate-tab writes are not a
new supported concurrency guarantee.

## Actual panel lifecycle

Each profile-keyed panel owns a page-local pending session. Failed additions and
edits stay visible with an explicit unsaved label and a retry button. A successful
retry or subsequent submission commits all pending changes, not only the last one.
Unsaved additions can be discarded even while storage remains denied. If deletion
of an already stored event fails, the row remains and the panel does not claim the
stored event was deleted. Failed clear discards only unsaved additions and keeps
stored rows/pending edits visible. Successful explicit clear clears both.

Changing profile remounts its session; it does not leak pending events between
profiles. Pending data is deliberately memory-only: reload, leaving the report or
closing the page can discard it. Warnings say this plainly; no background upload,
automatic repair, automatic deletion or new storage schema is introduced.

## Evidence and remaining AC

The initial actual store test fails against unchanged master in three cases:
corrupt JSON, unknown envelope and thrown read all incorrectly permit an upsert.
New regressions cover original-byte preservation, write denial, pending edits and
multiple additions, recovery via retry and subsequent submit, reload/store reopen,
profile isolation, capacity and explicit delete behavior. The prior test accepting
corrupt-data replacement is intentionally updated to the safer fail-closed contract;
its migration and legitimate-v1 assertions are retained.

The built-browser harness uses synthetic profiles in isolated new browser contexts,
with test-only storage errors limited to the LifeEvents key. It exercises real form
add/edit, denied writes, pending deletion, retry, reload/recalculation, profile
isolation, explicit deletion and opaque-envelope preservation at desktop/mobile
widths. It runs only in the existing approved stock sandboxed Chrome CI route,
with exact-head and clean-source guards. Local harness typecheck/build is not a
browser pass; browser acceptance remains NOT RUN until the exact-head CI receipt.
No user browser, real birth/event storage, sandbox disabling or local raw Chromium
fallback is used.

#59 full v1-to-v2 migration and positive/negative backtest semantics remain open,
including the #29 direction dependency. #15 statistical/prospective and real-data
acceptance also remains open. #20/#24 coverage and documentation accompany this
user-path fix. #22/#23 holds remain unchanged. The base is master, independent of
Draft151/153/154. Event/profile keys and backtest computation are unchanged. Future
integration with153 must preserve Report8 canBacktest/replay checks and rerun the
LifeEvents consumer boundary; this patch does not recreate that calculation code.

Automatic legacy-key migration also fails closed when either profile has unknown
metadata, any invalid record, or the unique merged event count would exceed 200.
No metadata merge meaning is guessed. Successful migration retains full raw event
records and the existing target-wins same-id rule. The panel warns if legacy data
remains after migration. Selected-id removal filters only that id from the original
raw array: unseen records past the display cap, malformed/opaque survivors and
profile metadata are preserved. The display cleaner is never a deletion primitive.
