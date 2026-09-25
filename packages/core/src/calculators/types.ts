/**
 * @fileoverview ② Calculator contract (ARCHITECTURE-V2 §4).
 *
 * A calculator turns a {@link TimeContext} (the only time source, D-026) into a
 * strongly-typed chart for one system plus the v1 `components` array that the
 * LayerClassifier / Radar / Summary pipeline already consumes.
 *
 * `calculate` must be pure: no system clock, no env, no network or file IO
 * (D-014). Anything time-varying (大運/大限/流年/個人流年) is evaluated at
 * `config.asOf`, which time-dependent calculators require.
 *
 * @module calculators/types
 */

import type { SystemId } from '../signals/types';
import type { TimeContext } from '../time/types';

export type { SystemId };

/**
 * One atomic engine output — same shape as v1 `SystemResult` components
 * (`core/models/SystemResult.js`). `value` is engine-specific; calculators
 * expose the typed view of it in `ChartResult.chart`.
 */
export interface Component {
  id: string;
  name: string;
  category: string;
  value: unknown;
  meta?: Record<string, unknown>;
}

/** What a calculator needs from the BirthProfile to produce its chart. */
export interface CalculatorRequirements {
  /** Needs a known birth time; with `time === null` the chart is empty and `time_unknown` is warned. */
  time: boolean;
  /** Needs the birthplace coordinates (not just the civil date). */
  location: boolean;
  /** Needs a name. */
  name: boolean;
}

/** Shared calculator config. Each calculator documents which fields it reads. */
export interface CalculatorConfig {
  /**
   * Evaluation date for time-varying layers, 'YYYY-MM-DD' or a Date.
   * Required by time-dependent calculators — they never fall back to "now".
   */
  asOf?: string | Date;
  /** Name override (defaults to `ctx.profile.name`). */
  name?: string;
}

/** Well-known warning codes emitted by calculators (other warnings are free text from the engine). */
export type CalculatorWarningCode =
  | 'time_unknown'
  | 'near_shichen_boundary'
  | 'near_jie_boundary'
  | 'zi_hour_convention'
  | 'dst_gap'
  | 'dst_overlap';

export interface ChartResult<TChart> {
  system: SystemId;
  /** Calculator semver (bumped on any algorithm change). */
  version: string;
  /** System-specific, strongly-typed chart. */
  chart: TChart;
  /** v1 components, unchanged from the engine (LayerClassifier input). */
  components: Component[];
  /** Warning codes (see {@link CalculatorWarningCode}) followed by engine messages. */
  warnings: string[];
}

export interface Calculator<TChart, TConfig extends CalculatorConfig = CalculatorConfig> {
  id: SystemId;
  /** Calculator semver; any algorithm change must bump it. */
  version: string;
  requires: CalculatorRequirements;
  calculate(ctx: TimeContext, config?: TConfig): ChartResult<TChart>;
}
