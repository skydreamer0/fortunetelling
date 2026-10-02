/**
 * Profile directory (M0.5-03 / M1-02): one `<profileId>.fortune.json` per person. Stateless: every
 * call reads the file, nothing is "currently loaded". `profileId` is validated before it touches a
 * path, so `../x` can never escape the directory.
 */

import { readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  PROFILE_FILE_EXTENSION,
  isValidProfileId,
  parseProfileFile,
  type ProfileFileV1,
} from '@fortune/core';
import { ToolError } from './errors';

export type ProfileListing = {
  profiles: { profileId: string; chartFingerprint: string; warnings: string[] }[];
  invalid: { file: string; errors: string[] }[];
};

export function defaultProfilesDir(env: Record<string, string | undefined> = process.env): string {
  return env.FORTUNE_PROFILES_DIR ?? join(homedir(), '.fortune', 'profiles');
}

export class ProfileStore {
  constructor(readonly dir: string = defaultProfilesDir()) {}

  async list(): Promise<ProfileListing> {
    let names: string[];
    try {
      names = await readdir(this.dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { profiles: [], invalid: [] };
      throw error;
    }
    const listing: ProfileListing = { profiles: [], invalid: [] };
    for (const name of names.filter(n => n.endsWith(PROFILE_FILE_EXTENSION)).sort()) {
      const parsed = parseProfileFile(await readFile(join(this.dir, name), 'utf8'));
      if (!parsed.ok) {
        listing.invalid.push({ file: name, errors: parsed.errors });
      } else if (`${parsed.file.profileId}${PROFILE_FILE_EXTENSION}` !== name) {
        listing.invalid.push({ file: name, errors: [`profileId '${parsed.file.profileId}' does not match the file name`] });
      } else {
        listing.profiles.push({
          profileId: parsed.file.profileId,
          chartFingerprint: parsed.file.chartFingerprint,
          warnings: parsed.warnings,
        });
      }
    }
    return listing;
  }

  async get(profileId: string): Promise<{ file: ProfileFileV1; warnings: string[] }> {
    if (!isValidProfileId(profileId)) {
      throw new ToolError('invalid_args', `profileId ${JSON.stringify(profileId)} is not a valid id`, 'Use list_profiles to see valid ids.');
    }
    let text: string;
    try {
      text = await readFile(join(this.dir, `${profileId}${PROFILE_FILE_EXTENSION}`), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new ToolError('profile_not_found', `No profile '${profileId}'`, 'Use list_profiles to see available profiles.');
      }
      throw error;
    }
    const parsed = parseProfileFile(text);
    if (!parsed.ok) throw new ToolError('profile_invalid', `Profile '${profileId}' is invalid: ${parsed.errors.join('; ')}`);
    if (parsed.file.profileId !== profileId) {
      throw new ToolError('profile_invalid', `File for '${profileId}' declares profileId '${parsed.file.profileId}'`);
    }
    return { file: parsed.file, warnings: parsed.warnings };
  }
}
