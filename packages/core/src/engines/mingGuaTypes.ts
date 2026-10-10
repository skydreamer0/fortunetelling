/** Internal producer contracts for the legacy Ming Gua components (#21).
 * These describe existing bytes, not calculation or predictive validation.
 */
import type { MING_GUA_YEAR_BOUNDARY } from '../calculators/mingGua/mingGua';

export interface MingGuaDirectionValue {
  code: string;
  zh: string;
}

export interface MingGuaValue {
  guaNumber: number;
  name: string;
  element: string;
  elementZh: string;
  group: 'east' | 'west';
  groupName: string;
  bestDirection: string;
  yearForGua: number;
  yearBoundary: typeof MING_GUA_YEAR_BOUNDARY;
  liChunUtc: string;
}

export interface MingGuaDirectionsValue {
  auspicious: Record<string, MingGuaDirectionValue>;
  inauspicious: Record<string, MingGuaDirectionValue>;
}

/** Each legacy category has its own payload; neither emits component metadata. */
export type MingGuaComponent =
  | { id: 'ming_gua'; name: string; category: 'mingGua'; value: MingGuaValue }
  | { id: 'directions'; name: string; category: 'directions'; value: MingGuaDirectionsValue };

export interface MingGuaMetadata {
  yearForGua: number;
  guaNumber: number;
  guaName: string;
  group: string;
  yearBoundary: typeof MING_GUA_YEAR_BOUNDARY;
  timeConvention: string;
  liChunUtc: string;
  boundaryAmbiguous: boolean;
}
