/**
 * @fileoverview `analyze()` — the single public orchestrator.
 *
 * Turns raw birth input into the standard `Report`: builds the BirthProfile and
 * TimeContext (① time layer, D-026), runs every registered engine (八字／紫微 on
 * the TimeContext, the rest on the civil date), classifies all components into
 * L0–L3 layers, attaches the transparent scoring-rule registry, the Block G/H
 * fields, and — since Report v4 (D-032) — `timeContext`, `timeline` and
 * `signals`; since Report v5 (D-034) — `consensus`.
 *
 * @module core/analyze
 */

import { LayerClassifier } from '../analysis/LayerClassifier';
import { ScoringRules } from '../analysis/ScoringRules';
import { HonestyGuard } from '../analysis/HonestyGuard';
import { StateSwitchTable } from '../analysis/StateSwitchTable';
import { EvolutionCalculator } from '../analysis/EvolutionCalculator';
import { buildRadars } from '../analysis/RadarBuilder';
import { SummaryBuilder } from '../analysis/SummaryBuilder';
import { InsightBuilder } from '../analysis/InsightBuilder';
import { createDefaultRegistry } from '../engines/index';
import { createTimeContext } from '../time/createTimeContext';
import { buildTimeline, TIMELINE_SYSTEMS } from '../timeline/buildTimeline';
import { SYSTEM_IDS } from '../signals/types';
import { buildConsensus } from '../consensus/buildConsensus';
import { resolveAnalyzeInput, toZiweiZiConvention } from './analyzeInput';
import { TimeContextBaZiEngine, TimeContextZiweiEngine } from './timeContextEngines';
import type { SystemResult } from './models/SystemResult';
import type { BirthData, BirthDataParams, Gender } from './models/BirthData';
import type { LayerClassification, LayerCode } from '../analysis/LayerClassifier';
import type { ScoringRulesExport } from '../analysis/ScoringRules';
import type { Radar } from '../analysis/RadarBuilder';
import type { Summary } from '../analysis/SummaryBuilder';
import type { Insights } from '../analysis/InsightBuilder';
import type { Scenario } from '../analysis/StateSwitchTable';
import type { Period } from '../analysis/EvolutionCalculator';
import type { Violation } from '../analysis/HonestyGuard';
import type { Birthplace, TimeAccuracy } from '../profile/types';
import type { TimeContext } from '../time/types';
import type { Signal, SystemId } from '../signals/types';
import type { SkippedSystem, Timeline, TimelineSkipReason } from '../timeline/buildTimeline';
import type { ConsensusSummary } from '../consensus/buildConsensus';
import type { ZiHourConvention } from '../calculators/bazi/pillars';
import type { ZiweiZiHourConvention } from '../calculators/ziwei/types';
import type { AnalysisTimeOptions, BirthplaceSource } from './analyzeInput';

/** Public library version (semver). Bump on any observable API change. */
export const VERSION = '0.5.0';

/**
 * Version of the `Report` shape itself, independent of code version.
 * Consumers should check this before deserializing stored reports.
 */
export const REPORT_SCHEMA_VERSION = 5;

/** Timeline systems that need the Swiss Ephemeris; sync `analyze()` never initialises it. */
const EPHEMERIS_SYSTEMS: SystemId[] = ['jyotish', 'humanDesign'];

/** 15° of longitude = 1 hour of local mean time away from the zone meridian. */
const LEGACY_MERIDIAN_TOLERANCE_DEG = 15;

/** Raw `analyze()` input: the v3 BirthData fields plus the v4 options (see `core/analyzeInput`). */
export interface AnalyzeInput extends BirthDataParams {
  /** v4: explicit birthplace (IANA timezone) */
  birthplace?: Birthplace | null;
  /** v4: any key `findCity()` accepts (id, 中文名, English name) */
  cityId?: string | null;
  /** v4: 'exact' | 'approx15m' | 'approx1h' | 'unknown' */
  timeAccuracy?: TimeAccuracy;
  /** v4: 'late' (default) | 'early'; Ziwei spellings accepted as aliases */
  ziHourConvention?: ZiHourConvention | ZiweiZiHourConvention;
  /** v4: default true */
  useTrueSolarTime?: boolean;
}

/** Normalized birth input echoed in the report. */
export interface ReportInput {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** Present (false) only when the birth time is unknown */
  timeKnown?: false;
  gender: Gender;
  name: string;
  longitude: number;
  latitude: number;
}

/** Report `timeContext`: TimeContext without `profile.name`, plus the conventions each system used. */
export type ReportTimeContext = ReturnType<typeof buildReportTimeContext>;

