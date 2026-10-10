/**
 * @fileoverview V4 life events + backtesting (ARCHITECTURE-V2 §10, §10.1; D-029, D-033).
 * Pure, deterministic, browser-safe; no storage here (callers persist events).
 * @module backtest
 */
export * from './lifeEvents';
export { BACKTEST_TIMELINE_SCHEMA_VERSION, DEFAULT_BACKTEST_START_AGE, buildBacktestTimeline } from './timeline';
export type { BacktestDomainScores, BacktestYearCell, BacktestTimeline, BacktestTimelineOptions } from './timeline';
export * from './runBacktest';
export * from './proposeWeights';
export { hashString, mulberry32, seededShuffle } from './prng';
