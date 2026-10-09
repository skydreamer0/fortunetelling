import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { makeFixture } from './helpers';

let fx: Awaited<ReturnType<typeof makeFixture>>;
const base = { profileId: 'sky', asOf: '2026-09-30' };
beforeAll(async () => { fx = await makeFixture(); }, 120_000);
afterAll(() => fx.cleanup());

describe('#44 MCP directional provenance', () => {
  test('timeline and filtered consensus expose the recorded theta/tau and activity semantics', async () => {
    const timeline = await fx.call('get_timeline', { ...base, domain: 'career', detail: true });
    expect(timeline.isError).toBe(false);
    expect(timeline.json.data.thresholds).toEqual({ theta: 0.5, tau: 0.2 });
    const domain = timeline.json.data.years[0].domains[0];
    expect(typeof domain.activityAgreement).toBe('number');
    expect(domain.directionalEvidence.policy).toBe('nonexperimental-directional-v1');
    const consensus = await fx.call('get_consensus', { ...base, systems: ['bazi', 'ziwei', 'numerology'] });
    expect(consensus.isError).toBe(false);
    expect(consensus.json.data.thresholds).toEqual(timeline.json.data.thresholds);
  }, 120_000);

  test('future question signals resolve and bring their same-analysis evidence into answer checking', async () => {
    const answer = await fx.call('answer_question', { ...base, category: 'job_change', range: { start: '2027-07', end: '2027-07' }, detail: true });
    expect(answer.isError).toBe(false);
    expect(answer.json.data.thresholds).toEqual({ theta: 0.5, tau: 0.2 });
    const ids: string[] = answer.json.data.status === 'ranked' ? answer.json.data.top[0].signalIds : answer.json.data.ranking[0].signalIds;
    expect(ids.length).toBeGreaterThan(0);
    const resolved = await fx.call('get_signal', { ...base, signalId: ids[0] });
    expect(resolved.isError).toBe(false);
    const checked = await fx.call('check_answer', { ...base, answerText: `這段時期傾向有變動〔${ids[0]}〕。` });
    expect(checked.isError).toBe(false);
    expect(checked.json.data.unknownCitations).toEqual([]);
    const analysis: any = await fx.ctx.analyzer.get(base.profileId, base.asOf);
    expect(typeof analysis.directionalEvidence).toBe('function');
    expect(analysis.directionalEvidence().some((proof: any) => proof.window.start === '2027-07-01')).toBe(true);
  }, 120_000);
});
