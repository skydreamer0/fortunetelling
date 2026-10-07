import { beforeAll, describe, expect, test } from 'bun:test';

// Contract: calculators/types.ts says these dates come from the user's input
// local calendar day; ARCHITECTURE-V2 §§3.1/3.4 and the timeline use profile.date.
const moduleRoot = new URL('../src/', import.meta.url).pathname;
const zones = ['UTC', 'Asia/Taipei', 'America/New_York', 'Pacific/Apia'];
const script = `
import { analyze } from ${JSON.stringify(moduleRoot + 'core/analyze.ts')};
import { createTimeContext } from ${JSON.stringify(moduleRoot + 'time/createTimeContext.ts')};
import { BirthData } from ${JSON.stringify(moduleRoot + 'core/models/BirthData.ts')};
import { NumerologyEngine } from ${JSON.stringify(moduleRoot + 'engines/NumerologyEngine.ts')};
import { DreamspellEngine } from ${JSON.stringify(moduleRoot + 'engines/DreamspellEngine.ts')};
import { numerologyCalculator, tzolkinCalculator } from ${JSON.stringify(moduleRoot + 'calculators/index.ts')};
const asOf = '2026-07-11';
const apia = { label: 'Synthetic Apia', lat: -13.8333, lng: -171.75, timezone: 'Pacific/Apia' };
const kiritimati = { label: 'Synthetic Kiritimati', lat: 1.8721, lng: -157.4278, timezone: 'Pacific/Kiritimati' };
const ny = { label: 'Synthetic NY', lat: 40.7128, lng: -74.006, timezone: 'America/New_York' };
const cases = [
  ['apia-before', '2011-12-29', '12:00', apia], ['apia-gap', '2011-12-30', '12:00', apia], ['apia-after', '2011-12-31', '12:00', apia],
  ['kiritimati-before', '1994-12-30', '12:00', kiritimati], ['kiritimati-gap', '1994-12-31', '12:00', kiritimati], ['kiritimati-after', '1995-01-01', '12:00', kiritimati],
  ['ny-gap', '2026-03-08', '02:30', ny], ['ny-overlap', '2026-11-01', '01:30', ny],
];
const plain = v => JSON.parse(JSON.stringify(v));
const value = (components, id) => components.find(c => c.id === id)?.value;
const volatile = new Set(['generatedAt','computedAt','durationMs','classifiedAt','exportedAt']);
const hash = v => new Bun.CryptoHasher('sha256').update(JSON.stringify(v, (k,v) => volatile.has(k) ? undefined : v)).digest('hex');
const capture = fn => { try { fn(); return null; } catch (e) { return e.message; } };
const out = [];
for (const [key,date,time,birthplace] of cases) {
  const profile = { date, time, timeAccuracy: 'exact', gender: 'female', name: 'ALICE', birthplace };
  const ctx = createTimeContext(profile), unknownCtx = createTimeContext({ ...profile, time: null, timeAccuracy: 'unknown' });
  const before = JSON.stringify(ctx);
  const [year,month,day] = date.split('-').map(Number), [hour,minute] = time.split(':').map(Number);
  const input = { year,month,day,hour,minute,gender:'female',name:'ALICE',birthplace };
  const birth = new BirthData(input);
  const num = numerologyCalculator.calculate(ctx,{asOf}), tz = tzolkinCalculator.calculate(ctx);
  const numUnknown = numerologyCalculator.calculate(unknownCtx,{asOf}), tzUnknown = tzolkinCalculator.calculate(unknownCtx);
  const expectedNum = new NumerologyEngine({asOf}).run(birth), expectedTz = new DreamspellEngine().run(birth);
  const report = ['apia-before','apia-gap','apia-after','kiritimati-gap'].includes(key) ? analyze(input,{asOf}) : null;
  out.push({ key, date, local: ctx.local, gap: ctx.flags.find(f => f.code === 'dst_gap') ?? null,
    overlap: ctx.flags.find(f => f.code === 'dst_overlap') ?? null, profileDate: ctx.profile.date,
    num: plain(num), tz: plain(tz), numUnknown: plain(numUnknown), tzUnknown: plain(tzUnknown),
    expectedNum: expectedNum.components, expectedTz: expectedTz.components,
    mainNum: report?.engines.find(e => e.engineId === 'numerology').components ?? null,
    mainTz: report?.engines.find(e => e.engineId === 'dreamspell').components ?? null,
    reportGap: report?.timeContext.flags.find(f => f.code === 'dst_gap') ?? null,
    timeline: report ? hash(report.timeline) : null,
    sourceUnchanged: before === JSON.stringify(ctx),
    numbers: { lifePath: num.chart.lifePath?.number, personalYear: num.chart.personalYear?.number, kin: tz.chart.kin },
    overrides: ['BOB',''].map(name => ({ name,
      actual: numerologyCalculator.calculate(ctx,{asOf,name}).components,
      expected: new NumerologyEngine({asOf}).run(new BirthData({...input,name})).components })),
    missingAsOf: capture(() => numerologyCalculator.calculate(ctx)),
    invalidAsOf: capture(() => numerologyCalculator.calculate(ctx,{asOf:'not-a-date'})),
  });
}
console.log(JSON.stringify(out));
`;

