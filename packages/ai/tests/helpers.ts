import type { QuestionAnswer } from '@fortune/core';
import { answerQuestion } from '../../core/src/questions';
import { createSignal } from '../../core/src/signals/createSignal';
import type { ReportLike } from '../src/payload';
import type { CompleteFn, CompletionRequest } from '../src/client';

// Trimmed real `analyze()` output (asOf 2026-07-11, name 王小明, birthplace label 台北市大安區)
// and an `answerQuestion(vehicle_purchase, 2026-07…2026-12)` result. Generated once from core;
// tests never run calculators (D-021). timeline topSignals are reduced to `{ id }`.
import reportJson from './fixtures/report-v4.json';
import questionJson from './fixtures/question-vehicle.json';

export function loadReport(): ReportLike {
  return structuredClone(reportJson) as unknown as ReportLike;
}

export function loadQuestion(): QuestionAnswer {
  return structuredClone(questionJson) as unknown as QuestionAnswer;
}

/** New synthetic live answer for projection tests that need an attested ranked result. */
export function loadRankedQuestion(): QuestionAnswer {
  return answerQuestion({category:'vehicle_purchase',range:{start:'2026-10',end:'2026-12'}}, window =>
    (['wealth','contract','movement','property'] as const).map(domain => createSignal({
      system:'bazi',ruleId:'test.projection',ruleVersion:1,domain,trait:'opportunity',
      intensity:[.8,.7,.6][Number(window.start.slice(5,7))-10],valence:.5,window,target:domain,
    })));
}

/** Mock `complete` that records requests and returns canned outputs in order. */
export function mockComplete(outputs: string[] | ((req: CompletionRequest) => string), model = 'mock-model') {
  const calls: CompletionRequest[] = [];
  let i = 0;
  const fn = (async (req: CompletionRequest) => {
    calls.push(req);
    if (typeof outputs === 'function') return outputs(req);
    const out = outputs[Math.min(i, outputs.length - 1)];
    i += 1;
    return out;
  }) as CompleteFn;
  fn.model = model;
  return { fn, calls };
}
