import { describe, expect, test } from 'bun:test';
import { answerQuestion } from '../../core/src/questions';
import { createSignal } from '../../core/src/signals/createSignal';
import { buildInterpretationPayload } from '../src/payload';
import { buildCopyPrompt } from '../src/copyPrompt';
import { checkAnswer } from '../src/checkAnswer';
import { checkPastedAnswer } from '../src/pasteCheck';
import { validateSections } from '../src/validate';
import { questionContextOf } from '../src/questionPolicy';
import { loadQuestion } from './helpers';
import legacyDelta from './fixtures/question-vehicle.payload-v4.delta.json';

const request = { category: 'investment', range: { start: '2027-01', end: '2027-03' } };
const make = (values: number[], topN = 3) => answerQuestion(request, window => ['wealth','contract'].map(domain => createSignal({
  system:'bazi',ruleId:'test.abstention',ruleVersion:1,domain:domain as 'wealth'|'contract',trait:'opportunity',
  intensity:values[Number(window.start.slice(5,7))-1],valence:.5,window,target:domain,
})), { topN });
const report = { asOf:'2027-01-01',schemaVersion:7,signals:[],engines:[] };

describe('#45 all AI consumers share the explicit question decision', () => {
  for (const values of [[0,0,0],[.1,.2,.3],[.8,.8,.8],[.8,.7,.6]]) {
    test(`decision ${values}`, () => {
      const answer = make(values), context = questionContextOf(answer);
      const built = buildInterpretationPayload(report, { question: answer, budget:false });
      expect(built.payload.question).toMatchObject(context);
      const copy = buildCopyPrompt(report, { question:'2027年何時投資？',questionAnswer:answer });
      expect(copy.payload.payload.question).toMatchObject(context);
      const text = '推薦2027-03進行投資。';
      const issue = answer.status === 'ranked' ? [] : ['month_recommendation_when_abstained' as const];
      expect(checkAnswer(text, { signalLookup:()=>null,questionContext:context }).issues.map(i=>i.code)).toEqual(issue);
      expect(checkPastedAnswer(built, text).paragraphs[0].flags.filter(f=>f.code==='month_recommendation_when_abstained').length).toBe(issue.length);
      expect(validateSections([{heading:'月份',text,citations:[]}], built).dropped.flatMap(s=>s.reasons).filter(r=>r.code==='month_recommendation_when_abstained').length).toBe(issue.length);
      if (answer.status !== 'ranked') {
        expect(built.payload.question!.top).toEqual([]);
        expect(copy.text).toContain(answer.abstentionReasons[0].message);
        expect(copy.text).not.toMatch(/\d\. 2027-\d\d：分數/);
      }
    });
  }
  test('a stale top cannot leak through any non-ranked decision', () => {
    const ranked = make([.8,.7,.6]);
    for (const status of ['tied','no_clear_advantage','insufficient_evidence','unsupported'] as const) {
      const answer = { ...ranked,status,abstentionReasons:[{code:'all_low_band' as const,message:'不可排名'}] };
      expect(buildInterpretationPayload(report,{question:answer}).payload.question!.top).toEqual([]);
    }
  });
  test('topN=0 remains ranked and missing original context is explicitly unchecked', () => {
    const answer=make([.8,.7,.6],0),context=questionContextOf(answer);
    expect(buildInterpretationPayload(report,{question:answer}).payload.question!.status).toBe('ranked');
    expect(checkAnswer('推薦三月', {signalLookup:()=>null,questionContext:context}).ok).toBe(true);
    expect(checkAnswer('推薦三月', {signalLookup:()=>null})).toMatchObject({ok:false,questionCheck:'not_provided',questionStatus:null,issues:[{code:'question_context_missing'}]});
  });
  test('preserved legacy input has no attested policy and never gains a live recommendation', async () => {
    const original = await Bun.file(new URL('./fixtures/question-vehicle.json',import.meta.url)).text();
    expect(new Bun.CryptoHasher('sha256').update(original).digest('hex')).toBe(legacyDelta.originalSha256);
    const old=loadQuestion(),before=JSON.stringify(old);
    const q=buildInterpretationPayload(report,{question:old}).payload.question!;
    expect(q.status).toBe('insufficient_evidence'); expect(q.top).toEqual([]);
    expect(q.abstentionReasons[0].code).toBe('legacy_policy_missing'); expect(JSON.stringify(old)).toBe(before);
    expect<unknown>({...questionContextOf(old),topMonths:q.top}).toEqual(legacyDelta.after);
  });
  test.each(['三月分數20，只是診斷。','不推薦三月。','三月不適合。','沒有建議三月行動。','March is not recommended.','三月、四月同分，無法推薦。'])('negations and diagnostics are not recommendations: %s', text => {
    expect(checkAnswer(text,{signalLookup:()=>null,questionContext:questionContextOf(make([.1,.2,.3]))}).issues).toEqual([]);
  });
  test.each(['推薦三月。','三月最適合。','建議：2027-03。','首選\n三月。','不推薦三月，建議四月。','March is the best month.'])('positive recommendations are rejected: %s', text => {
    expect(checkAnswer(text,{signalLookup:()=>null,questionContext:questionContextOf(make([.1,.2,.3]))}).issues[0].code).toBe('month_recommendation_when_abstained');
  });
});

describe('#45 review: sentence/heading scope and explicit uncertainty across all checkers', () => {
  const cases = [
    ['三月，最適合投資。', true],
    ['March, the best month.', true],
    ['推薦月份：\n\n三月。', true],
    ['目前無法判定三月是否適合投資。', false],
    ['沒有足夠證據建議三月投資。', false],
    ['不推薦三月，但四月最適合投資。', true],
  ] as const;
  const signal = make([.8,.7,.6]).top[0].supportSignals[0];
  for (const present of [true, false]) for (const api of ['checkAnswer','checkPastedAnswer','validateSections'] as const) {
    for (const [prose, recommends] of cases) test(`${api} context=${present}: ${prose}`, () => {
      const question = present ? make([.1,.2,.3]) : null;
      const built = buildInterpretationPayload({...report,signals:[signal]}, {question,budget:false});
      const text = `${prose}〔${signal.id}〕`;
      const expected = recommends ? [present ? 'month_recommendation_when_abstained' : 'question_context_missing'] : [];
      const isGuard = (code:string) => code === 'month_recommendation_when_abstained' || code === 'question_context_missing';
      if (api === 'checkAnswer') {
        const result=checkAnswer(text,{signalLookup:id=>id===signal.id?signal:null,questionContext:question?questionContextOf(question):null});
        expect<string[]>(result.issues.filter(issue=>isGuard(issue.code)).map(issue=>issue.code)).toEqual(expected);
        if (!recommends) expect(result.ok).toBe(true);
      } else if (api === 'checkPastedAnswer') {
        const result=checkPastedAnswer(built,text);
        expect<string[]>(result.paragraphs.flatMap(p=>p.flags).filter(flag=>isGuard(flag.code)).map(flag=>flag.code)).toEqual(expected);
        if (!recommends) expect(result.ok).toBe(true);
      } else {
        const result=validateSections([{heading:'資料限制',text,citations:[signal.id]}],built);
        expect<string[]>(result.dropped.flatMap(section=>section.reasons).filter(reason=>isGuard(reason.code)).map(reason=>reason.code)).toEqual(expected);
        expect(result.kept.length).toBe(recommends?0:1);
      }
    });
  }
});
