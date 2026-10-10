/** Isolated child-process probe. Imported through URL.href by the test, never a new runtime API. */
import { analyze } from '../../src/core/analyze';
import { resolveCalculationSpec } from '../../src/core/calculationSpec';
import { toZiweiZiConvention } from '../../src/core/analyzeInput';
import { finishCalculation } from '../../src/core/calculationSteps';
import { lunarToSolarDate, parseIsoDate, solarToLunarDate } from '../../src/core/calendar';
import { TimeContextZiweiEngine } from '../../src/core/timeContextEngines';
import { createTimeContext } from '../../src/time/createTimeContext';
import { createAstrolabe, natalChart, timeIndexFrom } from '../../src/calculators/ziwei/astrolabe';
import { calculateZiweiSteps, ziweiCalculator } from '../../src/calculators/ziwei/calculator';
import { createZiweiNatalBasisProvider, type ZiweiNatalBasisProvider } from '../../src/calculators/ziwei/natalBasis';
import { calendarPlaces, lunarCases, natalCases, settings } from './natalCalendarCases';

const AS_OF = '2026-09-25';
// Only nondeterministic metadata is omitted; chart, periods, warnings, flags,
// rules, identity and all other public output fields participate in the digest.
const volatile = new Set(['computedAt', 'durationMs', 'generatedAt', 'classifiedAt', 'exportedAt']);
const digest = (value: unknown) => new Bun.CryptoHasher('sha256')
  .update(JSON.stringify(value, (key, item) => volatile.has(key) ? undefined : item)).digest('hex');
type Setting = keyof typeof settings;
export type ProbeMode = Setting | 'interleaved';

function resolve(row: typeof natalCases[number], setting: Setting) {
  const [hour, minute] = row.time.split(':').map(Number);
  const input = { ...parseIsoDate(row.date), hour, minute, gender: 'female' as const,
    name: 'SYNTHETIC MATRIX', birthplace: calendarPlaces[0], ...settings[setting] };
  const resolved = resolveCalculationSpec(input);
  const ctx = createTimeContext(resolved.profile, { dstOverlap: resolved.spec.identity.settings.time.dstOverlap });
  const cfg = { asOf: AS_OF, useTrueSolarTime: resolved.options.useTrueSolarTime,
    ziHourConvention: toZiweiZiConvention(resolved.options.ziHourConvention) };
  return { ...resolved, input, ctx, cfg };
}

function calculate(row: typeof natalCases[number], setting: Setting, provider?: ZiweiNatalBasisProvider) {
  const { ctx, cfg, options, birth, spec } = resolve(row, setting);
  const basis = provider?.(ctx, cfg);
  const time = basis ? basis.time! : timeIndexFrom(ctx, cfg)!;
  const natal = [time, ...time.alternatives].map(resolution => basis
    ? basis.natalFor(resolution) : natalChart(createAstrolabe(resolution.date, resolution.timeIndex, ctx.profile.gender)));
  const main = new TimeContextZiweiEngine({ ctx, ...options, asOf: new Date(AS_OF), natalBasis: provider }).run(birth);
  // Full typed period work is sampled, rather than multiplying the expensive
  // 11-year calculation by every civil-calendar fixture.
  const typed = ['taipei-overlap', 'leap-six-sixteen'].includes(row.id)
    ? (provider ? finishCalculation(calculateZiweiSteps(ctx, cfg, provider)) : ziweiCalculator.calculate(ctx, cfg)) : null;
  return { id: row.id, setting, spec: digest(spec), ctx: digest(ctx), local: ctx.local, utc: ctx.utc,
    lunar: ctx.lunar, flags: ctx.flags, policy: spec.identity.settings.time,
    time, natal: digest(natal), palaceCounts: natal.map(chart => chart.palaces.length),
    main: digest(main), mainCount: main.components.length, errors: main.errors,
    typed: typed && { digest: digest(typed), palaces: typed.chart.palaces.length,
      time: typed.chart.time, monthly: typed.chart.monthlySequence.length, warnings: typed.warnings } };
}

export function runNatalCalendarProbe(mode: ProbeMode) {
  // Baseline processes use only one setting and NO shared provider. The third
  // process retains provider A across B, exercising the actual cached path.
  const rows = natalCases.map(row => {
    if (mode !== 'interleaved') return [calculate(row, mode)];
    const a = resolve(row, 'A'), b = resolve(row, 'B');
    const providerA = createZiweiNatalBasisProvider(a.ctx, a.cfg);
    const providerB = createZiweiNatalBasisProvider(b.ctx, b.cfg);
    return [calculate(row, 'A', providerA), calculate(row, 'B', providerB), calculate(row, 'A', providerA)];
  });
  const calendar = lunarCases.flatMap(row => calendarPlaces.map(birthplace => {
    const ctx = createTimeContext({ date: row.date, time: '12:00', timeAccuracy: 'exact', gender: 'female', birthplace });
    return { id: row.id, timezone: birthplace.timezone, solar: solarToLunarDate(parseIsoDate(row.date)),
      back: lunarToSolarDate(row.lunar), lunar: ctx.lunar };
  }));
  let invalidLeapDay = '';
  try { lunarToSolarDate({ year: 2025, month: 6, day: 30, isLeap: true }); }
  catch (error) { invalidLeapDay = (error as Error).message; }

  // One complete real analyze report per TZ proves the shared integration is
  // reached for leap-month birth; other rows exercise full main/natal outputs.
  const input = resolve(natalCases.find(row => row.id === 'leap-six-sixteen')!, 'A').input;
  const report = mode === 'interleaved' ? analyze(input, { asOf: AS_OF }) : null;
  const ziwei = report?.engines.find(engine => engine.engineId === 'ziwei');
  return { host: process.env.TZ, hostOffsetMinutes: new Date('2025-07-25T00:00:00Z').getTimezoneOffset(),
    rows, calendar, invalidLeapDay,
    report: report && { digest: digest(report), main: digest(ziwei), errors: report.engines.map(engine => engine.errors),
      context: report.timeContext, systems: report.timeline.systems, schemaVersion: report.schemaVersion } };
}
export type ProbeResult = ReturnType<typeof runNatalCalendarProbe>;
