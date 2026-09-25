/** Typed bridge to `@fortune/core` — the only place the UI calls the calculation library. */

import * as core from '@fortune/core';
import type { BirthInput, CompatibilityResult, LunarInput, Report } from '../model/types';

type YMD = { year: number; month: number; day: number };

export const analyze = (input: BirthInput): Report => core.analyze(input as any) as unknown as Report;

export const analyzeCompatibility = (first: BirthInput, second: BirthInput): CompatibilityResult =>
  core.analyzeCompatibility(first as any, second as any) as unknown as CompatibilityResult;

// V4 life events + backtesting: pure core functions, re-exported so components keep one bridge.
export {
  BACKTEST_METHOD, INSUFFICIENT_SAMPLE, LIFE_EVENT_CATEGORIES, LIFE_EVENT_CATEGORY_LABELS,
  buildBacktestTimeline, hashString, proposeWeights, runBacktest, suggestedDomains, validateLifeEvent,
} from '@fortune/core';
export type {
  BacktestGroup, BacktestMetrics, BacktestResult, BacktestTimeline, LifeEvent, LifeEventCategory, TimeContext,
} from '@fortune/core';

// V5 Question Engine (deterministic, no AI) + the timeline it reads month signals from.
export { answerQuestion, buildTimeline, getQuestionCategory, listQuestionCategories } from '@fortune/core';
export type { QuestionAnswer, QuestionRange, Signal as CoreSignal, SignalWindow } from '@fortune/core';

export const parseIsoDate = (value: string): YMD => core.parseIsoDate(value);
export const toIsoDate = (date: YMD): string => core.toIsoDate(date);
export const solarToLunarDate = (date: YMD): LunarInput => core.solarToLunarDate(date);
export const lunarToSolarDate = (date: LunarInput): YMD & { iso: string } => core.lunarToSolarDate(date);
