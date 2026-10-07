import { beforeAll, describe, expect, test } from 'bun:test';
import { analyze, type Report } from '../../core/src/core/analyze';
import { buildInterpretationPayload, type ReportLike } from '../src/payload';
import { buildCopyPrompt } from '../src/copyPrompt';
import * as publicAi from '../src/index';
import { loadQuestion } from './helpers';
import recorded from './fixtures/report-selection.v0.6.0.json';
import delta from './fixtures/report-selection.payload-v3.delta.json';
function expected<K extends keyof typeof recorded>(key: K): (typeof recorded)[K] {
  const change = delta.changes[key];
  expect(change.before).toEqual(recorded[key]);
  return change.after as (typeof recorded)[K];
}

let report: Report & ReportLike;
beforeAll(() => { report=JSON.parse(JSON.stringify(analyze({year:1990,month:6,day:15,hour:23,minute:30,gender:'female',useTrueSolarTime:false,ziHourConvention:'early'},{asOf:'2027-01-15'}))); });
const sha=(s:string)=>new Bun.CryptoHasher('sha256').update(s).digest('hex');

describe('Report7 candidate projection with reviewed Payload3 serialization deltas', () => {
  test('200k payload preserves its selected pool and removes dangling conflict references', () => {
    const b=buildInterpretationPayload(report,{maxChars:200000});
    const p=structuredClone(b.payload);p.report.schemaVersion=6; // normalize only declared Report metadata
    const known=new Set(p.signals.map(s=>s.id));
    const conflict=[...p.timeline!.years,...p.timeline!.months].flatMap(c=>c.domains.flatMap(d=>[...(d.conflict?.positive??[]),...(d.conflict?.negative??[])]));
    const missing=[...new Set(conflict.filter(id=>!known.has(id)))].sort();
    expect(missing).toEqual([]);
    expect(missing).toEqual(expected('200k').missing); // explicit three-to-zero bugfix, original literal preserved
    expect(sha(JSON.stringify(p))).toBe(expected('200k').hash);
    expect(b.signalIds.size).toBe(expected('200k').kept);
  });

  test('short IDs, Question sources and local mode match explicit reviewed serialization deltas', () => {
    for(const [name,options] of [['200k-short',{maxChars:200000,shortIds:true}],['200k-question',{maxChars:200000,question:loadQuestion()}],['local',{budget:false,redact:false}]] as const) {
      const b=buildInterpretationPayload(report,options);const p=structuredClone(b.payload);p.report.schemaVersion=6;
      expect(sha(JSON.stringify(p)),name).toBe(expected(name).hash);
      expect(b.signalIds.size).toBe(expected(name).kept);
    }
  });

  test('copy prompt freezes selection before level trimming, for 16k/24k with and without Question', () => {
    for(const maxChars of [16000,24000])for(const question of [false,true]) {
      const b=buildCopyPrompt(report,{maxChars,...(question?{questionAnswer:loadQuestion()}: {})});
      const key=`copy-${maxChars}-${question}` as keyof typeof recorded;
      expect(sha(b.text.replace(/"schemaVersion":7/g,'"schemaVersion":6')),key).toBe(expected(key).hash);
      expect(b.payload.signalIds.size).toBe(expected(key).kept);
      expect(b.charCount).toBeLessThanOrEqual(maxChars);
    }
  });

  test('old Report and missing-timeline inputs preserve the original signals fallback', () => {
    for (const value of [{...report,schemaVersion:6}, {...report,timeline:null}]) {
      const built=buildInterpretationPayload(value,{budget:false,redact:false});
      expect([...built.signalIds].sort()).toEqual(report.signals.map(s=>s.id).sort());
      expect(built.payload.report.schemaVersion).toBe(value.schemaVersion);
    }
  });

  test('selection does not mutate the complete Report or expand the public API', () => {
    const before=JSON.stringify(report);
    buildInterpretationPayload(report,{maxChars:200000});buildCopyPrompt(report,{maxChars:16000});
    expect(JSON.stringify(report)).toBe(before);
    expect(report.signals.length).toBe(767);
    expect(publicAi).not.toHaveProperty('selectInterpretationReport');
    expect(publicAi).not.toHaveProperty('buildInterpretationPayloadFromSelection');
  });
});
