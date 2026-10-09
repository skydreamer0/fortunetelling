import { beforeAll, describe, expect, test } from 'bun:test';

const moduleRoot = new URL('../src/', import.meta.url).href;
const zones = ['UTC', 'Asia/Taipei', 'America/New_York', 'Pacific/Apia'];
const validDates = ['0100-01-01', '1900-02-28', '2000-02-29', '2011-12-29', '2011-12-30', '2011-12-31', '2024-02-29', '2100-02-28', '9999-12-31'];
const invalidDates = ['0000-01-01', '0001-01-01', '0099-12-31', '1900-02-29', '2100-02-29', '2026-02-30', '2026-00-01', '2026-13-01', '2026-01-00', '2026-04-31'];
const malformedDates = ['', '2026-2-01', '10000-01-01', '-001-01-01', '2026-01-01T00:00:00Z', ' 2026-01-01', null, 20260101];

const script = `
import { parseIsoDate, lunarToSolarDate } from ${JSON.stringify(moduleRoot + 'core/calendar.ts')};
import { BirthData } from ${JSON.stringify(moduleRoot + 'core/models/BirthData.ts')};
import { BaZiEngine } from ${JSON.stringify(moduleRoot + 'engines/BaZiEngine.ts')};
import { analyze } from ${JSON.stringify(moduleRoot + 'core/analyze.ts')};
import { resolveCalculationSpec } from ${JSON.stringify(moduleRoot + 'core/calculationSpec.ts')};
import { createTimeContext } from ${JSON.stringify(moduleRoot + 'time/createTimeContext.ts')};
import { baziCalculator } from ${JSON.stringify(moduleRoot + 'calculators/bazi/calculator.ts')};
const valid = ${JSON.stringify(validDates)}, invalid = ${JSON.stringify(invalidDates)}, malformed = ${JSON.stringify(malformedDates)};
const input = { year: 1991, month: 10, day: 5, hour: 14, minute: 0, gender: 'female', cityId: 'taipei' };
const birth = new BirthData(input);
const capture = fn => { try { return { value: fn() }; } catch (e) { return { error: e.message }; } };
const volatile = new Set(['computedAt', 'durationMs', 'generatedAt', 'classifiedAt', 'exportedAt']);
const hash = value => new Bun.CryptoHasher('sha256').update(JSON.stringify(value, (key, v) => volatile.has(key) ? undefined : v)).digest('hex');
const parsed = [...valid, ...invalid, ...malformed].map(value => ({ input: value, ...capture(() => parseIsoDate(value)) }));
const engines = [...valid, ...invalid, ...malformed, new Date('2026-01-01T00:00:00Z'), new Date(NaN)].map(asOf => {
  const result = new BaZiEngine({ asOf }).run(birth);
  return { input: String(asOf), count: result.components.length, errors: result.errors, components: hash(result.components), meta: result.meta };
});
const { profile, options, spec } = resolveCalculationSpec(input);
const ctx = createTimeContext(profile, { dstOverlap: spec.identity.settings.time.dstOverlap });
const reports = ['2011-12-29', '2011-12-30', '2011-12-31'].map(asOf => {
  const report = analyze(input, { asOf });
  const bazi = report.engines.find(engine => engine.engineId === 'bazi');
  const calculator = baziCalculator.calculate(ctx, { ...options, asOf });
  return { asOf: report.asOf, count: bazi.components.length, errors: bazi.errors, bazi: hash(bazi),
    calculator: hash(calculator), chartPresent: Boolean(calculator.chart.pillars),
    timeline: hash(report.timeline), systems: report.timeline.systems, skipped: report.timeline.skippedSystems };
});
const unknown = new BaZiEngine({ asOf: 'not-a-date' }).run(new BirthData({ ...input, timeKnown: false }));
const apiaBirth = createTimeContext({ date: '2011-12-30', time: '12:00', timeAccuracy: 'exact', gender: 'female',
  birthplace: { label: 'Test', lat: -13.8333, lng: -171.75, timezone: 'Pacific/Apia' } });
const birthGap = { utc: apiaBirth.utc.iso, gap: apiaBirth.flags.find(flag => flag.code === 'dst_gap') };
const lunarRange = [1899, 2101].map(year => capture(() => lunarToSolarDate({ year, month: 1, day: 1 })));
console.log(JSON.stringify({ parsed, engines, reports, unknown: { errors: unknown.errors, count: unknown.components.length, meta: unknown.meta }, lunarRange, birthGap }));
`;

