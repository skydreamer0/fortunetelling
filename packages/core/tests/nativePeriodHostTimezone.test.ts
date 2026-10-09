import { expect, test } from 'bun:test';

const moduleUrl = new URL('../src/period/index.ts', import.meta.url).href;
const script = `
import { dateBoundaryInstant, nativePeriodFromDates, splitPeriodInterval } from ${JSON.stringify(moduleUrl)};
Intl.DateTimeFormat = function () { throw new Error('host Intl must not be used'); };
const capture = fn => { try { return fn(); } catch(e) { return { error: e.message }; } };
const result = {
  dates: ['Asia/Taipei','Asia/Kathmandu','America/New_York','US/Eastern'].map(zone => dateBoundaryInstant('2024-03-10', zone)),
  skipped: capture(() => dateBoundaryInstant('2011-12-30', 'Pacific/Apia')),
  overlap: ['earlier','later'].map(choice => dateBoundaryInstant('2024-11-03', 'America/Havana', choice)),
  period: nativePeriodFromDates({ periodId: 'synthetic', system: 'ziwei', kind: 'month', timezone: 'America/New_York', startDate: '2024-03-10', endDateExclusive: '2024-03-11' }),
  split: splitPeriodInterval({ startInstant: '2024-03-10T00:00:00-05:00', endExclusive: '2024-03-11T00:00:00-04:00' }, ['2024-03-10T12:00:00-04:00']),
};
console.log(JSON.stringify(result));
`;

test('#55 identical output under four host timezones without Intl fallback', () => {
  const outputs = ['UTC', 'Asia/Taipei', 'America/New_York', 'Pacific/Apia'].map(TZ => {
    const child = Bun.spawnSync([process.execPath, '--eval', script], { env: { ...process.env, TZ } });
    expect(child.exitCode, child.stderr.toString()).toBe(0);
    return JSON.parse(child.stdout.toString());
  });
  for (const output of outputs) expect(output).toEqual(outputs[0]);
  expect(outputs[0].period.startInstant).toBe('2024-03-10T05:00:00.000Z');
  expect(outputs[0].period.endExclusive).toBe('2024-03-11T04:00:00.000Z');
}, 30000);
