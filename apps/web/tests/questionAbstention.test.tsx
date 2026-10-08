import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { answerQuestion, createSignal } from '@fortune/core';
import { buildCopyPrompt, checkPastedAnswer } from '@fortune/ai/copy';
import { QuestionStatus } from '../src/components/report/AskAi';
import { localQuestion, monthSignalProvider } from '../src/model/askAi';

describe('#45 Web reason rendering and paste-back decision',()=>{
  for(const [values,status] of [[[0,0,0],'insufficient_evidence'],[[.1,.2,.3],'no_clear_advantage'],[[.8,.8,.8],'tied'],[[.8,.7,.6],'ranked']] as const) {
    test(status,()=>{
      const range={start:'2027-01',end:'2027-03'};
      const answer=answerQuestion({category:'investment',range},window=>(['wealth','contract'] as const).map(domain=>createSignal({system:'bazi',ruleId:'test.abstention',ruleVersion:1,domain,trait:'opportunity',intensity:values[Number(window.start.slice(5,7))-1],valence:.5,window,target:domain})));
      const local={category:'investment',categoryName:'投資時機',range,answer};
      const html=renderToStaticMarkup(<QuestionStatus text="何時投資" local={local} ranking={false}/>);
      expect(html).toContain(`data-status="${status}"`);
      const prompt=buildCopyPrompt({asOf:'2027-01-01',signals:[],engines:[]},{question:'何時投資',questionAnswer:answer});
      expect(prompt.payload.payload.question!.status).toBe(status);
      if(status!=='ranked') {
        expect(html).toContain(answer.abstentionReasons[0].message);expect(html).not.toContain('網站計算的前');
        expect(checkPastedAnswer(prompt.payload,'推薦三月。').paragraphs[0].flags[0].code).toBe('month_recommendation_when_abstained');
      }
    });
  }
  test('unavailable replay source differs from evaluated all-zero scores',()=>{
    const q=localQuestion({asOf:'2027-01-01'} as any,'何時投資')!;
    expect(q.answer).toMatchObject({status:'insufficient_evidence',top:[],abstentionReasons:[{code:'source_unavailable'}]});
    expect(q.answer!.ranking).toEqual([]);
    expect(renderToStaticMarkup(<QuestionStatus text="何時投資" local={q} ranking={false}/>)).toContain('缺少可重放');
  });
  test('#45 review: a calculation failure preserves unknown months rather than inventing zero diagnostics',()=>{
    const broken:any={schemaVersion:7,asOf:'2027-01-01',timeContext:{conventions:{useTrueSolarTime:false,ziHourConvention:'late',timeline:{followsOptions:true,clock:'civil',baziZiHourConvention:'late',ziweiZiHourConvention:'splitMidnight'}}},
      timeline:{schemaVersion:2,systems:['bazi'],systemWeights:{bazi:1},thresholds:{theta:.5,tau:.2},years:[],months:[]}};
    const provider=monthSignalProvider(broken);
    expect(provider).not.toBeNull();
    expect(()=>provider!({grain:'month',start:'2027-01-01',end:'2027-01-31'})).toThrow();
    const q=localQuestion(broken,'何時投資')!;
    expect(q.answer).toMatchObject({status:'insufficient_evidence',ranking:[],top:[],abstentionReasons:[{code:'source_unavailable'}]});
    expect(JSON.stringify(q.answer)).not.toContain('"score":0');
    const prompt=buildCopyPrompt({asOf:'2027-01-01',signals:[],engines:[]},{question:'何時投資',questionAnswer:q.answer});
    expect(prompt.payload.payload.question!.top).toEqual([]);
    expect(checkPastedAnswer(prompt.payload,'推薦三月。').paragraphs[0].flags[0].code).toBe('month_recommendation_when_abstained');
  });
  test('#45 review: ranked topN=0 is explicitly a display choice',()=>{
    const range={start:'2027-01',end:'2027-03'};
    const answer=answerQuestion({category:'investment',range},window=>(['wealth','contract'] as const).map(domain=>createSignal({system:'bazi',ruleId:'test.display-only',ruleVersion:1,domain,trait:'opportunity',intensity:[.8,.7,.6][Number(window.start.slice(5,7))-1],valence:.5,window,target:domain})),{topN:0});
    const html=renderToStaticMarkup(<QuestionStatus text="何時投資" local={{category:'investment',categoryName:'投資時機',range,answer}} ranking={false}/>);
    expect(html).toContain('展示');expect(html).not.toContain('無法計算');expect(html).not.toContain('網站計算的前');
    const prompt=buildCopyPrompt({asOf:'2027-01-01',signals:[],engines:[]},{question:'何時投資',questionAnswer:answer});
    expect(prompt.payload.payload.question!.status).toBe('ranked');expect(prompt.payload.payload.question!.top).toEqual([]);
    expect(prompt.text).toContain('展示未列出月份');
  });
});
