/**
 * @fileoverview 命理綜合分析平台 — 唯一公開 API（barrel）。
 *
 * 他人重用此函式庫時只應 import 這個模組：
 *
 * ```js
 * import { analyze, BirthData, VERSION } from 'fortunetelling';
 * const report = analyze(
 *   { year: 1991, month: 10, day: 5, hour: 14, gender: 'female', name: '…' },
 *   { asOf: '2026-07-11' },
 * );
 * ```
 *
 * 深路徑（`fortunetelling/src/...`）不在 semver 保證範圍內。
 *
 * @module fortunetelling
 */

// ── Orchestrator ──
export { analyze, VERSION, REPORT_SCHEMA_VERSION } from './core/analyze';
export { createCalculationSpec, CALCULATION_SPEC_SCHEMA_VERSION } from './core/calculationSpec';
export type { CalculationSpec, CalculationIdentity } from './core/calculationSpec';
export { analyzeCompatibility, COMPATIBILITY_SCHEMA_VERSION } from './core/analyzeCompatibility';

// ── Core models & engine framework（自建引擎/自組管線用）──
export { BirthData } from './core/models/BirthData';
export { lunarToSolarDate, solarToLunarDate, parseIsoDate, toIsoDate } from './core/calendar';
export { SystemResult } from './core/models/SystemResult';
export { BaseEngine } from './core/BaseEngine';
export { EngineRegistry } from './core/EngineRegistry';

// ── Engines ──
export {
  createEngines,
  createDefaultRegistry,
  ZiweiEngine,
  NumerologyEngine,
  MingGuaEngine,
  DreamspellEngine,
  BaZiEngine,
} from './engines/index';

// ── Analysis ──
export { LayerClassifier } from './analysis/LayerClassifier';
export { ScoringRules } from './analysis/ScoringRules';
export { HonestyGuard, QUALITATIVE_PATTERNS } from './analysis/HonestyGuard';
export {
  StateSwitchTable,
  SCENARIO_DEFINITIONS,
  CATEGORY_SCENARIO_MAP,
  TEN_GOD_GROUP_SCENARIO_MAP,
  TEN_GOD_GROUP_EXPRESSIONS,
} from './analysis/StateSwitchTable';
export {
  EvolutionCalculator,
  DAYUN_OVERLAY_PER_CHAR,
  DAYUN_STEM_WEIGHT,
  DAYUN_BRANCH_WEIGHT,
} from './analysis/EvolutionCalculator';
export { SummaryBuilder, SUMMARY_VERSION } from './analysis/SummaryBuilder';
export { InsightBuilder, INSIGHT_VERSION } from './analysis/InsightBuilder';

// ── Visualization（框架無關的文字降級輸出）──
export * as TextFallback from './visualization/TextFallback';

// ── V2 架構（ARCHITECTURE-V2）──
// ① 出生資料與時間標準化層（V1-01／V1-02）
export * from './profile/index';
export * from './time/index';
// Native-period primitives (#55); existing timelines still use SignalWindow.
export * from './period/index';
// ④ Signal 模型與彙整（V1-09）
export * from './signals/index';
// ② 純函式計算器（V1-06／V1-07）；以命名空間匯出，避免同名 helper 衝突
export * as Numerology from './calculators/numerology/numerology';
export * as Tzolkin from './calculators/tzolkin/tzolkin';
// ② 計算器契約與各系統計算器（V1-03 起）
export * from './calculators/index';
// ⑤ Timeline（V1-13）與 ⑥ 問事引擎（V5-01/02）
export * from './timeline/index';
export * from './questions/index';
// V3 跨系統共識摘要（Report v5 `consensus`，D-034）
export * from './consensus/index';
// ⑧ 人生事件與回驗（V4-03／V4-04／V4-05）
export * from './backtest/index';

// M0.5: portable profile file, canonical JSON, version block (D-037)
export * from './portable/index';

// Jyotish / Human Design need the ephemeris (async), so they are not in the sync CALCULATORS; they live in
// EPHEMERIS_CALCULATORS (M5-03, D-039: humanDesign verified, jyotish still experimental). The individual
// calculators stay exported for consumers (MCP) that need one system. Call `await initEphemeris()` first.
export { EPHEMERIS_CALCULATORS, runEphemerisCalculators } from './calculators/ephemerisRegistry';
export type { EphemerisCalculatorEntry } from './calculators/ephemerisRegistry';
export { initEphemeris, isEphemerisReady } from './calculators/astro/index';
export { jyotishCalculator } from './calculators/jyotish/calculator';
export { humanDesignCalculator } from './calculators/humanDesign/calculator';
export * from './export/index';
