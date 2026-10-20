import { expect, test } from 'vitest';
import { answerQuestionV4, questionModelIdentityV4 } from '@fortune/core';
import { buildInterpretationPayload } from '../src/payload';
import { questionContextOf } from '../src/questionPolicy';
import { interpret, createMemoryStore } from '../src/client';
import { mockComplete, loadReport } from './helpers';

test('mock-only AI client retains v4 identity through payload, output and cache; no external model calls',async()=>{
  const report=loadReport();
  const question=answerQuestionV4({category:'job_change',range:{start:'2026-01',end:'2026-02'}},()=>[]);
  const {fn,calls}=mockComplete([JSON.stringify({sections:[{heading:'資料限制',text:'目前依據不足，無法推薦月份。',citations:[]}]})]);
  const store=createMemoryStore();
  const first=await interpret(report,{complete:fn,question,store});
  const cached=await interpret(report,{complete:fn,question,store});
  expect(first.question?.model).toEqual(questionModelIdentityV4());expect(first.question?.answerVersion).toBe(4);
  expect(cached.question).toEqual(first.question);expect(cached.cached).toBe(true);expect(calls).toHaveLength(1);
  expect(buildInterpretationPayload(report,{question}).payload.question?.top).toEqual([]);
  expect(()=>questionContextOf({...question,status:'ranked'} as never)).toThrow();
  const wrong=structuredClone(question);wrong.model.fingerprint='forged';expect(()=>buildInterpretationPayload(report,{question:wrong})).toThrow();
});
