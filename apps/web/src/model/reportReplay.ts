/** New reports must validate their replay contract; old reports keep their recorded-options path. */
import { createReportReplaySession } from '../lib/core';
import type { Report } from './types';
export function reportReplaySession(report: Report) {
  if (report.schemaVersion !== 8) return null;
  try { return createReportReplaySession(report); } catch { return null; }
}

/** A retained/partial new envelope cannot be relabelled into the legacy path. */
export function requiresReportReplay(report: Report): boolean {
  return report.schemaVersion >= 8 || 'replay' in report || 'calculation' in report;
}
