# Report/replay/consumer integration acceptance

This isolated integration combines already-reviewed work without changing its calculation policy.
Base master `ea811be95f6784d507c10b94077179e1aabfe3ed` already contains #152's HKO oracle.
#153's tree contains #151. Only the base-relative differences from #154–157 are applied afterward.

| Requirement | Integrated acceptance | Remaining boundary |
| --- | --- | --- |
| #26/#51/#52 settings and snapshot | Profile2 settings → Report8 → Question/citation/backtest → portable profile → MCP/export; identity and ownership regressions | No historical runtime loader or all-version replay claim |
| #53 async identity | Complete same-build asynchronous record/reload, malformed and mutable input rejection, explicit dependency/version identity | Async records remain distinct from sync natal Report8; no silent inclusion of excluded systems |
| #15/#59 local observations | Failed writes remain visible, recovery/reload retains records, opaque source/cap safety; integrated with Report8 profile key and backtest | No schema2 outcome or directional policy change |
| #21 opaque payload consumers | Core unknown boundary plus actual Web BaZi/Ziwei/MingGua selectors and Method display | Producer views describe existing data; they do not add validators |
| #20/#24 | Combined type/build, affected regression, native calendar and source inventory; explicit integration contract | Browser/native OS claims require this combined head's actual CI, not earlier PR successes |

The source union has 100 paths relative to master. 97 single-owner paths are byte-identical to their reviewed candidate. Three overlaps are composed: Web Report/Component types, Core type/runtime export declarations, and the exact additive runtime-export inventory test. Original fixtures and assertions remain intact.

The added cross-entry regression passes a real Report8 through typed chart selectors, synthetic failure/recovery/reload storage, Profile2 download, actual MCP analyzer, and a separate current-build async replay. It checks the sync report bytes remain unchanged and excluded systems remain explicit. MCP calculation includes additional Profile2 provenance fields; identity comparison checks the complete Report8 identity subset and explicitly checks those additional settings fields.

Initial new-test authoring errors (wrong async version property and assuming identical MCP/Report envelope shape) were corrected to existing contracts; they were not production defects. No runtime changes were required by source composition. Holds #22/#23 and unresolved #64 source/semantic decisions remain outside this integration.

No parent Issue is closed by this acceptance document. Local evidence and natural CI are recorded separately; prior PR CI must not be relabeled as combined-head validation. Main and original PR branches are not modified by preparing this candidate.
