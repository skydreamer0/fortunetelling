import { beforeAll, describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { analyze } from '../src/core/analyze';
import { resolveCalculationSpec } from '../src/core/calculationSpec';
import { createChartSnapshot, validateChartSnapshot } from '../src/core/chartSnapshot';
import { lunarToSolarDate, solarToLunarDate } from '../src/core/calendar';
import { createTimeContext } from '../src/time/createTimeContext';
import { ziweiCalculator, extractZiweiChart } from '../src/calculators/ziwei/calculator';
import type { DeepReadonly } from '../src/core/calculationSpec';
import type { ZiweiPalace } from '../src/calculators/ziwei/types';

// Public Fortel example, NOT a person's supplied birth record. Original complete
// output retained, including divergent four transformations and untested fields.
const original = JSON.parse(readFileSync(new URL('./fixtures/fortel1952.json', import.meta.url), 'utf8')) as {
  fiveElement: string; starReactionMap: Record<string, string>;
  cells: { ground: number; temples: string[]; majorStars: string[]; minorStars: string[] }[];
};
const branches = '子丑寅卯辰巳午未申酉戌亥';
const aliases: Record<string, string> = { 事業: '官祿', 交友: '僕役' };
const sorted = (values: readonly string[]) => [...values].sort();
const expected = original.cells.map(cell => {
  const name = cell.temples.find(name => name !== '身宮')!;
  return { branch: branches[cell.ground], name: aliases[name] ?? name,
    body: cell.temples.includes('身宮'), major: sorted(cell.majorStars), minor: sorted(cell.minorStars) };
});
function projection(palaces: DeepReadonly<ZiweiPalace[]>) {
  return [...palaces].sort((a, b) => branches.indexOf(a.branch) - branches.indexOf(b.branch))
    .map(p => ({ branch: p.branch, name: p.name, body: p.isBodyPalace,
      major: sorted(p.majorStars.map(s => s.name)), minor: sorted(p.minorStars.map(s => s.name)) }));
}
const input = { year: 1953, month: 1, day: 29, hour: 0, minute: 30, gender: 'male' as const,
  name: 'PUBLIC FORTEL FIXTURE', useTrueSolarTime: false, ziHourConvention: 'late' as const,
  birthplace: { label: 'Synthetic Hong Kong', lat: 22.3, lng: 114.17, timezone: 'Asia/Hong_Kong' } };
const asOf = '2026-10-19';
const resolved = resolveCalculationSpec(input);
const ctx = createTimeContext(resolved.profile);
const snapshot = createChartSnapshot(resolved.spec);
let typed: ReturnType<typeof ziweiCalculator.calculate>;
let main: ReturnType<typeof extractZiweiChart>;
beforeAll(() => {
  typed = ziweiCalculator.calculate(ctx, { asOf, useTrueSolarTime: false, ziHourConvention: 'splitMidnight' });
  const report = analyze(input, { asOf });
  const engine = report.engines.find(engine => engine.engineId === 'ziwei');
  expect(engine?.errors).toEqual([]);
  if (!engine) throw new Error('Missing actual Ziwei main engine');
  main = extractZiweiChart(engine.components);
}, 60_000);

describe('#54 Fortel 2019 independent bounded natal oracle, not whole-chart equivalence', () => {
  test('HKO calendar and explicit early-Zi civil input are consumed', () => {
    const lunar = { year: 1952, month: 12, day: 15, isLeap: false };
    expect(solarToLunarDate({ year: 1953, month: 1, day: 29 })).toMatchObject(lunar);
    expect(lunarToSolarDate(lunar).iso).toBe('1953-01-29');
    expect(ctx.lunar).toMatchObject(lunar);
    expect(typed.chart.time).toMatchObject({ date: '1953-01-29', timeIndex: 0 });
    expect(expected).toHaveLength(12);
    expect(expected.flatMap(p => p.major)).toHaveLength(14);
  });
  test('actual typed calculator, main report and owned snapshot match all twelve palace projections', () => {
    expect(snapshot.natal.ziwei.status).toBe('computed');
    if (snapshot.natal.ziwei.status !== 'computed') throw new Error('Missing snapshot');
    for (const chart of [typed.chart, main, snapshot.natal.ziwei.chart.primary]) {
      expect(projection(chart.palaces)).toEqual(expected);
      expect(chart.fiveElementBureau).toBe(original.fiveElement);
    }
  });
  test('reports the known school difference instead of asserting complete chart equality', () => {
    expect(original.starReactionMap).toEqual({ 科: '天府', 權: '紫微', 忌: '武曲', 祿: '天梁' });
    if (snapshot.natal.ziwei.status !== 'computed') throw new Error('Missing snapshot');
    for (const chart of [typed.chart, main, snapshot.natal.ziwei.chart.primary]) {
      const actual = Object.fromEntries(chart.natalTransformations.map(t => [t.mutagen, t.star]));
      expect(actual).toEqual({ 科: '左輔', 權: '紫微', 忌: '武曲', 祿: '天梁' });
      expect(Object.keys(actual).filter(key => actual[key] !== original.starReactionMap[key])).toEqual(['科']);
    }
  });
  test('mutated star placement cannot pass oracle comparison or owned replay validation', () => {
    const changed = structuredClone(typed.chart.palaces);
    const star = changed[0].majorStars.pop()!;
    changed[1].majorStars.push(star);
    expect(() => expect(projection(changed)).toEqual(expected)).toThrow();
    const copy = JSON.parse(JSON.stringify(snapshot));
    copy.natal.ziwei.chart.primary.palaces[0].majorStars[0].name = 'FORGED';
    expect(() => validateChartSnapshot(copy, snapshot)).toThrow();
    expect(validateChartSnapshot(JSON.parse(JSON.stringify(snapshot)), snapshot)).toBe(snapshot);
  });
});