export interface Report {
  /** Library version that produced the report */
  version: string;
  /** Report shape version */
  schemaVersion: number;
  /** ISO timestamp of generation */
  generatedAt: string;
  /** Evaluation date (YYYY-MM-DD) for L1/L2 layers */
  asOf: string;
  /** Normalized birth input echo */
  input: ReportInput;
  /** Raw per-engine results */
  engines: SystemResult[];
  /** Block H① L0–L3 classification */
  layers: LayerClassification;
  /** Block G transparency: full rule registry export */
  scoringRules: ScoringRulesExport;
  /** Block G radars */
  radars: Radar[];
  /** Cross-system plain-language overview */
  summary: Summary;
  /** User-question-oriented synthesis */
  insights: Insights;
  /** Block H② */
  stateTable: { scenarios: Scenario[]; pending: boolean };
  /** Block H③ */
  evolution: { periods: Period[]; narrative: string; pending: boolean };
  /** Block H④ */
  honesty: { languageRules: { layer: LayerCode; name: string; rule: string }[]; violations: Violation[]; pending: boolean };
  /** v4: TimeContext (profile without name) + `conventions` */
  timeContext: ReportTimeContext;
  /** v4: every timeline `topSignals` entry, deduped by id, sorted by id */
  signals: Signal[];
  /** v4: sync `buildTimeline` (5 years + 12 months of the asOf year) */
  timeline: Timeline;
  /** v5: `buildConsensus(timeline)` — cross-system agreements, conflicts, coverage */
  consensus: ConsensusSummary;
}

/** The report while `analyze()` fills it in (placeholders before each block is computed). */
type ReportDraft = Omit<Report, 'insights' | 'timeContext' | 'timeline' | 'consensus'> & {
  insights: Insights | { version: number; domains: never[]; annual: object; guidance: object };
  timeContext: ReportTimeContext | null;
  timeline: Timeline | null;
  consensus: ConsensusSummary | null;
};

/**
 * Run the full analysis pipeline against one birth datum.
 *
 *   Raw birth parameters（year/month/day/hour/minute/timeKnown/gender/name/longitude/latitude）
 *   or a ready-made BirthData instance. v4 optional fields: `birthplace`
 *   ({ label, lat, lng, timezone }) or `cityId`, `timeAccuracy`,
 *   `ziHourConvention` ('late' | 'early'), `useTrueSolarTime` (default true).
 *   See `core/analyzeInput` for the birthplace resolution order.
 * @param options.asOf - (default null) Evaluation date for the
 *   time-varying layers（L1 大限/大運、L2 流年、timeline）. Defaults to today.
 * @throws {Error} If the input fails validation. Individual engine
 *   failures do NOT throw — they surface as `errors` on that engine's result.
 */
export function analyze(input: AnalyzeInput | BirthData, { asOf = null }: { asOf?: Date | string | null } = {}): Report {
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

  const report: ReportDraft = {
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

    // ── v5（D-034）──
    consensus: null,
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
  // ── v5：跨系統共識／矛盾摘要（只重排 timeline 已有的判定，不另算分數，D-033）──
  report.consensus = buildConsensus(timeline);

  // ── 區塊 H④：組完 Report 後跑誠實稽核（D1）──
  report.honesty.violations = HonestyGuard.auditReport(report);
  report.honesty.pending = false;

  return report as Report;
}

/**
 * Sync `buildTimeline` for the report. jyotish／humanDesign need the Swiss
 * Ephemeris (async WASM init) and are ALWAYS left out of `analyze()` — even when
 * another caller happened to initialise the ephemeris — so the report never
 * depends on global state (D-014). They are listed in `skippedSystems` with
 * reason 'time_unknown' (no birth time) or 'ephemeris_not_initialised'; use
 * `buildTimelineAsync(ctx, { asOf })` for the full timeline.
 */
function buildSyncTimeline(ctx: TimeContext, asOf: string, name: string): Timeline {
  const timeline = buildTimeline(ctx, {
    asOf,
    systems: TIMELINE_SYSTEMS.filter(s => !EPHEMERIS_SYSTEMS.includes(s)),
    ...(name ? { name } : {}),
  });
  const reason: TimelineSkipReason = ctx.utc === null ? 'time_unknown' : 'ephemeris_not_initialised';
  const skipped: SkippedSystem[] = [...timeline.skippedSystems, ...EPHEMERIS_SYSTEMS.map(system => ({ system, reason }))];
  timeline.skippedSystems = SYSTEM_IDS.flatMap(id => skipped.filter(s => s.system === id));
  return timeline;
}

/**
 * Report `timeContext`: the TimeContext with `profile.name` removed (already
 * echoed in `input`; D-029 — an AI payload must additionally drop
 * `birthplace.label`), plus `conventions` — the clock and conventions each
 * system actually used.
 */
function buildReportTimeContext(ctx: TimeContext, options: AnalysisTimeOptions, birthplaceSource: BirthplaceSource) {
  const { name: _name, ...profile } = ctx.profile;
  const clock = options.useTrueSolarTime ? 'trueSolar' : 'civil';
  const warnings: string[] = [];
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
function collectSignals(timeline: Timeline): Signal[] {
  const byId = new Map<string, Signal>();
  for (const cell of [...timeline.years, ...timeline.months]) {
    for (const domain of cell.domains) {
      for (const signal of domain.topSignals) {
        if (!byId.has(signal.id)) byId.set(signal.id, signal);
      }
    }
  }
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
