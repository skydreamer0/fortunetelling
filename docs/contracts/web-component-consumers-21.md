# Web component values and chart consumers (#21)

The Web report's default `Component` payload is `unknown`, including values
reached through `EngineResult` and `Report`. An explicitly parameterized
`Component<V>` still describes a selected producer contract. Arbitrary plugin
and legacy values remain accepted at the shared boundary.

The existing selectors select engine/category first and then use the existing
Core producer types for BaZi context groups/current year, Ziwei palaces,
decades/stars/soul/opposite facets, and Ming Gua. Method's natal convention read
uses the same BaZi natal producer type. The type exports add no runtime module
or validator. These projections do not authenticate imported reports or
normalize malformed payloads. Existing nullish fallbacks, getter counts,
exceptions, numeric strings, `NaN`, and reference identities are preserved.

## User-visible paths covered

- Core analysis → Web report → BaZi structure, Ziwei board/borrowed soul stars,
  Ming Gua compass, identity ledger → the five rendered chart panels.
- The same report → Method's convention display, including its exact `false`
  comparison and unknown-time behavior.
- Unknown-time results retain unavailable BaZi/Ziwei panels; no time or chart
  is invented. Existing report replay, historical-zone, question/consensus,
  timeline, guidance and preserved Core golden tests remain regression gates.

The added test includes compile-time rejection of unchecked shared payload
reads and incorrect producer fields, actual rendering, deliberately loose
legacy payloads, malformed arrays and accessor counts. JavaScript erasure of
all four changed production modules is compared byte-for-byte with master
`ea811be95f6784d507c10b94077179e1aabfe3ed`. No formula, component value, ordering,
schema, calendar, version, fixture, workflow or runtime guard changes.

## Remaining boundaries and integration

This completes the Web component-default and its existing chart/Method readers,
not all explicit `any` across the repository. The Core bridge's historical
input compatibility and other unrelated loose boundaries are unchanged.
Type assertions describe existing producers; they are not general payload
validation and do not make untrusted imported content safe.

PR153 adds `Report.calculation` and `Report.replay` in the same types file;
this change affects only the separate Component declaration. Those Report8
fields must remain when the branches are integrated. PR156's Core opaque-value
work is separate. Neither PR is merged or rewritten by this package. Future
combined-tree CI is required; independent branch evidence is not combined-tree
acceptance. Issue21 remains open for any remaining consumer debt.
