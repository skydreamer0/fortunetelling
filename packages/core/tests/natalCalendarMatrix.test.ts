import { beforeAll, describe, expect, test } from 'bun:test';
import { dstCases, lunarCases, natalCases } from './fixtures/natalCalendarCases';
import type { ProbeMode, ProbeResult } from './fixtures/natalCalendarProbe';

const zones = ['UTC', 'Asia/Taipei', 'America/New_York', 'Pacific/Apia'] as const;
const modes = ['A', 'B', 'interleaved'] as const satisfies readonly ProbeMode[];
const probeUrl = new URL('./fixtures/natalCalendarProbe.ts', import.meta.url).href;
const results = new Map<string, ProbeResult>();
const get = (zone: string, mode: ProbeMode) => results.get(`${zone}/${mode}`)!;

beforeAll(() => {
  // Serial, fresh Bun processes; no global TZ mutation or process reuse between
  // A-only, B-only and interleaved calculations. Keep file URLs intact on Windows.
  for (const TZ of zones) for (const mode of modes) {
    const script = `import { runNatalCalendarProbe } from ${JSON.stringify(probeUrl)};
      console.log(JSON.stringify(runNatalCalendarProbe(${JSON.stringify(mode)})));`;
    const child = Bun.spawnSync([process.execPath, '--eval', script], { env: { ...process.env, TZ }, timeout: 60_000 });
    expect(child.exitCode, `${TZ}/${mode}: ${new TextDecoder().decode(child.stderr)}`).toBe(0);
    results.set(`${TZ}/${mode}`, JSON.parse(new TextDecoder().decode(child.stdout)) as ProbeResult);
  }
}, 180_000);

describe('#54 source-backed natal calendar slice (not complete ChartSnapshot acceptance)', () => {
  test('HKO/CWA fixed leap-sixth-month and month-end facts hold in conversions and both local contexts', () => {
    for (const zone of zones) for (const mode of modes) {
      const result = get(zone, mode);
      expect(result.host).toBe(zone);
      expect(result.calendar).toHaveLength(lunarCases.length * 2);
      for (const expected of lunarCases) for (const timezone of ['Asia/Taipei', 'Asia/Hong_Kong']) {
        const actual = result.calendar.find(row => row.id === expected.id && row.timezone === timezone)!;
        expect(actual.solar).toEqual(expected.lunar);
        expect(actual.lunar).toMatchObject(expected.lunar);
        expect(actual.back.iso).toBe(expected.date);
      }
      // Existing API rejects the nonexistent leap-sixth-month day 30. Its
      // generic leap-month error is preserved, not interpreted as calendar truth.
      expect(result.invalidLeapDay).toBe('該年沒有這個閏月，請重新確認');
    }
  });

  test('resolved spec retains fixed DST policy, UTC/local facts and confirmation flags through both settings', () => {
    for (const zone of zones) for (const mode of modes) for (const expected of dstCases) {
      const rows = get(zone, mode).rows.find(group => group[0].id === expected.id)!;
      for (const row of rows) {
        expect(row.policy).toEqual({ dstOverlap: 'earlier', dstGap: 'shift-forward-by-gap' });
        expect(row.local).toEqual(expected.local);
        expect(row.utc).toEqual({ iso: expected.utc });
        const flag = row.flags.find(flag => flag.code === expected.code);
        expect<unknown>(flag && 'data' in flag ? flag.data : undefined).toEqual(expected.data);
        expect(row.flags.some(flag => flag.code === (expected.code === 'dst_gap' ? 'dst_overlap' : 'dst_gap'))).toBe(false);
      }
    }
  });

  test('A → B → A cached natal/main results equal each setting in a separate uncached process', () => {
    for (const zone of zones) {
      expect(get(zone, 'interleaved').rows).toHaveLength(natalCases.length);
      // These settings must exercise genuinely different natal calculations,
      // not merely different labels on otherwise identical cached charts.
      expect(get(zone, 'A').rows.some((group, i) => group[0].natal !== get(zone, 'B').rows[i][0].natal)).toBe(true);
      for (let i = 0; i < natalCases.length; i++) {
        const [a1, b, a2] = get(zone, 'interleaved').rows[i];
        expect(a1, zone + '/' + natalCases[i].id).toEqual(get(zone, 'A').rows[i][0]);
        expect(b).toEqual(get(zone, 'B').rows[i][0]);
        expect(a2).toEqual(get(zone, 'A').rows[i][0]);
        expect(a1.spec).not.toBe(b.spec);
        expect(a1.time.basis).toBe('civil');
        expect(b.time.basis).toBe('trueSolar');
        expect(a1.time.ziHourConvention).toBe('splitMidnight');
        expect(b.time.ziHourConvention).toBe('nextDayAt23');
        for (const row of [a1, b, a2]) {
          expect(row.errors).toEqual([]);
          expect(row.mainCount).toBeGreaterThan(12);
          expect(row.palaceCounts.length).toBeGreaterThan(0);
          for (const count of row.palaceCounts) expect(count).toBe(12);
        }
      }
    }
  });

  test('DST overlap and leap-day-16 full typed periods are populated and also obey A → B → A', () => {
    for (const zone of zones) for (const mode of modes) for (const id of ['taipei-overlap', 'leap-six-sixteen']) {
      const rows = get(zone, mode).rows.find(group => group[0].id === id)!;
      for (const row of rows) {
        expect(row.typed).not.toBeNull();
        expect(row.typed!.palaces).toBe(12);
        expect(row.typed!.monthly).toBeGreaterThanOrEqual(12);
        expect(row.typed!.time).toMatchObject({ date: row.time.date, timeIndex: row.time.timeIndex, basis: row.time.basis });
      }
    }
  });

  test('complete normalized outputs are equal across all four isolated host timezones', () => {
    // Also prove the subprocesses applied TZ to their native host clock.
    expect(new Set(zones.map(zone => get(zone, 'A').hostOffsetMinutes)).size).toBe(4);
    for (const zone of zones) for (const mode of modes) {
      expect(get(zone, mode).hostOffsetMinutes).toBe(get(zone, 'A').hostOffsetMinutes);
      const { host: _actualHost, hostOffsetMinutes: _actualOffset, ...actual } = get(zone, mode);
      const { host: _referenceHost, hostOffsetMinutes: _referenceOffset, ...reference } = get('UTC', mode);
      expect(actual, zone + '/' + mode).toEqual(reference);
    }
  });

  test('real analyze leap-month birth uses the same main projection and keeps all engines/timeline healthy', () => {
    for (const zone of zones) {
      const result = get(zone, 'interleaved'), report = result.report!;
      const row = result.rows.find(group => group[0].id === 'leap-six-sixteen')![0];
      expect(report.errors).toHaveLength(5);
      for (const errors of report.errors) expect(errors).toEqual([]);
      expect(report.main).toBe(row.main);
      expect(report.context.lunar).toMatchObject(lunarCases.find(row => row.id === 'leap-six-sixteen')!.lunar);
      expect(report.systems).toContain('ziwei');
      expect(report.systems).toContain('bazi');
      expect(report.schemaVersion).toBe(7);
    }
  });
});
