import { describe, expect, test } from 'bun:test';
import fixtures from './fixtures/questionAbstention.v3.json';
import { answerQuestion, getQuestionCategory, replayQuestionAnswerV2, QUESTION_CATALOG, type SignalProvider } from '../src/questions';
import archivedCatalog from '../src/questions/catalog.v2.json';
import { createSignal } from '../src/signals/createSignal';

const request = { category: 'investment', range: { start: '2027-01', end: '2027-03' } };

function provider(intensities: readonly number[]): SignalProvider {
  return window => getQuestionCategory(request.category)!.domains.map(({ domain }) => createSignal({
    system: 'bazi', ruleId: 'test.question-abstention', ruleVersion: 1,
    domain, trait: 'opportunity', intensity: intensities[Number(window.start.slice(5, 7)) - 1],
    valence: 0.5, window, target: domain,
  }));
}

describe('#45 red-first abstention fixtures', () => {
  for (const fixture of fixtures.fixtures) {
    test(fixture.name, () => {
      const answer = answerQuestion(request, provider(fixture.intensities));
      expect<string>(answer.status).toBe(fixture.status);
      expect(answer.top.map(row => row.window.start.slice(0, 7))).toEqual(fixture.topMonths);
      if (fixture.status === 'ranked') expect(answer.abstentionReasons).toEqual([]);
      else expect(answer.abstentionReasons.length).toBeGreaterThan(0);
      if (fixture.status !== 'ranked') {
        expect(answer.ranking.map(row => row.rank)).toEqual([null, null, null]);
        expect(answer.ranking.map(row => row.window.start)).toEqual(['2027-01-01', '2027-02-01', '2027-03-01']);
      }
      expect(answer.ranking.map(row => row.score).sort((a, b) => a - b))
        .toEqual(fixture.intensities.map(value => value * 100).sort((a, b) => a - b));
    });
  }
});

describe('#45 policy boundaries and PR77 replay', () => {
  test('no data and assessed zero scores have different reasons', () => {
    expect(answerQuestion(request, () => []).abstentionReasons[0].code).toBe('no_signals');
    expect(answerQuestion(request, provider([0, 0, 0])).abstentionReasons[0].code).toBe('all_zero_scores');
  });
  test('priority: zero before low, low before tie; top tie need not include every month', () => {
    for (const [values, status] of [[[0,0,0], 'insufficient_evidence'], [[.2,.2,.1], 'no_clear_advantage'], [[.8,.8,.5], 'tied']] as const) {
      const a = answerQuestion(request, provider(values));
      expect(a.status).toBe(status); expect(a.top).toEqual([]);
    }
  });
  test('topN is presentation only, including zero and one', () => {
    for (const topN of [0,1,3,10]) {
      const a = answerQuestion(request, provider([.8,.6,.7]), { topN });
      expect(a.status).toBe('ranked'); expect(a.abstentionReasons).toEqual([]);
      expect(a.top.length).toBe(Math.min(topN, 3));
      expect(answerQuestion(request, provider([.8,.8,.7]), { topN }).status).toBe('tied');
    }
  });
  test('inclusive low-band boundary and rounded-score ties use one effective policy', () => {
    expect(answerQuestion(request, provider([.35,.2,.1])).status).toBe('ranked');
    expect(answerQuestion(request, provider([.349999,.2,.1])).status).toBe('no_clear_advantage');
    expect(answerQuestion(request, provider([.8,.8000001,.1])).status).toBe('tied');
    const a = answerQuestion(request, provider([.4,.2,.1]), { bandCuts: [50,70,90] });
    expect(a.status).toBe('no_clear_advantage'); expect(a.rankingPolicy.minimumScore).toBe(50);
    expect(a.ranking.every(row => row.band === '低')).toBe(true);
    const catalog = { ...QUESTION_CATALOG, rankingPolicy: { ...QUESTION_CATALOG.rankingPolicy!, bandCuts: [40,60,80] as [number,number,number] } };
    expect(answerQuestion(request, provider([.4,.2,.1]), { catalog }).status).toBe('ranked');
  });
  test('invalid bands are rejected even without signals; frozen catalog requires explicit replay', () => {
    for (const bandCuts of [[NaN,55,75], [35,Infinity,75], [55,35,75], [-1,55,75], [35,55,101]]) {
      expect(() => answerQuestion(request, () => [], { bandCuts: bandCuts as [number,number,number] })).toThrow(/bandCuts/);
    }
    expect(() => answerQuestion(request, provider([.8,.7,.6]), { catalog: archivedCatalog as any })).toThrow(/replayQuestionAnswerV2/);
  });
  test('systems and zero weights apply before abstention without changing the scoring formula', () => {
    expect(answerQuestion(request, provider([.8,.7,.6]), { systems: ['ziwei'] }).status).toBe('insufficient_evidence');
    expect(answerQuestion(request, provider([.8,.7,.6]), { aggregate: { systemWeights: { bazi: 0 } } }).status).toBe('insufficient_evidence');
  });
  test('all decisions preserve exact per-month scores/evidence from PR77, and replay has no new fields', () => {
    for (const { intensities } of fixtures.fixtures) {
      const p = provider(intensities), old = replayQuestionAnswerV2(request, p), live = answerQuestion(request, p);
      expect(old.catalogVersion).toBe(2); expect(old).not.toHaveProperty('status');
      expect(old.ranking.map(row => row.rank)).toEqual([1,2,3]);
      for (const row of live.ranking) {
        const { rank: _newRank, ...value } = row;
        const { rank: _oldRank, ...before } = old.ranking.find(oldRow => oldRow.window.start === row.window.start)!;
        expect(value).toEqual(before);
      }
      expect(JSON.stringify(answerQuestion(request, p))).toBe(JSON.stringify(live));
    }
  });
  test('unsupported never calls the provider and is explicit in serialized answers', () => {
    const a = answerQuestion({ ...request, category: 'unknown' }, () => { throw Error('must not run'); });
    expect(JSON.parse(JSON.stringify(a))).toMatchObject({ status:'unsupported',top:[],ranking:[],abstentionReasons:[{code:'unsupported_category'}] });
  });
});
