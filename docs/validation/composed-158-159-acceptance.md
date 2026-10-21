# Composed Report replay and independent natal oracle acceptance

Scope: Issues #20/#24/#26/#54. This candidate composes #158 (0fc7d216c6b8bcbdc7ee07ab502e6e68a4f7468e, tree5b1ae6f9e86417ff37c7fe82c0a37dd80a50e7d7) with only the five source-pinned oracle files of #159 (893436b14e765275d9374898e04b48aeaa880079, treec9c22981602d87dcd473a6d0c4e35c66ccdf025d).

Both are based on masterea811be95f6784d507c10b94077179e1aabfe3ed. #158 already includes #151 via #153 and #154–157. #152 is already in master. Their patches are not applied a second time. The original branches stay unchanged. Any eventual aggregate/component integration must reconcile ancestry and diffs to avoid duplicate delivery.

## Actual combined entry coverage

The new `packages/mcp/tests/composedFortelReplay.test.ts` uses the unchanged public Fortel sample and its fixed source manifest. It checks fixture SHA256 against both the manifest and the independently pinned expected digest, source commit and corrected raw README hash. It does not refetch a live oracle or execute third-party code during tests.

The same synthetic representative input (1953-01-29 00:30, Hong Kong civil time, false true-solar flag, late/split-midnight convention) enters Profile2, then Core Report8 with owned natal snapshot. The actual Web Ziwei selector is compared against the complete twelve-palace/main/minor/body projection and bureau. Profile download is parsed back to identical Profile2, stored in an isolated temporary MCP store, consumed by the real get_chart handler, and exported via buildExportBundle. Export and MCP charts match completely; each is also checked against the external bounded projection. Calculation identity is checked across all envelopes.

A JSON-reloaded Report8 builds the same one-year timeline projection, with recorded settings and identity. Retaining old identity while altering a snapshot star must be rejected, as must a conflicting replay setting. The clean report remains unchanged and still replays afterward. This is current-build replay, not a historical runtime loader.

The source and current four transformations are both asserted: source 科=天府, current 科=左輔; 祿=天梁, 權=紫微, 忌=武曲 agree. The original complete source JSON, license, and difference declaration remain unchanged. Whole-chart status remains NOT_EQUIVALENT. The Web board comparison covers the fields actually displayed by that selector; its yearly transformations are not mislabelled as natal transformations.

## Per-Issue boundary

- #20: affected source oracle and combined entry regression plus pin/corruption negative controls; unchanged component suites are not rerun just to inflate evidence.
- #24: exact composition, input/source provenance and supported/unsupported scope documented here and in `ziwei-fortel-oracle-54.md`.
- #26: same-build Profile2/Report8 identity and owned snapshot replay agree with external bounded natal fields across real download/MCP/export entries. No all-version replay claim.
- #54: one independent, nonleap early-Zi natal case; full twelve-palace projection and known school difference retained. No leap-month/DST/other-case matrix, miscellaneous stars/brightness/cycles/decade ages/masters or dynamic-period oracle acceptance. One case does not close #54 or demonstrate predictive validity.

No calculation defaults, four-transformation configuration, runtime code, original assertions, source fixtures, versions, workflows or dependencies change. #22/#23 Holds and unresolved #64 semantics remain excluded. Exact local/independent/natural-CI receipts are separate; earlier #158/#159 greens do not certify the new composed head. No merge/deployment/parent closure is implied.
