/**
 * @fileoverview Human Design BodyGraph data: 9 centers, 64 gates → center,
 * 36 channels (V2-04). Pure data; integrity is checked in tests
 * (every gate in exactly one center; every channel's gates in its two centers).
 *
 * @module calculators/humanDesign/bodygraph
 */

export const CENTERS = [
  'head',
  'ajna',
  'throat',
  'g',
  'heart',
  'sacral',
  'solarPlexus',
  'spleen',
  'root',
] as const;
export type Center = (typeof CENTERS)[number];

/** The four motor centers (energy sources). */
export const MOTOR_CENTERS: readonly Center[] = Object.freeze(['heart', 'sacral', 'solarPlexus', 'root']);

/** Display names (English; no interpretive text). */
export const CENTER_NAMES: Readonly<Record<Center, string>> = Object.freeze({
  head: 'Head',
  ajna: 'Ajna',
  throat: 'Throat',
  g: 'G',
  heart: 'Heart (Ego)',
  sacral: 'Sacral',
  solarPlexus: 'Solar Plexus',
  spleen: 'Spleen',
  root: 'Root',
});

export const CENTER_GATES: Readonly<Record<Center, readonly number[]>> = Object.freeze({
  head: [64, 61, 63],
  ajna: [47, 24, 4, 17, 43, 11],
  throat: [62, 23, 56, 35, 12, 45, 33, 8, 31, 20, 16],
  g: [7, 1, 13, 10, 25, 15, 46, 2],
  heart: [21, 40, 26, 51],
  sacral: [5, 14, 29, 34, 27, 59, 9, 3, 42],
  solarPlexus: [6, 37, 22, 36, 49, 55, 30],
  spleen: [48, 57, 44, 50, 32, 28, 18],
  root: [58, 38, 54, 53, 60, 52, 19, 39, 41],
});

/** gate (1–64) → center. */
export const GATE_CENTER: Readonly<Record<number, Center>> = Object.freeze(
  Object.fromEntries(
    (Object.entries(CENTER_GATES) as [Center, readonly number[]][]).flatMap(([c, gates]) => gates.map((g) => [g, c])),
  ),
);

export interface Channel {
  /** Canonical id 'a-b' with a < b. */
  id: string;
  gates: readonly [number, number];
  centers: readonly [Center, Center];
}

/** The 36 channels as gate pairs (centers are derived from {@link GATE_CENTER}). */
const CHANNEL_PAIRS: readonly (readonly [number, number])[] = [
  // Head – Ajna
  [64, 47], [61, 24], [63, 4],
  // Ajna – Throat
  [17, 62], [43, 23], [11, 56],
  // Throat – G
  [31, 7], [8, 1], [33, 13], [20, 10],
  // Throat – Heart
  [45, 21],
  // Throat – Solar Plexus
  [35, 36], [12, 22],
  // Throat – Sacral
  [20, 34],
  // Throat – Spleen
  [16, 48], [20, 57],
  // G – Heart
  [25, 51],
  // G – Sacral
  [5, 15], [14, 2], [29, 46], [34, 10],
  // G – Spleen
  [10, 57],
  // Heart – Spleen
  [26, 44],
  // Heart – Solar Plexus
  [37, 40],
  // Sacral – Solar Plexus
  [59, 6],
  // Sacral – Spleen
  [27, 50], [34, 57],
  // Sacral – Root
  [42, 53], [3, 60], [9, 52],
  // Solar Plexus – Root
  [19, 49], [39, 55], [41, 30],
  // Spleen – Root
  [18, 58], [28, 38], [32, 54],
];

export const CHANNELS: readonly Channel[] = Object.freeze(
  CHANNEL_PAIRS.map(([a, b]) => {
    const [lo, hi] = a < b ? [a, b] : [b, a];
    return Object.freeze({
      id: `${lo}-${hi}`,
      gates: [lo, hi] as const,
      centers: [GATE_CENTER[lo]!, GATE_CENTER[hi]!] as const,
    });
  }).sort((x, y) => x.gates[0] - y.gates[0] || x.gates[1] - y.gates[1]),
);
