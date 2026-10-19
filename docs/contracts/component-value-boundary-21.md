# Opaque component values and actual consumers (#21)

`Component.value`, `ClassifiedComponent.value` and each `RadarAxis.inputs` value
are `unknown`. Normalization, classification, scenario generation, radar formulas
and serialization are unchanged. Unknown is a TypeScript read boundary, not a
runtime ban on custom-engine payloads or a JSON-schema restriction.

A plugin can still supply strings, arrays, objects, accessors, functions, symbols,
non-finite numbers and other values accepted by the existing APIs. Null/undefined
component values still normalize to null. Existing JSON.stringify behavior,
including throws for unsupported JSON values, is not replaced by a sanitizer.
No numeric/finite/plain-object guard, copy, getter suppression or coercion is added.

The actual remaining readers are explicitly addressed:

- StateSwitchTable selects the existing Ziwei soul/body and surrounding-palace
  contracts and BaZi ten-god context contract after its existing category dispatch.
  Views remain partial/nullish where existing code already supplies defaults.
  A string or NaN group count retains the original JavaScript comparison behavior.
- TimeContextBaZiEngine reads the existing BaZi luck-cycle index only in its
  existing daYun branch. Natal replacement and calculation order are unchanged.
- Radar audit inputs are opaque to downstream consumers. Tests which recompute
  formulas establish numeric types explicitly rather than inheriting `any`.
- MCP get_chart already serializes unknown payloads with bounded JSON length;
  it does not need a new parser or a producer-specific guess.

## Verification boundary

The whole five-module production patch must transpile to byte-identical JavaScript
against master ea811be95f6784d507c10b94077179e1aabfe3ed with the locked esbuild.
The additive regression pins those five baseline hashes and includes a changed-JS
negative control. Type-level negative controls reject unchecked property/number
use and any leakage at all three output boundaries.

Existing field, formula, vector, golden and MCP assertions remain. Tests of known
built-in producer results use explicit existing producer types after checking the
engine identity; these test-only views do not validate payloads and cannot be used
as production validators. Field/golden assertions continue to detect wrong values.
This distinction prevents assigning one engine's contract to another while keeping
custom plugin values outside the built-in producer union.

The actual dynamic-plugin result/classification path, nullish normalization,
reference retention, getters, NaN/string count semantics and malformed-array throw
are exercised. Existing consumer coercion/accessor regressions are retained.

This closes the shared value/actual downstream-read typing package, not the whole
Issue #21 or an assertion that every legacy test/helper in the repository is free
of `any`. No Report version, calculator setting, model, score, fixture, native
runtime, school eligibility or historical replay behavior changes. TypeScript
callers that previously relied on implicit any must now select/check the payload
contract before field access; JavaScript callers retain the same behavior.
