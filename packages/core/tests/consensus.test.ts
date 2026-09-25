import { beforeAll, describe, expect, test } from 'bun:test';
import {
  CONSENSUS_SCHEMA_VERSION,
  DEFAULT_HEADLINE_AGREEMENTS,
  buildConsensus,
  type ConsensusSummary,
} from '../src/consensus/index';
import { DOMAINS, SYSTEM_IDS, type Domain, type SystemId } from '../src/signals/types';
import { createTimeContext } from '../src/time/index';
import {
  TIMELINE_CONVENTIONS,
  buildTimeline,
  buildTimelineAsync,
  type Timeline,
  type TimelineCell,
  type TimelineDomainCell,
} from '../src/timeline/index';

const TAINAN = { label: 'Tainan, Taiwan', lat: 22.9922, lng: 120.1848, timezone: 'Asia/Taipei' };
const ctx = createTimeContext({ date: '1995-07-16', time: '22:00', timeAccuracy: 'exact', gender: 'male', birthplace: TAINAN });
const ASOF = '2026-09-25';

let timeline: Timeline;
let summary: ConsensusSummary;
beforeAll(async () => {
  timeline = await buildTimelineAsync(ctx, { asOf: ASOF });
  summary = buildConsensus(timeline);
}, 60_000);

const domainIdx = (d: Domain) => DOMAINS.indexOf(d);
const cellOf = (start: string, domain: Domain) =>
  timeline.years.find((c) => c.window.start === start)!.domains.find((d) => d.domain === domain)!;

// ─── Synthetic timeline: exact control over perSystem / conflict ────────────

function domainCell(domain: Domain, partial: Partial<TimelineDomainCell> = {}): TimelineDomainCell {
  return { domain, score: 0, band: '低', consensus: 0, highConsensus: false, conflict: null, perSystem: {}, topSignals: [], ...partial };
}
function yearCell(year: number, cells: TimelineDomainCell[]): TimelineCell {
  return {
    window: { grain: 'year', start: `${year}-01-01`, end: `${year}-12-31` },
    domains: DOMAINS.map((d) => cells.find((c) => c.domain === d) ?? domainCell(d)),
  };
}
const sys = (score: number, valence: number, ...signalIds: string[]) => ({ score, valence, signalIds });

function syntheticTimeline(): Timeline {
  return {
    schemaVersion: 1,
    asOf: '2026-01-01',
    systems: ['bazi', 'ziwei', 'numerology'],
    skippedSystems: [],
    conventions: { ...TIMELINE_CONVENTIONS },
    bandCuts: [35, 55, 75],
    systemWeights: { bazi: 1, ziwei: 1, numerology: 1 },
    years: [
      yearCell(2026, [
        // Two systems supportive, one under pressure → conflict with both sides kept.
        domainCell('career', {
          score: 60, band: '中高', consensus: 3, highConsensus: true,
          perSystem: { bazi: sys(0.6, 0.5, 'b1', 'b2'), ziwei: sys(0.7, 0.4, 'z1'), numerology: sys(0.5, -0.6, 'n1') },
          conflict: { positive: ['b1', 'z1'], negative: ['n1'] },
        }),
        // Only one of three systems spoke.
        domainCell('movement', { score: 50, band: '中', consensus: 1, perSystem: { ziwei: sys(0.5, 0.2, 'z9') } }),
      ]),
      yearCell(2027, [
        domainCell('self', {
          score: 80, band: '高', consensus: 3, highConsensus: true,
          perSystem: { bazi: sys(0.8, 0.3, 'b3'), ziwei: sys(0.9, 0.2, 'z3'), numerology: sys(0.7, 0.1, 'n3') },
        }),
        domainCell('career', {
          score: 60, band: '中高', consensus: 3, highConsensus: true,
          perSystem: { bazi: sys(0.6, 0.3, 'b4'), ziwei: sys(0.6, 0.3, 'z4'), numerology: sys(0.6, 0.3, 'n4') },
        }),
      ]),
    ],
    months: [],
  };
}

