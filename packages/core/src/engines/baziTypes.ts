/** Internal producer contracts for the legacy BaZi components (#21).
 * Reuse calculator payloads where they exist; this module adds no runtime logic.
 */
import type {
  BaziAnnual,
  BaziChart,
  BaziDayMaster,
  BaziLuckCycle,
  BaziPillars,
} from '../calculators/bazi/calculator';
import type { ASOF_CONVENTION, BaziConvention, TenGodPresence } from './BaZiEngine';

/** The legacy producer spells the calculator's hour field `time`. */
export type BaziNatalValue = Pick<BaziPillars, 'year' | 'month' | 'day'> & {
  time: BaziPillars['hour'];
  convention: BaziConvention;
};

export interface BaziElementsValue {
  counts: NonNullable<BaziChart['fiveElements']>;
  total: number;
  includesHiddenStems: true;
  includesDayMaster: true;
  metric: 'occurrence-count';
  limitation: string;
}

export interface BaziTenGodsValue {
  counts: NonNullable<BaziChart['tenGods']>;
  total: number;
  includesDayMaster: true;
}

/** Legacy-only shape from buildBaziNatalComponents, read by InsightBuilder and
 * StateSwitchTable. This is not a native calculator chart field or a new rule.
 */
export interface BaziTenGodsContextGroup {
  group: string;
  context: string;
  tenGods: string[];
  breakdown: Record<string, number>;
  observedTenGods: string[];
  visibleCount: number;
  hiddenCount: number;
  count: number;
  presence: TenGodPresence;
  share: number;
}

export interface BaziTenGodsContextValue {
  groups: BaziTenGodsContextGroup[];
  total: number;
  includesHiddenStems: true;
  includesDayMaster: false;
  metric: 'occurrence-share';
  presenceConvention: 'visible-hidden-absent';
}

/** The seven legacy fields, without the calculator's optional native dates. */
export type BaziDaYunValue = Pick<BaziLuckCycle,
  'index' | 'ganZhi' | 'startYear' | 'endYear' | 'startAge' | 'isCurrent' | 'ageConvention'>;

/** Only the natal producer emits component metadata. */
export type BaziNatalComponent =
  | { id: 'natal'; name: string; category: 'natal'; value: BaziNatalValue; meta: { convention: BaziConvention } }
  | { id: 'day_master'; name: string; category: 'dayMaster'; value: BaziDayMaster }
  | { id: 'elements'; name: string; category: 'elements'; value: BaziElementsValue }
  | { id: 'ten_gods'; name: string; category: 'tenGods'; value: BaziTenGodsValue }
  | { id: 'tenGodsContext'; name: string; category: 'tenGodsContext'; value: BaziTenGodsContextValue };

export type BaziComponent = BaziNatalComponent
  | { id: `daYun_${number}`; name: string; category: 'daYun'; value: BaziDaYunValue }
  | { id: 'liuNian'; name: string; category: 'liuNian'; value: BaziAnnual };

export interface BaziAvailableMetadata {
  asOfConvention: typeof ASOF_CONVENTION;
  dayBoundary: 'eight-char sect=2';
  yunCalculation: 'getYun sect=2';
}

export interface BaziUnavailableMetadata {
  unavailableReason: 'unknown-time';
  unavailableMessage: string;
}
