/**
 * @fileoverview V4 life events + backtesting (ARCHITECTURE-V2 §10, §10.1; D-029, D-033).
 * Pure, deterministic, browser-safe; no storage here (callers persist events).
 * @module backtest
 */
export * from './lifeEvents';
export * from './timeline';
export * from './runBacktest';
export * from './proposeWeights';
export { hashString, mulberry32, seededShuffle } from './prng';
