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
export { analyze, VERSION, REPORT_SCHEMA_VERSION } from './core/analyze.js';

// ── Core models & engine framework（自建引擎/自組管線用）──
export { BirthData } from './core/models/BirthData.js';
export { SystemResult } from './core/models/SystemResult.js';
export { BaseEngine } from './core/BaseEngine.js';
export { EngineRegistry } from './core/EngineRegistry.js';

// ── Engines ──
export {
  createEngines,
  createDefaultRegistry,
  ZiweiEngine,
  NumerologyEngine,
  MingGuaEngine,
  DreamspellEngine,
  BaZiEngine,
} from './engines/index.js';

// ── Analysis ──
export { LayerClassifier } from './analysis/LayerClassifier.js';
export { ScoringRules } from './analysis/ScoringRules.js';
export { HonestyGuard, QUALITATIVE_PATTERNS } from './analysis/HonestyGuard.js';
export {
  StateSwitchTable,
  SCENARIO_DEFINITIONS,
  CATEGORY_SCENARIO_MAP,
  TEN_GOD_GROUP_SCENARIO_MAP,
  TEN_GOD_GROUP_EXPRESSIONS,
} from './analysis/StateSwitchTable.js';

// ── Visualization（框架無關的文字降級輸出）──
export * as TextFallback from './visualization/TextFallback.js';
