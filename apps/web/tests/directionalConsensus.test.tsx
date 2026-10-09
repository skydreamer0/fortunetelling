import { describe, expect, test } from 'bun:test';
import { aggregateSignals, analyze, buildConsensus, buildTimeline, createSignal } from '@fortune/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { selectConsensus, selectTimelineYears } from '../src/model/selectors';
import { TimelineDetail } from '../src/components/report/Timeline';
import { localQuestion, reportSignalLookup } from '../src/model/askAi';

function fixture(negative = false): any {
  const window = { grain: 'year', start: '2026-01-01', end: '2026-12-31' } as const;
  const signals = (['bazi', 'ziwei', 'numerology'] as const).map(system => createSignal({ system, ruleId: `${system}.synthetic`,
    ruleVersion: 1, target: system, domain: 'career', trait: 'opportunity', intensity: 0.8, valence: negative ? -1 : 1, window }));
  const agg = aggregateSignals(signals)[0];
  const timeline: any = { schemaVersion: 2, asOf: '2026-07-11', systems: ['bazi', 'ziwei', 'numerology'],
    skippedSystems: [], conventions: {}, bandCuts: [35, 55, 75], systemWeights: { bazi: 1, ziwei: 1, numerology: 1 },
    thresholds: { theta: 0.5, tau: 0.2 }, years: [{ window, domains: [{ ...agg, band: '高', topSignals: signals }] }], months: [] };
  return { schemaVersion: 6, asOf: timeline.asOf, engines: [], input: {}, signals, timeline, consensus: buildConsensus(timeline) };
}

describe('#44 web agreement wording and old reports', () => {
  test('negative high agreement is visibly same-direction pressure, with activity separate', () => {
    const report = fixture(true);
    const cell: any = selectTimelineYears(report)!.rows.find(row => row.domain === 'career')!.cells[0];
    expect(cell.activityAgreement).toBe(3);
    expect(cell.highConsensus).toBe(true);
    expect(cell.agreementDirections).toEqual(['negative']);
    const html = renderToStaticMarkup(<TimelineDetail cell={cell} />);
    expect(html).toContain('同向壓力');
    expect(html).toContain('共同關注');
  });

  test('an old three-system activity flag is never rendered as directional high consensus', () => {
    const report = fixture();
    report.schemaVersion = 5; report.timeline.schemaVersion = 1;
    delete report.timeline.thresholds;
    delete report.timeline.years[0].domains[0].directionalEvidence;
    report.consensus.schemaVersion = 1;
    const cell: any = selectTimelineYears(report)!.rows.find(row => row.domain === 'career')!.cells[0];
    expect(cell.highConsensus).toBe(false);
    expect(cell.activityAgreement).toBe(3);
    expect(selectConsensus(report)!.agreements).toEqual([]);
  });

  test('real report Question replay preserves zero weights and custom theta/tau', () => {
    const report: any = analyze({ year: 1995, month: 7, day: 16, hour: 22, minute: 0, gender: 'male', cityId: 'tainan' }, { asOf: '2026-09-25' });
    report.timeline = buildTimeline(report.timeContext, { useTrueSolarTime: true, ziHourConvention: 'late', asOf: report.asOf, systems: ['bazi', 'ziwei', 'numerology'],
      systemWeights: { bazi: 0, ziwei: 0, numerology: 0 }, consensusThreshold: 0.8, conflictThreshold: 0.7 });
    const question = localQuestion(report, '2026轉職')!;
    expect(question.answer!.status).toBe('insufficient_evidence');
    expect(question.answer!.top).toEqual([]);
    expect(question.answer!.ranking.every(row => row.score === 0 && row.rank === null)).toBe(true);
    expect(question.answer!.ranking.every(row => !row.highConsensus)).toBe(true);
    expect(question.answer!.thresholds).toEqual({ theta: 0.8, tau: 0.7 });
    const lookup: any = reportSignalLookup(report);
    expect(typeof lookup.directionalEvidence).toBe('function');
    expect(lookup.directionalEvidence().every((proof: any) => proof.thresholds.theta === 0.8 && proof.thresholds.tau === 0.7)).toBe(true);
  }, 60_000);
});
