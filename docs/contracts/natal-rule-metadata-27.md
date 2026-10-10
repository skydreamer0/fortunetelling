# Internal primary-natal native rule metadata (#27)

`chartSnapshotSession.natalRuleMetadata()` is a real internal consumer of the
session's owned captured snapshot. It runs existing natal matchers against pure
natal views and resolves selected metadata against the matching owned FactStore.
It does not regenerate natal charts, admit a production SchoolPack, change Signal
bytes/IDs, modify the exact-claim descriptor, group evidence or calculate scores.

## Version 1 scope

The sidecar has schema/adapter version 1, rule versions, catalog/trait/modifier
versions, full snapshot and FactStore binding. Matcher metadata is retained in a
WeakMap at the point structured source roles would otherwise be discarded; it is
not parsed from display text or target strings. External hit objects are never
accepted by the owned consumer. Validation compares complete content against an
owned result and rechecks the owned store/current calculator environment.

- `bazi.stem.control@1`: retains existing raw controller/controlled pillar order,
  directed flag and complete flag. Exact pillar facts resolve each role. Domains
  and traits are copied from existing templates; a single relation may produce
  multiple domain records. Source metadata is resolved; claims are unresolved.
- `ziwei.star.tianma@1`: retains the primary placement and observed three-direction
  lucun placement roles, plus same-palace sha placements. Palace relation and
  absence conditions are not modeled facts, so coverage stays partial.
- `ziwei.natal.star_traits@1`: retains actual host/source palace and borrowing,
  placement, same-palace sha and natal transformation facts. Brightness, absence
  conditions and palace relation semantics are explicitly missing; coverage is
  partial. Shared placements do not equate this rule with the special tianma rule.

The Ziwei view reuses the production pure `fromZiweiComponents` converter with
captured palace data, retaining brightness, brightnessScore, mutagen and the
major/minor separation. That converter deliberately excludes adjective stars;
this slice does not expand production rule coverage. The natal-only window uses
the birth date solely to invoke existing matchers: no native interval is claimed
or exported. No flow sequence is calculated.

Every actual matched natal rule produces records, including unmapped rules with
explicit unresolved metadata. Coverage lists mapped and unmapped exact rule
versions independently of whether they hit. Missing time returns no records and
lists unavailable systems. Alternatives, periods, other systems, claim equivalence
and generalized evidence groups remain uncovered. Every claim remains unresolved;
independence remains not-established. No metadata ID/hash adds a trust boundary.

This is not completion of #27 or permission for #28/#29 to treat these records as
independent evidence. Parent claims, event aliases, Signal V2, validationRef,
EvidenceStore export/MCP and scoring remain separate unfinished work.
