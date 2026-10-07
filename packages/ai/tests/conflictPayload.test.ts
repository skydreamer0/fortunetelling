import { describe, expect, test } from 'bun:test';
import { aggregateSignals, createSignal, type Signal } from '../../core/src/signals/index';
import { analyze } from '../../core/src/core/analyze';
import { buildInterpretationPayload, PAYLOAD_VERSION } from '../src/payload';
import { buildCopyPrompt } from '../src/copyPrompt';
import { validateSections } from '../src/validate';
import { checkPastedAnswer } from '../src/pasteCheck';
import { checkAnswer } from '../src/checkAnswer';
import { loadQuestion } from './helpers';
import { localQuestion } from '../../../apps/web/src/model/askAi';

const window={grain:'month',start:'2027-01-01',end:'2027-01-31'} as const;
const make=(system:'bazi'|'ziwei',valence:number,index:number):Signal=>createSignal({system,ruleId:system+'.fixture',ruleVersion:1,target:String(index),domain:'career',trait:'opportunity',intensity:0.8,valence,window});
function fixture() {
  const signals=[make('bazi',1,0),make('ziwei',-1,1)];
  const agg=aggregateSignals(signals)[0];
  const timeline:any={schemaVersion:2,asOf:'2027-01-15',systems:['bazi','ziwei'],skippedSystems:[],conventions:{},bandCuts:[35,55,75],systemWeights:{bazi:1,ziwei:1},thresholds:{theta:.5,tau:.2},years:[],months:[{window,domains:[{...agg,band:'高',topSignals:signals}]}]};
  const report:any={schemaVersion:6,asOf:timeline.asOf,engines:[],signals,timeline};
  const question:any={...loadQuestion(),thresholds:timeline.thresholds,top:[{rank:1,window,score:80,band:'高',consensus:1,activityAgreement:2,highConsensus:false,conflict:[{domain:'career',...agg.conflict!}],supportSignals:[signals[0]],riskSignals:[signals[1]],domainScores:[{...agg,signalIds:signals.map(s=>s.id)}]}]};
  return {report,question,signals};
}
const conflicts=(built:ReturnType<typeof buildInterpretationPayload>):any[]=>[
  ...[...(built.payload.timeline?.years??[]),...(built.payload.timeline?.months??[])].flatMap(c=>c.domains.map(d=>d.conflict).filter(Boolean)),
  ...(built.payload.question?.top??[]).flatMap(w=>w.conflict??[]),
];
function assertResolved(built:ReturnType<typeof buildInterpretationPayload>) {
  const ids=new Set(built.payload.signals.map(s=>s.id));
  for(const conflict of conflicts(built))for(const id of [...conflict.positive,...conflict.negative])expect(ids.has(id),id).toBe(true);
}

