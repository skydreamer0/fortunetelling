import {
  DOMAINS,
  SYSTEM_IDS,
  buildConsensus,
  monthsInRange,
  restrictTimeline,
  restrictTimelineCell,
  type ConsensusAgreement,
  type ConsensusConflict,
  type Signal,
  type SignalWindow,
  type TimelineCell,
} from '@fortune/core';
import { z } from 'zod';
import { caveatsFor, ok } from '../envelope';
import { ToolError } from '../errors';
import { detailInput, previewIds } from '../slim';
import { resolveSystems, systemsFields, systemsInput, verifiedOnlyInput } from '../systems';
import { assertAsOf, resolvableYearRange } from '../compute';
import { MAX_MONTHS } from './questions';
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

/** Month cells (many per response) leave out `perSystem` unless `detail`; year cells always carry it. */
function slimCell(cell: TimelineCell, domain: string | undefined, detail: boolean | undefined, month = false) {
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
        ...(month && !detail
          ? {}
          : {
              perSystem: Object.fromEntries(
                Object.entries(d.perSystem).map(([sys, a]) => [sys, { score: a!.score, valence: a!.valence, signalCount: a!.signalIds.length }]),
              ),
            }),
        topSignalIds: previewIds(d.topSignals.map(s => s.id), detail),
        topSignalIdsTotal: d.topSignals.length,
      })),
  };
}

export const MONTH_TABLE_COLUMNS = ['month', 'score', 'band', 'consensus', 'highConsensus', 'hasConflict', 'topSignalIds', 'topSignalIdsTotal'] as const;
const MONTH_TABLE_COLUMNS_TEXT = MONTH_TABLE_COLUMNS.join(', ');

/** 單一領域的逐月表格：每月一列，欄位見 MONTH_TABLE_COLUMNS（topSignalIds 依 detail 截斷規則）。 */
function monthTable(cells: readonly TimelineCell[], domain: string, detail: boolean | undefined) {
  return {
    domain,
    columns: MONTH_TABLE_COLUMNS,
    rows: cells.map(cell => {
      const d = cell.domains.find(x => x.domain === domain)!;
      const ids = d.topSignals.map(s => s.id);
      return [cell.window.start.slice(0, 7), d.score, d.band, d.consensus, d.highConsensus, d.conflict !== null, previewIds(ids, detail), ids.length] as const;
    }),
  };
}

