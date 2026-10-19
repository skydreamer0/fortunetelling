/**
 * @fileoverview 匯出包產生器（ROADMAP M2-01／M2-02）。
 *
 * 同一個 `(profile, asOf, 版本, preset)` 得到位元相同的輸出：
 * - 不含執行時間戳（沒有 `generatedAt`，也不讀時鐘）。
 * - 所有檔案文字都走 portable/ 的 canonical serializer（鍵序固定、無空白）。
 * 匯出包只包裝 core 已算好的結果，不另外重算或改分。
 *
 * @module export/buildExport
 */

import { humanDesignCalculator } from '../calculators/humanDesign/calculator';
import { jyotishCalculator } from '../calculators/jyotish/calculator';
import type { ChartResult } from '../calculators/types';
import { buildConsensus } from '../consensus/buildConsensus';
import { canonicalStringify } from '../portable/canonical';
import { PROFILE_FILE_FORMAT, ownProfileFile } from '../portable/profileFile';
import type { ProfileFile } from '../portable/profileFile';
import { buildVersionInfo } from '../portable/versions';
import { fnv1a64Hex } from '../signals/signalId';
import type { Signal } from '../signals/types';
import type { Timeline, TimelineCell } from '../timeline/buildTimeline';
import { createProfileCalculation } from '../portable/profileCalculation';
import { buildExportReadme } from './readme';
import { redactProfile, scrubDeep, sensitiveStringsOf, type SensitiveStrings } from './redact';
import {
  EXPORT_FILE_NAMES,
  EXPORT_PRESETS,
  EXPORT_SCHEMA_VERSION,
  type ExportBundle,
  type ExportFileName,
  type ExportManifest,
  type ExportPreset,
} from './types';

export type BuildExportOptions = {
  /** `local-full`（完整資料）或 `share-redacted`（移除姓名與出生地標籤）。 */
  preset: ExportPreset;
  /** 評估日期 'YYYY-MM-DD'（必填，D-014）。 */
  asOf: string;
};

const ASOF_RE = /^\d{4}-\d{2}-\d{2}$/;
const NO_SECRETS: SensitiveStrings = { name: null, place: null };

/** 命盤輸出的系統（固定順序）。 */
const CHART_SYSTEMS = ['bazi', 'ziwei', 'numerology', 'tzolkin', 'mingGua', 'jyotish', 'humanDesign'] as const;
/** 時間未知時不給盤的系統。 */
const NEEDS_TIME = new Set<string>(['bazi', 'ziwei', 'jyotish', 'humanDesign']);

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** timeline.json：domain cell 的 topSignals 改成 id 清單，訊號本體只放在 signals.json。 */
function slimCell(cell: TimelineCell) {
  return {
    window: cell.window,
    domains: cell.domains.map(({ topSignals, ...rest }) => ({ ...rest, topSignalIds: topSignals.map(s => s.id) })),
  };
}

function collectSignals(timeline: Timeline): Signal[] {
  const byId = new Map<string, Signal>();
  for (const cell of [...timeline.years, ...timeline.months]) {
    for (const domain of cell.domains) for (const signal of domain.topSignals) byId.set(signal.id, signal);
  }
  return [...byId.values()].sort((a, b) => cmp(a.id, b.id));
}

/**
 * 產生匯出包（純資料物件，可序列化）。因 jyotish／humanDesign 需要星曆，函式為 async。
 * `file` 通常來自 {@link createProfileFile} 或 `parseProfileFile`。
 */
