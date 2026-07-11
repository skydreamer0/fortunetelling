/**
 * @fileoverview `analyze()` — the single public orchestrator.
 *
 * Turns raw birth input into the standard `Report`: runs every registered
 * engine, classifies all components into L0–L3 layers, and attaches the
 * transparent scoring-rule registry. The Block G/H advanced fields (radars /
 * stateTable / evolution / honesty audit) ship as **stable empty shells** so
 * the report shape is final from day one; milestones C/D fill them in.
 *
 * @module core/analyze
 */

import { BirthData } from './models/BirthData.js';
import { LayerClassifier } from '../analysis/LayerClassifier.js';
import { ScoringRules } from '../analysis/ScoringRules.js';
import { HonestyGuard } from '../analysis/HonestyGuard.js';
import { StateSwitchTable } from '../analysis/StateSwitchTable.js';
import { EvolutionCalculator } from '../analysis/EvolutionCalculator.js';
import { createDefaultRegistry } from '../engines/index.js';

/** Public library version (semver). Bump on any observable API change. */
export const VERSION = '0.1.0';

/**
 * Version of the `Report` shape itself, independent of code version.
 * Consumers should check this before deserializing stored reports.
 */
export const REPORT_SCHEMA_VERSION = 1;

/**
 * @typedef {import('./models/SystemResult.js').SystemResult} SystemResult
 * @typedef {import('../analysis/LayerClassifier.js').LayerClassification} LayerClassification
 */

/**
 * @typedef {Object} Report
 * @property {string} version        - Library version that produced the report
 * @property {number} schemaVersion  - Report shape version
 * @property {string} generatedAt    - ISO timestamp of generation
 * @property {string} asOf           - Evaluation date (YYYY-MM-DD) for L1/L2 layers
 * @property {Object} input          - Normalized birth input echo
 * @property {SystemResult[]} engines - Raw per-engine results
 * @property {LayerClassification} layers - Block H① L0–L3 classification
 * @property {Object} scoringRules   - Block G transparency: full rule registry export
 * @property {Object[]} radars       - Block G radars（里程碑 C 填入，先為空）
 * @property {{ scenarios: Object[], pending: boolean }} stateTable - Block H②（里程碑 D）
 * @property {{ periods: Object[], narrative: string, pending: boolean }} evolution - Block H③（里程碑 D）
 * @property {{ languageRules: Object[], violations: Object[], pending: boolean }} honesty - Block H④
 */

/**
 * Run the full analysis pipeline against one birth datum.
 *
 * @param {import('./models/BirthData.js').BirthDataParams | BirthData} input
 *   Raw birth parameters（year/month/day/hour/minute/gender/name/longitude/latitude）
 *   or a ready-made BirthData instance.
 * @param {Object} [options]
 * @param {Date|string|null} [options.asOf=null] - Evaluation date for the
 *   time-varying layers（L1 大限/大運、L2 流年）. Defaults to today.
 * @returns {Report}
 * @throws {Error} If the input fails BirthData validation. Individual engine
 *   failures do NOT throw — they surface as `errors` on that engine's result.
 */
export function analyze(input, { asOf = null } = {}) {
  const birth = input instanceof BirthData ? input : new BirthData(input ?? {});
  birth.validate(); // fail fast with a clear message before running engines

  const asOfDate = asOf ? new Date(asOf) : new Date();
  if (Number.isNaN(asOfDate.getTime())) {
    throw new Error(`Invalid asOf date: ${asOf}`);
  }
  const asOfStr = asOfDate.toISOString().slice(0, 10);

  const registry = createDefaultRegistry({ asOf: asOfDate });
  const engines = registry.runAll(birth);

  const classifier = new LayerClassifier();
  const layers = classifier.classify(engines);

  const scoring = new ScoringRules();

  const report = {
    version: VERSION,
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    asOf: asOfStr,
    input: {
      year: birth.year,
      month: birth.month,
      day: birth.day,
      hour: birth.hour,
      minute: birth.minute,
      gender: birth.gender,
      name: birth.name,
      longitude: birth.longitude,
      latitude: birth.latitude,
    },
    engines,
    layers,
    scoringRules: scoring.exportRules(),

    // ── 區塊 G/H 進階欄位：穩定空殼（shape 已定案，里程碑 C/D 填肉）──
    radars: [],
    stateTable: { scenarios: [], pending: true },
    evolution: { periods: [], narrative: '', pending: true },
    honesty: {
      // 語言規則來自分層定義；違規由下方 HonestyGuard 稽核填入（D1）
      languageRules: layers.layerDefinitions.map(d => ({
        layer: d.code,
        name: d.name,
        rule: d.languageRule,
      })),
      violations: [],
      pending: true,
    },
  };

  // ── 區塊 H②：狀態切換表（D2）——必須在誠實稽核前填入，讓自產文字受檢 ──
  report.stateTable.scenarios = StateSwitchTable.build(layers);
  report.stateTable.pending = false;

  // ── 區塊 H③：時期演化（D4）——同樣先於誠實稽核填入，讓自產文字受檢 ──
  const evolution = EvolutionCalculator.calculate(engines, { asOf: asOfStr });
  report.evolution.periods = evolution.periods;
  report.evolution.narrative = evolution.narrative;
  report.evolution.pending = false;

  // ── 區塊 H④：組完 Report 後跑誠實稽核（D1）──
  report.honesty.violations = HonestyGuard.auditReport(report);
  report.honesty.pending = false;

  return report;
}
