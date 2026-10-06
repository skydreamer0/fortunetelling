import {
  EXPERIMENTAL_SYSTEM_IDS,
  analyzeCompatibility,
  answerQuestion,
  experimentalSensitivity,
  getQuestionCategory,
  listQuestionCategories,
  monthsInRange,
  timeContextToBirthData,
  type ExperimentalSensitivity,
  type QuestionAnswer,
  type RankedWindow,
  type Signal,
  type SignalWindow,
} from '@fortune/core';
import { z } from 'zod';
import { compactAnswer, type Shorten, sensitivityCaveat, sensitivityOut } from '../answerSummary';
import type { Analysis } from '../compute';
import { assertAsOf, resolvableYearRange } from '../compute';
import { caveatsFor, ok, type Caveat } from '../envelope';
import { ToolError } from '../errors';
import { routeQuestion } from '../questionRouter';
import { previewIds } from '../slim';
import { resolveSystems, systemsFields, systemsInput, verifiedOnlyInput } from '../systems';
import { defineTool } from './types';

export const MAX_MONTHS = 36;
const RANKING_LIMIT = 12;
const YM = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Month signals from the timeline layer (per-year `buildTimeline`, cached on the analysis). Mirrors the web app's provider. */
export function monthSignalProvider(analysis: Pick<Analysis, 'monthSignals'>): (window: SignalWindow) => Signal[] {
  return window => analysis.monthSignals(Number(window.start.slice(0, 4))).get(window.start.slice(0, 7)) ?? [];
}

const slimSignal = (s: Signal, sh: Shorten) => ({ id: sh([s.id])[0], system: s.system, ruleId: s.ruleId, domain: s.domain, trait: s.trait, intensity: s.intensity, valence: s.valence });

function slimWindow(r: RankedWindow, detail: boolean, sh: Shorten) {
  return {
    rank: r.rank,
    window: r.window,
    score: r.score,
    band: r.band,
    consensus: r.consensus,
    activityAgreement: r.activityAgreement,
    highConsensus: r.highConsensus,
    conflict: r.conflict,
    domainScores: r.domainScores.map(d => ({ ...d, signalIds: sh(previewIds(d.signalIds, detail)), signalIdsTotal: d.signalIds.length })),
    supportSignals: previewIds(r.supportSignals, detail).map(x => slimSignal(x, sh)),
    supportSignalsTotal: r.supportSignals.length,
    riskSignals: previewIds(r.riskSignals, detail).map(x => slimSignal(x, sh)),
    riskSignalsTotal: r.riskSignals.length,
    signalIds: sh(previewIds(r.signalIds, detail)),
    signalIdsTotal: r.signalIds.length,
  };
}

function slimRanked(r: RankedWindow) {
  return { rank: r.rank, window: r.window, score: r.score, band: r.band, highConsensus: r.highConsensus };
}

/**
 * 舊的瘦身結構：answer_question 的 `detail: true` 以 `slimAnswer(answer, true)` 回傳完整結構；
 * 預設回應改用 answerSummary.ts 的 `compactAnswer`。`detail = false` 仍保留給程式呼叫端使用。
 */
export function slimAnswer(answer: QuestionAnswer, detail = false, sh: Shorten = ids => [...ids]) {
  return {
    category: answer.category,
    thresholds: answer.thresholds,
    range: answer.range,
    top: answer.top.map(r => slimWindow(r, detail, sh)),
    ranking: answer.ranking.slice(0, RANKING_LIMIT).map(slimRanked),
    rankingTotal: answer.ranking.length,
    ...(detail ? { conventions: answer.conventions } : { conventionsOmitted: true as const }),
    catalogVersion: answer.catalogVersion,
    ...(answer.categoryVersion !== undefined ? { categoryVersion: answer.categoryVersion } : {}),
  };
}

const ymShape = z.string().regex(YM, "must be 'YYYY-MM'");