let results: Record<string, any>;
beforeAll(() => {
  results = Object.fromEntries(zones.map(TZ => {
    const child = Bun.spawnSync([process.execPath, '--eval', script], { env: { ...process.env, TZ } });
    expect(child.exitCode, new TextDecoder().decode(child.stderr)).toBe(0);
    return [TZ, JSON.parse(new TextDecoder().decode(child.stdout).trim())];
  }));
}, 120000);

describe('#26/#54 Gregorian validation is independent of the host calendar day', () => {
  test('parseIsoDate accepts Gregorian dates even when the host skipped the civil day', () => {
    for (const zone of zones) for (const input of validDates) {
      const [year, month, day] = input.split('-').map(Number);
      const row = results[zone].parsed.find((r: any) => r.input === input);
      expect(row, zone + '/' + input).toEqual({ input, value: { year, month, day } });
    }
  });

  test('parseIsoDate preserves leap-day, format and 0–99-year rejection without narrowing its range', () => {
    for (const zone of zones) {
      for (const input of invalidDates) {
        expect(results[zone].parsed.find((r: any) => r.input === input)).toEqual({ input, error: '這個國曆日期不存在' });
      }
      for (const input of malformedDates) {
        expect(results[zone].parsed.find((r: any) => r.input === input)).toEqual({ input, error: '請選擇有效的出生日期' });
      }
      expect(results[zone].lunarRange).toEqual([{ error: '農曆年份需在 1900–2100' }, { error: '農曆年份需在 1900–2100' }]);
    }
  });

  test('BaZiEngine accepts the same valid asOf dates and produces the same components on every host', () => {
    for (const zone of zones) for (const input of validDates) {
      const row = results[zone].engines.find((r: any) => r.input === input);
      expect(row.errors, zone + '/' + input).toEqual([]);
      expect(row.count).toBe(16);
      expect(row).toEqual(results.UTC.engines.find((r: any) => r.input === input));
    }
  });

  test('BaZiEngine preserves its exact invalid-calendar and string-only format errors', () => {
    for (const zone of zones) {
      for (const row of results[zone].engines.slice(validDates.length)) {
        const expected = invalidDates.includes(row.input)
          ? 'BaZiEngine requires a valid calendar date, got: '
          : 'BaZiEngine requires asOf in YYYY-MM-DD format, got: ';
        expect(row.errors).toEqual(['計算失敗：' + expected + row.input]);
        expect(row.count).toBe(0);
      }
    }
  });

  test('real analyze and typed calculator retain Bazi in the timeline on the skipped host date', () => {
    for (const zone of zones) for (const row of results[zone].reports) {
      expect(row.errors, zone + '/' + row.asOf).toEqual([]);
      expect(row.count).toBe(16);
      expect(row.chartPresent).toBe(true);
      expect(row.systems).toContain('bazi');
      expect(row).toEqual(results.UTC.reports.find((r: any) => r.asOf === row.asOf));
    }
  });

  test('unknown birth time still skips Bazi before date validation', () => {
    for (const zone of zones) {
      expect(results[zone].unknown.errors).toEqual([]);
      expect(results[zone].unknown.count).toBe(0);
      expect(results[zone].unknown.meta.unavailableReason).toBe('unknown-time');
      expect(results[zone].unknown).toEqual(results.UTC.unknown);
    }
  });

  test('a real Apia birthplace still reports its missing civil day and requires confirmation', () => {
    for (const zone of zones) {
      const gap = results[zone].birthGap;
      expect(gap.utc).toBe('2011-12-30T22:00:00Z');
      expect(gap.gap.data).toEqual({ requestedLocal: '2011-12-30T12:00:00', resolvedLocal: '2011-12-31T12:00:00', gapMinutes: 1440, requiresConfirmation: true });
      expect(gap).toEqual(results.UTC.birthGap);
    }
  });
});
