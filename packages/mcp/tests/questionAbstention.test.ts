import { describe, expect, test } from 'bun:test';
import { createSignal } from '@fortune/core';
import { callTool } from '../src/tools';

const range = {start:'2027-01',end:'2027-03'};
const base = {profileId:'synthetic',asOf:'2027-01-01'};
function context(values:number[]) {
  const all:any[]=[];
  const analysis:any={asOf:base.asOf,ctx:{flags:[]},timeline:{systems:['bazi','ziwei'],skippedSystems:[],systemWeights:{bazi:1,ziwei:1},thresholds:{theta:.5,tau:.2}},
    monthSignals:()=>new Map(values.map((intensity,index)=>{
      const month=`2027-0${index+1}`,window={grain:'month' as const,start:month+'-01',end:month+'-28'};
      const signals=(['wealth','contract'] as const).map(domain=>createSignal({system:'bazi',ruleId:'test.abstention',ruleVersion:1,domain,trait:'opportunity',intensity,valence:.5,window,target:domain}));
      all.push(...signals);return [month,signals];
    })),shortIds:(ids:string[])=>ids,rememberQuestionEvidence:()=>{},directionalEvidence:()=>[],findSignal:(id:string)=>all.find(s=>s.id===id)};
  return {store:{} as any,analyzer:{get:async(profile:string,asOf:string)=>{expect(profile).toBe(base.profileId);expect(asOf).toBe(base.asOf);return analysis}} as any};
}
async function call(ctx:ReturnType<typeof context>,name:string,args:unknown) { const r=await callTool(name,args,ctx);return {...r,json:JSON.parse(r.text)}; }

describe('#45 MCP actual schemas/handlers with synthetic month sources',()=>{
  for(const [values,status] of [[[0,0,0],'insufficient_evidence'],[[.1,.2,.3],'no_clear_advantage'],[[.8,.8,.8],'tied'],[[.8,.7,.6],'ranked']] as const) {
    test(`compact, detail and check_answer agree: ${status}`,async()=>{
      const ctx=context([...values]),args={...base,category:'investment',range};
      const compact=await call(ctx,'answer_question',args),detail=await call(ctx,'answer_question',{...args,detail:true});
      expect(compact.isError).toBe(false); expect(detail.isError).toBe(false);
      for(const response of [compact,detail]) {
        expect(response.json.data.status).toBe(status);
        expect(response.json.data.top.length).toBe(status==='ranked'?3:0);
        expect(response.json.data.rankingKind).toBe(status==='ranked'?'ranked':'diagnostic');
      }
      if(status!=='ranked') {
        expect(detail.json.data.ranking.every((row:any)=>row.rank===null)).toBe(true);
        expect(compact.json.data.abstentionReasons.length).toBeGreaterThan(0);
        expect(compact.json.data.experimentalSensitivity).toBeNull();
        expect(detail.json.data.ranking.map((row:any)=>row.window.start)).toEqual(['2027-01-01','2027-02-01','2027-03-01']);
      }
      const checked=await call(ctx,'check_answer',{...base,questionContext:compact.json.data.questionContext,answerText:'推薦三月。'});
      expect(checked.isError).toBe(false);expect(checked.json.data.questionStatus).toBe(status);
      expect(checked.json.data.issues.map((i:any)=>i.code)).toEqual(status==='ranked'?[]:['month_recommendation_when_abstained']);
    });
  }
  test('systems context is replayed; a caller cannot send a forged status or escape range bounds',async()=>{
    const ctx=context([.8,.7,.6]),q={category:'investment',range,systems:['ziwei']};
    const a=await call(ctx,'answer_question',{...base,...q});
    expect(a.json.data.status).toBe('insufficient_evidence');
    const check=await call(ctx,'check_answer',{...base,questionContext:a.json.data.questionContext,answerText:'三月最適合。'});
    expect(check.json.data.questionStatus).toBe('insufficient_evidence');
    for(const questionContext of [{...q,status:'ranked'},{...q,range:{start:'2027-01',end:'2050-12'}}]) {
      expect((await call(ctx,'check_answer',{...base,questionContext,answerText:'推薦三月'})).json.error.code).toBe('invalid_args');
    }
  });
  test('unknown categories and absent question context are explicit rather than silently passed',async()=>{
    const ctx=context([.8,.7,.6]);
    const a=await call(ctx,'answer_question',{...base,category:'not_supported',range});
    expect(a.json.data).toMatchObject({status:'unsupported',top:[],abstentionReasons:[{code:'unsupported_category'}]});
    const unsupported=await call(ctx,'check_answer',{...base,questionContext:a.json.data.questionContext,answerText:'推薦三月'});
    expect(unsupported.json.data).toMatchObject({ok:false,questionStatus:'unsupported',issues:[{code:'month_recommendation_when_abstained'}]});
    const check=await call(ctx,'check_answer',{...base,answerText:'推薦三月'});
    expect(check.json.data).toMatchObject({ok:false,questionCheck:'not_provided',issues:[{code:'question_context_missing'}]});
  });
});
