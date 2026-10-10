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
export { answerQuestion, buildTimeline, buildTimelineCooperatively, TimelineEnvironmentChangedError, getQuestionCategory, listQuestionCategories, TIMELINE_SYSTEMS } from '@fortune/core';
export type { QuestionAnswer, QuestionRange, Signal as CoreSignal, SignalWindow, TimelineOptions } from '@fortune/core';

// 短訊號編號（sig_ + 8 位）：輸出可縮短，輸入接受完整編號或 ≥ 8 位前綴（前綴要唯一才解析）。
export { resolveSignalId, shortSignalId } from '@fortune/core';
export { directionalVotes, evidenceMatchesContext, validAgreementThresholds } from '@fortune/core';
export type { DirectionalEvidence } from '@fortune/core';
export type { SignalIdResolution } from '@fortune/core';

// M4-02: `.fortune.json` profile file (shared with the local MCP server).
export {
  PROFILE_FILE_EXTENSION, PROFILE_ID_RE, chartFingerprint, createProfileFile, isValidProfileId, serializeProfileFile,
} from '@fortune/core';
export type { BirthProfile } from '@fortune/core';

// 歷史時區不確定的警告文字，與各計算器共用同一份。
export const HISTORICAL_ZONE_WARNING_TEXT: string = core.HISTORICAL_ZONE_WARNING_TEXT;

export const parseIsoDate =(value: string): YMD => core.parseIsoDate(value);
export const toIsoDate = (date: YMD): string => core.toIsoDate(date);
export const solarToLunarDate = (date: YMD): LunarInput => core.solarToLunarDate(date);
export const lunarToSolarDate = (date: LunarInput): YMD & { iso: string } => core.lunarToSolarDate(date);
