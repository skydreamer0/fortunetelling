import { expect, test } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { analyzeReplayReport, createProfileFileV2, profileAnalyzeInput, answerQuestionV4, listQuestionCategories, questionModelIdentityV4, serializeQuestionAnswerV4 } from '@fortune/core';
import { localQuestionV4, monthSignalProvider } from '../../../apps/web/src/model/askAi';
import { answerQuestionV4 as webCoreAnswer } from '../../../apps/web/src/lib/core';
import { computeQuestionContextV4 } from '../src/tools/questions';
import { buildCopyPrompt, checkPastedAnswer } from '@fortune/ai/copy';
import { buildInterpretationPayload } from '@fortune/ai';
import { makeFixture } from './helpers';
const frozen = JSON.parse(gunzipSync(readFileSync(new URL('../../core/tests/fixtures/questionLegacy32.v2-v3.json.gz',import.meta.url))).toString());
const phrases: Record<string,string> = {vehicle_purchase:'買車',job_change:'轉職',relationship_timing:'感情',startup_timing:'創業',property_purchase:'買房',relocation:'搬家',study_exam:'考試',investment:'投資'};
const profiles=[{date:'1990-02-22',time:'12:00',gender:'female'},{date:'1995-07-16',time:'22:00',gender:'male'}] as const;
test('32 true ProfileV2 / Report8 / Web / MCP v4 paths agree, old handler bytes remain unchanged, AI refuses recommendations',async()=>{
  expect(webCoreAnswer).toBe(answerQuestionV4);
  const fx=await makeFixture({});const receipt: unknown[]=[];
  try {
    for(let p=0;p<profiles.length;p++) for(const setting of [{useTrueSolarTime:false,ziHourConvention:'early'},{useTrueSolarTime:true,ziHourConvention:'late'}] as const) {
      const id=`synthetic-${p}-${setting.ziHourConvention}`;
      const file=createProfileFileV2(id,{...profiles[p],name:'SYNTHETIC DIRECTION TEST',timeAccuracy:'exact',birthplace:{label:'Synthetic Taipei',lat:25.033,lng:121.5654,timezone:'Asia/Taipei'}},setting);
      const report=analyzeReplayReport(profileAnalyzeInput(file),{asOf:'2026-01-01'});
      await fx.store.put(file);const analysis=await fx.ctx.analyzer.get(id,'2026-01-01');
      for(const category of listQuestionCategories()) {
        const request={category:category.id,range:{start:'2026-01',end:'2026-12'}};
        const core=answerQuestionV4(request,monthSignalProvider(report as never));
        const web=localQuestionV4(report as never,`2026 年${phrases[category.id]}`)!;
        expect(web.answer).toEqual(core);
        const mcp=computeQuestionContextV4(analysis,category.id,request.range,report.timeline!.systems);
        const {systemFilter,...calculation}=mcp;expect(systemFilter?.systemsRequested).toEqual(report.timeline!.systems);expect(calculation).toEqual(core);
        const args={profileId:id,asOf:'2026-01-01',category:category.id,range:request.range,systems:report.timeline!.systems,detail:true};
        const wire=await fx.call('answer_question_v4',args);expect(wire.isError,wire.text).toBe(false);
        expect(wire.json.versions.catalogs.questions).toBe(4);expect(wire.json.versions.questionModel.fingerprint).toBe(core.model.fingerprint);
        expect(wire.json.data.model).toEqual(core.model);expect(wire.json.data.status).toBe(core.status);expect(wire.json.data.top).toEqual([]);
        expect(wire.json.data.ranking.map((row:{directionalDiagnostics:unknown})=>row.directionalDiagnostics)).toEqual(core.ranking.map(row=>row.directionalDiagnostics));
        const legacy=await fx.call('answer_question',args);expect(legacy.isError).toBe(false);
        expect(legacy.json).toEqual(frozen.find((row:{profile:string;category:string})=>row.profile===id&&row.category===category.id).mcpHandler);
        const built=buildInterpretationPayload(report as unknown as Parameters<typeof buildInterpretationPayload>[0],{question:core});expect(built.payload.question?.model).toEqual(core.model);expect(built.payload.question?.top).toEqual([]);
        expect(JSON.parse(serializeQuestionAnswerV4(core))).toEqual(core);
        const checked=await fx.call('check_answer_v4',{profileId:id,asOf:'2026-01-01',answerText:'建議 2026 年 3 月轉職。',questionContext:wire.json.data.questionContext});
        expect(checked.isError,checked.text).toBe(false);expect(checked.json.data.issues.some((issue:{code:string})=>issue.code==='month_recommendation_when_abstained')).toBe(true);
        receipt.push({profile:id,category:category.id,core,mcp:wire.json,legacyHandlerParity:true,aiCheck:checked.json});
      }
    }
    const question=answerQuestionV4({category:'job_change',range:{start:'2026-01',end:'2026-01'}},()=>[]);
    const prompt=buildCopyPrompt({schemaVersion:8,signals:[]},{question:'轉職',questionAnswer:question});
    expect(prompt.payload.payload.question?.model).toEqual(questionModelIdentityV4());
    expect(checkPastedAnswer(prompt.payload,'建議 2026 年 3 月轉職。').paragraphs.some(p=>p.flags.some(f=>f.code==='month_recommendation_when_abstained'))).toBe(true);
    const wrong=await fx.call('answer_question_v4',{profileId:'sky',asOf:'2026-01-01',category:'job_change',modelVersion:'v3'});expect(wrong.isError).toBe(true);
    const forged=await fx.call('check_answer_v4',{profileId:'sky',asOf:'2026-01-01',answerText:'推薦三月',questionContext:{answerVersion:4,modelVersion:'question-v4-diagnostic-1',modelFingerprint:'forged',category:'job_change',range:{start:'2026-01',end:'2026-01'}}});expect(forged.isError).toBe(true);
    const stripped=await fx.call('check_answer_v4',{profileId:'sky',asOf:'2026-01-01',answerText:'推薦三月',questionContext:{category:'job_change',range:{start:'2026-01',end:'2026-01'}}});expect(stripped.isError).toBe(true);
    expect(receipt).toHaveLength(32);
    if(process.env.QUESTION_V4_RECEIPT) writeFileSync(process.env.QUESTION_V4_RECEIPT,JSON.stringify(receipt,null,2)+'\n');
  } finally { await fx.cleanup(); }
},120000);
