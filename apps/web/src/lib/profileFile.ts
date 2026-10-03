/**
 * M4-02: 網站報告 → `.fortune.json`（本機 MCP 讀取的 profile 檔）。
 * 只負責產生檔案內容；網站不會、也不能寫入本機任意位置，由使用者下載後自行放進
 * `~/.fortune/profiles/`。檔案格式與序列化一律交給 core（位元穩定）。
 */

import {
  PROFILE_FILE_EXTENSION, chartFingerprint, createProfileFile, isValidProfileId, serializeProfileFile,
  type BirthProfile,
} from './core';
import type { Report } from '../model/types';

type ProfileSource = Pick<Report, 'input' | 'timeContext'>;

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/**
 * The birth profile behind a report. v4+ reports carry it in `timeContext.profile`
 * (without the name, which is echoed in `input`); older reports are rebuilt from
 * `input` with the v3 contract (Taiwan civil time).
 */
export function profileOfReport(report: ProfileSource): BirthProfile {
  const { input } = report;
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const base = (report.timeContext as { profile?: BirthProfile } | null | undefined)?.profile;
  if (base) return { ...base, ...(name ? { name } : {}) };
  const timeKnown = input.timeKnown !== false;
  return {
    date: `${pad(input.year, 4)}-${pad(input.month)}-${pad(input.day)}`,
    time: timeKnown ? `${pad(input.hour)}:${pad(input.minute)}` : null,
    timeAccuracy: timeKnown ? 'exact' : 'unknown',
    gender: input.gender,
    ...(name ? { name } : {}),
    birthplace: {
      label: `${input.latitude.toFixed(4)}, ${input.longitude.toFixed(4)}`,
      lat: input.latitude,
      lng: input.longitude,
      timezone: 'Asia/Taipei',
    },
  };
}

/** `chartFingerprint` of the chart a report is about (name and place label excluded). */
export function fingerprintOfReport(report: ProfileSource): string {
  return chartFingerprint(profileOfReport(report));
}

/** Same rule as the MCP `add-profile` (core `isValidProfileId`); returns a zh-TW message, or null when valid. */
export function profileIdError(id: string): string | null {
  if (id === '') return '請替這個人取個名字（profileId）。';
  if (id.length > 32) return '最長 32 字。';
  if (!isValidProfileId(id)) return '只能用小寫英文字母、數字、- 與 _，且第一個字要是英文字母或數字。';
  return null;
}

export type ProfileDownload =
  | { ok: true; filename: string; text: string; chartFingerprint: string }
  | { ok: false; error: string };

/** The file the browser downloads: `<profileId>.fortune.json` + canonical JSON text. */
export function buildProfileDownload(report: ProfileSource, profileId: string): ProfileDownload {
  const error = profileIdError(profileId);
  if (error) return { ok: false, error };
  try {
    const file = createProfileFile(profileId, profileOfReport(report));
    return {
      ok: true,
      filename: `${profileId}${PROFILE_FILE_EXTENSION}`,
      text: serializeProfileFile(file),
      chartFingerprint: file.chartFingerprint,
    };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : '無法產生檔案。' };
  }
}
