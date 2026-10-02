import { z } from 'zod';
import { humanDesignCalculator, initEphemeris, jyotishCalculator, runCalculators, type Component } from '@fortune/core';
import type { Analysis } from '../compute';
import { caveatsFor, ok, type Caveat } from '../envelope';
import { defineTool } from './types';

const SYSTEMS = ['bazi', 'ziwei', 'numerology', 'tzolkin', 'mingGua', 'jyotish', 'humanDesign'] as const;
type System = (typeof SYSTEMS)[number];

const SUMMARY_FIELD_MAX = 240;
const SUMMARY_VALUE_MAX = 80;

/** Replace any string containing the person's name; chart data must never echo it. */
function redact<T>(value: T, name: string | undefined): T {
  if (!name) return value;
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return v.includes(name) ? v.split(name).join('[name]') : v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value) as T;
}

function short(value: unknown, max: number): string {
  const s = JSON.stringify(value) ?? 'null';
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function summarize(chart: object, components: Component[], warnings: string[]) {
  const fields: Record<string, unknown> = {};
  const omitted: string[] = [];
  for (const [k, v] of Object.entries(chart)) {
    if ((JSON.stringify(v) ?? '').length <= SUMMARY_FIELD_MAX) fields[k] = v;
    else omitted.push(k);
  }
  return {
    chart: fields,
    omittedChartFields: omitted,
    components: components.map(c => ({ id: c.id, value: short(c.value, SUMMARY_VALUE_MAX) })),
    warnings,
  };
}

async function calculate(system: System, analysis: Analysis) {
  const { ctx, asOf } = analysis;
  switch (system) {
    case 'jyotish':
      await initEphemeris();
      return { requiresTime: jyotishCalculator.requires.time, run: () => jyotishCalculator.calculate(ctx, { asOf }) };
    case 'humanDesign':
      await initEphemeris();
      return { requiresTime: humanDesignCalculator.requires.time, run: () => humanDesignCalculator.calculate(ctx, { asOf }) };
    default:
      return {
        requiresTime: system === 'bazi' || system === 'ziwei',
        run: () => runCalculators(ctx, { asOf }).find(r => r.system === system)!,
      };
  }
}

export const chartTools = [
  defineTool({
    name: 'get_chart',
    description:
      'Natal chart of one system for a profile, computed by core (never recomputed here). detail="full" returns the complete chart, components and warnings. ' +
      'detail="summary" (default) returns only chart fields whose JSON is short (<=240 chars; the rest are listed in omittedChartFields), ' +
      'components as {id, value} with value truncated to 80 chars, and warnings. The name is never included. ' +
      'If the system needs a birth time and it is unknown, returns available:false with a reason instead of guessing. ' +
      'jyotish and humanDesign are experimental (caveat experimental:<system>).',
    input: {
      profileId: z.string(),
      system: z.enum(SYSTEMS),
      asOf: z.string().describe("Evaluation date 'YYYY-MM-DD' for time-varying layers."),
      detail: z.enum(['summary', 'full']).default('summary'),
    },
    async handler(args, { analyzer }) {
      const analysis = await analyzer.get(args.profileId, args.asOf);
      const { system, detail } = args;
      const caveats: Caveat[] = caveatsFor(analysis);
      if ((system === 'jyotish' || system === 'humanDesign') && !caveats.some(c => c.code === `experimental:${system}`)) {
        caveats.push({
          code: `experimental:${system}`,
          message: `${system} is not yet cross-validated against public calculators (verified: false, D-039). Do not count it as equal confidence to verified systems.`,
        });
      }
      const { requiresTime, run } = await calculate(system, analysis);
      if (requiresTime && analysis.ctx.profile.time === null) {
        return ok({
          asOf: args.asOf,
          caveats,
          data: { system, available: false, reason: 'time_unknown: this system requires a known birth time; no chart is computed.' },
        });
      }
      const res = run();
      const name = analysis.ctx.profile.name;
      const body =
        detail === 'full'
          ? { chart: res.chart, components: res.components, warnings: res.warnings }
          : summarize(res.chart, res.components, res.warnings);
      return ok({
        asOf: args.asOf,
        caveats,
        data: { system, available: true, detail, version: res.version, ...redact(body, name) },
      });
    },
  }),
  defineTool({
    name: 'get_time_context',
    description:
      'Compact TimeContext for a profile: local, utc, jd, solar, lunar, solarTerms, flags. The profile object (name, birth data) is omitted.',
    input: { profileId: z.string(), asOf: z.string().describe("Evaluation date 'YYYY-MM-DD'.") },
    async handler(args, { analyzer }) {
      const analysis = await analyzer.get(args.profileId, args.asOf);
      const { local, utc, jd, solar, lunar, solarTerms, flags } = analysis.ctx;
      return ok({ asOf: args.asOf, caveats: caveatsFor(analysis), data: { local, utc, jd, solar, lunar, solarTerms, flags } });
    },
  }),
];
