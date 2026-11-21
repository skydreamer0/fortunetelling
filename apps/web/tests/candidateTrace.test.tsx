import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { ChartCandidates } from '../src/components/report/ChartCandidates';
import { TimelineDetail } from '../src/components/report/Timeline';
import { analyze, birthTimeSnapshot } from '../src/lib/core';
import { chartCandidates, compareChosenTimes, proposedTime } from '../src/model/chartCandidates';
import { selectTimelineYears } from '../src/model/selectors';
import { sourceEvidence } from '../src/model/sourceEvidence';
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

test('source resolver shows real natal pillars, palace and 四化 without substituting as-of year data', () => {
  const report = analyze({ ...unknown, timeKnown: true, timeAccuracy: 'exact', hour: 14 });
  const lookup = sourceEvidence(report);
  expect(lookup('bazi', 'natal')?.detail).toContain('日柱 戊申');
  expect(lookup('ziwei', 'mutagen_科')?.detail).toBe('生年文曲化科・子女');
  expect(lookup('ziwei', 'palace_0')?.detail).toMatch(/^[^・]+・.寅/);
  expect(lookup('ziwei', 'flyingStars_yearly', 'timeline')).toBeUndefined();
  expect(lookup('bazi', 'invented')).toBeUndefined();
  const cells = selectTimelineYears(report)!.rows.flatMap(row => row.cells);
  const cell = cells.find(item => item.topSignals.some(signal => signal.system === 'bazi' && signal.trace?.length))!;
  expect(cell).toBeDefined();
  const markup = renderToStaticMarkup(<TimelineDetail cell={cell} />);
  expect(markup).toContain('查看命盤部件與判讀依據');
  expect(markup).toMatch(/ v\d+<\/code>/);
});
