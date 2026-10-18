/** HKO Almanac 2025 monthly PDF Solar Terms columns, transcribed 2026-10-18.
 * External minute-resolution facts, not generated from application output.
 * See docs/validation/solar-term-oracle-54.md for provenance and limits. */
export const HKO_SOLAR_TERMS_2025 = [
  { name: '小寒', kind: 'jie', hkt: '2025-01-05T10:33:00+08:00', sourceMonth: '01' },
  { name: '大寒', kind: 'qi', hkt: '2025-01-20T04:00:00+08:00', sourceMonth: '01' },
  { name: '立春', kind: 'jie', hkt: '2025-02-03T22:10:00+08:00', sourceMonth: '02' },
  { name: '雨水', kind: 'qi', hkt: '2025-02-18T18:07:00+08:00', sourceMonth: '02' },
  { name: '惊蛰', kind: 'jie', hkt: '2025-03-05T16:07:00+08:00', sourceMonth: '03' },
  { name: '春分', kind: 'qi', hkt: '2025-03-20T17:01:00+08:00', sourceMonth: '03' },
  { name: '清明', kind: 'jie', hkt: '2025-04-04T20:49:00+08:00', sourceMonth: '04' },
  { name: '谷雨', kind: 'qi', hkt: '2025-04-20T03:56:00+08:00', sourceMonth: '04' },
  { name: '立夏', kind: 'jie', hkt: '2025-05-05T13:57:00+08:00', sourceMonth: '05' },
  { name: '小满', kind: 'qi', hkt: '2025-05-21T02:55:00+08:00', sourceMonth: '05' },
  { name: '芒种', kind: 'jie', hkt: '2025-06-05T17:57:00+08:00', sourceMonth: '06' },
  { name: '夏至', kind: 'qi', hkt: '2025-06-21T10:42:00+08:00', sourceMonth: '06' },
  { name: '小暑', kind: 'jie', hkt: '2025-07-07T04:05:00+08:00', sourceMonth: '07' },
  { name: '大暑', kind: 'qi', hkt: '2025-07-22T21:29:00+08:00', sourceMonth: '07' },
  { name: '立秋', kind: 'jie', hkt: '2025-08-07T13:52:00+08:00', sourceMonth: '08' },
  { name: '处暑', kind: 'qi', hkt: '2025-08-23T04:34:00+08:00', sourceMonth: '08' },
  { name: '白露', kind: 'jie', hkt: '2025-09-07T16:52:00+08:00', sourceMonth: '09' },
  { name: '秋分', kind: 'qi', hkt: '2025-09-23T02:19:00+08:00', sourceMonth: '09' },
  { name: '寒露', kind: 'jie', hkt: '2025-10-08T08:41:00+08:00', sourceMonth: '10' },
  { name: '霜降', kind: 'qi', hkt: '2025-10-23T11:51:00+08:00', sourceMonth: '10' },
  { name: '立冬', kind: 'jie', hkt: '2025-11-07T12:04:00+08:00', sourceMonth: '11' },
  { name: '小雪', kind: 'qi', hkt: '2025-11-22T09:36:00+08:00', sourceMonth: '11' },
  { name: '大雪', kind: 'jie', hkt: '2025-12-07T05:05:00+08:00', sourceMonth: '12' },
  { name: '冬至', kind: 'qi', hkt: '2025-12-21T23:03:00+08:00', sourceMonth: '12' },
] as const;

// Fixed before comparison: 60 s for minute-only publication (rounding unspecified)
// plus the existing adapter's approximately 1-minute astronomical accuracy claim.
// This engineering acceptance envelope is NOT an HKO confidence interval.
export const SOLAR_TERM_COMPARISON_TOLERANCE_MS = 120_000;
