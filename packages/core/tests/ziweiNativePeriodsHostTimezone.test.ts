import { expect, test } from 'bun:test';

const moduleUrl = new URL('../src/calculators/ziwei/index.ts', import.meta.url).href;
const script = `
import { createAstrolabe, yearlySequence, monthlySequence, decadeSequence,
  ziweiYearlyNativePeriod, ziweiMonthlyNativePeriod, ziweiDecadeNativePeriod } from ${JSON.stringify(moduleUrl)};
const hostOffset = new Date('2025-01-29T00:00:00Z').getTimezoneOffset();
Intl.DateTimeFormat = function () { throw new Error('host Intl fallback is forbidden'); };
const a = createAstrolabe('1991-10-5', 7, 'female');
const years = yearlySequence(a, 2025, 2), months = monthlySequence(a, 2025), decades = decadeSequence(a);
const capture = fn => { try { return fn(); } catch(e) { return {error: e.message}; } };
const outputs = ['Asia/Taipei', 'America/New_York', 'Asia/Kathmandu'].map(timezone => ({
  years: years.map(p => ziweiYearlyNativePeriod(p, {timezone})),
  months: months.map(p => ziweiMonthlyNativePeriod(p, {timezone})),
  decades: decades.map(p => ziweiDecadeNativePeriod(p, {timezone})),
}));
const span = {...months[0], start:'2024-11-03', end:'2024-11-03'};
const results = {outputs,
  gap: capture(() => ziweiMonthlyNativePeriod({...span,start:'2011-12-30',end:'2011-12-30'}, {timezone:'Pacific/Apia'})),
  overlap: capture(() => ziweiMonthlyNativePeriod(span, {timezone:'America/Havana'})),
  choices: ['earlier','later'].map(startOverlap => ziweiMonthlyNativePeriod(span, {timezone:'America/Havana',startOverlap})),
};
console.log(JSON.stringify({hostOffset, results}));
`;

test('#57 adapter outputs are identical across four real host TZs without Intl fallback', () => {
  const rows = ['UTC', 'Asia/Taipei', 'America/New_York', 'Pacific/Apia'].map(TZ => {
    const result = Bun.spawnSync([process.execPath, '--eval', script], { env: { ...process.env, TZ } });
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    return JSON.parse(result.stdout.toString());
  });
  expect(new Set(rows.map(row => row.hostOffset)).size).toBe(4);
  for (const row of rows) expect(row.results).toEqual(rows[0].results);
  const result = rows[0].results;
  expect(result.outputs).toHaveLength(3);
  expect(result.outputs[0].years[0].startInstant).toBe('2025-01-28T16:00:00.000Z');
  expect(result.outputs[0].months[6].startInstant).toBe('2025-08-08T16:00:00.000Z');
  expect(result.outputs[0].decades[3].startInstant).toBe('2023-01-21T16:00:00.000Z');
  expect(result.gap.error).toContain('nonexistent');
  expect(result.overlap.error).toContain('ambiguous');
  expect(result.choices.map((p: { startInstant: string }) => p.startInstant))
    .toEqual(['2024-11-03T04:00:00.000Z', '2024-11-03T05:00:00.000Z']);
}, 30000);
