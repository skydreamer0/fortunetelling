/** Hand-transcribed calendar facts, NOT generated chart goldens. See the validation note. */
export const calendarSources = {
  checkedOn: '2026-10-10',
  hko: 'https://www.hko.gov.hk/tc/gts/time/calendar/text/files/T2025c.txt',
  cwa: 'https://www.cwa.gov.tw/Data/astronomy/2025cal.pdf',
  iana: 'https://data.iana.org/time-zones/tzdb-2026e/asia',
} as const;

export const lunarCases = [
  { id: 'regular-six-end', date: '2025-07-24', lunar: { year: 2025, month: 6, day: 30, isLeap: false } },
  { id: 'leap-six-start', date: '2025-07-25', lunar: { year: 2025, month: 6, day: 1, isLeap: true } },
  { id: 'leap-six-fifteen', date: '2025-08-08', lunar: { year: 2025, month: 6, day: 15, isLeap: true } },
  { id: 'leap-six-sixteen', date: '2025-08-09', lunar: { year: 2025, month: 6, day: 16, isLeap: true } },
  { id: 'leap-six-end', date: '2025-08-22', lunar: { year: 2025, month: 6, day: 29, isLeap: true } },
  { id: 'regular-seven-start', date: '2025-08-23', lunar: { year: 2025, month: 7, day: 1, isLeap: false } },
] as const;

// UTC values are arithmetic from the IANA rules + the EXISTING product policies,
// not a second independent timezone oracle or new selectable DST settings.
export const dstCases = [
  { id: 'taipei-gap', date: '1974-04-01', time: '00:30',
    local: { iso: '1974-04-01T01:30:00+09:00', utcOffsetMinutes: 540, dst: true },
    utc: '1974-03-31T16:30:00Z', code: 'dst_gap', data: {
      requestedLocal: '1974-04-01T00:30:00', resolvedLocal: '1974-04-01T01:30:00',
      gapMinutes: 60, requiresConfirmation: true,
    } },
  { id: 'taipei-overlap', date: '1974-09-30', time: '23:30',
    local: { iso: '1974-09-30T23:30:00+09:00', utcOffsetMinutes: 540, dst: true },
    utc: '1974-09-30T14:30:00Z', code: 'dst_overlap', data: {
      requestedLocal: '1974-09-30T23:30:00', chosen: 'earlier', requiresConfirmation: true,
      candidates: [
        { utcIso: '1974-09-30T14:30:00Z', utcOffsetMinutes: 540 },
        { utcIso: '1974-09-30T15:30:00Z', utcOffsetMinutes: 480 },
      ],
    } },
] as const;

export const natalCases = [
  ...lunarCases.map(row => ({ id: row.id, date: row.date, time: '12:00' })),
  ...dstCases.map(row => ({ id: row.id, date: row.date, time: row.time })),
];
export const settings = {
  A: { useTrueSolarTime: false, ziHourConvention: 'late' },
  B: { useTrueSolarTime: true, ziHourConvention: 'early' },
} as const;
export const calendarPlaces = [
  { label: 'Synthetic Taipei', lat: 25.033, lng: 121.5654, timezone: 'Asia/Taipei' },
  { label: 'Synthetic Hong Kong', lat: 22.3193, lng: 114.1694, timezone: 'Asia/Hong_Kong' },
];
