# MCP consumer and response contracts

This describes the existing MCP boundary, not a new calculation model or a claim of predictive validity. Related work: Issues20,21,24. These issues still contain broader unfinished work.

## Producer values and consumer assertions

`get_chart` consumes the existing calculator `Component.value: unknown`; this boundary was already delivered and is not recreated here. `conventionsFor` now accepts an opaque object/nullish chart. After selecting the system, only the corresponding existing calculator chart leaf (`conventions`, `time`, `settings`, `node`) is asserted. No validator, coercion, fallback, cloning, property-read ordering or calculation is added. Missing fields retain the existing “未明確記錄” behavior. The assertions establish compiler expectations about code-owned producers; they do not authenticate arbitrary JSON.

The heterogeneous tool registry retains each original Zod shape and handler. Its erased handler accepts `never`, preventing accidental unchecked calls through the registry. `callTool` is the single bridge: find the tool, parse with that same tool's strict schema, then invoke that same handler. The cast after successful parsing is the explicit erasure boundary. `defineTool` continues to infer each concrete handler argument; SDK validation, batch ordering/budget/errors and canonical rendering are unchanged.

Shared engine `Component.value` and engine-level metadata elsewhere are not thereby fixed. This is the MCP consumer portion of Issue21, not completion of that issue.

## Two complementary baseline responsibilities

1. Existing `systemsBaseline.json` and v0.6.0/v0.7.0 delta files remain byte-identical historical digests. Their `stripNew`, ID expansion and `noYears` comparisons intentionally have limited scopes. Provenance metadata records source/digest history; it is not recovered historical full-payload replay.
2. `currentResponse.contract.json` is a separate current synthetic-response contract captured from unmodified master `d3725a8eee3c9b0edc184aac89ae3405d726d980`, using a clean source snapshot independent of this type-only candidate. Eight real tool calls cover full/summary chart, full yearly timeline cells, monthly cells/table, full consensus and full/compact question output. The synthetic fixture is the existing test fixture, never an operator profile.

The current contract hashes four disjoint layers: data; caveats; versionsHash and optional versions; remaining envelope fields. The only normalization is canonical object-key ordering. Arrays, IDs, years/yearTable, systems selection, sensitivity, format fields, nested metadata (including generatedAt) and future fields are not removed. A change to any layer fails its own digest. Deletion controls on actual responses demonstrate that fields hidden by historical comparisons now remain visible. Caveat-only/version-only changes cannot silently authorize a data change.

A digest difference identifies location, not legitimacy or scientific cause. Review the actual before/after payload and relevant calculator/rule/schema versions before accepting changes. Do not regenerate legacy baselines or overwrite this contract merely to make CI green. A new intentional output version needs a reviewed migration/delta and attribution. The current manifest's source commit is its capture provenance, not the candidate commit; avoid circular self-hashes.

## Verification boundaries

Targeted MCP typecheck, real synthetic-tool tests and pure negative controls establish software contracts. They do not establish historical payload replay, full repository regression, desktop MCP integration, live Claude, public-site/mobile behavior, external calendar accuracy or prediction validity. Existing checks continue to own those respective scopes. No model call, real-profile import, release or deployment is needed for these tests.
