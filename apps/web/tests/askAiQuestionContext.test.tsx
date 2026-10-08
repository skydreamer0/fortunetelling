/** Controlled hook/timer regression for report-bound question provenance; not a browser/paint benchmark. */
import { expect, test } from 'bun:test';
import { createRequire } from 'node:module';
import { isValidElement, type ReactNode } from 'react';

const require = createRequire(import.meta.url);
test('AskAi never uses report A question decision in report B, including A→B→A and pending timers', async () => {
  const slots:any[] = [], effects:{deps:unknown[];cleanup?:()=>void}[] = [], pending:(()=>void)[] = [];
  const timers = new Map<number,()=>void>(); let nextTimer=0,cursor=0,ec=0,tree:any;
  const a={asOf:'2027-01-01',id:'A'},b={asOf:'2027-01-01',id:'B'}; let report=a;
  let lastPrompt:any; const calls:string[]=[];
  const react={...require('react'),
    useState(initial:any){const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],(v:any)=>{slots[i]=typeof v==='function'?v(slots[i]):v}]},
    useRef(initial:any){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i]},
    useMemo(fn:()=>unknown){return fn()},useDeferredValue(v:unknown){return v},
    useEffect(fn:()=>void|(()=>void),deps:unknown[]){const i=ec++;if(!effects[i]||deps.some((x,j)=>x!==effects[i].deps[j]))pending.push(()=>{effects[i]?.cleanup?.();effects[i]={deps,cleanup:fn()||undefined}})},
  };
  const range={start:'2027-01',end:'2027-12'};
  const model={matchQuestionCategory:(s:string)=>s?'investment':null,questionRange:()=>range,
    localQuestion(r:typeof a){calls.push(r.id);return {category:'investment',categoryName:'投資時機',range,answer:{owner:r.id,status:r.id==='A'?'ranked':'no_clear_advantage',top:[],abstentionReasons:[]}}},
  };
  const mod:any={exports:{}};
  const built=await Bun.build({entrypoints:['apps/web/src/components/report/AskAi.tsx'],target:'bun',format:'cjs',external:['*']});
  if(!built.success)throw Error(built.logs.join('\n'));
  const load=(id:string)=>id==='react'?react:id==='../../model/askAi'?model:id==='@fortune/ai/copy'?{
    buildCopyPrompt(r:unknown,o:any){lastPrompt={report:r,answer:o.questionAnswer};return {text:'fixture',charCount:7,truncated:false,payload:{payload:{signals:[]},signalIds:new Set()}}},checkPastedAnswer:()=>null,
  }:id==='../ui/primitives'?{Section:'section'}:id==='./McpEntry'?{McpEntry:'aside'}:id==='./copyText'?{copyText:async()=> 'clipboard'}:require(id);
  const compile=new Function('setTimeout','clearTimeout',`return (\n${await built.outputs[0].text()}\n)`);
  compile((fn:()=>void)=>{const id=++nextTimer;timers.set(id,fn);return id},(id:number)=>timers.delete(id))(mod.exports,load,mod,'AskAi.tsx','.');
  function walk(n:ReactNode):any[]{if(Array.isArray(n))return n.flatMap(walk);if(!isValidElement<any>(n))return [];return [n,...walk((n.props as {children?:ReactNode}).children)]}
  function render(){cursor=0;ec=0;tree=mod.exports.AskAi({report});pending.splice(0).forEach(fn=>fn())}
  function flush(){const jobs=[...timers.values()];timers.clear();jobs.forEach(fn=>fn());render()}
  render();walk(tree).find(n=>n.type==='input'&&n.props.value==='question').props.onChange();render();
  walk(tree).find(n=>n.type==='textarea'&&n.props.maxLength===500).props.onChange({target:{value:'何時投資'}});render();
  expect(lastPrompt.answer).toBeNull();flush();expect(lastPrompt.answer.owner).toBe('A');
  report=b;render();expect(lastPrompt.answer).toBeNull();expect(timers.size).toBe(1);
  flush();expect(lastPrompt.answer.owner).toBe('B');expect(lastPrompt.answer.status).toBe('no_clear_advantage');
  report=a;render();expect(lastPrompt.answer).toBeNull();flush();expect(lastPrompt.answer.owner).toBe('A');
  report=b;render();report=a;render();expect(timers.size).toBe(0);expect(lastPrompt.answer.owner).toBe('A');
  expect(calls).toEqual(['A','B','A']);effects.forEach(e=>e.cleanup?.());
});
