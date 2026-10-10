/**
 * Internal #51 sync session. All projections own one validated immutable natal
 * DTO and its private run-time providers. No Report 8 or legacy replay changes.
 */
import { createNatalFactStore } from '../facts/natalFactStore';
import { describeNatalRuleMetadata } from '../facts/natalRuleMetadata';
import type { CalculationSpec } from './calculationSpec';
import { createChartSnapshot, validateChartSnapshot, chartSnapshotRuntime } from './chartSnapshot';
import { buildTimelineWithBaziNatalBasis, buildTimelineCooperativelyWithNatalBasis,
  type TimelineOptions, type TimelineCooperativeControl } from '../timeline/buildTimeline';
import { buildBacktestTimelineUsing, type BacktestTimelineOptions } from '../backtest/timeline';

type PeriodOptions = Omit<TimelineOptions, 'useTrueSolarTime' | 'ziHourConvention' | 'name'>;
type BacktestOptions = Omit<BacktestTimelineOptions, 'useTrueSolarTime' | 'ziHourConvention'>;

/**
 * A serialized DTO is checked once against one fresh current reconstruction,
 * then that exact reconstruction supplies every year and every backtest chunk.
 * Nothing is inferred for old reports or historical calculator versions.
 */
export function createChartSnapshotSession(spec: CalculationSpec, persisted?: unknown) {
  const computed = createChartSnapshot(spec);
  const snapshot = persisted === undefined ? computed : validateChartSnapshot(persisted, computed);
  const runtime = chartSnapshotRuntime(snapshot);
  const calculation = Object.freeze({ specHash: snapshot.specHash, snapshotId: snapshot.snapshotId });
  const time = Object.freeze({
    useTrueSolarTime: snapshot.identity.settings.bazi.clock === 'trueSolar',
    ziHourConvention: snapshot.identity.settings.bazi.ziHourConvention,
  });
  function options<T extends PeriodOptions | BacktestOptions>(requested: T) {
    // Even explicitly undefined overrides are forbidden: there is one source
    // of natal input/settings, and period options cannot replace that source.
    if (!requested || ['name', 'useTrueSolarTime', 'ziHourConvention'].some(key => key in requested)) {
      throw new Error('ChartSnapshot projections cannot override natal settings');
    }
    const systems = requested.systems ?? ['bazi', 'ziwei', 'numerology'];
    if (!Array.isArray(systems) || systems.some(system => !['bazi', 'ziwei', 'numerology'].includes(system))) {
      throw new Error('ChartSnapshot projections require the existing sync timeline scope');
    }
    return { ...requested, systems: [...systems], ...time };
  }
  const project: typeof buildTimelineWithBaziNatalBasis = (ctx, opts) => {
    runtime.verifyEnvironment();
    const result = buildTimelineWithBaziNatalBasis(ctx, opts, runtime.bazi, runtime.ziwei);
    runtime.verifyEnvironment();
    return result;
  };
  return Object.freeze({
    snapshot,
    natalRuleMetadata() {
      if (arguments.length) throw new TypeError('No metadata context overrides allowed');
      runtime.verifyEnvironment();
      const result = describeNatalRuleMetadata(snapshot, createNatalFactStore(snapshot));
      runtime.verifyEnvironment();
      return result;
    },
    timeline(requested: PeriodOptions) {
      const timeline = project(runtime.ctx, options(requested), runtime.bazi, runtime.ziwei);
      return { calculation, timeline };
    },
    async timelineCooperatively(requested: PeriodOptions, control: TimelineCooperativeControl) {
      control.signal.throwIfAborted();
      runtime.verifyEnvironment();
      const timeline = await buildTimelineCooperativelyWithNatalBasis(runtime.ctx, options(requested), control, runtime.bazi, runtime.ziwei);
      runtime.verifyEnvironment();
      return { calculation, timeline };
    },
    backtest(requested: BacktestOptions) {
      const timeline = buildBacktestTimelineUsing(runtime.ctx, options(requested), (ctx, opts) => project(ctx, opts, runtime.bazi, runtime.ziwei));
      return { calculation, timeline };
    },
  });
}