/** Omitted `range` = the asOf month and the 11 after it (12 months); echoed back with `rangeResolvedFrom: 'default'`. */
export function defaultRange(asOf: string): { start: string; end: string } {
  const year = Number(asOf.slice(0, 4));
  const month = Number(asOf.slice(5, 7));
  const last = year * 12 + (month - 1) + 11;
  const pad = (n: number) => String(n).padStart(2, '0');
  return { start: `${asOf.slice(0, 4)}-${pad(month)}`, end: `${Math.floor(last / 12)}-${pad((last % 12) + 1)}` };
}

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
      'First call list_question_categories to get a category id and pass it as category. ' +
      'Alternatively pass question (your own wording of the question) with category omitted: a fixed keyword table picks the category, and if nothing or several categories match you get invalid_args with availableCategories (no guessing, no LLM). ' +
      'The response says how it was chosen: categoryResolvedFrom "explicit" | "question". ' +
      'range {start,end} (YYYY-MM) is optional: when omitted it is the asOf month plus the next 11 months (12 months), and the response says so with rangeResolvedFrom "default". ' +
      'Default (compact) response: top = first 3 months, each { rank, month, score, band, highConsensus, domains (one summary line per domain), signalIds (max 3, resolvable with get_signal), oneLine (fixed-template reason) }, ' +
      'plus ranking = every month as [month, score, band]. detail: true returns the full structure instead (domainScores, support/risk signals, conventions); ranks and scores are identical. ' +
      'systems (e.g. ["bazi","ziwei"]) or verifiedOnly: true recompute the ranking from only those systems; the response always has systemsUsed, excludedSystems, experimentalIncluded. ' +
      'experimentalSensitivity { top3All, top3VerifiedOnly, changed } compares the top 3 with vs without the experimental systems (jyotish); if changed is true, tell the user the conclusion depends on unverified systems. ' +
      'Unknown explicit category → { unsupported: true }.',
    input: {
      profileId: z.string(),
      category: z.string().optional().describe('Category id from list_question_categories. Takes precedence over question.'),
      question: z.string().min(1).optional().describe('Natural-language question; only used to pick the category when category is omitted.'),
      range: z.object({ start: ymShape, end: ymShape }).strict().optional().describe('Default: asOf month through 11 months later.'),
      asOf: z.string().describe("Required 'YYYY-MM-DD'."),
      systems: systemsInput,
      verifiedOnly: verifiedOnlyInput,
      detail: z.boolean().optional().describe('Default false: compact top 3 + ranking table. true: the full structure (all signal ids, domainScores, conventions).'),
    },
    async handler({ profileId, category: explicitCategory, question, range: explicitRange, asOf, systems, verifiedOnly, detail }, { analyzer }) {
      assertAsOf(asOf);
      const availableCategories = listQuestionCategories().map(c => c.id);
      let category: string;
      let categoryResolvedFrom: 'explicit' | 'question';
      if (explicitCategory !== undefined) {
        category = explicitCategory;
        categoryResolvedFrom = 'explicit';
      } else if (question !== undefined) {
        const route = routeQuestion(question);
        if (route.status === 'ambiguous') {
          throw new ToolError(
            'invalid_args',
            route.candidates.length === 0
              ? 'Could not tell the question category from question'
              : `question matches several categories equally: ${route.candidates.join(', ')}`,
            'Pass category explicitly (ids from list_question_categories).',
            { availableCategories, ...(route.candidates.length ? { candidates: route.candidates } : {}) },
          );
        }
        category = route.category;
        categoryResolvedFrom = 'question';
      } else {
        throw new ToolError('invalid_args', 'Provide category or question', 'Call list_question_categories and pass a category id.', { availableCategories });
      }
      const range = explicitRange ?? defaultRange(asOf);
      const rangeResolvedFrom = explicitRange ? 'explicit' : 'default';
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
      const sel = resolveSystems(analysis, systems, verifiedOnly);
      const caveats = caveatsFor(analysis, sel);
      if (!getQuestionCategory(category)) {
        const answer = answerQuestion({ category, range }, () => []);
        return ok({ asOf, caveats, data: { unsupported: true as const, category: answer.category, categoryResolvedFrom, range: answer.range, rangeResolvedFrom, ...systemsFields(sel), ...(detail ? { conventions: answer.conventions } : { conventionsOmitted: true as const }), catalogVersion: answer.catalogVersion, availableCategories } });
      }
      const provider = monthSignalProvider(analysis);
      let answer: QuestionAnswer;
      let sensitivity: ExperimentalSensitivity | null;
      try {
        // 不篩選時走原本的路徑（輸出與改動前相同）；篩選時由 core 只採計 systemsUsed 的訊號重算。
        const aggregate = { systemWeights: analysis.timeline.systemWeights,
          consensusThreshold: analysis.timeline.thresholds.theta, conflictThreshold: analysis.timeline.thresholds.tau };
        answer = answerQuestion({ category, range }, provider, { aggregate, ...(sel.filtered ? { systems: sel.systemsUsed } : {}) });
        analysis.rememberQuestionEvidence(answer);
        // 敏感度：同一問題、同一範圍，(採計的系統 ∪ 可用的實驗性系統) 對 (採計的系統 − 實驗性系統)。
        sensitivity = experimentalSensitivity({ category, range }, provider, {
          systems: sel.systemsUsed,
          aggregate,
          experimental: EXPERIMENTAL_SYSTEM_IDS.filter(s => analysis.timeline.systems.includes(s)),
        });
      } catch (e) {
        if (e instanceof ToolError) throw e;
        throw new ToolError('invalid_args', e instanceof Error ? e.message : String(e));
      }
      const warn = sensitivity ? sensitivityCaveat(sensitivity) : null;
      if (warn) caveats.push(warn);
      const extra = {
        categoryResolvedFrom,
        rangeResolvedFrom,
        ...systemsFields(sel),
        experimentalSensitivity: sensitivity ? sensitivityOut(sensitivity) : null,
      };
      const body = detail ? slimAnswer(answer, true, analysis.shortIds) : compactAnswer(answer, analysis.shortIds);
      return ok({ asOf, caveats, data: { ...body, ...extra } });
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
