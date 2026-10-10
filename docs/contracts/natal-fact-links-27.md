# Internal native natal pairwise exact fact links (#27)

`chartSnapshotSession.natalFactLinks()` consumes the existing owned native natal
metadata without recalculating charts. `describeNatalFactLinks(metadata)` accepts
exactly one owned metadata capability; serialized or caller-created records are
not inputs. The output retains that complete original metadata object, including
all records, dependencies, gaps, claims, catalogs, snapshot and FactStore binding.
No existing metadata, FactProvenance, Signal or identity bytes change.

Version 1 pairs reference zero-based positions in the metadata's original
canonical records. Each pair has leftRecord < rightRecord; pairs sort by those
numeric positions. Only a nonempty exact intersection creates a pair. Equality
uses complete resolved Fact bytes, never short IDs or diagnostic targets. Shared
facts sort by those bytes and retain their full content and every role at each
endpoint. Roles sort lexically; distinct roles and repeated role occurrences are
not discarded. No pair rewrites records, merges domains or substitutes shared
facts for either endpoint's complete dependencies.

Partial and unresolved source-record positions are separately listed in ascending
order. Full source gaps and every unresolved claim remain in the original
metadata. Pairwise links do not establish dependency completeness, trigger/event
or claim equivalence. A-B and B-C overlap does not imply A-C overlap; no union or
transitive grouping occurs. An absent pair does not establish independence:
`independence: not-established` applies even to empty outputs. Missing-time and
unavailable-system coverage stays explicit in metadata.

The output is immutable and privately owned. Validation accepts transport bytes
only against a current owned expected result, revalidates its metadata and bound
calculator environment, compares complete bytes and returns the owned result.
No digest, public Signal ID, serialization trust boundary, scoring, new rule,
EvidenceGroup V2, export/MCP or production SchoolPack is introduced. #27 remains
open; #28/#29 cannot treat these links as independent evidence votes. Paused
#22/#23 and existing exact-claim provenance behavior remain untouched.
