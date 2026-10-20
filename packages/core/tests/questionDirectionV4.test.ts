import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import {
  answerQuestion, answerQuestionV4, replayQuestionAnswerV2, replayQuestionAnswerV3, createSignal,
  evaluateResearchGroupV4, directionalAxesV4, compareDirectionalAxesV4, serializeQuestionAnswerV4,
  questionModelIdentityV4, DIRECTIONAL_KERNEL_V4, type Signal, type SignalWindow, type QuestionRequest,
} from '../src';
const frozen = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/questionLegacy32.v2-v3.json.gz', import.meta.url))).toString());
const request: QuestionRequest = { category: 'job_change', range: { start: '2026-01', end: '2026-02' } };
const window = { grain: 'month' as const, start: '2026-01-01', end: '2026-01-31' };
function signal(valence: number, intensity = 1, target = String(valence), trait: Signal['trait'] = 'support') {
  return createSignal({ system: 'bazi', ruleId: 'test', ruleVersion: 1, domain: 'career', trait, valence, intensity, target, window });
}
function group(signals: Signal[]) { return evaluateResearchGroupV4({ kernelVersion: DIRECTIONAL_KERNEL_V4, groupId: 'synthetic-group', branch: 'synthetic-school-v1', system: 'bazi', domain: 'career', signals }); }
describe('frozen complete v2/v3 bytes, never change legacy characterization', () => {
  test('all 32 full v2/v3 answers reproduce original serialization', () => {
    expect(frozen).toHaveLength(32);
    for (const row of frozen) {
      const provider = (w: SignalWindow) => row.rawMonths.find((m: {window: typeof window}) => m.window.start === w.start).signals;
      expect(JSON.stringify(replayQuestionAnswerV2(row.request, provider, row.options))).toBe(JSON.stringify(row.v2));
      expect(JSON.stringify(replayQuestionAnswerV3(row.request, provider, row.options))).toBe(JSON.stringify(row.core));
      expect(JSON.stringify(answerQuestion(row.request, provider, row.options))).toBe(JSON.stringify(row.core));
    }
  });
  test('v3 deliberately still ignores valence for score: retain original red-AC witnesses', () => {
    let raised = 0;
    for (const row of frozen) for (const actual of row.core.ranking) {
      expect(actual.score).toBe(row.withPositiveValence.ranking.find((w: {window: typeof window}) => w.window.start === actual.window.start).score);
      if (actual.score > row.withoutNegativeSupport.ranking.find((w: {window: typeof window}) => w.window.start === actual.window.start).score + 0.00001) raised++;
    }
    expect(raised).toBe(52);
  });
});
describe('explicit research arithmetic, not a production recommendation policy', () => {
  test('negative supportive trait stays intact, only N; activity cannot improve comparison', () => {
    const negative = signal(-0.8, 1);
    const result = group([negative]);
    expect(result.support).toBe(0); expect(result.pressure).toBe(.8); expect(result.activity).toBe(1);
    expect(result.signals[0]).toEqual(negative); expect(result.supportSignalIds).toEqual([]);
    expect(result.pressureSignalIds).toEqual([negative.id]);
    expect(compareDirectionalAxesV4(directionalAxesV4(1,.2,.3),directionalAxesV4(.4,.2,.3))).toBe('equal');
  });
  test('same-system opposing evidence remains both sides; weak D=100 is not strong support', () => {
    const both = group([signal(.8),signal(-.8)]);
    expect(both).toMatchObject({support:.8,pressure:.8,directionalMass:1.6,direction:0,internalConflict:1});
    expect(both.supportSignalIds).toHaveLength(1); expect(both.pressureSignalIds).toHaveLength(1);
    expect(directionalAxesV4(1,.8,.2).direction).toBeCloseTo(60);
    expect(directionalAxesV4(1,.8,.75).direction).toBeCloseTo(3.22580645);
    expect(group([signal(1,.000001)])).toMatchObject({support:.000001,pressure:0,direction:100,directionalMass:.000001,scope:'research-only'});
  });
  test('neutral and zero intensity have null direction/conflict; group-max dedupe/reorder invariant', () => {
    expect(group([signal(0)])).toMatchObject({activity:1,support:0,pressure:0,directionalMass:0,direction:null,internalConflict:null});
    expect(group([signal(.8,0)])).toMatchObject({activity:0,direction:null});
    const a=signal(.5,.4), b=signal(-.4,.9);
    expect(group([a,b,a])).toEqual(group([b,a]));
    expect(group([a,signal(.5,.3,'same-family-other-trait')]).support).toBe(.2);
    expect(compareDirectionalAxesV4(directionalAxesV4(1,.8,.75),directionalAxesV4(1,.2,.1))).toBe('tradeoff');
    expect(compareDirectionalAxesV4(directionalAxesV4(1,.8,.2),directionalAxesV4(1,.2,.2))).toBe('dominates');
  });
  test('source tampering, mixed system/domain, unknown version and conflicting duplicate fail', () => {
    const s=signal(.8);
    expect(()=>group([{...s,id:'sig_0000000000000000'}])).toThrow();
    expect(()=>group([s,{...s,intensity:.1}])).toThrow('conflicting');
    expect(()=>group([createSignal({...s,system:'ziwei'})])).toThrow('mixed');
    expect(()=>group([{...s,system:'unknown'} as never])).toThrow();
    expect(()=>evaluateResearchGroupV4({kernelVersion:'unknown'} as never)).toThrow();
  });
});
describe('production versioned consumer fails closed before ranking', () => {
  test('positive/all-negative/mixed/neutral/missing inputs never bypass missing policies', () => {
    for (const raw of [[signal(.8)], [signal(-.8)], [signal(.8), signal(-.8)], [signal(0)], []]) {
      const answer=answerQuestionV4(request,()=>raw);
      expect(answer).toMatchObject({answerVersion:4,catalogVersion:4,status:'insufficient_evidence',top:[]});
      expect(answer.ranking.every(row=>row.rank===null&&row.groupMetrics===null&&row.coverage==='unresolved')).toBe(true);
      expect(answer.abstentionReasons.map(reason=>reason.code)).toEqual(['grouping_unresolved','coverage_unresolved','model_policy_unavailable']);
      expect(JSON.parse(serializeQuestionAnswerV4(answer))).toEqual(answer);
    }
    const unavailable=answerQuestionV4(request,null);
    expect(unavailable.ranking).toEqual([]); expect(unavailable.abstentionReasons[0].code).toBe('source_unavailable');
    expect(answerQuestionV4(request,()=>[]).abstentionReasons.some(r=>r.code==='source_unavailable')).toBe(false);
  });
  test('no unapproved model, weights, grouping, policy, malformed signal or export version fallback', () => {
    for (const options of [{modelVersion:'unknown'},{modelVersion:'v3'},{aggregate:{systemWeights:{bazi:0}}},{policy:{}},{grouping:{}}]) expect(()=>answerQuestionV4(request,()=>[],options as never)).toThrow();
    expect(()=>answerQuestionV4(request,()=>[],{systems:['unknown'] as never})).toThrow();
    expect(()=>answerQuestionV4(request,()=>[{...signal(.8),system:'unknown'} as never])).toThrow();
    const answer=answerQuestionV4(request,()=>[signal(.8)]);
    expect(()=>serializeQuestionAnswerV4({...answer,answerVersion:3} as never)).toThrow();
    expect(()=>serializeQuestionAnswerV4({...answer,status:'ranked'} as never)).toThrow();
    for (const mutate of [
      (a: typeof answer) => { a.catalogVersion=3 as never; },
      (a: typeof answer) => { a.ranking[0].directionalDiagnostics[0].support=999; },
      (a: typeof answer) => { a.ranking[0].signalIds=[]; },
      (a: typeof answer) => { a.ranking[0].signals[0].valence=-1; },
    ]) { const altered=structuredClone(answer);mutate(altered);expect(()=>serializeQuestionAnswerV4(altered)).toThrow(); }
    answer.model.manifest.groupingVersion='forged' as never;
    expect(()=>serializeQuestionAnswerV4(answer)).toThrow();
    expect(questionModelIdentityV4().manifest.groupingVersion).toBe(null);
  });
  test('all 384 real rule cells preserve original signals and every negative contribution has P=0', () => {
    let cells=0, negative=0;
    for (const row of frozen) {
      const answer=answerQuestionV4(row.request,w=>row.rawMonths.find((m:{window: typeof window})=>m.window.start===w.start).signals);
      for (const month of answer.ranking) { cells++;
        for (const source of month.signals) {
          const diagnostic=month.directionalDiagnostics.find(item=>item.signalId===source.id)!;
          expect(source).toEqual(row.rawMonths.find((m:{window:typeof window})=>m.window.start===month.window.start).signals.find((s:Signal)=>s.id===source.id));
          if(source.valence<0){negative++;expect(diagnostic.support).toBe(0);expect(diagnostic.pressure).toBe(source.intensity*-source.valence);}
        }
      }
    }
    expect(cells).toBe(384);expect(negative).toBeGreaterThan(0);
  });
});
