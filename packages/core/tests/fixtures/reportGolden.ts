/**
 * Behaviour-parity golden (V1-16): `analyze()` / `analyzeCompatibility()` /
 * calendar-helper outputs recorded with the ORIGINAL JavaScript core before the
 * TypeScript conversion. `reportGolden.test.ts` asserts the current code still
 * produces byte-identical JSON.
 *
 * Full reports are ~0.6 MB each (timeline + signals dominate), so a report
 * section whose JSON exceeds {@link INLINE_LIMIT} characters is stored as its
 * SHA-256 + length instead of inline; small sections, the calendar helpers and
 * the compatibility results are stored verbatim. Any byte change in any section
 * still fails the test, which names the case and section.
 *
 * Regenerate (only when a behaviour change is intended and reviewed):
 *   bun packages/core/tests/fixtures/reportGolden.ts --write
 */
import { analyze, analyzeCompatibility, lunarToSolarDate, solarToLunarDate } from '../../src/index';

const ASOF = '2026-07-18';

/** Wall-clock / timing fields that legitimately differ between runs. */
const VOLATILE_KEYS = new Set(['generatedAt', 'computedAt', 'durationMs', 'classifiedAt', 'exportedAt']);

const LUNAR_INPUT = { year: 1990, month: 8, day: 15, isLeap: false };
const lunarSolar = lunarToSolarDate(LUNAR_INPUT);

type RawInput = Record<string, unknown>;

export const REPORT_CASES: ReadonlyArray<{ id: string; input: RawInput }> = [
  { id: 'taipei-female-1991', input: { year: 1991, month: 10, day: 5, hour: 14, minute: 0, gender: 'female', name: 'A', cityId: 'taipei' } },
  { id: 'legacy-coords-male-1986', input: { year: 1986, month: 5, day: 29, hour: 8, minute: 0, gender: 'male', name: 'B', longitude: 121.5654, latitude: 25.033 } },
  { id: 'tainan-male-1978', input: { year: 1978, month: 3, day: 12, hour: 6, minute: 45, gender: 'male', name: 'C', cityId: 'tainan' } },
  { id: 'new-york-female-1985', input: { year: 1985, month: 12, day: 1, hour: 21, minute: 10, gender: 'female', name: 'D', cityId: 'new-york' } },
  { id: 'late-zi-2330', input: { year: 1995, month: 6, day: 20, hour: 23, minute: 30, gender: 'female', name: 'E', cityId: 'taipei' } },
  { id: 'late-zi-2330-early-civil', input: { year: 1995, month: 6, day: 20, hour: 23, minute: 30, gender: 'male', name: 'E2', cityId: 'taipei', ziHourConvention: 'early', useTrueSolarTime: false } },
  { id: 'time-unknown', input: { year: 2001, month: 1, day: 17, hour: 12, minute: 0, timeKnown: false, gender: 'male', name: 'F', cityId: 'kaohsiung', timeAccuracy: 'unknown' } },
  { id: 'lunar-input', input: { year: lunarSolar.year, month: lunarSolar.month, day: lunarSolar.day, hour: 9, minute: 5, gender: 'female', name: 'G', cityId: 'taichung' } },
  { id: 'near-lichun-1990', input: { year: 1990, month: 2, day: 4, hour: 10, minute: 0, gender: 'male', name: 'H', cityId: 'taipei' } },
  { id: 'dst-1974-taipei', input: { year: 1974, month: 7, day: 15, hour: 10, minute: 30, gender: 'female', name: 'I', birthplace: { label: 'Taipei', lat: 25.0375, lng: 121.5637, timezone: 'Asia/Taipei' } } },
  { id: 'default-birthplace-no-name', input: { year: 1969, month: 11, day: 30, hour: 2, gender: 'male' } },
];

export const COMPATIBILITY_CASES: ReadonlyArray<{ id: string; first: RawInput; second: RawInput }> = [
  { id: 'pair-1991-1986', first: REPORT_CASES[0]!.input, second: REPORT_CASES[1]!.input },
  { id: 'pair-ny-unknown', first: REPORT_CASES[3]!.input, second: REPORT_CASES[6]!.input },
];

function stripVolatile(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (!VOLATILE_KEYS.has(k)) out[k] = v;
    }
    return out;
  }
  return value;
}

/** Sections longer than this (JSON characters) are stored as a digest. */
export const INLINE_LIMIT = 8000;

function digestSection(value: unknown): unknown {
  const json = JSON.stringify(value, stripVolatile);
  if (json === undefined || json.length <= INLINE_LIMIT) return value === undefined ? null : JSON.parse(json);
  return { sha256: new Bun.CryptoHasher('sha256').update(json).digest('hex'), length: json.length };
}

function digestReport(report: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(JSON.parse(JSON.stringify(report, stripVolatile)) as Record<string, unknown>).map(([k, v]) => [k, digestSection(v)]),
  );
}

/** Deterministic golden object (reports digested per top-level section). */
export function buildGoldenObject(): Record<string, unknown> {
  return {
    asOf: ASOF,
    calendar: {
      lunarToSolar: lunarSolar,
      solarToLunar: solarToLunarDate({ year: 1991, month: 10, day: 5 }),
    },
    reports: Object.fromEntries(REPORT_CASES.map(c => [c.id, digestReport(analyze(c.input as never, { asOf: ASOF }))])),
    compatibility: Object.fromEntries(
      COMPATIBILITY_CASES.map(c => [c.id, analyzeCompatibility(c.first as never, c.second as never, { asOf: ASOF })]),
    ),
  };
}

/** Deterministic JSON text of every golden output. */
export function buildGolden(): string {
  return `${JSON.stringify(buildGoldenObject(), stripVolatile, 1)}\n`;
}

export const GOLDEN_PATH = new URL('./reportGolden.json', import.meta.url);

if (import.meta.main && process.argv.includes('--write')) {
  await Bun.write(GOLDEN_PATH, buildGolden());
  console.log(`wrote ${GOLDEN_PATH.pathname}`);
}
