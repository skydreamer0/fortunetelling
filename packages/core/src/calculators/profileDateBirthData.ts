import { BirthData } from '../core/models/BirthData';
import type { TimeContext } from '../time/types';
import { timeContextToBirthData } from './birthData';

/**
 * Date-only systems use the user's input calendar day (ARCHITECTURE-V2 §3.4),
 * even when a clock gap resolves a known birth time onto another civil day.
 * Keep the shared clock adapter and its metadata/name handling unchanged.
 * Internal to the date-only adapters; not exported from the calculator barrel.
 */
export function profileDateToBirthData(ctx: TimeContext, extras: { name?: string } = {}): BirthData {
  const resolved = timeContextToBirthData(ctx, extras);
  const [year, month, day] = ctx.profile.date.split('-').map(Number);
  return new BirthData({ ...resolved.toJSON(), year, month, day });
}