const filterYears =<T extends { window: SignalWindow }>(items: T[], range: Range | undefined): T[] => {
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

const agreementOut = (a: ConsensusAgreement, detail: boolean | undefined) => ({
  domain: a.domain,
  window: a.window,
  consensus: a.consensus,
  score: a.score,
  systems: a.systems,
  signalIds: previewIds(a.signalIds, detail),
  signalIdsTotal: a.signalIds.length,
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
      'hasConflict, perSystem { score (0-1), valence, signalCount } (year cells always; month cells only with detail: true) and topSignalIds (first 5 ids; topSignalIdsTotal = full count; detail: true returns all; resolve with get_signal). ' +
      'years: yearly cells for the next years, filtered by range ({start,end} as YYYY or YYYY-MM, window overlap). ' +
      `months: ALWAYS [] unless the months parameter is given. months = {start,end} as YYYY-MM returns one cell per month in that inclusive range (max ${MAX_MONTHS} months, within asOf-5..asOf+10 years). ` +
      'Months outside the asOf year are computed for that year (core builds month cells per year). Use domain to shrink the response; response_too_large means narrow months or domain. ' +
      `With domain + months (and no detail) months come as monthTable { domain, columns, rows } = one row per month [${MONTH_TABLE_COLUMNS_TEXT}] instead of nested cells (monthsFormat: 'cells' forces cells). ` +
      'systems / verifiedOnly recompute every cell from only those systems; the response always has systemsUsed, excludedSystems, experimentalIncluded.',
    input: {
      profileId,
      asOf,
      range: flexRange.optional(),
      months: monthRange.optional().describe(`Month-by-month cells for this inclusive YYYY-MM range (max ${MAX_MONTHS} months). Omit for yearly cells only.`),
      domain: domainEnum.optional(),
      monthsFormat: z.enum(['table', 'cells']).optional().describe("Default: 'table' when domain is given (and detail is not), else 'cells'. 'table' needs domain."),
      systems: systemsInput,
      verifiedOnly: verifiedOnlyInput,
      detail: detailInput,
    },
    async handler(args, { analyzer }) {
      assertAsOf(args.asOf);
      if (args.monthsFormat === 'table' && !args.domain) {
        throw new ToolError('invalid_args', "monthsFormat 'table' needs domain", 'Pass domain (one row per month for that domain).');
      }
      let monthBounds: { lo: string; hi: string } | null = null;
      if (args.months) {
        const n = monthsInRange(args.months);
        if (n < 1) throw new ToolError('invalid_args', `months.start (${args.months.start}) is after months.end (${args.months.end})`);
        if (n > MAX_MONTHS) throw new ToolError('invalid_args', `months spans ${n} months; at most ${MAX_MONTHS} allowed`);
        const years = resolvableYearRange(args.asOf);
        if (Number(args.months.start.slice(0, 4)) < years.min || Number(args.months.end.slice(0, 4)) > years.max) {
          throw new ToolError('invalid_args', `months must stay within ${years.min}-${years.max} for asOf ${args.asOf}`);
        }
        monthBounds = { lo: args.months.start, hi: args.months.end };
      }
      const analysis = await analyzer.get(args.profileId, args.asOf);
      const sel = resolveSystems(analysis, args.systems, args.verifiedOnly);
      // 篩選時由 core 從指定系統的訊號重算每個 cell；不篩選時直接用原 timeline（輸出不變）。
      const tl = sel.filtered ? restrictTimeline(analysis.timeline, sel.systemsUsed) : analysis.timeline;
      const restrictCell = (cell: TimelineCell) => (sel.filtered ? restrictTimelineCell(cell, sel.systemsUsed, analysis.timeline) : cell);
      const years = filterYears(tl.years, args.range).map(c => slimCell(c, args.domain, args.detail));
      const monthCells: TimelineCell[] = [];
      if (monthBounds) {
        for (let y = Number(monthBounds.lo.slice(0, 4)); y <= Number(monthBounds.hi.slice(0, 4)); y++) {
          for (const cell of analysis.monthCells(y)) {
            const ym = cell.window.start.slice(0, 7);
            if (ym >= monthBounds.lo && ym <= monthBounds.hi) monthCells.push(restrictCell(cell));
          }
        }
      }
      // 指定 domain 時逐月預設改成每月一列的表格（monthsFormat: 'cells' 或 detail: true 可取回巢狀 cell）。
      const format = monthBounds ? (args.monthsFormat ?? (args.domain && !args.detail ? 'table' : 'cells')) : 'cells';
      const monthsOut =
        format === 'table'
          ? { monthsFormat: 'table' as const, monthTable: monthTable(monthCells, args.domain!, args.detail) }
          : { monthsFormat: 'cells' as const, months: monthCells.map(c => slimCell(c, args.domain, args.detail, true)) };
      return ok({
        asOf: analysis.asOf,
        data: { systems: tl.systems, skippedSystems: tl.skippedSystems, ...systemsFields(sel), years, ...monthsOut, monthsRange: args.months ?? null },
        caveats: caveatsFor(analysis, sel),
      });
    },
  }),
  defineTool({
    name: 'get_consensus',
    description:
      'Cross-system consensus: years[] each { window, highConsensus[] agreements (domain, consensus, score, systems, signalIds (first 5; signalIdsTotal = full count; detail: true returns all)), conflictCount }, ' +
      'headlines.agreements (top agreements), conflictCount total, systems and thresholds. Conflict details: use list_conflicts. range = {start,end} as YYYY or YYYY-MM filters years. ' +
      'systems / verifiedOnly recompute consensus from only those systems (list_conflicts is not filtered); the response always has systemsUsed, excludedSystems, experimentalIncluded.',
    input: { profileId, asOf, range: flexRange.optional(), systems: systemsInput, verifiedOnly: verifiedOnlyInput, detail: detailInput },
    async handler(args, { analyzer }) {
      const analysis = await analyzer.get(args.profileId, args.asOf);
      const sel = resolveSystems(analysis, args.systems, args.verifiedOnly);
      const c = sel.filtered ? buildConsensus(restrictTimeline(analysis.timeline, sel.systemsUsed)) : analysis.consensus;
      const years = filterYears(c.years, args.range).map(y => ({
        window: y.window,
        highConsensus: y.highConsensus.map(a => agreementOut(a, args.detail)),
        conflictCount: y.conflicts.length,
      }));
      const agreements = filterYears(c.headlines.agreements, args.range).map(a => agreementOut(a, args.detail));
      const conflictCount = filterYears(c.headlines.conflicts, args.range).length;
      return ok({
        asOf: analysis.asOf,
        data: {
          systems: c.systems,
          consensusThreshold: c.consensusThreshold,
          highConsensusMinSystems: c.highConsensusMinSystems,
          ...systemsFields(sel),
          years,
          headlines: { agreements },
          conflictCount,
        },
        caveats: caveatsFor(analysis, sel),
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
