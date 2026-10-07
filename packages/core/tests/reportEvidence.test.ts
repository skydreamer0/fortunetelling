import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { analyze, type AnalyzeInput, type Report } from '../src/core/analyze';
import { resolveCalculationSpec } from '../src/core/calculationSpec';
import { createTimeContext } from '../src/time/createTimeContext';
import { createBaziNatalBasisProvider } from '../src/calculators/bazi/natalBasis';
import * as pillars from '../src/calculators/bazi/pillars';
import * as baziRules from '../src/rules/bazi/evaluate';
import * as tenGodRules from '../src/rules/bazi/evaluateTenGods';
import * as ziweiRules from '../src/rules/ziwei/evaluate';
import * as timelineModule from '../src/timeline/buildTimeline';
import * as publicCore from '../src/index';
import type { Timeline, TimelineOptions } from '../src/timeline/buildTimeline';
import type { Signal, SignalWindow } from '../src/signals/types';

const ASOF = '2026-10-07';
const input: AnalyzeInput = { year: 1991, month: 10, day: 5, hour: 14, gender: 'female', name: 'Test Person' };
const volatile = new Set(['generatedAt', 'computedAt', 'durationMs', 'classifiedAt', 'exportedAt']);
const clean = (value: unknown) => JSON.parse(JSON.stringify(value, (key, v) => volatile.has(key) ? undefined : v));
const spies: Array<{ mockRestore(): void }> = [];
afterEach(() => { for (const spy of spies.splice(0)) spy.mockRestore(); });
const observe = (object: any, key: string) => { const spy = spyOn(object, key); spies.push(spy); return spy; };

function resolved(value = input) {
  const { profile, options, spec } = resolveCalculationSpec(value);
  const ctx = createTimeContext(profile, { dstOverlap: spec.identity.settings.time.dstOverlap });
  return { ctx, options, provider: createBaziNatalBasisProvider(ctx, options) };
}
function fullBuild(value = input, extra: Partial<TimelineOptions> = {}): { timeline: Timeline; signals: Signal[] } {
  const { ctx, options, provider } = resolved(value);
  const fn = (timelineModule as any).buildTimelineEvidenceWithBaziNatalBasis;
  return fn(ctx, { asOf: ASOF, ...options, systems: ['bazi', 'ziwei', 'numerology'], name: value.name, ...extra }, provider);
}
function assertReferences(timeline: Timeline, signals: Signal[], consensus?: Report['consensus']) {
  const byId = new Map(signals.map(s => [s.id, s]));
  expect(byId.size).toBe(signals.length);
  expect(signals.map(s => s.id)).toEqual([...byId.keys()].sort());
  const check = (id: string, domain: string, window: SignalWindow, system?: string) => {
    const signal = byId.get(id);
    expect(signal, `unresolved ${id}`).toBeDefined();
    expect(signal!.domain === domain).toBe(true);
    if (system) expect(signal!.system === system).toBe(true);
    expect(signal!.window).toEqual(window);
    return signal!;
  };
  for (const cell of [...timeline.years, ...timeline.months]) for (const domain of cell.domains) {
    for (const signal of domain.topSignals) expect(check(signal.id, domain.domain, cell.window, signal.system)).toEqual(signal);
    for (const [system, data] of Object.entries(domain.perSystem)) for (const id of data!.signalIds) check(id, domain.domain, cell.window, system);
    for (const [system, data] of Object.entries(domain.directionalEvidence?.perSystem ?? {})) for (const id of data!.signalIds) check(id, domain.domain, cell.window, system);
    for (const id of domain.conflict?.positive ?? []) expect(check(id, domain.domain, cell.window).valence).toBeGreaterThan(0);
    for (const id of domain.conflict?.negative ?? []) expect(check(id, domain.domain, cell.window).valence).toBeLessThan(0);
  }
  if (consensus) for (const year of consensus.years) {
    for (const agreement of year.highConsensus) for (const id of agreement.signalIds) expect(agreement.systems).toContain(check(id, agreement.domain, year.window).system);
    for (const conflict of year.conflicts) for (const side of [conflict.positive, conflict.negative]) for (const id of side.signalIds) expect(side.systems).toContain(check(id, conflict.domain, year.window).system);
  }
  if (consensus) for (const agreement of consensus.headlines.agreements) for (const id of agreement.signalIds) check(id, agreement.domain, agreement.window);
  if (consensus) for (const conflict of consensus.headlines.conflicts) for (const side of [conflict.positive, conflict.negative]) for (const id of side.signalIds) check(id, conflict.domain, conflict.window);
}
function withoutTop(timeline: Timeline) {
  return { ...timeline, years: timeline.years.map(c => ({ ...c, domains: c.domains.map(({topSignals, ...d}) => d) })),
    months: timeline.months.map(c => ({ ...c, domains: c.domains.map(({topSignals, ...d}) => d) })) };
}

