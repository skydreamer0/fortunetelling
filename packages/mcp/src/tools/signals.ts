import { DOMAINS, SYSTEM_IDS, type ConsensusAgreement, type ConsensusConflict, type Signal, type SignalWindow, type TimelineCell } from '@fortune/core';
import { z } from 'zod';
import { caveatsFor, ok } from '../envelope';
import { ToolError } from '../errors';
import { defineTool } from './types';

const asOf = z.string().describe("Evaluation date 'YYYY-MM-DD'.");
const profileId = z.string();
const domainEnum = z.enum(DOMAINS);
const systemEnum = z.enum(SYSTEM_IDS);
const monthRange = z
  .object({
    start: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "'YYYY-MM'"),
    end: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "'YYYY-MM'"),
  })
  .describe("Inclusive month range { start: 'YYYY-MM', end: 'YYYY-MM' }; keeps items whose window overlaps it.");
const flexRange = z
  .object({
    start: z.string().regex(/^\d{4}(-(0[1-9]|1[0-2]))?$/, "'YYYY' or 'YYYY-MM'"),
    end: z.string().regex(/^\d{4}(-(0[1-9]|1[0-2]))?$/, "'YYYY' or 'YYYY-MM'"),
  })
  .describe("Inclusive range { start, end }, each 'YYYY' or 'YYYY-MM'; keeps items whose window overlaps it.");

type Range = { start: string; end: string };

/** Normalise to month bounds 'YYYY-MM'. */
function bounds(range: Range | undefined): { lo: string; hi: string } | null {
  if (!range) return null;
  const lo = range.start.length === 4 ? `${range.start}-01` : range.start;
  const hi = range.end.length === 4 ? `${range.end}-12` : range.end;
  if (lo > hi) throw new ToolError('invalid_args', 'range.start must not be after range.end');
  return { lo, hi };
}

function overlaps(w: SignalWindow, b: { lo: string; hi: string } | null): boolean {
  if (!b) return true;
  return w.start.slice(0, 7) <= b.hi && w.end.slice(0, 7) >= b.lo;
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function slim(s: Signal) {
  return {
    id: s.id,
    system: s.system,
    ruleId: s.ruleId,
    domain: s.domain,
    trait: s.trait,
    intensity: s.intensity,
    valence: s.valence,
    window: s.window,
    evidence: { text: s.evidence.text },
  };
}

function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset }), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): number {
  try {
    const o = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')).o;
    if (Number.isInteger(o) && o >= 0) return o;
  } catch {}
  throw new ToolError('invalid_args', 'Invalid cursor', 'Pass the nextCursor from the previous list_signals response unchanged.');
}

function slimCell(cell: TimelineCell, domain: string | undefined) {
  return {
    window: cell.window,
    domains: cell.domains
      .filter(d => !domain || d.domain === domain)
      .map(d => ({
        domain: d.domain,
        score: d.score,
        band: d.band,
        consensus: d.consensus,
        highConsensus: d.highConsensus,
        hasConflict: d.conflict !== null,
        perSystem: Object.fromEntries(
          Object.entries(d.perSystem).map(([sys, a]) => [sys, { score: a!.score, valence: a!.valence, signalCount: a!.signalIds.length }]),
        ),
        topSignalIds: d.topSignals.map(s => s.id),
      })),
  };
}

const filterYears = <T extends { window: SignalWindow }>(items: T[], range: Range | undefined): T[] => {
  const b = bounds(range);
  return items.filter(i => overlaps(i.window, b));
};

const conflictOut = (c: ConsensusConflict) => ({
  domain: c.domain,
  window: c.window,
  score: c.score,
  positive: c.positive,
  negative: c.negative,
});

const agreementOut = (a: ConsensusAgreement) => ({
  domain: a.domain,
  window: a.window,
  consensus: a.consensus,
  score: a.score,
  systems: a.systems,
  signalIds: a.signalIds,
});

