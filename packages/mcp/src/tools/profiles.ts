import { z } from 'zod';
import { ok } from '../envelope';
import { defineTool } from './types';

export const profileTools = [
  defineTool({
    name: 'list_profiles',
    description: 'List available profiles (ids and chart fingerprints only; no names or birth data). Call this first to get a profileId. Also returns the full `versions` block (other tools only return versionsHash).',
    input: {},
    async handler(_args, { store }) {
      const listing = await store.list();
      return ok({ asOf: null, data: listing, caveats: [], ephemeris: 'not_initialized', includeVersions: true });
    },
  }),
  defineTool({
    name: 'get_profile',
    description:
      'Profile metadata: gender, time accuracy, timezone. Name and birth data are withheld unless explicitly requested with includeName / includeBirthData. Also returns the full `versions` block (other tools only return versionsHash).',
    input: {
      profileId: z.string(),
      includeName: z.boolean().optional().describe('Return the person\'s name (default false).'),
      includeBirthData: z.boolean().optional().describe('Return date, time and birthplace (default false).'),
    },
    async handler(args, { store }) {
      const { file, warnings } = await store.get(args.profileId);
      const p = file.profile;
      return ok({
        asOf: null,
        ephemeris: 'not_initialized',
        includeVersions: true,
        data: {
          profileId: file.profileId,
          chartFingerprint: file.chartFingerprint,
          gender: p.gender,
          timeAccuracy: p.timeAccuracy,
          timeKnown: p.time !== null,
          timezone: p.birthplace.timezone,
          warnings,
          ...(args.includeName ? { name: p.name ?? null } : {}),
          ...(args.includeBirthData ? { birth: { date: p.date, time: p.time, birthplace: p.birthplace } } : {}),
        },
      });
    },
  }),
];
