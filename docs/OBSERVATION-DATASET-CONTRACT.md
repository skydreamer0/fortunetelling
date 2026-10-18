# Opt-in observation data and grouped research audit

Related: #15, #59, #60. This delivers a research-data framework using synthetic tests. It does not establish prediction accuracy, causality, scientifically independent samples, or completion of those issues.

## Explicit v1/v2 boundary

The existing LifeEvent v1 validator, browser storage, export, MCP, runBacktest, method version and weight proposals are unchanged. They do not read or automatically migrate v2. `readLifeObservationV2`, `migrateLifeEventV1` and `auditObservationDataset` must be called explicitly. No import side effect reads records or performs a migration. The legacy reader continues rejecting schemaVersion2; a v2 object is excluded by the actual legacy scoring runner.

V2 stores:
- schemaVersion2 and the caller's record ID;
- opaque personId and clusterId, both required; IDs do not prove anonymity or identify which real people belong together;
- eventType using the existing event-category vocabulary, and domains;
- a nominal recorded date with explicit day/month precision and existing certain/approx confidence;
- observationStatus: event_recorded, confirmed_absent or unknown;
- labelStatus: unreviewed, confirmed or disputed;
- direction fixed to unknown, pending the distinct #29 directional contract;
- an optional explicit half-open observedWindow, explicit recordedAt or null, and source kind/reference;
- the exact JSON-compatible legacyV1 input for migration records, otherwise null.

Event presence is not favorable direction. A label `confirmed` is the caller's assertion, not independent verification. `confirmed_absent` requires a confirmed label and an explicit observed window. Missing records, missing windows and unknown labels never generate negative examples. Any supplied window must cover the complete nominal precision interval: the entire day for day precision, or every day of the calendar month for month precision. Partial overlap, including a window covering only the first day of a month, is rejected. This is basic consistency, not a claim of complete real-world observation. Month precision does not mean an exact event day. The four-digit supported dates cannot express an exclusive endpoint after December 9999; such end-of-range day/month records remain representable with a null window but cannot claim a fully covered window or confirmed absence. Approximate confidence is retained.

## Lossless explicit migration

Callers supply personId and clusterId; neither is guessed from names, descriptions or dates. Versionless and numeric1 records must already satisfy the unchanged v1 validator. The complete parsed JSON value is cloned and retained, including whitespace in descriptions, domain order, unknown fields and explicit numeric1. Restore returns an independent copy of that original JSON; v1 normalization is not used as the retained source.

Migration records event_recorded with unreviewed labeling, unknown direction, null observedWindow and null recordedAt. It does not invent an observation interval, timestamp, confirmed negative or reviewed status. The source projection must agree with the retained original. Revising labels requires an explicit new nonlegacy observation, not silently rewriting a migration record.

Non-JSON values, accessors, cycles, sparse arrays, nonfinite/-0 numbers and bounded-size/depth violations are rejected rather than silently lost. This preserves parsed JSON values and their serialization, not original JSON source bytes, whitespace or duplicate keys already consumed by a parser. Arrays must use the standard Array prototype; subclasses, overridden methods and exotic prototypes are rejected. This is losslessness for JSON-compatible v1 records, not arbitrary JavaScript objects. Invalid v1 records remain invalid; this module does not repair old dates or unknown future schemas. New v2 records reject unsupported fields rather than quietly discarding them.

## Grouped counts and split policy

`countObservationUnits` reports persons, caller-declared (personId,clusterId) units, records, nominal person-period keys, domain annotations, unique cluster-domain units, confirmed event/absence clusters and unknown/unreviewed records. More domains or several record IDs in one cluster cannot increase clusterUnits. They may increase descriptive record/domain counts; those are not an independent n. The same cluster string belonging to different person IDs is a different namespaced cluster. Contradictory confirmed presence/absence for the same person/cluster/event type fails closed; different target event types are retained separately. Therefore confirmed event-cluster and absence-cluster counts can overlap for different targets; they are not mutually exclusive categories or a statistical denominator.

`auditObservationDataset` requires explicit train/tune/test arrays. One person cannot appear in multiple splits, even with nonoverlapping dates or different clusters. A namespaced (personId, clusterId) cluster crossing splits and duplicate observation identities are rejected. A shared cross-person household/site cluster is not modeled by this policy; the same cluster string on different people is not a shared group identifier. This is a strict person-disjoint policy, not a forward-time splitter and not evidence that declared persons are truly independent. It audits supplied partitions without selecting, randomizing or changing them. Empty partitions return zero counts without statistical approval or fabricated negatives.

The output is explicitly data-partition-audit-only. It contains no accuracy, significance test, threshold, model training, seed search, probability, ranking or automatic weight changes. It cannot be passed as a legacy backtest result.

## Remaining original acceptance

#59 still needs reviewed direction semantics and actual v2 consumer/storage/UI migration decisions; this opt-in reader distinguishes labels but does not make the legacy scoring engine score confirmed negatives. #60 still needs an approved final evaluation method, actual grouped/forward train/tune/test consumers, uncertainty/permutation/multiple-comparison treatment and seed-distribution evidence. #15 real-data collection, consent, frozen evaluation and predictive validation remain separate and unperformed. No actual personal records, localStorage changes, data exports, network/model calls, CI changes or deployments are part of this package.