let results: Record<string, any[]>;
beforeAll(() => {
  results = Object.fromEntries(zones.map(TZ => {
    const child = Bun.spawnSync([process.execPath, '--eval', script], { env: { ...process.env, TZ } });
    expect(child.exitCode, new TextDecoder().decode(child.stderr)).toBe(0);
    return [TZ, JSON.parse(new TextDecoder().decode(child.stdout).trim())];
  }));
}, 120000);
const row = (zone: string, key: string) => results[zone].find(r => r.key === key)!;

describe('#26/#54 date-only calculators retain the input calendar day across clock gaps', () => {
  test('Numerology uses the same input birth date as the real main chart on a skipped day', () => {
    for (const zone of zones) for (const key of ['apia-gap', 'kiritimati-gap']) {
      const r = row(zone, key);
      expect(r.num.components, zone + '/' + key).toEqual(r.mainNum);
      expect(r.num.components).toEqual(r.expectedNum);
    }
  });

  test('Tzolkin uses the same input birth date as the real main chart on a skipped day', () => {
    for (const zone of zones) for (const key of ['apia-gap', 'kiritimati-gap']) {
      const r = row(zone, key);
      expect(r.tz.components, zone + '/' + key).toEqual(r.mainTz);
      expect(r.tz.components).toEqual(r.expectedTz);
    }
  });

  test('adding a birth time cannot change a date-only chart, including a gap across New Year', () => {
    for (const zone of zones) for (const r of results[zone]) {
      expect(r.num.chart, zone + '/' + r.key).toEqual(r.numUnknown.chart);
      expect(r.tz.chart, zone + '/' + r.key).toEqual(r.tzUnknown.chart);
    }
  });

  test('literal values use the original day rather than the shifted day', () => {
    for (const zone of zones) {
      expect(row(zone, 'apia-gap').numbers).toEqual({ lifePath: 1, personalYear: 7, kin: 111 });
      expect(row(zone, 'kiritimati-gap').numbers).toEqual({ lifePath: 3, personalYear: 8, kin: 147 });
    }
  });

  test('adjacent valid days and same-day DST gap/overlap preserve existing engine parity', () => {
    for (const zone of zones) for (const key of ['apia-before','apia-after','kiritimati-before','kiritimati-after','ny-gap','ny-overlap']) {
      const r = row(zone, key);
      expect(r.num.components).toEqual(r.expectedNum);
      expect(r.tz.components).toEqual(r.expectedTz);
    }
  });

  test('date correction never changes shared resolved clocks, flags, or confirmation requirements', () => {
    for (const zone of zones) for (const [key, requested, resolved] of [
      ['apia-gap','2011-12-30','2011-12-31'], ['kiritimati-gap','1994-12-31','1995-01-01'],
    ]) {
      const r = row(zone, key);
      expect(r.profileDate).toBe(requested);
      expect(r.local.iso).toBe(resolved + 'T12:00:00+14:00');
      expect(r.gap.data).toEqual({ requestedLocal: requested + 'T12:00:00', resolvedLocal: resolved + 'T12:00:00', gapMinutes: 1440, requiresConfirmation: true });
      expect(r.reportGap).toEqual(r.gap);
      expect(r.sourceUnchanged).toBe(true);
    }
  });

  test('name overrides and required asOf behavior stay compatible', () => {
    for (const zone of zones) for (const r of results[zone]) {
      for (const override of r.overrides) expect(override.actual, r.key + '/' + override.name).toEqual(override.expected);
      expect(r.missingAsOf).toBe('numerology calculator requires config.asOf (D-014: no implicit "today")');
      expect(r.invalidAsOf).toBe('Invalid asOf date: not-a-date');
    }
  });

  test('all chart values and unchanged timeline content are host-independent', () => {
    for (const zone of zones) expect(results[zone]).toEqual(results.UTC);
  });
});
