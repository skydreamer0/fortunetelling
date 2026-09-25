/**
 * @fileoverview `analyze()` — the single public orchestrator.
 *
 * Turns raw birth input into the standard `Report`: builds the BirthProfile and
 * TimeContext (① time layer, D-026), runs every registered engine (八字／紫微 on
 * the TimeContext, the rest on the civil date), classifies all components into
 * L0–L3 layers, attaches the transparent scoring-rule registry, the Block G/H
 * fields, and — since Report v4 (D-032) — `timeContext`, `timeline` and
 * `signals`.
 *
 * @module core/analyze
 */

import { LayerClassifier } from '../analysis/LayerClassifier.js';
import { ScoringRules } from '../analysis/ScoringRules.js';
import { HonestyGuard } from '../analysis/HonestyGuard.js';
import { StateSwitchTable } from '../analysis/StateSwitchTable.js';
import { EvolutionCalculator } from '../analysis/EvolutionCalculator.js';
import { buildRadars } from '../analysis/RadarBuilder.js';
import { SummaryBuilder } from '../analysis/SummaryBuilder.js';
import { InsightBuilder } from '../analysis/InsightBuilder.js';
import { createDefaultRegistry } from '../engines/index.js';
import { createTimeContext } from '../time/createTimeContext';
import { buildTimeline, TIMELINE_SYSTEMS } from '../timeline/buildTimeline';
import { SYSTEM_IDS } from '../signals/types';
import { resolveAnalyzeInput, toZiweiZiConvention } from './analyzeInput';
import { TimeContextBaZiEngine, TimeContextZiweiEngine } from './timeContextEngines';

/** Public library version (semver). Bump on any observable API change. */
export const VERSION = '0.4.0';

/**
 * Version of the `Report` shape itself, independent of code version.
 * Consumers should check this before deserializing stored reports.
 */
export const REPORT_SCHEMA_VERSION = 4;

/** Timeline systems that need the Swiss Ephemeris; sync `analyze()` never initialises it. */
const EPHEMERIS_SYSTEMS = ['jyotish', 'humanDesign'];

/** 15° of longitude = 1 hour of local mean time away from the zone meridian. */
const LEGACY_MERIDIAN_TOLERANCE_DEG = 15;

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
 * @property {{ version: number, sentences: Object[], sourceSystems: string[], limitations: string[] }} summary - Cross-system plain-language overview
 * @property {{ version: number, domains: Object[], annual: Object, guidance: Object }} insights - User-question-oriented synthesis
 * @property {{ scenarios: Object[], pending: boolean }} stateTable - Block H②（里程碑 D）
 * @property {{ periods: Object[], narrative: string, pending: boolean }} evolution - Block H③（里程碑 D）
 * @property {{ languageRules: Object[], violations: Object[], pending: boolean }} honesty - Block H④
 * @property {Object} timeContext   - v4: TimeContext (profile without name) + `conventions`
 * @property {Object[]} signals     - v4: every timeline `topSignals` entry, deduped by id, sorted by id
 * @property {Object} timeline      - v4: sync `buildTimeline` (5 years + 12 months of the asOf year)
 */

/**
 * Run the full analysis pipeline against one birth datum.
 *
 * @param {Object | import('./models/BirthData.js').BirthData} input
 *   Raw birth parameters（year/month/day/hour/minute/timeKnown/gender/name/longitude/latitude）
 *   or a ready-made BirthData instance. v4 optional fields: `birthplace`
 *   ({ label, lat, lng, timezone }) or `cityId`, `timeAccuracy`,
 *   `ziHourConvention` ('late' | 'early'), `useTrueSolarTime` (default true).
 *   See `core/analyzeInput` for the birthplace resolution order.
 * @param {Object} [options]
 * @param {Date|string|null} [options.asOf=null] - Evaluation date for the
 *   time-varying layers（L1 大限/大運、L2 流年、timeline）. Defaults to today.
 * @returns {Report}
 * @throws {Error} If the input fails validation. Individual engine
 *   failures do NOT throw — they surface as `errors` on that engine's result.
 */