describe('Report evidence is complete independently of display top N (#50)', () => {
  test('real Report resolves every per-system, directional and conflict reference before any replay', () => {
    const report = analyze(input, { asOf: ASOF });
    const ids = new Set(report.signals.map(s => s.id));
    const refs = new Set([...report.timeline.years, ...report.timeline.months].flatMap(c => c.domains.flatMap(d => Object.values(d.perSystem).flatMap(p => p!.signalIds))));
    // Baseline: 506 signals, 737 referenced ids, 231 missing.
    expect([...refs].filter(id => !ids.has(id))).toEqual([]);
    expect(refs.size).toBe(737);
    expect(report.signals.length).toBe(737);
    assertReferences(report.timeline, report.signals, report.consensus);
    const roundtrip = JSON.parse(JSON.stringify(report)) as Report;
    assertReferences(roundtrip.timeline, roundtrip.signals, roundtrip.consensus);
    expect(report.schemaVersion).toBe(7);
  });

  test('truncated conflict sources also resolve under a different clock and year', () => {
    const report = analyze({year:1990, month:6, day:15, hour:23, minute:30, gender:'female', useTrueSolarTime:false, ziHourConvention:'early'}, {asOf:'2027-01-15'});
    const ids = new Set(report.signals.map(s=>s.id));
    const conflicts = [...report.timeline.years,...report.timeline.months].flatMap(c=>c.domains.flatMap(d=>[...(d.conflict?.positive??[]),...(d.conflict?.negative??[])]));
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts.filter(id=>!ids.has(id))).toEqual([]);
    expect(ids.size).toBe(767);
    assertReferences(report.timeline,report.signals,report.consensus);
  });

  test('top N 0/1/default/Infinity changes only display lists, never evidence or score/proof', () => {
    const all = fullBuild(input, { topSignalsPerDomain: Infinity });
    for (const topSignalsPerDomain of [0, 1, undefined, Infinity]) {
      const result = fullBuild(input, { topSignalsPerDomain });
      expect(result.signals).toEqual(all.signals);
      expect(withoutTop(result.timeline)).toEqual(withoutTop(all.timeline));
      assertReferences(result.timeline, result.signals);
      for (const cell of [...result.timeline.years, ...result.timeline.months]) for (const domain of cell.domains) {
        expect(domain.topSignals.length).toBeLessThanOrEqual(topSignalsPerDomain ?? timelineModule.TOP_SIGNALS_PER_DOMAIN);
      }
    }
    expect(publicCore).not.toHaveProperty('buildTimelineEvidenceWithBaziNatalBasis');
  });

  test('same-pass collection does not rerun accurate natal calculations or per-window rules', () => {
    const p = observe(pillars, 'computePillars'); const l = observe(pillars, 'luckCycles');
    const b = observe(baziRules, 'evaluateBaziRules'), t = observe(tenGodRules, 'evaluateBaziTenGodRules'), z = observe(ziweiRules, 'evaluateZiweiRules');
    const report = analyze(input, { asOf: ASOF });
    expect(report.signals.length).toBe(737);
    expect(p).toHaveBeenCalledTimes(1); expect(l).toHaveBeenCalledTimes(1);
    for (const spy of [b,t,z]) expect(spy).toHaveBeenCalledTimes(17);
  });

  test('complete signals match the independent untruncated public timeline', () => {
    const {ctx, options} = resolved();
    const timeline = timelineModule.buildTimeline(ctx, {asOf: ASOF, ...options, name: input.name, systems: ['bazi','ziwei','numerology'], topSignalsPerDomain: Infinity});
    const byId = new Map([...timeline.years, ...timeline.months].flatMap(c => c.domains.flatMap(d => d.topSignals)).map(s => [s.id,s]));
    const report = analyze(input, {asOf: ASOF});
    expect(report.signals).toEqual([...byId.values()].sort((a,b)=>a.id.localeCompare(b.id)));
  });

  test('unknown birth time has only actually evaluated systems and complete references', () => {
    const report = analyze({...input, timeKnown:false, timeAccuracy:'unknown'}, {asOf:ASOF});
    assertReferences(report.timeline, report.signals, report.consensus);
    expect(new Set(report.signals.map(s=>s.system))).toEqual(new Set(['numerology']));
    expect(report.timeline.systems).toEqual(['numerology']);
  });

  test('A/B/A settings and asOf are isolated, deterministic, and public results remain mutable', () => {
    const a = {...input, hour:23, minute:10, useTrueSolarTime:false, ziHourConvention:'early' as const};
    const first = analyze(a, {asOf:ASOF});
    const original = clean(first);
    const b = analyze({...a,useTrueSolarTime:true,ziHourConvention:'late'}, {asOf:'2027-01-01'});
    assertReferences(b.timeline,b.signals,b.consensus);
    first.signals[0].evidence.text = 'caller mutation';
    expect(clean(analyze(a,{asOf:ASOF}))).toEqual(original);
  });
});
