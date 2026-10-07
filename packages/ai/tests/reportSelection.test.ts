import { beforeAll, describe, expect, test } from 'bun:test';
import { analyze, type Report } from '../../core/src/core/analyze';
import { buildInterpretationPayload, type ReportLike } from '../src/payload';
import { buildCopyPrompt } from '../src/copyPrompt';
import * as publicAi from '../src/index';
import { loadQuestion } from './helpers';
import recorded from './fixtures/report-selection.v0.6.0.json';

let report: Report & ReportLike;
beforeAll(() => { report=JSON.parse(JSON.stringify(analyze({year:1990,month:6,day:15,hour:23,minute:30,gender:'female',useTrueSolarTime:false,ziHourConvention:'early'},{asOf:'2027-01-15'}))); });
const sha=(s:string)=>new Bun.CryptoHasher('sha256').update(s).digest('hex');

describe('Report7 complete store preserves the existing AI selection contract', () => {
  test('200k payload keeps the exact baseline selection, including the existing conflict limitation', () => {
    const b=buildInterpretationPayload(report,{maxChars:200000});
    const p=structuredClone(b.payload);p.report.schemaVersion=6; // normalize only declared Report metadata
    const known=new Set(p.signals.map(s=>s.id));
    const conflict=[...p.timeline!.years,...p.timeline!.months].flatMap(c=>c.domains.flatMap(d=>[...(d.conflict?.positive??[]),...(d.conflict?.negative??[])]));
    const missing=[...new Set(conflict.filter(id=>!known.has(id)))].sort();
    expect(missing).toEqual(recorded['200k'].missing); // baseline3; unprojected Report7 incorrectly raises this to4
    expect(sha(JSON.stringify(p))).toBe(recorded['200k'].hash);
    expect(b.signalIds.size).toBe(recorded['200k'].kept);
  });

  test('short IDs, Question protected sources and unbudgeted local mode preserve baseline payload bytes', () => {
    for(const [name,options] of [['200k-short',{maxChars:200000,shortIds:true}],['200k-question',{maxChars:200000,question:loadQuestion()}],['local',{budget:false,redact:false}]] as const) {
      const b=buildInterpretationPayload(report,options);const p=structuredClone(b.payload);p.report.schemaVersion=6;
      expect(sha(JSON.stringify(p)),name).toBe(recorded[name].hash);
      expect(b.signalIds.size).toBe(recorded[name].kept);
    }
  });

  test('copy prompt freezes selection before level trimming, for 16k/24k with and without Question', () => {
    for(const maxChars of [16000,24000])for(const question of [false,true]) {
      const b=buildCopyPrompt(report,{maxChars,...(question?{questionAnswer:loadQuestion()}: {})});
      const key=`copy-${maxChars}-${question}` as keyof typeof recorded;
      expect(sha(b.text.replace(/"schemaVersion":7/g,'"schemaVersion":6')),key).toBe(recorded[key].hash);
      expect(b.payload.signalIds.size).toBe(recorded[key].kept);
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