export function analyze(input, { asOf = null } = {}) {
  // fail fast with a clear message before running engines
  const { birth, profile, options, birthplaceSource } = resolveAnalyzeInput(input);

  const asOfDate = asOf ? new Date(asOf) : new Date();
  if (Number.isNaN(asOfDate.getTime())) {
    throw new Error(`Invalid asOf date: ${asOf}`);
  }
  const asOfStr = asOfDate.toISOString().slice(0, 10);

  // ① 時間標準化層（D-026）：唯一時間來源
  const ctx = createTimeContext(profile);

  // 八字／紫微改吃 TimeContext（真太陽時、精確交節、晚子）；其餘引擎沿用民用日期
  const registry = createDefaultRegistry({ asOf: asOfDate })
    .register(new TimeContextBaZiEngine({ asOf: asOfStr, ctx, ...options }))
    .register(new TimeContextZiweiEngine({ asOf: asOfDate, ctx, ...options }));
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
      ...(birth.timeKnown === false ? { timeKnown: false } : {}),
      gender: birth.gender,
      name: birth.name,
      longitude: birth.longitude,
      latitude: birth.latitude,
    },
    engines,
    layers,
    scoringRules: scoring.exportRules(),
    summary: SummaryBuilder.build(engines),
    insights: { version: 1, domains: [], annual: {}, guidance: {} },

    // ── 區塊 G/H 進階欄位 ──
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

    // ── v4（D-032）──
    timeContext: null,
    signals: [],
    timeline: null,
  };

  // ── 區塊 G：雷達（C2）——RadarBuilder 只填入既有 radars 空殼 ──
  report.radars = buildRadars(engines);

  // ── 使用者問題視圖：人生領域、本年運勢、平衡建議 ──
  report.insights = InsightBuilder.build(engines, report.radars, { asOf: asOfStr });

  // ── 區塊 H②：狀態切換表（D2）——必須在誠實稽核前填入，讓自產文字受檢 ──
  report.stateTable.scenarios = StateSwitchTable.build(layers);
  report.stateTable.pending = false;

  // ── 區塊 H③：時期演化（D4）——同樣先於誠實稽核填入，讓自產文字受檢 ──
  const evolution = EvolutionCalculator.calculate(engines, { asOf: asOfStr });
  report.evolution.periods = evolution.periods;
  report.evolution.narrative = evolution.narrative;
  report.evolution.pending = false;

  // ── v4：時間脈絡、時間軸、訊號——先於誠實稽核填入，讓訊號文字受檢 ──
  const timeline = buildSyncTimeline(ctx, asOfStr, birth.name);
  report.timeContext = buildReportTimeContext(ctx, options, birthplaceSource);
  report.timeline = timeline;
  report.signals = collectSignals(timeline);

  // ── 區塊 H④：組完 Report 後跑誠實稽核（D1）──
  report.honesty.violations = HonestyGuard.auditReport(report);
  report.honesty.pending = false;

  return report;
}

/**
 * Sync `buildTimeline` for the report. jyotish／humanDesign need the Swiss
 * Ephemeris (async WASM init) and are ALWAYS left out of `analyze()` — even when
 * another caller happened to initialise the ephemeris — so the report never
 * depends on global state (D-014). They are listed in `skippedSystems` with
 * reason 'time_unknown' (no birth time) or 'ephemeris_not_initialised'; use
 * `buildTimelineAsync(ctx, { asOf })` for the full timeline.
 */
function buildSyncTimeline(ctx, asOf, name) {
  const timeline = buildTimeline(ctx, {
    asOf,
    systems: TIMELINE_SYSTEMS.filter(s => !EPHEMERIS_SYSTEMS.includes(s)),
    ...(name ? { name } : {}),
  });
  const reason = ctx.utc === null ? 'time_unknown' : 'ephemeris_not_initialised';
  /** @type {import('../timeline/buildTimeline').SkippedSystem[]} */
  const skipped = [...timeline.skippedSystems, ...EPHEMERIS_SYSTEMS.map(system => ({ system: /** @type {any} */ (system), reason: /** @type {any} */ (reason) }))];
  timeline.skippedSystems = SYSTEM_IDS.flatMap(id => skipped.filter(s => s.system === id));
  return timeline;
}

/**
 * Report `timeContext`: the TimeContext with `profile.name` removed (already
 * echoed in `input`; D-029 — an AI payload must additionally drop
 * `birthplace.label`), plus `conventions` — the clock and conventions each
 * system actually used.
 */
function buildReportTimeContext(ctx, options, birthplaceSource) {
  const { name: _name, ...profile } = ctx.profile;
  const clock = options.useTrueSolarTime ? 'trueSolar' : 'civil';
  const warnings = [];
  // Legacy lng/lat are read with Asia/Taipei civil time (v3 contract). A longitude
  // far from the UTC+8 meridian (120°E) means the caller most likely meant a
  // foreign local time: true solar time is then off by hours → pass `birthplace`.
  if (birthplaceSource === 'legacyCoordinates' && Math.abs(profile.birthplace.lng - 120) > LEGACY_MERIDIAN_TOLERANCE_DEG) {
    warnings.push('legacy_coordinates_outside_utc+8_meridian');
  }
  return {
    ...ctx,
    profile,
    conventions: {
      warnings,
      birthplaceSource,
      useTrueSolarTime: options.useTrueSolarTime,
      ziHourConvention: options.ziHourConvention,
      bazi: {
        dayHourClock: clock,
        yearMonthBasis: 'jie-instant',
        ziHourConvention: options.ziHourConvention,
        luckCycles: 'birth-instant-to-jie-instant',
        liuNian: 'liChun-solar-year-of-asOf',
      },
      ziwei: {
        clock,
        ziHourConvention: toZiweiZiConvention(options.ziHourConvention),
      },
      numerology: 'civil-local-date',
      dreamspell: 'civil-local-date',
      minggua: 'civil-local-time-read-as-utc+8',
      timeline: {
        clock: 'trueSolar',
        baziZiHourConvention: 'late',
        ziweiZiHourConvention: 'splitMidnight',
        followsOptions: false,
        skippedInSyncAnalyze: [...EPHEMERIS_SYSTEMS],
      },
    },
  };
}

/** Every timeline `topSignals` entry (years + months), deduped by id, sorted by id. */
function collectSignals(timeline) {
  const byId = new Map();
  for (const cell of [...timeline.years, ...timeline.months]) {
    for (const domain of cell.domains) {
      for (const signal of domain.topSignals) {
        if (!byId.has(signal.id)) byId.set(signal.id, signal);
      }
    }
  }
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
