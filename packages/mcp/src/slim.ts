/** Response slimming shared by the signal-citing tools: long id lists are cut unless `detail: true`. */

import { z } from 'zod';

/** Ids kept per list in a default (non-detail) response. */
export const ID_PREVIEW = 5;

/** The `detail` input every id-citing tool takes; same wording everywhere. */
export const detailInput = z
  .boolean()
  .optional()
  .describe(`Default false: signal lists keep the first ${ID_PREVIEW} (the matching *Total field gives the full count). true returns every id.`);

/** First {@link ID_PREVIEW} items unless `detail`; the total is returned by the caller next to the list. */
export function previewIds<T = string>(items: readonly T[], detail: boolean | undefined): T[] {
  return detail ? [...items] : items.slice(0, ID_PREVIEW);
}