describe('#30 AI conflict projection: preserve disagreement and only cite attached evidence',()=>{
  test('real Report payload no longer exposes unresolved conflict IDs',()=>{
    const report=analyze({year:1990,month:6,day:15,hour:23,minute:30,gender:'female',useTrueSolarTime:false,ziHourConvention:'early'},{asOf:'2027-01-15'});
    const built=buildInterpretationPayload(JSON.parse(JSON.stringify(report)),{maxChars:200000});
    assertResolved(built); // exact #68 baseline has three missing full IDs
    expect(conflicts(built).length).toBeGreaterThan(0);
  });

  test('Timeline and Question conflict IDs use the same short mapping as their signals',()=>{
    const f=fixture();const built=buildInterpretationPayload(f.report,{question:f.question,shortIds:true,budget:false});
    assertResolved(built);
    for(const conflict of conflicts(built)) {
      expect(conflict.positive).toEqual([f.signals[0].id.slice(0,12)]);
      expect(conflict.negative).toEqual([f.signals[1].id.slice(0,12)]);
      expect(conflict.omittedCount).toEqual({positive:0,negative:0});
    }
    expect(PAYLOAD_VERSION).toBe(3);
  });

  test('missing original evidence leaves a non-null one-sided or zero-sided conflict with exact counts',()=>{
    for(const keep of [0,1]) {
      const f=fixture();f.report.signals=f.signals.slice(0,keep);
      f.question.top[0].supportSignals=f.signals.slice(0,keep);f.question.top[0].riskSignals=[];
      const built=buildInterpretationPayload(f.report,{question:f.question,budget:false});
      expect(conflicts(built)).toHaveLength(2);
      for(const conflict of conflicts(built)) {
        expect(conflict.positive).toEqual(keep?[f.signals[0].id]:[]);expect(conflict.negative).toEqual([]);
        expect(conflict.omittedCount).toEqual({positive:1-keep,negative:1});
      }
      assertResolved(built);
    }
  });

  test('zero budget preserves both original conflict sides as omitted, without retaining dangling IDs',()=>{
    const f=fixture();const built=buildInterpretationPayload(f.report,{question:f.question,maxChars:0,shortIds:true});
    expect(built.signalIds.size).toBe(0);expect(conflicts(built)).toHaveLength(2);
    for(const conflict of conflicts(built))expect(conflict).toMatchObject({positive:[],negative:[],omittedCount:{positive:1,negative:1}});
    expect(built.payload.truncation.overBudget).toBe(true);assertResolved(built);
  });

  test('a missing full ID with a retained short prefix cannot impersonate retained evidence',()=>{
    const f=fixture();const retained='sig_aaaaaaaa00000001',missing='sig_aaaaaaaa00000002';
    f.signals[0].id=retained;
    f.report.timeline.months[0].domains[0].conflict={positive:[missing],negative:[f.signals[1].id]};
    const built=buildInterpretationPayload(f.report,{shortIds:true,budget:false});
    expect(built.payload.signals.map(s=>s.id)).toContain('sig_aaaaaaaa');
    expect(conflicts(built)[0]).toMatchObject({positive:[],negative:[f.signals[1].id.slice(0,12)],omittedCount:{positive:1,negative:0}});
    assertResolved(built);
  });

  test('two real selected full IDs that collide stay distinct full IDs in both conflict sides',()=>{
    const f=fixture();f.signals[0].id='sig_bbbbbbbb00000001';f.signals[1].id='sig_bbbbbbbb00000002';
    f.report.timeline.months[0].domains[0].conflict={positive:[f.signals[0].id],negative:[f.signals[1].id]};
    const built=buildInterpretationPayload(f.report,{shortIds:true,budget:false});
    expect(conflicts(built)[0]).toMatchObject({positive:[f.signals[0].id],negative:[f.signals[1].id],omittedCount:{positive:0,negative:0}});
    assertResolved(built);
  });

  test('fresh budget renders conserve each side count, remain deterministic, and do not mutate inputs',()=>{
    const f=fixture();const before=JSON.stringify(f);
    for(const maxChars of [0,1000,2000,3000,4000,8000,16000,1000,8000]) {
      const built=buildInterpretationPayload(f.report,{question:f.question,maxChars,shortIds:true});
      assertResolved(built);
      for(const conflict of conflicts(built))for(const side of ['positive','negative'])expect(conflict[side].length+conflict.omittedCount[side]).toBe(1);
      if(!built.payload.truncation.overBudget)expect(built.payloadJson.length).toBeLessThanOrEqual(maxChars);
      expect(buildInterpretationPayload(f.report,{question:f.question,maxChars,shortIds:true}).payloadJson).toBe(built.payloadJson);
    }
    expect(JSON.stringify(f)).toBe(before);
  });

  test('attached conflict references pass all three citation checks; omitted IDs do not',()=>{
    const f=fixture();f.report.signals=[f.signals[0]];
    const built=buildInterpretationPayload(f.report,{shortIds:true,budget:false});
    const conflict=conflicts(built)[0];assertResolved(built);
    const id=conflict.positive[0];const text=`這段時期可留意不同方向的傾向〔${id}〕。`;
    expect(validateSections([{heading:'方向',text,citations:[id]}],built).kept).toHaveLength(1);
    expect(checkPastedAnswer(built,text).ok).toBe(true);
    const lookup=(id:string)=>built.payload.signals.find(s=>s.id===id)??null;
    expect(checkAnswer(text,{signalLookup:lookup}).ok).toBe(true);
    const missing=f.signals[1].id;
    expect(validateSections([{heading:'方向',text,citations:[missing]}],built).dropped[0].reasons.some(r=>r.code==='unknown_citation')).toBe(true);
    expect(checkPastedAnswer(built,`來源〔${missing}〕`).ok).toBe(false);
    expect(checkAnswer(`來源〔${missing}〕`,{signalLookup:lookup}).ok).toBe(false);
  });

  test('real Question copy prompt shrinks from actual payload size and respects 16k',()=>{
    const report=analyze({year:1990,month:6,day:15,hour:23,minute:30,gender:'female',useTrueSolarTime:false,ziHourConvention:'early'},{asOf:'2027-01-15'});
    const question='2027 年何時轉職？';const answer=localQuestion(JSON.parse(JSON.stringify(report)),question)!.answer;
    expect(answer).not.toBeNull();
    const copy=buildCopyPrompt(JSON.parse(JSON.stringify(report)),{question,questionAnswer:answer,maxChars:16000});
    expect(copy.charCount).toBeLessThanOrEqual(16000); // previous safety-net stalled at16013 despite5 retries
    assertResolved(copy.payload);
  });

  test('no original conflict stays null; copy prompts retain an explicit omission explanation',()=>{
    const f=fixture();f.report.timeline.months[0].domains[0].conflict=null;
    expect(buildInterpretationPayload(f.report,{budget:false}).payload.timeline!.months[0].domains[0].conflict).toBeNull();
    const prompt=buildCopyPrompt(f.report,{maxChars:16000});
    expect(prompt.text).toContain('omittedCount');
    expect(prompt.text).toContain('不得補造');
  });
});
