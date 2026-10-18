import { spawnSync } from 'node:child_process';
import { describe, expect, test } from 'vitest';
import { createTimeContext } from '../src/time/createTimeContext';
import { solarTermsAround } from '../src/time/solarTerms';
import type { BirthProfile } from '../src/profile/types';
import { HKO_SOLAR_TERMS_2025, SOLAR_TERM_COMPARISON_TOLERANCE_MS } from './fixtures/hkoSolarTerms2025';

const MINUTE = 60_000;
const terms = solarTermsAround(Date.parse('2025-06-01T00:00:00Z'))
  .filter(term => term.utcMs >= Date.parse('2025-01-01T00:00:00Z') && term.utcMs < Date.parse('2026-01-01T00:00:00Z'));
const locations = [
  { label: 'Synthetic Hong Kong', lat: 22.3, lng: 114.17, timezone: 'Asia/Hong_Kong' },
  { label: 'Synthetic Taipei', lat: 25.03, lng: 121.56, timezone: 'Asia/Taipei' },
];
function context(utcMs: number, birthplace: BirthProfile['birthplace'], timeAccuracy: BirthProfile['timeAccuracy'] = 'exact') {
  const local = new Date(utcMs + 8 * 60 * MINUTE).toISOString();
  return createTimeContext({ date: local.slice(0, 10), time: local.slice(11, 16), timeAccuracy, gender: 'female', birthplace }, { dstOverlap: 'earlier' });
}

describe('#54 HKO 2025 external solar-term oracle (bounded astronomy only)', () => {
  test('fixture and result cover all 24 distinct terms, 12 jie and 12 qi', () => {
    expect(HKO_SOLAR_TERMS_2025).toHaveLength(24);
    expect(new Set(HKO_SOLAR_TERMS_2025.map(row => row.name)).size).toBe(24);
    expect(HKO_SOLAR_TERMS_2025.filter(row => row.kind === 'jie')).toHaveLength(12);
    expect(HKO_SOLAR_TERMS_2025.filter(row => row.kind === 'qi')).toHaveLength(12);
    expect(terms).toHaveLength(24);
    expect(terms.map(({ name, kind }) => ({ name, kind }))).toEqual(HKO_SOLAR_TERMS_2025.map(({ name, kind }) => ({ name, kind })));
  });

  for (const row of HKO_SOLAR_TERMS_2025) {
    test(`${row.name}: external minute value and unambiguous before/after in HK/Taipei`, () => {
      const reference = Date.parse(row.hkt);
      const actual = terms.find(term => term.name === row.name)!;
      const difference = actual.utcMs - reference;
      expect(Number.isFinite(difference)).toBe(true);
      expect(Math.abs(difference), `${row.name}: signed difference ${difference / 1000}s`).toBeLessThanOrEqual(SOLAR_TERM_COMPARISON_TOLERANCE_MS);
      for (const location of locations) {
        // ±5 minutes is outside the fixed ±2-minute oracle envelope. No claim
        // is made about which side an instant inside that envelope belongs to.
        for (const offset of [-5, 5]) {
          const ctx = context(reference + offset * MINUTE, location);
          expect(ctx.utc?.iso).toBe(new Date(reference + offset * MINUTE).toISOString().replace('.000Z', 'Z'));
          const selected = row.kind === 'jie'
            ? (offset < 0 ? ctx.solarTerms.nextJie : ctx.solarTerms.prevJie)
            : (offset < 0 ? ctx.solarTerms.nextQi : ctx.solarTerms.prevQi);
          expect(selected.name).toBe(row.name);
          expect(selected.kind).toBe(row.kind);
          expect(Math.abs(Date.parse(selected.utcIso) - reference)).toBeLessThanOrEqual(SOLAR_TERM_COMPARISON_TOLERANCE_MS);
          const flag = ctx.flags.find(flag => flag.code === 'near_jie_boundary');
          if (row.kind === 'jie') {
            expect(flag?.data.term.name).toBe(row.name);
            expect(flag?.data.basis).toBe('instant');
          } else expect(flag).toBeUndefined();
        }
      }
    });
  }

  test('existing uncertainty flags stay conservative around all 12 jie', () => {
    for (const row of HKO_SOLAR_TERMS_2025.filter(row => row.kind === 'jie')) {
      for (const accuracy of ['exact', 'approx15m', 'approx1h'] as const) {
        const tolerance = accuracy === 'approx1h' ? 60 : 30;
        for (const sign of [-1, 1]) for (const distance of [tolerance - 5, tolerance + 5]) {
          const ctx = context(Date.parse(row.hkt) + sign * distance * MINUTE, locations[0], accuracy);
          const flag = ctx.flags.find(flag => flag.code === 'near_jie_boundary');
          if (distance < tolerance) {
            expect(flag?.data.term.name).toBe(row.name);
            expect(flag?.data.basis).toBe('instant');
            if (flag?.data.basis !== 'instant') throw new Error('Missing instant boundary evidence');
            expect(flag.data.toleranceMinutes).toBe(tolerance);
          } else expect(flag).toBeUndefined();
        }
      }
    }
  });

  test('complete solar-term table is identical across four fresh host-TZ processes', () => {
    const moduleUrl = new URL('../src/time/solarTerms.ts', import.meta.url).href;
    const script = `import { solarTermsAround } from ${JSON.stringify(moduleUrl)};
      console.log(JSON.stringify({ offsets: ['2025-01-01T00:00:00Z', '2025-07-01T00:00:00Z'].map(iso => new Date(iso).getTimezoneOffset()),
        terms: solarTermsAround(Date.parse('2025-06-01T00:00:00Z')) }));`;
    const hosts = [['UTC', [0, 0]], ['Asia/Taipei', [-480, -480]], ['America/New_York', [300, 240]], ['Europe/London', [0, -60]]] as const;
    let baseline: unknown;
    for (const [TZ, offsets] of hosts) {
      const child = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script],
        { env: { ...process.env, TZ }, encoding: 'utf8', timeout: 20_000, maxBuffer: 1024 * 1024 });
      expect(child.error).toBeUndefined();
      expect(child.signal).toBeNull();
      expect(child.status, child.stderr).toBe(0);
      const result = JSON.parse(child.stdout) as { offsets: number[]; terms: unknown };
      expect(result.offsets).toEqual(offsets);
      if (TZ === 'UTC') baseline = result.terms;
      else expect(result.terms).toEqual(baseline);
    }
  });
});
