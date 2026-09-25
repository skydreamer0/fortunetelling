/** Display bands for 0–100 scores (§7). Cuts are data and may be overridden. */
export const BANDS = ['低', '中', '中高', '高'] as const;
export type Band = (typeof BANDS)[number];
export type BandCuts = readonly [number, number, number];

/** Ascending cuts; each cut is the INCLUSIVE lower bound of the next band (35 → 中, 55 → 中高, 75 → 高). */
export const DEFAULT_BAND_CUTS: BandCuts = [35, 55, 75];

export function toBand(score: number, cuts: BandCuts = DEFAULT_BAND_CUTS): Band {
  if (!Number.isFinite(score)) throw new Error(`toBand: score must be finite, got ${score}`);
  if (!(cuts[0] <= cuts[1] && cuts[1] <= cuts[2])) {
    throw new Error(`toBand: cuts must be ascending, got ${cuts.join(',')}`);
  }
  if (score >= cuts[2]) return '高';
  if (score >= cuts[1]) return '中高';
  if (score >= cuts[0]) return '中';
  return '低';
}