describe('buildConsensus — synthetic', () => {
  const s = buildConsensus(syntheticTimeline());

  test('shape and metadata', () => {
    expect(s.schemaVersion).toBe(CONSENSUS_SCHEMA_VERSION);
    expect(s.asOf).toBe('2026-01-01');
    expect(s.systems).toEqual(['bazi', 'ziwei', 'numerology']);
    expect(s.consensusThreshold).toBe(0.5);
    expect(s.highConsensusMinSystems).toBe(3);
    expect(s.years.map((y) => y.window.start)).toEqual(['2026-01-01', '2027-01-01']);
  });

  test('two systems positive, one negative: conflict lists both sides with systems and signal ids', () => {
    expect(s.years[0].conflicts).toEqual([
      {
        domain: 'career',
        window: { grain: 'year', start: '2026-01-01', end: '2026-12-31' },
        score: 60,
        positive: { systems: ['bazi', 'ziwei'], signalIds: ['b1', 'z1'] },
        negative: { systems: ['numerology'], signalIds: ['n1'] },
      },
    ]);
    // A conflicted cell can also be high-consensus; both are reported.
    expect(s.years[0].highConsensus.map((a) => a.domain)).toEqual(['career']);
    expect(s.headlines.conflicts).toEqual(s.years[0].conflicts);
  });

  test('agreements list systems ≥ θ and their signal ids; headline order is consensus, score, domain, year', () => {
    expect(s.years[1].highConsensus.map((a) => a.domain)).toEqual(['self', 'career']);
    expect(s.years[1].highConsensus[0]).toMatchObject({ systems: ['bazi', 'ziwei', 'numerology'], signalIds: ['b3', 'n3', 'z3'], consensus: 3, score: 80 });
    expect(s.headlines.agreements.map((a) => `${a.window.start.slice(0, 4)}:${a.domain}`)).toEqual(['2027:self', '2026:career', '2027:career']);
    expect(s.headlines.agreements[1].signalIds).toEqual(['b1', 'b2', 'n1', 'z1']);
  });

  test('θ is honoured when listing agreeing systems', () => {
    const strict = buildConsensus(syntheticTimeline(), { consensusThreshold: 0.65 });
    expect(strict.years[0].highConsensus[0].systems).toEqual(['ziwei']);
    expect(strict.consensusThreshold).toBe(0.65);
  });

  test('headline agreements are capped; conflicts never are', () => {
    const capped = buildConsensus(syntheticTimeline(), { maxHeadlineAgreements: 1 });
    expect(capped.headlines.agreements.map((a) => a.domain)).toEqual(['self']);
    expect(capped.headlines.conflicts).toHaveLength(1);
    expect(buildConsensus(syntheticTimeline(), { maxHeadlineAgreements: 0 }).headlines.agreements).toEqual([]);
    expect(() => buildConsensus(syntheticTimeline(), { maxHeadlineAgreements: -1 })).toThrow(/maxHeadlineAgreements/);
  });

  test('coverage: could speak vs did speak per domain × year', () => {
    const y2026 = s.coverage.years[0];
    expect(y2026.domains.map((d) => d.domain)).toEqual([...DOMAINS]);
    expect(y2026.domains.find((d) => d.domain === 'movement')).toEqual({
      domain: 'movement', available: 3, speaking: 1, systems: ['ziwei'], silent: ['bazi', 'numerology'],
    });
    expect(y2026.domains.find((d) => d.domain === 'career')!.speaking).toBe(3);
    expect(y2026.domains.find((d) => d.domain === 'health')).toEqual({
      domain: 'health', available: 3, speaking: 0, systems: [], silent: ['bazi', 'ziwei', 'numerology'],
    });
    expect(s.coverage.months).toEqual([]);
  });

  test('does not mutate the timeline', () => {
    const t = syntheticTimeline();
    const before = JSON.stringify(t);
    buildConsensus(t);
    expect(JSON.stringify(t)).toBe(before);
  });
});

// ─── Real async timeline (5 systems incl. jyotish / humanDesign) ────────────

