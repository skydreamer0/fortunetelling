/** Current-build portable calculation session. Identity covers sync natal systems only. */
import { createCalculationSpec } from '../core/calculationSpec';
import { createChartSnapshotSession } from '../core/chartSnapshotSession';
import { chartSnapshotRuntime } from '../core/chartSnapshot';
import { finishCalculation } from '../core/calculationSteps';
import { analyzeWithSnapshot, type AnalyzeInput } from '../core/analyze';
import { createTimeContext } from '../time/createTimeContext';
import { ownProfileFile, profileSettings, type ProfileFile } from './profileFile';
import { CALCULATORS } from '../calculators';
import { calculateBaziWithNatalBasis } from '../calculators/bazi/calculator';
import { calculateZiweiSteps } from '../calculators/ziwei/calculator';
import { initEphemeris } from '../calculators/astro';
import { buildTimelineWithBaziNatalBasis, type TimelineOptions } from '../timeline/buildTimeline';

export function profileAnalyzeInput(file: ProfileFile): AnalyzeInput {
  file = ownProfileFile(file);
  const { profile } = file;
  const [year, month, day] = profile.date.split('-').map(Number);
  const [hour, minute] = (profile.time ?? '12:00').split(':').map(Number);
  return {
    year, month, day, hour, minute, timeKnown: profile.time !== null,
    timeAccuracy: profile.timeAccuracy, gender: profile.gender, name: profile.name ?? '',
    birthplace: structuredClone(profile.birthplace), ...profileSettings(file).settings,
  };
}

export function createProfileCalculation(file: ProfileFile, persistedSnapshot?: unknown) {
  // Treat this public entry as an untrusted-data boundary, even from JavaScript callers.
  const owned = ownProfileFile(file);
  const input = profileAnalyzeInput(owned);
  const spec = createCalculationSpec(input);
  const session = createChartSnapshotSession(spec, persistedSnapshot);
  const runtime = chartSnapshotRuntime(session.snapshot);
  const ctx = createTimeContext(owned.profile);
  const resolution = profileSettings(owned);
  const calculation = Object.freeze({
    schemaVersion: 1 as const, scope: 'analyze-sync-natal' as const,
    specHash: spec.specHash, snapshotId: session.snapshot.snapshotId,
    settingsSource: resolution.source, settings: resolution.settings,
    // Never imply that the sync identity covers the async ephemeris calculations.
    excludedSystems: Object.freeze(['jyotish', 'humanDesign'] as const),
  });
  type Options = Omit<TimelineOptions, 'useTrueSolarTime' | 'ziHourConvention' | 'name'>;
  function validateOptions(options: Options) {
    if (['useTrueSolarTime', 'ziHourConvention', 'name'].some(key => key in options)) {
      throw new Error('Profile calculation projections cannot override natal settings');
    }
  }
  function timeline(options: Options) {
    validateOptions(options);
    runtime.verifyEnvironment();
    const result = buildTimelineWithBaziNatalBasis(runtime.ctx, { ...options, ...resolution.settings }, runtime.bazi, runtime.ziwei);
    runtime.verifyEnvironment();
    return result;
  }
  return Object.freeze({
    spec, snapshot: session.snapshot, calculation,
    // Callers receive their own copy, not the provider's context.
    context: () => structuredClone(ctx),
    analyze: (asOf: string) => analyzeWithSnapshot(input, { asOf }, session.snapshot),
    timeline,
    async timelineAsync(options: Options) {
      validateOptions(options);
      const ownedOptions = structuredClone(options);
      await initEphemeris();
      return timeline(ownedOptions);
    },
    charts(asOf: string) {
      runtime.verifyEnvironment();
      const results = CALCULATORS.filter(calculator => calculator.id !== 'bazi' && calculator.id !== 'ziwei').map(calculator => calculator.calculate(runtime.ctx, { asOf }));
      // Use the owned providers for the two natal systems with period projections.
      const bazi = calculateBaziWithNatalBasis(runtime.ctx, { asOf, ...resolution.settings }, runtime.bazi);
      const ziwei = finishCalculation(calculateZiweiSteps(runtime.ctx, {
        asOf, useTrueSolarTime: resolution.settings.useTrueSolarTime,
        ziHourConvention: resolution.settings.ziHourConvention === 'early' ? 'nextDayAt23' : 'splitMidnight',
      }, runtime.ziwei));
      runtime.verifyEnvironment();
      return [bazi, ziwei, ...results];
    },
    backtest: session.backtest,
    timelineCooperatively: session.timelineCooperatively,
  });
}

/** Explicit envelope; existing Report 7 bytes and old reports are never backfilled. */
export function analyzeProfileFile(file: ProfileFile, asOf: string, persistedSnapshot?: unknown) {
  const session = createProfileCalculation(file, persistedSnapshot);
  return { report: session.analyze(asOf), calculation: session.calculation, snapshot: session.snapshot };
}
