/**
 * UI-side view of the core `Report` (schema v3) and compatibility result.
 * Only the fields the UI reads are typed; the core remains the source of truth.
 */

export type SystemId = 'bazi' | 'ziwei' | 'numerology' | 'minggua' | 'dreamspell';
export type Gender = 'male' | 'female';

export interface LunarInput {
  year: number;
  month: number;
  day: number;
  isLeap: boolean;
}

/** Parameters passed to `analyze()`; also what the recent-query store keeps. */
export interface BirthInput {
  name: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  timeKnown: boolean;
  gender: Gender;
  calendarType: 'solar' | 'lunar';
  lunarInput?: LunarInput;
}

export interface Component<V = any> {
  id: string;
  name: string;
  category: string;
  value: V;
}

export interface EngineResult {
  engineId: string;
  engineName: string;
  components: Component[];
  meta: Record<string, any>;
  errors: string[];
}

export interface SourceRef {
  system: string;
  componentId: string;
  name: string;
}

export interface RadarAxis {
  key: string;
  label: string;
  value: number;
  unit: string;
  ruleId: string;
  inputs?: Record<string, number>;
  assets?: string[];
  liabilities?: string[];
}

export interface Radar {
  id: string;
  system: string;
  title: string;
  kind: 'radar' | 'bar';
  axes: RadarAxis[];
}

export interface ScoringRule {
  id: string;
  axisName: string;
  sourceSystem: string;
  formula: string;
  description: string;
  unit: string;
}

export interface SummarySentence {
  id: string;
  text: string;
  layer: string;
  sources: { engineId: string; engineName: string; componentId: string; componentName: string }[];
}

export interface AnnualTheme {
  id: string;
  title: string;
  text: string;
  sources: SourceRef[];
}

export interface Domain {
  id: string;
  title: string;
  palace: string;
  focus: string;
  score: number | null;
  insufficientData: boolean;
  metrics: { label: string; value: number; unit: string }[];
  insight: string;
  stage?: string;
  sources: SourceRef[];
  limitations: string[];
}

export interface Guidance {
  balance: null | {
    element: string;
    color: string;
    direction: string;
    habit: string;
    text: string;
    limitation: string;
  };
  directions: { name: string; code: string; direction: string }[];
  numbers: number[];
  numberLabel: string;
  sources: SourceRef[];
  limitations: string[];
}

export interface Period {
  system: 'bazi' | 'ziwei';
  label: string;
  range: [number, number];
  isCurrent?: boolean;
  radar?: Radar;
  summary: string[];
}

export interface Scenario {
  id: string;
  name: string;
  cells: { sources: SourceRef[]; expression: string; hypothesis: true }[];
  insufficientData: boolean;
}

export interface LayerDefinition {
  code: string;
  name: string;
  description: string;
  timeScale: string;
  languageRule: string;
}

export interface Report {
  version: string;
  schemaVersion: number;
  generatedAt: string;
  asOf: string;
  input: BirthInput & { longitude: number; latitude: number };
  engines: EngineResult[];
  layers: {
    layerDefinitions: LayerDefinition[];
    components: { id: string; name: string; layer: string; sourceSystem: string; unclassified?: boolean }[];
    byLayer: Record<string, unknown[]>;
    unclassified: unknown[];
  };
  scoringRules: { totalRules: number; byRadarType: Record<string, ScoringRule[]> };
  summary: { sentences: SummarySentence[]; limitations: string[] };
  insights: {
    domains: Domain[];
    annual: null | {
      year: number;
      title: string;
      headline: string;
      themes: AnnualTheme[];
      limitations: string[];
    };
    guidance: Guidance | null;
  };
  radars: Radar[];
  stateTable: { scenarios: Scenario[]; pending: boolean };
  evolution: { periods: Period[]; narrative: string; pending: boolean };
  honesty: { violations: unknown[]; pending: boolean };
}

export interface CompatibilityPerson {
  label: string;
  name: string;
  input: BirthInput;
  lifePath: number | null;
  mingGua: string | null;
}

export interface CompatibilityResult {
  version: string;
  schemaVersion: number;
  asOf: string;
  people: [CompatibilityPerson, CompatibilityPerson];
  elements: {
    available: boolean;
    axes: { label: string; firstShare: number; secondShare: number; complement: number; friction: number }[];
    overallComplement: number;
    overallFriction: number;
    formula: { complement: string; friction: string };
    limitation: string;
  };
  numerology: {
    available: boolean;
    first: { number: number; theme: string };
    second: { number: number; theme: string };
    dynamic: string | null;
    text: string | null;
  };
  minggua: {
    available: boolean;
    sameGroup: boolean;
    sharedDirections: string[];
    text: string | null;
  };
  narrative: { strength: string; watchpoint: string; limitations: string[] };
}
