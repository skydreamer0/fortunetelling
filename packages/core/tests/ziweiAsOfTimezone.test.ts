import { beforeAll, describe, expect, test } from 'bun:test';

const moduleRoot=new URL('../src/',import.meta.url).href;
const zones=['UTC','Asia/Taipei','America/New_York','Pacific/Apia'];
const script=`
import {setSystemTime} from 'bun:test';
import {analyze} from ${JSON.stringify(moduleRoot+'core/analyze.ts')};
import {resolveCalculationSpec} from ${JSON.stringify(moduleRoot+'core/calculationSpec.ts')};
import {createTimeContext} from ${JSON.stringify(moduleRoot+'time/createTimeContext.ts')};
import {ZiweiEngine} from ${JSON.stringify(moduleRoot+'engines/ZiweiEngine.ts')};
import {ResolvedBirthData,ziweiCalculator} from ${JSON.stringify(moduleRoot+'calculators/ziwei/calculator.ts')};
import {timeIndexFrom} from ${JSON.stringify(moduleRoot+'calculators/ziwei/astrolabe.ts')};
import {toZiweiZiConvention} from ${JSON.stringify(moduleRoot+'core/analyzeInput.ts')};
const inputs=[
 {year:1991,month:10,day:5,hour:14,minute:0,gender:'female',cityId:'taipei'},
 {year:1990,month:6,day:15,hour:23,minute:30,gender:'female',cityId:'taipei',useTrueSolarTime:false,ziHourConvention:'early'},
];
const cases=[['before','2026-02-16'],['boundary','2026-02-17'],['after','2026-02-18'],['date-object',new Date('2026-02-17T00:00:00Z')],['late-utc',new Date('2026-02-16T23:30:00Z')],['plus-offset','2026-02-17T00:30:00+08:00'],['minus-offset','2026-02-16T20:30:00-05:00']];
const value=(r,id)=>r.components.find(c=>c.id===id)?.value;
const volatile=new Set(['computedAt','durationMs','generatedAt','classifiedAt','exportedAt']);
const clean=v=>JSON.parse(JSON.stringify(v,(k,v)=>volatile.has(k)?undefined:v));
const hash=v=>new Bun.CryptoHasher('sha256').update(JSON.stringify(clean(v))).digest('hex');
const results=[];
for(const [index,input] of inputs.entries()) {
 const {birth,profile,options,spec}=resolveCalculationSpec(input);
 const ctx=createTimeContext(profile,{dstOverlap:spec.identity.settings.time.dstOverlap});
 const config={...options,ziHourConvention:toZiweiZiConvention(options.ziHourConvention)};
 const time=timeIndexFrom(ctx,config);const resolvedBirth=new ResolvedBirthData(birth,time);
 for(const [key,asOf] of cases) {
  const legacy=new ZiweiEngine({asOf}).run(resolvedBirth);
  const calc=ziweiCalculator.calculate(ctx,{...config,asOf});
  const main=['boundary','late-utc'].includes(key)?analyze(input,{asOf}):null;
  const engine=main?.engines.find(e=>e.engineId==='ziwei');
  const record={index,key,asOf:new Date(asOf).toISOString().slice(0,10),errors:legacy.errors,
   annual:value(legacy,'flyingStars_yearly'),age:value(legacy,'xiaoXian_current'),
   legacy:hash(legacy),components:hash(legacy.components),natal:hash(legacy.components.filter(c=>!['daXian','xiaoXian','flyingStars'].includes(c.category))),
   calcComponents:hash(calc.components),calcYearly:calc.chart.yearly,
   sequences:hash({decades:calc.chart.decadeSequence,yearly:calc.chart.yearlySequence,monthly:calc.chart.monthlySequence}),
   main:engine?hash(engine.components):null,timeline:main?hash(main.timeline):null,
   mainAsOf:main?.asOf??null};
  results.push(record);
 }
 setSystemTime(new Date('2026-02-16T23:30:00Z'));
 const implicit=new ZiweiEngine({asOf:null}).run(resolvedBirth),explicit=new ZiweiEngine({asOf:new Date('2026-02-16T23:30:00Z')}).run(resolvedBirth);
 results.push({index,key:'null-clock',implicit:hash(implicit),explicit:hash(explicit),annual:value(implicit,'flyingStars_yearly'),age:value(implicit,'xiaoXian_current')});
 setSystemTime();
 const invalid=new ZiweiEngine({asOf:'invalid-date'}).run(resolvedBirth);
 const invalidDate=new ZiweiEngine({asOf:new Date(NaN)}).run(resolvedBirth);
 let calculatorInvalid='',calculatorMissing='';
 try{ziweiCalculator.calculate(ctx,{...config,asOf:'invalid-date'})}catch(e){calculatorInvalid=e.message}
 try{ziweiCalculator.calculate(ctx,config)}catch(e){calculatorMissing=e.message}
 results.push({index,key:'invalid',errors:invalid.errors,dateErrors:invalidDate.errors,componentCount:invalid.components.length,calculatorInvalid,calculatorMissing});
 const unknown=analyze({...input,timeKnown:false,timeAccuracy:'unknown'},{asOf:'2026-02-17'});
 const unknownZiwei=unknown.engines.find(e=>e.engineId==='ziwei');
 results.push({index,key:'unknown',components:unknownZiwei.components,errors:unknownZiwei.errors,reason:unknownZiwei.meta.unavailableReason,systems:unknown.timeline.systems});
}
console.log(JSON.stringify(results));
`;
let results:Record<string,any[]>;
beforeAll(()=>{
 results=Object.fromEntries(zones.map(TZ=>{
  const child=Bun.spawnSync([process.execPath,'--eval',script],{env:{...process.env,TZ}});
  expect(child.exitCode,new TextDecoder().decode(child.stderr)).toBe(0);
  return [TZ,JSON.parse(new TextDecoder().decode(child.stdout).trim())];
 }));
},120000);
const row=(zone:string,index:number,key:string)=>results[zone].find(r=>r.index===index&&r.key===key)!;

