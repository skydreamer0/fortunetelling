# Question v4: versioned diagnostic consumer, not a production ranking model

This is the approved direction-consumption change for #47/#29, linked to #28/#36. It does not finish those entire issues or release any held work. No rule output, trait, valence, signal identity, natal provenance or calculator is modified.

## Finite model inventory

- Frozen v2: `replayQuestionAnswerV2`, archived catalog v2 and unchanged legacy scorer.
- Frozen v3: `answerQuestion` and explicit `replayQuestionAnswerV3`, catalog v3 and unchanged trait/activity formula. The old `localQuestion`, `answer_question`, and legacy contexts in `check_answer` are compatibility APIs, not v4. Their historical negative/positive valence equal-score characterization intentionally remains.
- V4 production consumer: `answerQuestionV4`, catalog 4, model `question-v4-diagnostic-1`. It always abstains under current source capabilities. It does not expose a scalar recommendation score or fake zero aggregate. Its manifest/fingerprint explicitly contains null grouping, eligibility, coverage, denominator and recommendation-policy versions. A new version is required to adopt those policies.
- Research-only arithmetic: `group-max-pn-ratio-v1`, exposed as `evaluateResearchGroupV4`. Caller-declared groups are explicitly not authenticated production provenance. The API cannot be passed to the production consumer to authorize ranking. No noisy-OR production alternative, multi-group aggregation, system weights, or threshold policy is silently supplied.

## Direction and comparison

For one declared research group and school branch, activity is max intensity; P is max(intensity × positive valence); N is max(intensity × negative-valence magnitude). Both sides and every full source signal remain. Trait remains descriptive and does not decide direction. Activity never improves the P/N comparison.

The explicitly versioned research ratios are D = 100(P−N)/(P+N), C = 2min(P,N)/(P+N). Both are null for zero mass. P, N and mass accompany ratios; D=100 at tiny mass does not mean strong support. A diagnostic comparator uses higher P/lower N and retains equal/tradeoff cases; it is not a recommendation policy. Eligibility, denominator, group independence, minimum support/mass and maximum pressure must be adopted and versioned before any production ranking. Zero/unknown weights are not supported inputs, rather than silently treated as defaults.

Real source data currently lacks finalized scoring groups, native trigger/domain family resolution, complete coverage states and adopted thresholds. The exact-claim/fact-set descriptor from #27 explicitly is not #28/#29 scoring provenance. D045 signed-mean directional votes likewise are not a bidirectional P/N model. V4 therefore returns chronological per-signal diagnostics, null group metrics, rank:null and top:[] even for positive-only data. Empty provider output is not certified evaluated-zero coverage; null provider is separately source_unavailable.

## Consumers, identity, export and replay

- Web `AskAi` uses `localQuestionV4`. Its replayable Report8 month provider is unchanged. Legacy `localQuestion` stays available for old answers/tests.
- MCP `answer_question_v4` and `computeQuestionContextV4` use the same consumer. Full model metadata survives both compact/detail projection. Detail exposes per-signal directional contributions and full IDs; `get_signal` resolves original full traits/evidence. The size-capped response does not duplicate full signal text for every month. `check_answer_v4` requires the returned version, model fingerprint and context, refuses omission/mismatch, and recomputes V4 rather than trusting client status.
- AI payload, copy prompt, paste-back checker and mocked `interpret` all preserve the V4 model/abstention. No LLM API is used in tests. V4 has no top rows to promote after abstention.
- `serializeQuestionAnswerV4` rederives the complete diagnostic projection and checks its catalog/model identity; changed contributions, source lists, signal IDs, ranks or statuses reject. Its fingerprint is not authentication, nor does serialization certify upstream source ownership. `systemFilter` records original provider usage beyond the retained category subset; shape/set constraints are checked, not fictional reauthentication.
- Portable version info opts into questions=4 and its model fingerprint for the new MCP routes; default legacy version bytes remain unchanged. Core VERSION and Report8/cs1 identity are not bumped. This is not a historical-runtime archive or migration for every Report generation.

## Acceptance evidence and limits

The committed gzip fixture freezes all 32 original synthetic profile/setting/category cases: full raw month sources, v2 and v3 answers, drop/positive controls and original v3 MCP responses. All v2/v3 answer JSON bytes and complete original MCP objects are compared. Old golden fixtures/catalogs are not rewritten. The legacy 52 raised cells are retained as characterization, not relabelled successful direction accuracy.

V4 tests cover real ProfileV2 → Report8 → Web → MCP calculations across 32 cases/384 cells, individual negative signals with P=0, retained sources, missing-policy abstention, neutral/zero intensity, opposing same-system sources, weak mass, group-max duplicates/order, P/N Pareto tradeoffs, unknown versions/systems/options, forged source/model/diagnostic data, export and AI checks. Research arithmetic can show positive P, but current production cannot demonstrate correct positive recommendations: no admitted policy exists. The prior two months entering top cannot enter V4 top because ranking remains unavailable, not because a calibrated alternative ranking was validated.

No public sharing, remote push/PR, merge, deployment, paid API, production database, local Codex, security changes or access expansion. No full catalog or 2344-test suite rerun. Browser UI interaction, HTTP/stdio transport, deployed behavior, external AI, statistical/predictive validity, general source grouping, and a complete production recommendation model remain unverified/not implemented.