export async function buildExportBundle(file: ProfileFile, options: BuildExportOptions): Promise<ExportBundle> {
  // Own the validated source before async ephemeris work; later caller edits must
  // not make profile.json disagree with the snapshot used by chart/timeline.
  file = ownProfileFile(file);
  const { preset, asOf } = options;
  if (!EXPORT_PRESETS.includes(preset)) throw new Error(`preset must be one of ${EXPORT_PRESETS.join(', ')} (got ${JSON.stringify(preset)})`);
  if (!ASOF_RE.test(asOf) || Number.isNaN(Date.parse(`${asOf}T00:00:00Z`))) {
    throw new Error(`asOf must be 'YYYY-MM-DD' (got ${JSON.stringify(asOf)})`);
  }
  const redacted = preset === 'share-redacted';
  const secrets = redacted ? sensitiveStringsOf(file.profile) : NO_SECRETS;
  const scrub = <T>(value: T): T => scrubDeep(value, secrets);

  const session = createProfileCalculation(file);
  const ctx = session.context();
  const timeline = await session.timelineAsync({ asOf, topSignalsPerDomain: Infinity });
  const consensus = buildConsensus(timeline);
  const signals = collectSignals(timeline);

  // 命盤：七個系統一份，時間未知者標 available:false，不猜。
  const results = new Map<string, ChartResult<unknown>>(session.charts(asOf).map(r => [r.system as string, r]));
  results.set('jyotish', jyotishCalculator.calculate(ctx, { asOf }));
  results.set('humanDesign', humanDesignCalculator.calculate(ctx, { asOf }));
  const chart: Record<string, unknown> = {};
  const chartStatus: ExportManifest['charts'] = {};
  for (const system of CHART_SYSTEMS) {
    if (NEEDS_TIME.has(system) && ctx.profile.time === null) {
      chart[system] = { available: false, reason: 'time_unknown: 此系統需要已知出生時間，不計算命盤。' };
      chartStatus[system] = { available: false, version: null, reason: 'time_unknown' };
      continue;
    }
    const res = results.get(system)!;
    chart[system] = { available: true, version: res.version, chart: res.chart, components: res.components, warnings: res.warnings };
    chartStatus[system] = { available: true, version: res.version };
  }

  const profileFile: ProfileFile | Record<string, unknown> = redacted
    ? {
        format: PROFILE_FILE_FORMAT,
        schemaVersion: file.schemaVersion,
        ...(file.schemaVersion === 2 ? { settings: file.settings } : {}),
        profileId: file.profileId,
        chartFingerprint: file.chartFingerprint,
        profile: redactProfile(file.profile),
      }
    : structuredClone(file);

  const versions = buildVersionInfo({ asOf, ephemeris: 'moshier' });
  const body = {
    profile: scrub(profileFile),
    chart: scrub({ asOf, calculation: session.calculation, systems: chart }),
    signals: scrub({ asOf, count: signals.length, signals }),
    timeline: scrub({ ...timeline, years: timeline.years.map(slimCell), months: timeline.months.map(slimCell) }),
    consensus: scrub(consensus),
  };
  const readme = buildExportReadme({ preset, asOf, redacted, experimentalSystems: versions.experimentalSystems });

  const fileTexts: Record<string, string> = {
    'profile.json': `${canonicalStringify(body.profile)}\n`,
    'chart.json': `${canonicalStringify(body.chart)}\n`,
    'signals.json': `${canonicalStringify(body.signals)}\n`,
    'timeline.json': `${canonicalStringify(body.timeline)}\n`,
    'consensus.json': `${canonicalStringify(body.consensus)}\n`,
    'README.md': readme,
  };
  const manifest: ExportManifest = {
    format: 'fortune.export',
    exportSchemaVersion: EXPORT_SCHEMA_VERSION,
    preset,
    redacted,
    profileId: file.profileId,
    chartFingerprint: file.chartFingerprint,
    calculation: session.calculation,
    asOf,
    versions,
    systems: {
      participating: [...timeline.systems],
      skipped: timeline.skippedSystems.map(s => ({ system: s.system, reason: s.reason })),
    },
    charts: chartStatus,
    ephemeris: {
      mode: versions.ephemeris,
      warnings: versions.experimentalSystems.map(s => `experimental:${s}（尚未與公開計算器交叉驗證，不可與已驗證系統同等信心看待）`),
    },
    files: Object.fromEntries(Object.entries(fileTexts).map(([name, text]) => [name, { hash: fnv1a64Hex(text) }])),
  };
  return { manifest, ...body, readme };
}

/** 匯出包 → 檔名對應文字（canonical JSON＋換行；README 原文）。位元穩定。 */
export function serializeExportBundle(bundle: ExportBundle): Record<ExportFileName, string> {
  const json = (v: unknown) => `${canonicalStringify(v)}\n`;
  return {
    'manifest.json': json(bundle.manifest),
    'profile.json': json(bundle.profile),
    'chart.json': json(bundle.chart),
    'signals.json': json(bundle.signals),
    'timeline.json': json(bundle.timeline),
    'consensus.json': json(bundle.consensus),
    'README.md': bundle.readme,
  };
}

export { EXPORT_FILE_NAMES };
