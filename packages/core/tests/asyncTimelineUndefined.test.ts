import {expect,test} from 'vitest';
import {createTimeContext} from '../src/time';
import {buildTimelineAsync,replayAsyncTimeline,buildTimeline} from '../src/timeline/buildTimeline';
import {createAsyncEphemerisCalculationSpec} from '../src/core/asyncEphemerisCalculationSpec';
const ctx=()=>createTimeContext({date:'1990-05-17',time:'23:10',timeAccuracy:'exact',gender:'female',birthplace:{label:'Synthetic',lat:23,lng:113,timezone:'Asia/Taipei'}});
const opts=()=>({asOf:'2026-01-01',years:1,includeMonths:false,useTrueSolarTime:false,ziHourConvention:'early' as const,systems:['numerology'] as const});
test('explicit undefined ephemeris settings remain rejected at actual async entry',async()=>{
 const ephemeris={jyotish:{node:undefined}} as any;
 expect(()=>createAsyncEphemerisCalculationSpec(ephemeris)).toThrow();
 expect(()=>buildTimeline(ctx(),{...opts(),ephemeris})).toThrow();
 await expect(buildTimelineAsync(ctx(),{...opts(),ephemeris})).rejects.toThrow();
});
test('recording also rejects explicit undefined setting rather than replacing with defaults',async()=>{
 await expect(buildTimelineAsync(ctx(),{...opts(),ephemeris:{humanDesign:{sampleDays:{year:undefined}}}} as any,{captureReplay:true})).rejects.toThrow();
});
test('independent extra-field, implementation, rule, hash and hidden payload controls',async()=>{
 const record=await buildTimelineAsync(ctx(),opts(),{captureReplay:true});
 for(const mutate of [
 (r:any)=>r.extra='not allowed', (r:any)=>r.extra=undefined, (r:any)=>r.spec.implementation='future',
 (r:any)=>r.spec.ruleDigests.baziRules='forged', (r:any)=>r.execution.resultHash='forged',
 (r:any)=>r.spec.options.futureOption=true,
 (r:any)=>Object.defineProperty(r.timeline,'hidden',{value:1})]) {
  const r=structuredClone(record);mutate(r);await expect(replayAsyncTimeline(r)).rejects.toThrow();
 }
});
test('independent retained source and nested returned proof ownership',async()=>{
 const c=ctx(),o={...opts(),systems:['bazi','ziwei','numerology'] as any,systemWeights:{bazi:0.8,ziwei:0.7,numerology:0.6}};
 const before=structuredClone(c),options=structuredClone(o);
 const pending=buildTimelineAsync(c,o,{captureReplay:true});c.profile.birthplace.lng=0;o.systemWeights.ziwei=0;o.systems.splice(0);
 const r=await pending;expect(r.timeline).toEqual(buildTimeline(before,options));
 expect(()=>{(r.timeline.years[0].domains as any).push({})}).toThrow();
 expect(await replayAsyncTimeline(JSON.parse(JSON.stringify(r)))).toEqual(r);
});
test('explicit undefined system weight remains invalid rather than defaulting to one',async()=>{
 const options={...opts(),systemWeights:{numerology:undefined}} as any;
 expect(()=>buildTimeline(ctx(),options)).toThrow();
 await expect(buildTimelineAsync(ctx(),options)).rejects.toThrow();
});

test('ordinary and recording async preserve all explicit malformed ephemeris and weight values', async () => {
  for (const extra of [
    { ephemeris: { jyotish: undefined } },
    { ephemeris: { jyotish: { ayanamsa: undefined } } },
    { ephemeris: { jyotish: { node: undefined } } },
    { ephemeris: { humanDesign: { sampleDays: { year: undefined } } } },
    { systemWeights: { numerology: undefined } },
  ]) {
    const options = { ...opts(), ...extra } as any;
    expect(() => buildTimeline(ctx(), options)).toThrow();
    await expect(buildTimelineAsync(ctx(), options)).rejects.toThrow();
    await expect(buildTimelineAsync(ctx(), options, { captureReplay: true })).rejects.toThrow();
  }
});

test('legal optional undefined retains existing output and JSON replay compatibility', async () => {
  const options = { ...opts(), name: undefined, years: undefined, includeMonths: undefined,
    systemWeights: undefined, topSignalsPerDomain: undefined, ephemeris: undefined };
  const expected = buildTimeline(ctx(), options);
  expect(await buildTimelineAsync(ctx(), options)).toEqual(expected);
  const record = await buildTimelineAsync(ctx(), options, { captureReplay: true });
  expect(record.timeline).toEqual(expected);
  expect(Object.hasOwn(record.spec.options, 'name')).toBe(false);
  expect(await replayAsyncTimeline(JSON.parse(JSON.stringify(record)))).toEqual(record);
});
