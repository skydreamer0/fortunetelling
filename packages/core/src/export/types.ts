/**
 * @fileoverview 匯出包型別（ROADMAP M2）。
 * @module export/types
 */

import type { VersionInfo } from '../portable/versions';

export const EXPORT_SCHEMA_VERSION = 1 as const;

export const EXPORT_PRESETS = ['local-full', 'share-redacted'] as const;
export type ExportPreset = (typeof EXPORT_PRESETS)[number];

/** 匯出包內的檔名（固定順序）。 */
export const EXPORT_FILE_NAMES = [
  'manifest.json',
  'profile.json',
  'chart.json',
  'signals.json',
  'timeline.json',
  'consensus.json',
  'README.md',
] as const;
export type ExportFileName = (typeof EXPORT_FILE_NAMES)[number];

export type ExportManifest = {
  format: 'fortune.export';
  exportSchemaVersion: typeof EXPORT_SCHEMA_VERSION;
  preset: ExportPreset;
  redacted: boolean;
  profileId: string;
  chartFingerprint: string;
  asOf: string;
  versions: VersionInfo;
  /** 參與時間軸與被略過的系統（含原因）。 */
  systems: {
    participating: string[];
    skipped: { system: string; reason: string }[];
  };
  /** 各系統命盤是否算出（需出生時間者在時間未知時為 false）。 */
  charts: Record<string, { available: boolean; version: string | null; reason?: string }>;
  ephemeris: { mode: VersionInfo['ephemeris']; warnings: string[] };
  /** 其餘檔案的內容指紋（fnv1a64），供比對；manifest 自己不在其中。 */
  files: Record<string, { hash: string }>;
};

export type ExportBundle = {
  manifest: ExportManifest;
  profile: unknown;
  chart: unknown;
  signals: unknown;
  timeline: unknown;
  consensus: unknown;
  readme: string;
};
