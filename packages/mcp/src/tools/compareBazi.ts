import { z } from 'zod';
import { baziCalculator, canonicalStringify, createTimeContext } from '@fortune/core';
import { ok, type Caveat } from '../envelope';
import { ToolError } from '../errors';
import { defineTool } from './types';

const options = z.object({
  useTrueSolarTime: z.boolean(),
  ziHourConvention: z.enum(['late', 'early']),
}).strict();

const SOURCES = [
  'packages/core/src/calculators/bazi/pillars.ts',
  'packages/core/src/calculators/bazi/calculator.ts',
] as const;
const FIELDS = ['pillars', 'dayMaster', 'fiveElements', 'tenGods'] as const;
const WARNING_CODES = new Set(['time_unknown', 'dst_gap', 'dst_overlap', 'near_jie_boundary',
  'near_shichen_boundary', 'zi_hour_convention', 'historical_zone_uncertain', 'pillars_differ_from_civil']);
const LIMITS = [
  '只比較目前安裝版本的八字本命四柱、日主、五行及十神出現次數；不比較大運、流年、流月、評分或規則解讀。',
  '這是同一份輸入的計算口徑比較，不是不同流派的判斷，也不代表預測準確度或獨立共識。',
  '版本資訊供核對；沒有保存歷史引擎、出生輸入或快照，不能據此宣稱歷史重播。',
  '差異是兩組設定共同作用的結果；同時改兩項時，不把差異歸因於單一設定。',
  '只比較每組口徑的主盤；保留時間警示，但沒有窮舉出生時間誤差範圍及邊界替代盤。',
] as const;

export const comparisonTools = [defineTool({
  name: 'compare_bazi_conventions',
  description: 'Read-only comparison of two explicit BaZi calculation conventions for the SAME stored profile and asOf, using the currently installed core calculator. ' +
    'left/right each require useTrueSolarTime (boolean) and ziHourConvention (late|early). ' +
    'Returns effective options, selected natal fields, differences, source paths, uncertainty warning codes, a deterministic Chinese explanation and full current version metadata. ' +
    'No AI key, school-pack comparison, rule interpretations, scores, historical replay, profile export or raw clock timestamps. Unknown birth time returns available:false; never guessed.',
  input: {
    profileId: z.string(),
    asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
      const date = new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }, 'asOf must be a real calendar date (YYYY-MM-DD)'),
    left: options,
    right: options,
  },
  async handler(args, { store }) {
    // Load once: both sides use identical validated input, without analyzer timeline/ephemeris work.
    const { file } = await store.get(args.profileId).catch(error => {
      const code = error instanceof ToolError ? error.code : 'internal';
      throw new ToolError(code, 'Unable to load a valid profile for comparison.');
    });
    const base = { schemaVersion: 1, scope: 'bazi-current-natal-conventions', system: 'bazi',
      sources: SOURCES, limits: LIMITS };
    const caveats: Caveat[] = [{ code: 'comparison_scope', message: LIMITS.join(' ') }];
    if (file.profile.timeAccuracy !== 'exact') caveats.push({ code: 'birth_time_not_exact',
      message: '出生時間不是精確值；此比較不代表完整誤差範圍分析。' });
    const envelope = (data: unknown) => ok({ asOf: args.asOf, includeVersions: true,
      ephemeris: 'not_initialized', caveats, data });
    if (file.profile.time === null) {
      caveats.push({ code: 'time:time_unknown', message: '出生時間未知，不猜測四柱。' });
      return envelope({ ...base, available: false, reason: 'time_unknown',
        explanation: '出生時間未知，無法比較八字四柱口徑。' });
    }
    try {
      const ctx = createTimeContext(file.profile);
      // Codes only: raw flag details can contain birth time/location information.
      for (const flag of ctx.flags) caveats.push({ code: `time:${flag.code}`,
        message: `core 時間警示 ${flag.code}；本比較不消除此不確定性。` });
      const run = (config: z.infer<typeof options>) => {
        const result = baziCalculator.calculate(ctx, { ...config, asOf: args.asOf });
        const chart = result.chart;
        if (!chart.pillars || !chart.conventions || !chart.dayMaster || !chart.fiveElements || !chart.tenGods) return null;
        return {
          calculatorVersion: result.version,
          effectiveOptions: { useTrueSolarTime: chart.conventions.useTrueSolarTime,
            ziHourConvention: chart.conventions.ziHourConvention,
            dayHourClock: chart.conventions.clock.basis, yearMonthBasis: chart.conventions.yearMonthBasis },
          natal: { pillars: chart.pillars, dayMaster: chart.dayMaster,
            fiveElements: chart.fiveElements, tenGods: chart.tenGods },
          warnings: [...new Set(result.warnings.map(code => WARNING_CODES.has(code) ? code : 'unclassified_core_warning'))],
        };
      };
      const left = run(args.left);
      const right = run(args.right);
      if (!left || !right) return envelope({ ...base, available: false, reason: 'calculation_unavailable',
        explanation: '核心未提供完整本命欄位與有效口徑，無法比較。' });
      const changedOptions = (['useTrueSolarTime', 'ziHourConvention'] as const)
        .filter(key => left.effectiveOptions[key] !== right.effectiveOptions[key]);
      const differences = FIELDS.filter(field => canonicalStringify(left.natal[field]) !== canonicalStringify(right.natal[field]))
        .map(field => ({ field, chartPath: `chart.${field}`, left: left.natal[field], right: right.natal[field] }));
      const unchangedFields = FIELDS.filter(field => !differences.some(change => change.field === field));
      const explanation = changedOptions.length === 0
        ? '兩側有效口徑相同；所比較的本命欄位相同。'
        : differences.length === 0
          ? `改變 ${changedOptions.join('、')} 後，此輸入的本命比較欄位沒有變化；不代表所有出生時間皆相同。`
          : `改變 ${changedOptions.join('、')} 後，${differences.map(change => change.field).join('、')} 出現差異。四柱由核心依兩組口徑計算，日主、五行及十神次數由各自四柱推導；來源列於 sources。`;
      return envelope({ ...base, available: true, left, right, changedOptions, differences, unchangedFields, explanation });
    } catch {
      // Do not echo arbitrary engine errors containing profile or clock data.
      throw new ToolError('internal', 'BaZi convention comparison failed; no comparison result is available.');
    }
  },
})];
