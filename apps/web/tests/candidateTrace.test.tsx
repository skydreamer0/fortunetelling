import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { ChartCandidates } from '../src/components/report/ChartCandidates';
import { ReportEvidenceContext, Sources } from '../src/components/ui/primitives';
import { TimelineDetail } from '../src/components/report/Timeline';
import { analyze, birthTimeSnapshot } from '../src/lib/core';
import { chartCandidates, compareChosenTimes, proposedTime } from '../src/model/chartCandidates';
import { selectTimelineYears } from '../src/model/selectors';
import { sourceEvidence, timelineEvidence } from '../src/model/sourceEvidence';
import type { BirthInput } from '../src/model/types';

const unknown: BirthInput = { name: '', year: 1991, month: 10, day: 5, hour: 12, minute: 0,
  timeKnown: false, timeAccuracy: 'unknown', gender: 'female', calendarType: 'solar', cityId: 'taipei' };

test('unknown time is not guessed; two explicit hypotheses compare both systems without changing the original', () => {
  const report = analyze(unknown);
  const replay = report.replay!;
  expect(chartCandidates(replay.snapshot)).toEqual([]);
  expect(renderToStaticMarkup(<ChartCandidates report={report} />)).toContain('沒有自動產生候選盤');
  expect(() => proposedTime(replay, '24:00')).toThrow();
  const first = proposedTime(replay, '02:10');
  const second = proposedTime(replay, '04:10');
  expect(first).toMatchObject({ year: 1991, month: 10, day: 5, hour: 2, minute: 10, cityId: 'taipei', timeAccuracy: 'exact' });
  const compared = compareChosenTimes(birthTimeSnapshot(first, report.asOf), birthTimeSnapshot(second, report.asOf), '02:10', '04:10');
  expect(compared.map(c => c.columns)).toEqual([['02:10', '04:10'], ['02:10', '04:10']]);
  expect(compared[0].rows.find(row => row.label === '時柱')).toMatchObject({ a: expect.any(String), b: expect.any(String) });
  expect(compared[0].rows.find(row => row.label === '時柱')!.a).not.toBe(compared[0].rows.find(row => row.label === '時柱')!.b);
  expect(compared[1].rows).toEqual(expect.arrayContaining([expect.objectContaining({ label: '命宮' }), expect.objectContaining({ label: '生年化科' })]));
  expect(replay.snapshot.identity.input.time).toBeNull();
});

test('actual replay alternatives render side by side with policy labels and differences', () => {
  const report = analyze({ ...unknown, timeKnown: true, timeAccuracy: 'approx15m', hour: 23, minute: 0 });
  const comparisons = chartCandidates(report.replay!.snapshot);
  expect(comparisons.length).toBeGreaterThan(0);
  const markup = renderToStaticMarkup(<ChartCandidates report={report} />);
  expect(markup).toContain('主盤');
  expect(markup).toContain('候選盤');
  expect(markup).toContain('scope="col"');
  expect(markup).toContain('不同');
});

test('candidate reasons use stable readable labels and fail gracefully with an unknown snapshot reason', () => {
  const report = analyze({ ...unknown, timeKnown: true, timeAccuracy: 'approx15m', hour: 23, minute: 0 });
  const snapshot = structuredClone(report.replay!.snapshot);
  const comparisons = chartCandidates(snapshot);
  expect(comparisons.map(item => item.label)).toEqual(expect.arrayContaining([expect.stringMatching(/時辰交界|子時換日口徑|交節交界|民用時間/)]));
  expect(comparisons.every(item => !item.columns[1].includes(' clock '))).toBe(true);
  const { bazi, ziwei } = snapshot.natal;
  if (bazi.status !== 'computed' || ziwei.status !== 'computed') throw new Error('Expected both charts');
  Object.assign(bazi.chart.pillars.alternatives[0], { reason: '__proto__', detail: 'unknown rule' });
  Object.assign(ziwei.chart.time.alternatives[0], { reasons: ['future_reason'] });
  const changed = chartCandidates(snapshot);
  expect(changed).toEqual(expect.arrayContaining([
    expect.objectContaining({ label: '八字｜未識別的候選原因', columns: ['主盤', '候選盤：未提供可顯示的候選時間或口徑'] }),
    expect.objectContaining({ label: '紫微｜未識別的候選原因' }),
  ]));
  expect(changed.every(item => !item.label.includes('undefined'))).toBe(true);
});

test('unresolved source reference is explicitly marked and is not presented as evidence', () => {
  const report = analyze({ ...unknown, timeKnown: true, timeAccuracy: 'exact', hour: 14 });
  const lookup = sourceEvidence(report);
  const markup = renderToStaticMarkup(<ReportEvidenceContext.Provider value={lookup}><Sources items={[
    { system: 'ziwei', componentId: 'invented', name: '候選來源' },
    { system: 'ziwei', componentId: 'mutagen_科', name: '生年四化' },
  ]} /></ReportEvidenceContext.Provider>);
  expect(markup).toContain('未提供命盤依據（來源代碼：invented）');
  expect(markup).toContain('生年文曲化科・子女');
});

test('source resolver shows real natal pillars, palace and 四化 without substituting as-of year data', () => {
  const report = analyze({ ...unknown, timeKnown: true, timeAccuracy: 'exact', hour: 14 });
  const lookup = sourceEvidence(report);
  expect(lookup('bazi', 'natal')?.detail).toContain('日柱 戊申');
  expect(lookup('ziwei', 'mutagen_科')?.detail).toBe('生年文曲化科・子女');
  expect(lookup('ziwei', 'palace_0')?.detail).toMatch(/^[^・]+・.寅/);
  expect(lookup('ziwei', 'flyingStars_yearly', 'timeline')).toBeUndefined();
  expect(lookup('bazi', 'invented')).toBeUndefined();
  const cells = selectTimelineYears(report)!.rows.flatMap(row => row.cells);
  const cell = cells.find(item => item.topSignals.some(signal => signal.system === 'bazi' && timelineEvidence(report, item)(signal.id)?.trace.length))!;
  expect(cell).toBeDefined();
  const markup = renderToStaticMarkup(<TimelineDetail cell={cell} report={report} />);
  expect(markup).toContain('查看命盤部件與判讀依據');
  expect(markup).toMatch(/ v\d+<\/code>/);
});
