# Profile v2: settings and current-build replay

Related: #26, #51, #52; D-075. No issue is closed by this package.

## Entry contract

- Read versions 1 and 2; preserve a v1 file and its canonical bytes rather than silently upgrading it.
- `createProfileFileV2` requires both `useTrueSolarTime: boolean` and canonical `ziHourConvention: late | early`. Unknown, missing or malformed options fail. It does not expose unsupported fixed settings.
- `migrateProfileFile` is explicit, returns a new validated v2 file and uses v1's historical trueSolar/late choices. No file is written by this function.
- `profileSettings` states `profile-v1-defaults` or `profile-v2-explicit`. MCP get_profile exposes it; each single-profile calculation response includes scoped calculation metadata.
- Web profile download preserves recorded main-chart choices. A legacy source lacking conventions remains v1; malformed recorded conventions fail. This does not reinterpret a historical report's divergent timeline as its main chart.
- `cf1` remains the original rounded birth-input fingerprint. Settings, exact coordinates and name are covered by CalculationSpec and the full cache identity instead.

## Ownership and replay

`createProfileCalculation(file, persistedSnapshot?)` rejects accessors, inherited/nonplain source objects and non-JSON values without invoking getters, validates/copies the file, and creates one immutable current-build sync snapshot and owns its private runtime providers. It returns copied outward contexts and fresh charts/projections. BaZi/Ziwei natal providers are reused by chart calls, timeline years and backtest chunks. The snapshot runtime's canonical context is used internally; outward source labels are preserved. A caller cannot replace natal options in a projection.

The optional serialized snapshot is validated against a current reconstruction before use. Corrupt content, settings, version or identity mismatch fails. There is no historical calculator execution, automatic migration of old snapshot content, filesystem persistence, cross-process cache, database or timestamp proof.

`analyzeProfileFile` is an additive envelope containing an ordinary Report7, calculation metadata and the private snapshot. It uses the same owned natal providers for the report's actual engines and timeline. It analyzes only its owned normalized input, never rereading the original file. Existing `analyze()` retains its ordinary Report7 output. Legacy parseProfileFile unknown-key/object compatibility is unchanged; the stricter source boundary belongs to the new calculation APIs and export. Fixed Date/performance-clock testing compares complete report objects, including timestamps; no fields are dropped to claim parity.

Only `analyze-sync-natal` is identified: BaZi, Ziwei, Numerology, Tzolkin and MingGua. MCP/export may also compute Jyotish/HumanDesign, but those two systems are explicitly excluded from this snapshot identity. A different period/asOf changes projections, not natal snapshot identity. A different effective supported time setting changes both specHash and snapshotId.

Do not publish the full private snapshot by accident: identity includes exact birth data and name-dependent Numerology. Noncryptographic hashes are diagnostics, not privacy/anonymization/security tokens. Redacted exports omit full snapshot/identity, but their hashes are linkable.

## Acceptance matrix

| Original issue / AC | This package | Still open |
| --- | --- | --- |
| #52 non-default MCP/Web equality | Real Web report → download → ProfileStore/Analyzer → export, actual settings/chart/timeline and sync identity roundtrip | Async settings portability belongs to #53 |
| #52 v1 behavior + default disclosure | v1 bytes retained, default calculations retained, explicit resolution source in outputs; no silent file rewrite | Historical-version execution is not promised |
| #52 D-043 correctness | Existing 10 cache tests plus settings-only invalidation; compare specHash then complete identity/source/warnings/asOf; old failed promises only evict their owning entry | Not a persistent cache; profile/asOf slot deliberately retains one current generation |
| #51 all report/timeline/question/backtest/export entries share snapshot | New profile envelope/session and MCP/export share sync identity/providers; actual session backtest verifies that identity | Existing Web Question/Backtest Report7 paths and Report8-wide metadata integration remain open |
| #51 any-setting identity and rerun equality | Four supported clock/zi combinations, deterministic current replay, owned data and unknown-time states | Async settings and unsupported future settings remain open |
| #51 missing time settings no silent default | Prior #81 preserved; v2 requires both supported choices | Original completed #81 scope is not claimed as new |
| #26 complete spec/snapshot/calendar/replay matrix | Portable effective choices and bounded current-build cross-entry replay | Remaining source-backed oracle boundaries, async full identity, persistence and historic migrations remain open |

## Evidence and version responsibility

Core 0.10.0, Profile2, Export2; Report7/CalculationSpec1/ChartSnapshot1 unchanged. The new profile envelope and scoped MCP calculation fields are additive. Export2 adds calculation to manifest/chart.json and retains the input profile version/settings.

`profileSettingsRegression.test.ts` fails on unchanged ca3ad2 because the non-default Web download loses both choices. New profile/session tests exercise strict malformed inputs, explicit migration, identity differences, current JSON reload, rejection, ownership, complete fixed-clock Report7 parity, natal provider call counts and unknown-time behavior. MCP integration uses the real store and calculators. D-043 regressions remain unchanged. Browser pixels, real-device acceptance, external oracle/scientific accuracy and historical engine replay are not asserted by these tests.

All prior fixtures remain byte-identical. New literal report deltas contain only thirteen core-version strings. New export deltas contain core/Profile version and chart.json hash only. The eight current MCP full-response contracts retain complete data/caveat digests and record version/envelope changes; calculation-removal and existing field-mutation controls remain active. The old projected systemsBaseline comparison still has its older, limited omission semantics; it is not used as the new whole-response oracle.

Compact answer content keeps its original <4096-byte target, plus <300 bytes for scoped calculation (whole envelope <4416 bytes). No answer field is removed for this allowance.