export const signalTools = [
  defineTool({
    name: 'list_signals',
    description:
      'List signals (precomputed by core) as compact rows: id, system, ruleId, domain, trait, intensity (0-1), valence (-1..1), window, evidence.text. ' +
      'Sorted by intensity desc then id asc. Filters: domain, system, range (window overlap, YYYY-MM), minStrength (intensity >= value). ' +
      'Paginate with limit (default 20, max 100) and cursor; response is { signals, nextCursor, total }. Use get_signal for modifiers and componentIds.',
    input: {
      profileId,
      asOf,
      domain: domainEnum.optional(),
      system: systemEnum.optional(),
      range: monthRange.optional(),
      minStrength: z.number().min(0).max(1).optional().describe('Minimum intensity (0-1).'),
      limit: z.number().int().min(1).max(100).optional().describe('Page size, default 20, max 100.'),
      cursor: z.string().optional().describe('Opaque cursor from a previous response.'),
    },
    async handler(args, { analyzer }) {
      const analysis = await analyzer.get(args.profileId, args.asOf);
      const b = bounds(args.range);
      const limit = args.limit ?? 20;
      const offset = args.cursor ? decodeCursor(args.cursor) : 0;
      const rows = analysis.signals
        .filter(
          s =>
            (!args.domain || s.domain === args.domain) &&
            (!args.system || s.system === args.system) &&
            (args.minStrength === undefined || s.intensity >= args.minStrength) &&
            overlaps(s.window, b),
        )
        .sort((x, y) => y.intensity - x.intensity || cmp(x.id, y.id));
      const page = rows.slice(offset, offset + limit);
      const next = offset + limit < rows.length ? encodeCursor(offset + limit) : null;
      return ok({ asOf: analysis.asOf, data: { signals: page.map(slim), nextCursor: next, total: rows.length }, caveats: caveatsFor(analysis) });
    },
  }),
  defineTool({
    name: 'get_signal',
    description: 'Full Signal by id, including evidence.modifiers, evidence.componentIds, ruleVersion and target. Ids come from list_signals, get_timeline, get_consensus or list_conflicts.',
    input: { profileId, asOf, signalId: z.string().min(1) },
    async handler(args, { analyzer }) {
      const analysis = await analyzer.get(args.profileId, args.asOf);
      const signal = analysis.findSignal(args.signalId);
      if (!signal) {
        throw new ToolError('unknown_signal', `No signal '${args.signalId}' for this profile and asOf`, 'Use list_signals to find valid ids; ids depend on profile and asOf.');
      }
      return ok({ asOf: analysis.asOf, data: { signal }, caveats: caveatsFor(analysis) });
    },
  }),
  defineTool({
    name: 'get_timeline',
    description:
      'Compact timeline: { years, months } cells, each { window, domains[] } where each domain has score (0-100 cross-system), band, consensus (systems >= threshold), highConsensus, ' +
      'hasConflict, perSystem { score (0-1), valence, signalCount } and topSignalIds (ids only; use get_signal). ' +
      'Filters: range ({start,end} as YYYY or YYYY-MM, window overlap) and domain. Months are only included when a range is given (to keep the response small); otherwise months is [].',
    input: { profileId, asOf, range: flexRange.optional(), domain: domainEnum.optional() },
    async handler(args, { analyzer }) {
      const analysis = await analyzer.get(args.profileId, args.asOf);
      const tl = analysis.timeline;
      const years = filterYears(tl.years, args.range).map(c => slimCell(c, args.domain));
      const months = args.range ? filterYears(tl.months, args.range).map(c => slimCell(c, args.domain)) : [];
      return ok({
        asOf: analysis.asOf,
        data: { systems: tl.systems, skippedSystems: tl.skippedSystems, years, months },
        caveats: caveatsFor(analysis),
      });
    },
  }),
  defineTool({
    name: 'get_consensus',
    description:
      'Cross-system consensus: years[] each { window, highConsensus[] agreements (domain, consensus, score, systems, signalIds), conflictCount }, ' +
      'headlines.agreements (top agreements), conflictCount total, systems and thresholds. Conflict details: use list_conflicts. range = {start,end} as YYYY or YYYY-MM filters years.',
    input: { profileId, asOf, range: flexRange.optional() },
    async handler(args, { analyzer }) {
      const analysis = await analyzer.get(args.profileId, args.asOf);
      const c = analysis.consensus;
      const years = filterYears(c.years, args.range).map(y => ({
        window: y.window,
        highConsensus: y.highConsensus.map(agreementOut),
        conflictCount: y.conflicts.length,
      }));
      const agreements = filterYears(c.headlines.agreements, args.range).map(agreementOut);
      const conflictCount = filterYears(c.headlines.conflicts, args.range).length;
      return ok({
        asOf: analysis.asOf,
        data: {
          systems: c.systems,
          consensusThreshold: c.consensusThreshold,
          highConsensusMinSystems: c.highConsensusMinSystems,
          years,
          headlines: { agreements },
          conflictCount,
        },
        caveats: caveatsFor(analysis),
      });
    },
  }),
  defineTool({
    name: 'list_conflicts',
    description:
      'Conflicts where one system leans supportive and another is under pressure: each { domain, window, score, positive { systems, signalIds }, negative { systems, signalIds } }. ' +
      'Signal ids resolve via get_signal. range = {start,end} as YYYY or YYYY-MM filters by window.',
    input: { profileId, asOf, range: flexRange.optional() },
    async handler(args, { analyzer }) {
      const analysis = await analyzer.get(args.profileId, args.asOf);
      const conflicts = filterYears(analysis.consensus.headlines.conflicts, args.range).map(conflictOut);
      return ok({ asOf: analysis.asOf, data: { conflicts, total: conflicts.length }, caveats: caveatsFor(analysis) });
    },
  }),
];
