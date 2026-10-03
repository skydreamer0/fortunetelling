import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { PROFILE_FILE_EXTENSION, parseProfileFile } from '@fortune/core';
import { z } from 'zod';
import { ok } from '../envelope';
import { ToolError } from '../errors';
import { defineTool } from './types';

/** `.fortune.json` 只有幾百 bytes；超過這個大小一定不是 profile 檔。 */
export const MAX_PROFILE_FILE_BYTES = 100_000;

function expandPath(path: string): string {
  return path === '~' || path.startsWith('~/') || path.startsWith('~\\') ? resolve(homedir(), path.slice(2)) : resolve(path);
}

async function readProfilePath(path: string): Promise<string> {
  if (!path.endsWith(PROFILE_FILE_EXTENSION)) {
    throw new ToolError('invalid_args', `path must end with ${PROFILE_FILE_EXTENSION}`, '只能匯入網站匯出的 .fortune.json 檔。');
  }
  const full = expandPath(path);
  let size: number;
  try {
    size = (await stat(full)).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new ToolError('invalid_args', `File not found: ${full}`);
    throw error;
  }
  if (size > MAX_PROFILE_FILE_BYTES) throw new ToolError('invalid_args', `File is ${size} bytes (limit ${MAX_PROFILE_FILE_BYTES})`);
  return readFile(full, 'utf8');
}

export const importProfileTools = [
  defineTool({
    name: 'import_profile',
    description:
      '把一份 .fortune.json（網站匯出）匯入 profiles 目錄，之後即可用 profileId 查詢。二選一：content（檔案全文）或 path（本機檔案路徑，須以 .fortune.json 結尾）。' +
      'profileId 取自檔案內容。已存在同名 profile 時不會覆蓋，回 profile_exists；確定要取代才帶 overwrite: true。' +
      '檔案內的指紋（chartFingerprint）缺漏或與內容不符時，會重算並在 warnings 與 caveats 提醒（代表檔案被手動改過）。' +
      '回應只有 profileId、指紋與是否覆蓋，不含姓名與出生資料。',
    input: {
      content: z.string().min(1).optional().describe('.fortune.json 的完整文字。與 path 二選一。'),
      path: z.string().min(1).optional().describe('本機 .fortune.json 檔案路徑（可用 ~）。與 content 二選一。'),
      overwrite: z.boolean().optional().describe('已存在同 profileId 時是否覆蓋（預設 false）。'),
    },
    async handler(args, { store }) {
      if ((args.content === undefined) === (args.path === undefined)) {
        throw new ToolError('invalid_args', 'Provide exactly one of content or path');
      }
      const text = args.content ?? (await readProfilePath(args.path as string));
      if (text.length > MAX_PROFILE_FILE_BYTES) throw new ToolError('invalid_args', `Content is ${text.length} chars (limit ${MAX_PROFILE_FILE_BYTES})`);
      const parsed = parseProfileFile(text);
      if (!parsed.ok) throw new ToolError('profile_invalid', `Not a valid profile file: ${parsed.errors.join('; ')}`);

      const { replacedFingerprint } = await store.put(parsed.file, { overwrite: args.overwrite });
      return ok({
        asOf: null,
        ephemeris: 'not_initialized',
        data: {
          profileId: parsed.file.profileId,
          chartFingerprint: parsed.file.chartFingerprint,
          overwritten: replacedFingerprint !== null,
          chartChanged: replacedFingerprint !== null && replacedFingerprint !== parsed.file.chartFingerprint,
          warnings: parsed.warnings,
        },
        caveats: parsed.warnings.map(message => ({ code: 'import:fingerprint_recomputed', message })),
      });
    },
  }),
];
