#!/usr/bin/env bun
/**
 * 把一個 profile 匯出成一個資料夾（manifest／profile／chart／signals／timeline／consensus／README）。
 *
 *   bun run export-profile sky --asOf 2026-10-03 --preset local-full --out ./out/sky
 *   bun run export-profile sky --asOf 2026-10-03 --preset share-redacted --out ./out/sky-share
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  EXPORT_PRESETS,
  buildExportBundle,
  serializeExportBundle,
  type ExportPreset,
} from '@fortune/core';
import { ProfileStore } from '../store';

const USAGE = 'usage: export-profile <profileId> --asOf YYYY-MM-DD --preset local-full|share-redacted --out <目錄>';

export function parseExportArgs(argv: string[]): { profileId: string; asOf: string; preset: ExportPreset; out: string } {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      asOf: { type: 'string' },
      preset: { type: 'string' },
      out: { type: 'string' },
    },
  });
  const profileId = positionals[0];
  if (!profileId || values.asOf === undefined || values.out === undefined) throw new Error(USAGE);
  const preset = (values.preset ?? 'local-full') as ExportPreset;
  if (!EXPORT_PRESETS.includes(preset)) throw new Error(`--preset 必須是 ${EXPORT_PRESETS.join(' 或 ')}（收到 ${JSON.stringify(values.preset)}）`);
  return { profileId, asOf: values.asOf, preset, out: values.out };
}

/** 讀 profile、產生匯出包並寫入目錄；回傳寫出的檔案路徑。 */
export async function exportProfileToDir(
  store: ProfileStore,
  args: { profileId: string; asOf: string; preset: ExportPreset; out: string },
): Promise<string[]> {
  const { file } = await store.get(args.profileId);
  const bundle = await buildExportBundle(file, { preset: args.preset, asOf: args.asOf });
  const dir = resolve(args.out);
  await mkdir(dir, { recursive: true });
  const written: string[] = [];
  for (const [name, text] of Object.entries(serializeExportBundle(bundle))) {
    const path = join(dir, name);
    await writeFile(path, text);
    written.push(path);
  }
  return written;
}

if (import.meta.main) {
  try {
    const args = parseExportArgs(process.argv.slice(2));
    const written = await exportProfileToDir(new ProfileStore(), args);
    console.log(`已匯出 ${written.length} 個檔案（${args.preset}）：\n${written.join('\n')}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