describe('buildConsensus — 1995-07-16 22:00 male Tainan, asOf 2026-09-25 (async, 5 systems)', () => {
  test('timeline includes jyotish and humanDesign', () => {
    expect(timeline.systems).toEqual(['bazi', 'ziwei', 'numerology', 'jyotish', 'humanDesign']);
    expect(summary.systems).toEqual(timeline.systems);
  });

  test('high consensus: every flagged cell appears, with ≥3 systems ≥ θ', () => {
    let flagged = 0;
    for (const [i, cell] of timeline.years.entries()) {
      const year = summary.years[i];
      expect(year.window).toEqual(cell.window);
      const expected = cell.domains.filter((d) => d.highConsensus).map((d) => d.domain);
      expect(year.highConsensus.map((a) => a.domain)).toEqual(expected);
      flagged += expected.length;
      for (const a of year.highConsensus) {
        const src = cell.domains.find((d) => d.domain === a.domain)!;
        expect(a.consensus).toBe(src.consensus);
        expect(a.score).toBe(src.score);
        expect(a.systems.length).toBe(src.consensus);
        expect(a.systems.length).toBeGreaterThanOrEqual(3);
        for (const s of a.systems) {
          expect(src.perSystem[s]!.score).toBeGreaterThanOrEqual(0.5);
          for (const id of src.perSystem[s]!.signalIds) expect(a.signalIds).toContain(id);
        }
      }
    }
    expect(flagged).toBeGreaterThan(0);
    // 4-system agreements exist once jyotish / humanDesign join (2026 self: bazi, ziwei, jyotish, humanDesign).
    const self2026 = summary.years[0].highConsensus.find((a) => a.domain === 'self')!;
    expect(self2026.systems).toEqual(['bazi', 'ziwei', 'jyotish', 'humanDesign']);
    expect(self2026.consensus).toBe(cellOf('2026-01-01', 'self').consensus);
  });

  test('headline agreements are the strongest, sorted deterministically', () => {
    const all = summary.years.flatMap((y) => y.highConsensus);
    const agreements = summary.headlines.agreements;
    expect(agreements.length).toBe(Math.min(DEFAULT_HEADLINE_AGREEMENTS, all.length));
    for (let i = 1; i < agreements.length; i++) {
      const a = agreements[i - 1];
      const b = agreements[i];
      const order =
        b.consensus - a.consensus || b.score - a.score || domainIdx(a.domain) - domainIdx(b.domain) || a.window.start.localeCompare(b.window.start);
      expect(order).toBeLessThanOrEqual(0);
    }
    const weakestKept = agreements[agreements.length - 1];
    for (const a of all.filter((x) => !agreements.includes(x))) {
      expect(a.consensus < weakestKept.consensus || (a.consensus === weakestKept.consensus && a.score <= weakestKept.score)).toBe(true);
    }
  });

  test('every conflict is listed with both sides resolved to systems', () => {
    const expected = timeline.years.flatMap((c) => c.domains.filter((d) => d.conflict).map((d) => `${c.window.start}:${d.domain}`));
    expect(expected.length).toBeGreaterThan(0);
    expect(summary.headlines.conflicts.map((c) => `${c.window.start}:${c.domain}`)).toEqual(expected);
    for (const c of summary.headlines.conflicts) {
      const src = cellOf(c.window.start, c.domain);
      expect(c.positive.signalIds).toEqual(src.conflict!.positive);
      expect(c.negative.signalIds).toEqual(src.conflict!.negative);
      expect(c.positive.systems.length).toBeGreaterThan(0);
      expect(c.negative.systems.length).toBeGreaterThan(0);
      for (const [side, ids] of [[c.positive, src.conflict!.positive], [c.negative, src.conflict!.negative]] as const) {
        for (const id of ids) expect(side.systems.some((s) => src.perSystem[s]!.signalIds.includes(id))).toBe(true);
      }
    }
    // The "two systems positive, one negative" case occurs in this chart: 2029 relationship.
    const rel2029 = summary.headlines.conflicts.find((c) => c.window.start === '2029-01-01' && c.domain === 'relationship')!;
    expect(rel2029.positive.systems).toEqual(['bazi', 'ziwei']);
    expect(rel2029.negative.systems).toEqual(['numerology']);
  });

  test('coverage counts match timeline.systems and perSystem for every year and month cell', () => {
    const cells = [...timeline.years, ...timeline.months];
    const coverage = [...summary.coverage.years, ...summary.coverage.months];
    expect(coverage).toHaveLength(17);
    for (const [i, cell] of cells.entries()) {
      expect(coverage[i].window).toEqual(cell.window);
      for (const d of cell.domains) {
        const cov = coverage[i].domains.find((x) => x.domain === d.domain)!;
        const spoke = SYSTEM_IDS.filter((s) => (d.perSystem[s]?.signalIds.length ?? 0) > 0);
        expect(cov.available).toBe(5);
        expect(cov.systems).toEqual(spoke as SystemId[]);
        expect(cov.speaking).toBe(spoke.length);
        expect([...cov.systems, ...cov.silent].sort()).toEqual([...timeline.systems].sort());
      }
    }
    // Sparse domains exist (D-033 caveat): some cell has signals from only one system.
    expect(coverage.some((c) => c.domains.some((d) => d.speaking === 1))).toBe(true);
  });

  test('deterministic: same input → byte-identical JSON; no score changes (D-033)', () => {
    expect(JSON.stringify(buildConsensus(timeline))).toBe(JSON.stringify(summary));
    const again = buildTimeline(ctx, { asOf: ASOF }); // ephemeris already initialised
    expect(JSON.stringify(buildConsensus(again))).toBe(JSON.stringify(summary));
  });

  test('sync 3-system timeline: coverage denominator is 3', () => {
    const sync = buildConsensus(buildTimeline(ctx, { asOf: ASOF, systems: ['bazi', 'ziwei', 'numerology'] }));
    expect(sync.systems).toEqual(['bazi', 'ziwei', 'numerology']);
    expect(sync.coverage.years[0].domains.every((d) => d.available === 3)).toBe(true);
    for (const a of sync.headlines.agreements) expect(a.systems).toEqual(['bazi', 'ziwei', 'numerology']);
  });
});