describe('#26 Ziwei asOf uses the declared UTC calendar date on every host',()=>{
 test('CNY boundary Date/string inputs cannot move the annual chart or age across host zones',()=>{
  for(const zone of zones)for(const index of [0,1])for(const key of ['before','boundary','after','date-object','late-utc','plus-offset','minus-offset']) {
   const value=row(zone,index,key),utc=row('UTC',index,key);
   expect(value.annual,zone+'/'+key).toEqual(utc.annual);
   expect(value.age,zone+'/'+key).toEqual(utc.age);
   expect(value.legacy,zone+'/'+key).toBe(utc.legacy);
   expect(value.calcComponents,zone+'/'+key).toBe(utc.calcComponents);
   expect(value.calcYearly,zone+'/'+key).toEqual(utc.calcYearly);
   expect(value.errors).toEqual([]);
  }
 });
 test('literal year-boundary oracle matches the output asOf day, including offset timestamps',()=>{
  for(const zone of zones)for(const index of [0,1])for(const key of ['before','boundary','after','date-object','late-utc','plus-offset','minus-offset']) {
   const value=row(zone,index,key),after=value.asOf>='2026-02-17';
   expect(value.annual.heavenlyStem+value.annual.earthlyBranch).toBe(after?'丙午':'乙巳');
   expect(value.age.nominalAge).toBe((index===0?35:36)+(after?1:0));
   expect(value.annual.asOf).toBe(value.asOf);expect(value.age.asOf).toBe(value.asOf);
  }
 });
 test('actual analyze main chart and typed calculator agree; natal and timeline/sequence remain host-independent',()=>{
  for(const zone of zones)for(const index of [0,1])for(const key of ['boundary','late-utc']) {
   const value=row(zone,index,key),utc=row('UTC',index,key);
   expect(value.main).toBe(value.calcComponents);
   expect(value.main).toBe(utc.main);
   expect(value.mainAsOf).toBe(value.asOf);
   expect(value.natal).toBe(utc.natal);expect(value.timeline).toBe(utc.timeline);expect(value.sequences).toBe(utc.sequences);
  }
 });
 test('null keeps the legacy clock fallback while calculators still require explicit asOf',()=>{
  for(const zone of zones)for(const index of [0,1]) {
   const value=row(zone,index,'null-clock');expect(value.implicit).toBe(value.explicit);
   expect(value.annual.heavenlyStem+value.annual.earthlyBranch).toBe('乙巳');
   expect(value.age.nominalAge).toBe(index===0?35:36);
   expect(row(zone,index,'invalid').calculatorMissing).toContain('requires config.asOf');
  }
 });
 test('invalid dates keep explicit existing failures and unknown time still skips Ziwei',()=>{
  for(const zone of zones)for(const index of [0,1]) {
   const invalid=row(zone,index,'invalid');expect(invalid.errors).toEqual(['計算失敗：Invalid Date']);expect(invalid.dateErrors).toEqual(invalid.errors);
   expect(invalid.componentCount).toBe(0);expect(invalid.calculatorInvalid).toBe('Invalid asOf date: invalid-date');
   const unknown=row(zone,index,'unknown');expect(unknown.components).toEqual([]);expect(unknown.errors).toEqual([]);expect(unknown.reason).toBe('unknown-time');expect(unknown.systems).toEqual(['numerology']);
  }
 });
});
