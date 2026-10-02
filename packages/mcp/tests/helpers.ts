import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProfileFile, serializeProfileFile, type BirthProfile } from '@fortune/core';
import { Analyzer } from '../src/compute';
import { ProfileStore } from '../src/store';
import { callTool } from '../src/tools/index';

export const SAMPLE_PROFILE: BirthProfile = {
  date: '1990-05-17',
  time: '08:30',
  timeAccuracy: 'exact',
  gender: 'female',
  name: '王小明',
  birthplace: { label: 'Tainan, Taiwan', lat: 22.9999, lng: 120.2269, timezone: 'Asia/Taipei' },
};

/** Temp profiles dir with `sky` (and any extra ids). Call `cleanup()` in afterAll. */
export async function makeFixture(extra: Record<string, BirthProfile> = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'fortune-mcp-'));
  const profiles: Record<string, BirthProfile> = { sky: SAMPLE_PROFILE, ...extra };
  for (const [id, profile] of Object.entries(profiles)) {
    await writeFile(join(dir, `${id}.fortune.json`), serializeProfileFile(createProfileFile(id, profile)));
  }
  const store = new ProfileStore(dir);
  const ctx = { store, analyzer: new Analyzer(store) };
  return {
    dir,
    store,
    ctx,
    cleanup: () => rm(dir, { recursive: true, force: true }),
    /** Call a tool and parse its JSON text. */
    async call(name: string, args: unknown = {}) {
      const { text, isError } = await callTool(name, args, ctx);
      return { isError, json: JSON.parse(text) as any, text };
    },
  };
}
