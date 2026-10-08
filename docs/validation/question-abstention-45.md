# Issue #45: Question abstention contract

## Baseline and versions

The implementation is stacked on PR77 head `5d44e16242c9eff2104d2bd7bc2921467b06e0f5`, tree `10a48d99b2cdf65b3ea95611162bc2352e8ac7a9`. The local baseline was materialized through the GitHub connector: all 560 blobs, file modes, 106 subtrees and the root tree were verified. The synthetic local commit is not remote ancestry. No master merge, CI/security setting or deployment is part of this change.

- core 0.7.0; catalog.v3.json: schemaVersion 2, version 3
- Catalog v1 and v2 both have schemaVersion 1. Their files are unchanged
- Payload 4; standalone Interpretation schema 2; copy-v6, interpret-v5, chat-v4
- Report, Timeline, Consensus, chart calculations, scoring coefficients, category weights and source rules are unchanged
- bun.lock changes only the core workspace version literal; dependency resolutions and integrity entries are unchanged

## Decision contract

Decision is made before topN truncation, using all evaluated months:

1. Unsupported category: unsupported
2. No relevant filtered signals: insufficient_evidence / no_signals
3. All rounded month scores are zero: insufficient_evidence / all_zero_scores
4. Highest score is below effective bandCuts[0]: no_clear_advantage / all_low_band
5. At least two months share the highest already-rounded four-decimal score: tied / top_score_tie
6. Otherwise: ranked

The default cuts [35,55,75] live in catalog.v3.json. Both band assignment and the abstention threshold read the same effective cuts. Existing bandCuts and catalog options remain available with finite, ascending, 0–100 validation. The threshold is inclusive: 35 reaches the middle band. No new prediction rule or calibration is implied. Missing domain signals continue to contribute zero with their existing denominator weight; this change does not infer whether an absent source was evaluated.

Every live QuestionAnswer carries status, abstentionReasons and the effective rankingPolicy. topN=0 is a display choice and does not change status. Only ranked answers expose recommendation top rows. All other states have top=[], with chronological ranking diagnostics and rank:null. Raw scores, signal references, conflicts and directional evidence stay intact. A web report that cannot replay its source is explicitly source_unavailable rather than claiming that its source was evaluated as zero.

Ties are only the first-place ambiguity gate. Below-threshold ties are low-band abstentions; zero ties are insufficient evidence. For ranked answers, the existing score order and earlier-month stable tie ordering below the leading score remain unchanged. No Pareto, sensitivity algorithm or multi-axis policy was added.

## Consumers and checking

- MCP compact/detail outputs expose status, reasons, policy and rankingKind. Non-ranked detail diagnostics retain resolvable signal IDs, rank:null and chronological order. They do not contain sensitivity recommendation lists
- answer_question returns questionContext with category, exact range and the requested systems/verifiedOnly selection. check_answer accepts this bounded context, recomputes through the same core path with the same profileId/asOf, and rejects client-supplied status fields
- AI payload and copy prompt gate top on status. All three text validation paths (checkAnswer, checkPastedAnswer, validateSections) flag positive month recommendations against an abstained decision
- Missing checker context is explicitly not_provided; an attempted month recommendation raises question_context_missing. A citation-only successful check without context does not certify a month recommendation
- The prose rule covers explicit Chinese/ISO/English month mentions plus recommendation wording, with local negation handling. It is a bounded heuristic, not a claim to understand every paraphrase
- Web QuestionStatus renders the actual abstention reason. AskAi binds the computed question to the report identity as well as category/range, so a report switch cannot reuse the previous report's decision. Existing PR77 AnswerCheck cancellation/generation logic is retained

## Replay and fixture changes

replayQuestionAnswerV2 is the explicit PR77 engine/catalog2 shape replay entrypoint, with no new status fields. It does not claim to reconstruct an older catalog1 engine or a LOCKED FORECAST V1 prediction. No archived forecast was read or rewritten.

- questionSystems.baseline.json and its v0.6.0 delta are unchanged. All 16 PR77-v2 SHA-256 values were matched before producing the new v0.7.0 delta. Per-month score/evidence was compared exactly after removing only rank/order. Ten sample requests become no_clear_advantage; six stay ranked with their original top months
- question-vehicle.json is an older catalog1, trimmed fixture. Its bytes and hash stay fixed. It cannot attest to a full v3 evaluation. Payload4 projects it as insufficient_evidence / legacy_policy_missing with no top, recorded in question-vehicle.payload-v4.delta.json. A separate new synthetic live-ranked helper tests protected source projection
- reportGolden.v0.7.0.delta.json changes only 13 core-version literals. export.v0.7.0.delta.json changes only manifest coreVersion and questions catalog version
- Additional AI/MCP versioned serialization deltas document the new explicit contract and prompt budgets. Old goldens and all previous deltas remain unchanged

## Verification record

The four synthetic fixtures were written before production changes and run under Bun 1.4.2: 0 pass / 4 fail, exit 1, each failing because status was absent. They then passed after implementation. Further focused cases cover threshold boundaries, topN=0, ties, system filters, zero weights, unavailable sources, legacy replay, serialization, consumer gating, exact MCP context, invalid context and negative prose controls.

The intermediate core-only checkpoint was not a PR77 baseline: 1349 pass / 2 skip / 20 fail, exit 1, 459.92 seconds. Failures identified old top/ranking/serialization assertions that needed an explicit live-v3 or legacy-v2 scope. Its RSS serialization failed, so no peak RSS is asserted for that run. Live Claude tests remain disabled.

Final suite, typecheck, doctor and build receipts are recorded with the candidate handoff. A passing Linux run does not fix PR77's documented Windows timezone-import failures or enable the repository's disabled Actions. No browser paint/input-latency or Windows validation is claimed here.
