import { expect, test } from 'bun:test';

const url = new URL('../src/index.ts', import.meta.url).href;
const script = `
import {createTimeContext,luckCycles,annualPillars,monthlyPillars,
  baziAnnualNativePeriod,baziMonthlyNativePeriod,baziLuckCycleNativePeriod} from ${JSON.stringify(url)};
const hostOffset = new Date('2026-01-01T00:00:00Z').getTimezoneOffset();
Intl.DateTimeFormat = function () { throw Error('host Intl fallback forbidden'); };
const result = ['Asia/Taipei','America/New_York','Asia/Kathmandu'].map(timezone => {
  const ctx = createTimeContext({date:'1995-07-16',time:'22:00',timeAccuracy:'exact',gender:'male',
    birthplace:{label:'Synthetic location',lat:25.0375,lng:121.5637,timezone}});
  const source = luckCycles(ctx,'male',{count:3});
  return {source, years:annualPillars(2025,2).map((p,i)=>baziAnnualNativePeriod(p,{timezone,periodId:'year:'+i})),
    months:monthlyPillars(2026).map((p,i)=>baziMonthlyNativePeriod(p,{timezone,periodId:'month:'+i})),
    luck:source.steps.map(s=>baziLuckCycleNativePeriod(source,s.index,{timezone,periodId:'luck:'+s.index}))};
});
console.log(JSON.stringify({hostOffset,result}));
`;

test('#56 actual adapters and source clocks agree across four host TZs without Intl fallback', () => {
  const rows = ['UTC','Asia/Taipei','America/New_York','Pacific/Apia'].map(TZ => {
    const child = Bun.spawnSync([process.execPath, '--eval', script], { env: { ...process.env, TZ } });
    expect(child.exitCode, child.stderr.toString()).toBe(0);
    return JSON.parse(child.stdout.toString());
  });
  expect(new Set(rows.map(row => row.hostOffset)).size).toBe(4);
  for (const row of rows) expect(row.result).toEqual(rows[0].result);
  expect(rows[0].result).toHaveLength(3);
  for (const item of rows[0].result) {
    expect(item.years).toHaveLength(2); expect(item.months).toHaveLength(12); expect(item.luck).toHaveLength(3);
    expect(item.years[0].startInstant).toBe('2025-02-03T14:10:28.000Z');
    expect(item.luck[0].endExclusive).toBe(item.luck[1].startInstant);
  }
}, 30000);
