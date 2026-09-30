#!/usr/bin/env bun
/**
 * Create a `<profileId>.fortune.json` in the profiles directory (until the web app can export one, M4-02).
 *
 *   bun run add-profile sky --date 1990-05-17 --time 08:30 --gender female --city 台南 [--name 王小明]
 *   bun run add-profile sky --date 1990-05-17 --gender female --city 台南          # time unknown
 *   bun run add-profile sky ... --lat 22.99 --lng 120.22 --tz Asia/Taipei --place "Tainan"   # custom place
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  PROFILE_FILE_EXTENSION,
  cityToBirthplace,
  createProfileFile,
  findCity,
  serializeProfileFile,
  type BirthProfile,
} from '@fortune/core';
import { defaultProfilesDir } from '../store';

export function buildProfileFromArgs(argv: string[]): { profileId: string; profile: BirthProfile } {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      date: { type: 'string' },
      time: { type: 'string' },
      accuracy: { type: 'string' },
      gender: { type: 'string' },
      name: { type: 'string' },
      city: { type: 'string' },
      place: { type: 'string' },
      lat: { type: 'string' },
      lng: { type: 'string' },
      tz: { type: 'string' },
    },
  });
  const profileId = positionals[0];
  if (!profileId) throw new Error('usage: add-profile <profileId> --date YYYY-MM-DD [--time HH:mm] --gender male|female --city <name>');

  let birthplace: BirthProfile['birthplace'];
  if (values.city !== undefined) {
    const city = findCity(values.city);
    if (!city) throw new Error(`unknown city ${JSON.stringify(values.city)}; use --lat --lng --tz --place for a custom place`);
    birthplace = cityToBirthplace(city);
  } else if (values.lat !== undefined && values.lng !== undefined && values.tz !== undefined) {
    birthplace = { label: values.place ?? `${values.lat},${values.lng}`, lat: Number(values.lat), lng: Number(values.lng), timezone: values.tz };
  } else {
    throw new Error('give --city, or all of --lat --lng --tz');
  }

  const time = values.time ?? null;
  return {
    profileId,
    profile: {
      date: values.date as string,
      time,
      timeAccuracy: (values.accuracy ?? (time === null ? 'unknown' : 'exact')) as BirthProfile['timeAccuracy'],
      gender: values.gender as BirthProfile['gender'],
      ...(values.name !== undefined ? { name: values.name } : {}),
      birthplace,
    },
  };
}

if (import.meta.main) {
  try {
    const { profileId, profile } = buildProfileFromArgs(process.argv.slice(2));
    const file = createProfileFile(profileId, profile); // validates id + profile
    const dir = defaultProfilesDir();
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${profileId}${PROFILE_FILE_EXTENSION}`);
    await writeFile(path, serializeProfileFile(file));
    console.log(`wrote ${path}\nchartFingerprint ${file.chartFingerprint}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
