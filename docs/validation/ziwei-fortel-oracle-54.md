# #54: a bounded, independent historical Ziwei fixture

This is one public worked example, not complete #54 acceptance, scientific
validation, or agreement between all schools. No runtime/default/configuration
has changed. The test runs the actual typed calculator, main `analyze` Ziwei
engine and owned natal snapshot on master; it does not require unmerged #158.

## Sources and lineage

- Eric Yu's [Fortel README at 26d3323c](https://github.com/airicyu/Fortel/blob/26d3323c650057851ed3c8df5986133c41649e21/README.md), dated 2019-04-28,
  publishes lunar 1952-12-15, non-leap, early Zi, male, sky chart and complete
  twelve-cell JSON. The repository identifies the Zhongzhou school.
- Its pinned `Config.java` constructs a Lunar date; pinned `Data.java`
  defines early Zi as 00:00–00:59, separately from night Zi 23:00–23:59.
  `MajorStar.java` implements placements locally. The Java dependency manifest
  uses Joda/Commons/Jackson/JUnit, not iztro. This historical publication
  predates the iztro repository's 2023-07-27 creation. This is source-lineage
  evidence, not a guarantee the source is error-free.
- [HKO 1953 calendar, page 1](https://www.hko.gov.hk/tc/gts/time/calendar/pdf/files/1953.pdf):
  January 15 is lunar month twelve day one; January 29 is day fifteen;
  February 14 starts the next lunar year. Thus the example maps to 1953-01-29.
  HKO validates this date conversion, not star placement or school conventions.

The complete source JSON is preserved in `tests/fixtures/fortel1952.json`,
attributed to Eric Yu / airicyu/Fortel under its adjacent Apache-2.0 license.
It includes all original fields, even those not accepted as an oracle here.
Only whitespace was reformatted. It is a public example, not user birth data.

## Reproducible inputs and coverage

The fixture uses synthetic Hong Kong coordinates 22.3/114.17, Asia/Hong_Kong,
00:30 civil time, true-solar correction off, `late` / `splitMidnight`, and
asOf 2026-10-19. Place/minute/asOf are explicit test representatives, not facts
claimed by the original example. 00:30 lies inside its defined early-Zi period.
Neither HKO nor Fortel is used to invent a real person's birthplace.

The test compares all twelve palace names, body-palace flags, complete main-star
and minor-star sets, and the wood-three bureau across all three actual entries.
Only explicit name aliases (事業→官祿, 交友→僕役) and star-set order are normalized.
There is no star filtering to obtain agreement. Source twelve-cell ordering is
Zi first; actual charts are reordered by branch for comparison.

**Known difference, asserted explicitly:** source Ren-year transformations are
祿天梁、權紫微、科天府、忌武曲; current default has 科左輔 instead. The three other
transformations agree. The test must preserve this difference; it must never
label the complete charts equal or change defaults to make them equal.

**Not covered:** miscellaneous stars, brightness, pre-general/pre-age/pre-doctor
cycles, lifespan stages, decade ages, destiny/body masters, sonDou, dynamic
periods, leap-month cases, month-end and DST edges, other schools/settings,
or astronomical/predictive validity. Complete source storage is not acceptance
of these fields. Existing #54 boundary and native-OS evidence is separate.

The negative control moves a real major star between palaces and must fail the
same comparison. Another mutation retains snapshot IDs while altering a star;
owned snapshot validation must reject it, while the genuine JSON reload passes.

Run `npm test -- packages/core/tests/ziweiFortelOracle.test.ts` and Core typecheck.
No online source, external installation, or external executable runs in tests.
Original #54 and parent #26 AC remain open; this supplies one bounded external
star/palace case, not the required complete multi-boundary matrix.
