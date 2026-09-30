import {
  analyzeCompatibility,
  answerQuestion,
  getQuestionCategory,
  listQuestionCategories,
  monthsInRange,
  timeContextToBirthData,
  type QuestionAnswer,
  type RankedWindow,
  type Signal,
  type SignalWindow,
} from '@fortune/core';
import { z } from 'zod';
import type { Analysis } from '../compute';
import { assertAsOf, resolvableYearRange } from '../compute';
import { caveatsFor, ok, type Caveat } from '../envelope';
import { ToolError } from '../errors';
import { defineTool } from './types';

const MAX_MONTHS = 36;
const RANKING_LIMIT = 12;
const YM = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Month signals from the timeline layer (per-year `buildTimeline`, cached on the analysis). Mirrors the web app's provider. */
export function monthSignalProvider(analysis: Pick<Analysis, 'monthSignals'>): (window: SignalWindow) => Signal[] {
  return window => analysis.monthSignals(Number(window.start.slice(0, 4))).get(window.start.slice(0, 7)) ?? [];
}

const slimSignal = (s: Signal) => ({ id: s.id, system: s.system, ruleId: s.ruleId, domain: s.domain, trait: s.trait, intensity: s.intensity, valence: s.valence });

function slimWindow(r: RankedWindow) {
  return {
    rank: r.rank,
    window: r.window,
    score: r.score,
    band: r.band,
    consensus: r.consensus,
    highConsensus: r.highConsensus,
    conflict: r.conflict,
    domainScores: r.domainScores,
    supportSignals: r.supportSignals.map(slimSignal),
    riskSignals: r.riskSignals.map(slimSignal),
    signalIds: r.signalIds,
  };
}

function slimRanked(r: RankedWindow) {
  return { rank: r.rank, window: r.window, score: r.score, band: r.band, highConsensus: r.highConsensus };
}

export function slimAnswer(answer: QuestionAnswer) {
  return {
    category: answer.category,
    range: answer.range,
    top: answer.top.map(slimWindow),
    ranking: answer.ranking.slice(0, RANKING_LIMIT).map(slimRanked),
    rankingTotal: answer.ranking.length,
    conventions: answer.conventions,
    catalogVersion: answer.catalogVersion,
    ...(answer.categoryVersion !== undefined ? { categoryVersion: answer.categoryVersion } : {}),
  };
}

const ymShape = z.string().regex(YM, "must be 'YYYY-MM'");

export const questionTools = [
  defineTool({
    name: 'list_question_categories',
    description: 'List the question categories answer_question supports (id, name, domains). No profile needed.',
    input: {},
    async handler() {
      const categories = listQuestionCategories().map(c => ({
        id: c.id,
        name: c.name,
        domains: c.domains.map(d => d.domain),
      }));
      return ok({ asOf: null, data: { categories }, caveats: [], ephemeris: 'not_initialized' });
    },
  }),
  defineTool({
    name: 'answer_question',
    description:
      "Rank the months of a range (max 36) for a question category, using core's deterministic Question Engine over the profile's timeline signals. " +
      'Returns top windows with scores and source signals plus a truncated ranking. Unknown category → { unsupported: true }.',
    input: {
      profileId: z.string(),
      category: z.string().describe('Category id from list_question_categories.'),
      range: z.object({ start: ymShape, end: ymShape }).strict(),
      asOf: z.string().describe("Required 'YYYY-MM-DD'."),
    },
    async handler({ profileId, category, range, asOf }, { analyzer }) {
      assertAsOf(asOf);
      const n = monthsInRange(range);
      if (n < 1) throw new ToolError('invalid_args', `range.start (${range.start}) is after range.end (${range.end})`);
      if (n > MAX_MONTHS) throw new ToolError('invalid_args', `range spans ${n} months; at most ${MAX_MONTHS} allowed`);
      const years = resolvableYearRange(asOf);
      const startYear = Number(range.start.slice(0, 4));
      const endYear = Number(range.end.slice(0, 4));
      if (startYear < years.min || endYear > years.max) {
        throw new ToolError('invalid_args', `range must stay within ${years.min}-${years.max} for asOf ${asOf}`, 'Cited signals are only resolvable by get_signal inside this window.');
      }
      const analysis = await analyzer.get(profileId, asOf);
      const caveats = caveatsFor(analysis);
      const availableCategories = listQuestionCategories().map(c => c.id);
      if (!getQuestionCategory(category)) {
        const answer = answerQuestion({ category, range }, () => []);
        return ok({ asOf, caveats, data: { unsupported: true as const, category: answer.category, range: answer.range, conventions: answer.conventions, catalogVersion: answer.catalogVersion, availableCategories } });
      }
      let answer: QuestionAnswer;
      try {
        answer = answerQuestion({ category, range }, monthSignalProvider(analysis));
      } catch (e) {
        if (e instanceof ToolError) throw e;
        throw new ToolError('invalid_args', e instanceof Error ? e.message : String(e));
      }
      return ok({ asOf, caveats, data: slimAnswer(answer) });
    },
  }),
  defineTool({
    name: 'compare_profiles',
    description:
      "Transparent two-person comparison of existing report values (five-element balance, life path, ming gua) via core analyzeCompatibility. Names and birth data are not returned; people are labelled A and B. Does not predict relationship outcomes.",
    input: {
      profileIdA: z.string(),
      profileIdB: z.string(),
      asOf: z.string().describe("Required 'YYYY-MM-DD'."),
    },
    async handler({ profileIdA, profileIdB, asOf }, { analyzer }) {
      assertAsOf(asOf);
      if (profileIdA === profileIdB) throw new ToolError('invalid_args', 'profileIdA and profileIdB must differ');
      const a = await analyzer.get(profileIdA, asOf);
      const b = await analyzer.get(profileIdB, asOf);
      const result = analyzeCompatibility(
        timeContextToBirthData(a.ctx, { name: '' }),
        timeContextToBirthData(b.ctx, { name: '' }),
        { asOf },
      );
      const { generatedAt: _generatedAt, people, ...rest } = result;
      const labels = ['A', 'B'];
      const safePeople = people.map((p, i) => ({ label: labels[i], lifePath: p.lifePath, mingGua: p.mingGua }));
      const seen = new Set<string>();
      const caveats: Caveat[] = [];
      for (const c of [...caveatsFor(a), ...caveatsFor(b), { code: 'compare_scope', message: 'Comparison only contrasts existing numbers in the two reports; it does not predict whether a relationship succeeds or fails.' }]) {
        if (seen.has(c.code)) continue;
        seen.add(c.code);
        caveats.push(c);
      }
      return ok({ asOf, caveats, data: { ...rest, asOf, people: safePeople } });
    },
  }),
];
