# Limited natal validation-reference links (#27 / #16)

This internal descriptor connects existing owned `NatalRuleMetadata` to the
existing four-axis validation registry. It is not Signal V2, a production school
mapping, an EvidenceStore, or an eligibility decision. Issue #27 remains open.

## Boundary

`describeNatalValidationLinks(metadata, bindings?, validationRecords?)` accepts
the original owned metadata and strict plain-data declarations. The existing
`createValidationRegistry` validates records and resolves exact versioned refs.
No registry callbacks or custom resolvers execute. Defaults are empty: every
native record is unbound, and no evidence or school/question scope is invented.

Each binding selects a position in this complete metadata object, an explicit
seven-field validation scope and four axis refs. The native system, rule ID,
decimal rule-version spelling and natal grain must match exactly. School/version
and question are **caller-declared, not verified**; matching a validation record
does not establish that this school or question actually applies to the rule.
Domain, trait, target strings and source overlaps never infer that mapping.
Positions are not portable identities and must not be reused across metadata.

Multiple school/question declarations survive separately. Duplicate exact
record/scope declarations fail. Links sort by record position and complete scope
tuple; record and validation input order do not select a preferred branch.
Null refs and unknown exact versions stay pending with distinct reasons. A
known ref in the wrong axis or any different scope fails. All resolved source
citations, shared bases, limitations, statuses and results remain available.

`resolved` means an exact registry reference was found, not that its result
supports a claim. Even a supplied predictive-validation record with a supports
result cannot establish attribution or grant predictive use/directional votes.
These remain explicitly not authorized. No capability or scoring code consumes
this descriptor, and no independence claim is made.

The original owned metadata is retained, including its complete snapshot and
FactStore binding, source roles/gaps and unresolved claims. No f1, sn1, cs1,
ifa1, existing Signal or Report identities change. Full-content validation
rejects tampering and mixed snapshots; ownership and the live snapshot
environment are rechecked. Serialized lookalikes are not owned capabilities.
No natal chart calculation is repeated.

## Verification and next consumer

Contract tests use synthetic evidence clearly labeled as such, on real native
metadata. They cover unknown/exact versions, axis/scope mismatch, retained
branches, immutable data, malformed declarations, getters, duplicate binding,
ownership, cross-snapshot/tampered candidates, stale environments, zero
recalculation, missing birth time and non-authorization even after resolution.
They provide no scientific or predictive validation evidence.

The next consumer must provide reviewed, versioned school/question-to-native-rule
mappings before replacing caller-declared attribution. It must retain pending
axes and exact source limitations, and use the separate eligibility policy.
General source-family/domain/trigger equivalence, true SchoolPack branches,
Signal V2 migration, complete EvidenceStore and Web/MCP/export wiring remain
unimplemented. This slice changes no existing consumers or public behavior.
