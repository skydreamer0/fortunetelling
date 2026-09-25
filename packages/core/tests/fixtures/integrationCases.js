/**
 * @typedef {import('../../src/core/models/BirthData.js').BirthDataParams} BirthDataParams
 * @typedef {{ label: string, lat: number, lng: number, timezone: string }} FixtureBirthplace
 * @typedef {{ id: string, kind: string, input: BirthDataParams & { birthplace?: FixtureBirthplace }, asOf: string, provenance: Object, expected: Object }} IntegrationCase
 */

export const INTEGRATION_CASES = Object.freeze(/** @type {IntegrationCase[]} */ ([
  {
    id: 'golden-1986-05-29-taipei',
    kind: 'golden',
    input: {
      year: 1986,
      month: 5,
      day: 29,
      hour: 8,
      minute: 0,
      gender: 'male',
      name: 'Golden Vector 1986',
      longitude: 121.5654,
      latitude: 25.033,
    },
    asOf: '2026-07-13',
    provenance: {
      sourceUrl: '../../docs/TASKS.md',
      accessedOn: '2026-07-13',
      birthTimeConfidence: 'exact',
      notes: 'Project golden vector documented in docs/TASKS.md; Asia/Taipei, 08:00, lunar-javascript sect=2.',
    },
    expected: {
      baziNatal: { year: '丙寅', month: '癸巳', day: '癸酉', time: '丙辰' },
      lifePath: 22,
    },
  },
  {
    id: 'golden-1991-10-05-taipei',
    kind: 'golden',
    input: {
      year: 1991,
      month: 10,
      day: 5,
      hour: 14,
      minute: 0,
      gender: 'female',
      name: 'Golden Vector 1991',
      longitude: 121.5654,
      latitude: 25.033,
    },
    asOf: '2026-07-13',
    provenance: {
      sourceUrl: '../../docs/TASKS.md',
      accessedOn: '2026-07-13',
      birthTimeConfidence: 'exact',
      notes: 'Project full-report golden vector documented throughout docs/TASKS.md.',
    },
    expected: {
      baziNatal: { year: '辛未', month: '丁酉', day: '戊申', time: '己未' },
      lifePath: 8,
    },
  },
  {
    id: 'barack-obama-aa',
    kind: 'public-reference',
    input: {
      year: 1961,
      month: 8,
      day: 4,
      hour: 19,
      minute: 24,
      gender: 'male',
      name: 'Barack Hussein Obama II',
      longitude: -157.8667,
      latitude: 21.3,
      // Report v4 (D-032): without `birthplace` the hour would be read as Asia/Taipei civil time.
      birthplace: { label: 'Honolulu, Hawaii, US', lat: 21.3, lng: -157.8667, timezone: 'Pacific/Honolulu' },
    },
    asOf: '2026-07-13',
    provenance: {
      sourceUrl: 'https://www.astro.com/astro-databank/Obama%2C_Barack',
      accessedOn: '2026-07-13',
      birthTimeConfidence: 'exact',
      notes: 'Astro-Databank lists 4 Aug 1961, 19:24, Honolulu, with Rodden Rating AA (birth certificate/birth record in hand).',
    },
    expected: {
      // v4 true solar time: 19:24 HST (UTC−10) at 157.87°W → LMT −31.5 min, EoT −6.1 min → 18:46:35
      // → 酉時 (civil clock 19:24 = 戌時 甲戌). Year/month/day unchanged.
      utcIso: '1961-08-05T05:24:00Z',
      baziNatal: { year: '辛丑', month: '乙未', day: '己巳', time: '癸酉' },
      lifePath: 2,
      digitFrequency: { 1: 2, 2: 0, 3: 0, 4: 1, 5: 0, 6: 1, 7: 0, 8: 1, 9: 1 },
    },
  },
  {
    id: 'steve-jobs-aa',
    kind: 'public-reference',
    input: {
      year: 1955,
      month: 2,
      day: 24,
      hour: 19,
      minute: 15,
      gender: 'male',
      name: 'Steven Paul Jobs',
      longitude: -122.4167,
      latitude: 37.7833,
      birthplace: { label: 'San Francisco, California, US', lat: 37.7833, lng: -122.4167, timezone: 'America/Los_Angeles' },
    },
    asOf: '2026-07-13',
    provenance: {
      sourceUrl: 'https://www.astro.com/astro-databank/Jobs%2C_Steve',
      accessedOn: '2026-07-13',
      birthTimeConfidence: 'exact',
      notes: 'Astro-Databank lists 24 Feb 1955, 19:15, San Francisco, with Rodden Rating AA (birth certificate/birth record in hand).',
    },
    expected: {
      // v4 true solar time: 19:15 PST (UTC−8) at 122.42°W → LMT −9.7 min, EoT −13.3 min → 18:52:01
      // → 酉時 (civil clock 19:15 = 戌時 戊戌). Year/month/day unchanged.
      utcIso: '1955-02-25T03:15:00Z',
      baziNatal: { year: '乙未', month: '戊寅', day: '丙辰', time: '丁酉' },
      lifePath: 1,
      digitFrequency: { 1: 1, 2: 2, 3: 0, 4: 1, 5: 2, 6: 0, 7: 0, 8: 0, 9: 1 },
    },
  },
]));
