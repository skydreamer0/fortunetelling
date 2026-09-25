import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import type { BirthProfile } from '../src/profile/index';
import { DOMAINS, SYSTEM_IDS, TRAITS, type SystemId } from '../src/signals/types';
import { toBand } from '../src/signals/bands';
import { createTimeContext } from '../src/time/index';
import {
  NUMEROLOGY_TIMELINE_CATALOG,
  buildTimeline,
  buildTimelineAsync,
  calculatePersonalMonth,
  civilDateOf,
  dominantPeriod,
  evaluateNumerologyRules,
  type Timeline,
  type TimelineCell,
} from '../src/timeline/index';
import { calculatePersonalYear } from '../src/calculators/numerology/numerology';

const TAINAN = { label: 'Tainan, Taiwan', lat: 22.9922, lng: 120.1848, timezone: 'Asia/Taipei' };
const PROFILE: BirthProfile = { date: '1995-07-16', time: '22:00', timeAccuracy: 'exact', gender: 'male', birthplace: TAINAN };
const ASOF = '2026-09-25';
const SYNC_SYSTEMS: SystemId[] = ['bazi', 'ziwei', 'numerology'];
const ctx = createTimeContext(PROFILE);

function checkCells(cells: TimelineCell[], grain: 'year' | 'month', starts: string[], cuts: readonly [number, number, number] = [35, 55, 75]) {
  expect(cells.map((c) => c.window.start)).toEqual(starts);
  for (const cell of cells) {
    expect(cell.window.grain).toBe(grain);
    expect(cell.domains.map((d) => d.domain)).toEqual([...DOMAINS]);
    for (const d of cell.domains) {
      expect(d.score).toBeGreaterThanOrEqual(0);
      expect(d.score).toBeLessThanOrEqual(100);
      expect(Math.round(d.score * 10) / 10).toBe(d.score);
      expect(d.band).toBe(toBand(d.score, cuts));
      expect(d.topSignals.length).toBeLessThanOrEqual(5);
      if (d.score === 0) expect(d.band).toBe('低');
      const ids = new Set(Object.values(d.perSystem).flatMap((p) => p!.signalIds));
      if (ids.size === 0) expect(d.topSignals).toEqual([]);
      for (const s of d.topSignals) {
        expect(ids.has(s.id)).toBe(true);
        expect(s.domain).toBe(d.domain);
        expect(s.window.start <= cell.window.end && s.window.end >= cell.window.start).toBe(true);
      }
      // ranking: intensity desc (weights 1), tie → id asc
      for (let i = 1; i < d.topSignals.length; i++) {
        const a = d.topSignals[i - 1];
        const b = d.topSignals[i];
        expect(a.intensity > b.intensity || (a.intensity === b.intensity && a.id < b.id)).toBe(true);
      }
    }
  }
}

const YEAR_STARTS = ['2026-01-01', '2027-01-01', '2028-01-01', '2029-01-01', '2030-01-01'];
const MONTH_STARTS = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}-01`);

describe('buildTimeline (sync, fresh process without initEphemeris)', () => {
  // Other test files initialise the WASM ephemeris in this process, so the
  // "not initialised" path is checked in a clean subprocess.
  test('1995-07-16 22:00 male Tainan @ 2026-09-25', async () => {
    const script = `
      import { createTimeContext } from ${JSON.stringify(resolve(import.meta.dir, '../src/time/index.ts'))};
      import { buildTimeline } from ${JSON.stringify(resolve(import.meta.dir, '../src/timeline/index.ts'))};
      const ctx = createTimeContext(${JSON.stringify(PROFILE)});
      const t0 = performance.now();
      const tl = buildTimeline(ctx, { asOf: ${JSON.stringify(ASOF)} });
      const ms = performance.now() - t0;
      process.stdout.write(JSON.stringify({ ms, tl }));
    `;
    const proc = Bun.spawnSync([process.execPath, '-e', script], { stdout: 'pipe', stderr: 'pipe' });
    if (proc.exitCode !== 0) throw new Error(proc.stderr.toString());
    const { ms, tl } = JSON.parse(proc.stdout.toString()) as { ms: number; tl: Timeline };
    console.log(`sync buildTimeline (fresh process): ${ms.toFixed(0)} ms`);

    expect(tl.schemaVersion).toBe(1);
    expect(tl.asOf).toBe(ASOF);
    expect(tl.systems).toEqual(SYNC_SYSTEMS);
    expect(tl.skippedSystems).toEqual([
      { system: 'jyotish', reason: 'ephemeris_not_initialised' },
      { system: 'humanDesign', reason: 'ephemeris_not_initialised' },
    ]);
    expect(tl.years).toHaveLength(5);
    expect(tl.months).toHaveLength(12);
    checkCells(tl.years, 'year', YEAR_STARTS);
    checkCells(tl.months, 'month', MONTH_STARTS);
    expect(tl.months[1].window).toEqual({ grain: 'month', start: '2026-02-01', end: '2026-02-28' });
    expect(tl.years[0].window).toEqual({ grain: 'year', start: '2026-01-01', end: '2026-12-31' });
    for (const k of ['windows', 'periodMapping', 'scopes', 'excluded']) expect(typeof tl.conventions[k]).toBe('string');

    // Same result in-process (explicit systems, whatever the ephemeris state is here).
    const again = buildTimeline(ctx, { asOf: ASOF, systems: SYNC_SYSTEMS });
    expect(JSON.stringify(again.years)).toBe(JSON.stringify(tl.years));
    expect(JSON.stringify(again.months)).toBe(JSON.stringify(tl.months));

    // Every system contributes somewhere.
    for (const s of SYNC_SYSTEMS) {
      expect(tl.years.some((c) => c.domains.some((d) => d.perSystem[s]))).toBe(true);
      expect(tl.months.some((c) => c.domains.some((d) => d.perSystem[s]))).toBe(true);
    }

    // Compact score table for the integrator.
    const pad = (x: string, n: number) => x.padStart(n);
    const lines = [`${pad('', 12)} ${tl.years.map((c) => pad(c.window.start.slice(0, 4), 10)).join('')}`];
    for (const [i, domain] of DOMAINS.entries()) {
      lines.push(`${domain.padEnd(12)} ${tl.years.map((c) => pad(`${c.domains[i].score.toFixed(1)} ${c.domains[i].band}`, 10)).join('')}`);
    }
    console.log(`\nTimeline 1995-07-16 22:00 male Tainan, asOf ${ASOF} (sync: ${tl.systems.join('+')})\n${lines.join('\n')}\n`);
  });
});

describe('buildTimelineAsync', () => {
  test('includes jyotish and humanDesign signals', async () => {
    const tl = await buildTimelineAsync(ctx, { asOf: ASOF });
    expect(tl.systems).toEqual(['bazi', 'ziwei', 'numerology', 'jyotish', 'humanDesign']);
    expect(tl.skippedSystems).toEqual([]);
    checkCells(tl.years, 'year', YEAR_STARTS);
    checkCells(tl.months, 'month', MONTH_STARTS);
    for (const s of ['jyotish', 'humanDesign'] as const) {
      expect(tl.years.every((c) => c.domains.some((d) => d.perSystem[s]))).toBe(true);
      expect(tl.months.some((c) => c.domains.some((d) => d.perSystem[s]))).toBe(true);
    }
    // humanDesign is natal-only: identical per-system aggregates in every year cell.
    const hd = (c: TimelineCell) => JSON.stringify(c.domains.map((d) => d.perSystem.humanDesign?.score ?? null));
    expect(new Set(tl.years.map(hd)).size).toBe(1);
    // Print the all-systems table too.
    const lines = DOMAINS.map(
      (domain, i) => `${domain.padEnd(12)} ${tl.years.map((c) => `${c.domains[i].score.toFixed(1)} ${c.domains[i].band}`.padStart(10)).join('')}`,
    );
    console.log(`\nTimeline (async: ${tl.systems.join('+')})\n${' '.repeat(13)}${tl.years.map((c) => c.window.start.slice(0, 4).padStart(10)).join('')}\n${lines.join('\n')}\n`);
  });
});

describe('buildTimeline behaviour', () => {
  const base = buildTimeline(ctx, { asOf: ASOF, systems: SYNC_SYSTEMS });

  test('bazi 流年 differs by year: 2026 丙午 vs 2027 丁未', () => {
    const texts = (c: TimelineCell) =>
      c.domains.flatMap((d) => d.topSignals.filter((s) => s.system === 'bazi').map((s) => s.evidence.text));
    const t2026 = texts(base.years[0]);
    const t2027 = texts(base.years[1]);
    expect(t2026.length).toBeGreaterThan(0);
    expect(t2027.length).toBeGreaterThan(0);
    expect(t2026.some((t) => /流年[丙午]/.test(t))).toBe(true);
    expect(t2026.some((t) => /流年[丁未]/.test(t))).toBe(false);
    expect(t2027.some((t) => /流年[丁未]/.test(t))).toBe(true);
    expect(t2027.some((t) => /流年[丙午]/.test(t))).toBe(false);
    expect(new Set(t2026)).not.toEqual(new Set(t2027));
  });

  test('ziwei year cells use the dominant lunar year', () => {
    const ids = (c: TimelineCell) =>
      new Set(c.domains.flatMap((d) => d.topSignals.filter((s) => s.system === 'ziwei').flatMap((s) => s.evidence.componentIds)));
    expect([...ids(base.years[0])].filter((x) => x.startsWith('liuNian_'))).toEqual(['liuNian_2026']);
    expect([...ids(base.years[1])].filter((x) => x.startsWith('liuNian_'))).toEqual(['liuNian_2027']);
  });

  test('deterministic: same input → identical JSON', () => {
    const a = buildTimeline(ctx, { asOf: ASOF, systems: SYNC_SYSTEMS });
    const b = buildTimeline(createTimeContext(PROFILE), { asOf: ASOF, systems: SYNC_SYSTEMS });
    expect(JSON.stringify(a)).toBe(JSON.stringify(base));
    expect(JSON.stringify(b)).toBe(JSON.stringify(base));
  });

  test('systems filter', () => {
    const tl = buildTimeline(ctx, { asOf: ASOF, systems: ['numerology'] });
    expect(tl.systems).toEqual(['numerology']);
    expect(tl.skippedSystems).toEqual([]);
    for (const c of [...tl.years, ...tl.months]) {
      for (const d of c.domains) {
        expect(Object.keys(d.perSystem).every((s) => s === 'numerology')).toBe(true);
        expect(d.topSignals.every((s) => s.system === 'numerology')).toBe(true);
      }
    }
    const tz = buildTimeline(ctx, { asOf: ASOF, systems: ['tzolkin', 'mingGua', 'numerology'], includeMonths: false });
    expect(tz.systems).toEqual(['numerology']);
    expect(tz.skippedSystems).toEqual([
      { system: 'tzolkin', reason: 'no_timeline_rules' },
      { system: 'mingGua', reason: 'no_timeline_rules' },
    ]);
    expect(tz.months).toEqual([]);
    expect(() => buildTimeline(ctx, { asOf: ASOF, systems: ['nope' as SystemId] })).toThrow();
  });

  test('systemWeights change scores as Σw·s/Σw', () => {
    const weights = { bazi: 3, ziwei: 1, numerology: 0.5 };
    const tl = buildTimeline(ctx, { asOf: ASOF, systems: SYNC_SYSTEMS, systemWeights: weights });
    expect(tl.systemWeights).toEqual(weights);
    let changed = 0;
    for (const [ci, cell] of [...tl.years, ...tl.months].entries()) {
      const baseCell = [...base.years, ...base.months][ci];
      for (const [di, d] of cell.domains.entries()) {
        // perSystem is independent of weights
        expect(d.perSystem).toEqual(baseCell.domains[di].perSystem);
        let num = 0;
        let den = 0;
        for (const [s, p] of Object.entries(d.perSystem)) {
          num += weights[s as keyof typeof weights] * p!.score;
          den += weights[s as keyof typeof weights];
        }
        const expected = den > 0 ? (100 * num) / den : 0;
        expect(Math.abs(d.score - expected)).toBeLessThanOrEqual(0.06);
        if (d.score !== baseCell.domains[di].score) changed++;
      }
    }
    expect(changed).toBeGreaterThan(0);
    // Only bazi counts → score = bazi noisy-OR × 100 wherever bazi has signals.
    const onlyBazi = buildTimeline(ctx, { asOf: ASOF, systems: SYNC_SYSTEMS, systemWeights: { ziwei: 0, numerology: 0 } });
    for (const d of onlyBazi.years[0].domains) {
      if (d.perSystem.bazi) expect(Math.abs(d.score - 100 * d.perSystem.bazi.score)).toBeLessThanOrEqual(0.06);
      else expect(d.score).toBe(0);
    }
    expect(() => buildTimeline(ctx, { asOf: ASOF, systemWeights: { bazi: -1 } })).toThrow();
  });

  test('bandCuts override', () => {
    const cuts = [10, 20, 30] as const;
    const tl = buildTimeline(ctx, { asOf: ASOF, systems: SYNC_SYSTEMS, bandCuts: cuts });
    expect(tl.bandCuts).toEqual([10, 20, 30]);
    checkCells(tl.years, 'year', YEAR_STARTS, cuts);
    checkCells(tl.months, 'month', MONTH_STARTS, cuts);
    const bands = (t: Timeline) => t.years.flatMap((c) => c.domains.map((d) => d.band)).join();
    expect(bands(tl)).not.toBe(bands(base));
    expect(() => buildTimeline(ctx, { asOf: ASOF, bandCuts: [50, 40, 60] })).toThrow();
  });

  test('unknown birth time: only numerology remains', async () => {
    await buildTimelineAsync(ctx, { asOf: ASOF, years: 1, includeMonths: false }); // ephemeris ready
    const unknown = createTimeContext({ ...PROFILE, time: null, timeAccuracy: 'unknown' });
    const tl = buildTimeline(unknown, { asOf: ASOF });
    expect(tl.systems).toEqual(['numerology']);
    expect(tl.skippedSystems).toEqual([
      { system: 'bazi', reason: 'time_unknown' },
      { system: 'ziwei', reason: 'time_unknown' },
      { system: 'jyotish', reason: 'time_unknown' },
      { system: 'humanDesign', reason: 'time_unknown' },
    ]);
    checkCells(tl.years, 'year', YEAR_STARTS);
    checkCells(tl.months, 'month', MONTH_STARTS);
    expect(tl.years.every((c) => c.domains.some((d) => d.perSystem.numerology))).toBe(true);
  });

  test('input validation', () => {
    expect(() => buildTimeline(ctx, { asOf: '2026-02-30' })).toThrow();
    expect(() => buildTimeline(ctx, { asOf: '2026/09/25' })).toThrow();
    expect(() => buildTimeline(ctx, { asOf: ASOF, years: 0 })).toThrow();
  });

  test('years option and performance', () => {
    const t0 = performance.now();
    const tl = buildTimeline(ctx, { asOf: ASOF, systems: SYNC_SYSTEMS, years: 12 });
    const ms = performance.now() - t0;
    console.log(`sync buildTimeline, 12 years + 12 months (warm): ${ms.toFixed(0)} ms`);
    expect(tl.years).toHaveLength(12);
    expect(tl.years[11].window.start).toBe('2037-01-01');
    expect(JSON.stringify(tl.years.slice(0, 5))).toBe(JSON.stringify(base.years));
    const t1 = performance.now();
    buildTimeline(ctx, { asOf: ASOF, systems: SYNC_SYSTEMS });
    const ms5 = performance.now() - t1;
    console.log(`sync buildTimeline, default (warm): ${ms5.toFixed(0)} ms`);
    expect(ms5).toBeLessThan(3000);
  });
});

describe('dominantPeriod', () => {
  test('picks the period with the largest overlap', () => {
    const w = { grain: 'year', start: '2026-01-01', end: '2026-12-31' } as const;
    const periods = [
      { start: '2025-02-03T14:10:00Z', end: '2026-02-03T20:02:00Z', id: 'a' },
      { start: '2026-02-03T20:02:00Z', end: '2027-02-04T01:46:00Z', id: 'b' },
    ];
    expect(dominantPeriod(periods, w)?.id).toBe('b');
    expect(dominantPeriod([{ start: '2020-01-01', end: '2020-12-31' }], w)).toBeNull();
    // date spans are end-inclusive
    expect(dominantPeriod([{ start: '2026-12-31', end: '2026-12-31', id: 'x' }], w)?.id).toBe('x');
  });
});

describe('numerology timeline rules', () => {
  const chart = { birthDate: civilDateOf(PROFILE.date) };

  test('personal year / month numbers', () => {
    // 7 + 16→7 + 2026→10→1 = 15 → 6
    expect(calculatePersonalYear(chart.birthDate, 2026)).toBe(6);
    expect(calculatePersonalMonth(chart.birthDate, 2026, 9)).toBe(6); // 6 + 9 = 15 → 6
    expect(calculatePersonalMonth(chart.birthDate, 2026, 5)).toBe(11); // 6 + 5 = 11 (master)
  });

  test('year window → personal-year signals from the catalog', () => {
    const w = { grain: 'year', start: '2026-01-01', end: '2026-12-31' } as const;
    const sigs = evaluateNumerologyRules(chart, w);
    expect(sigs.length).toBe(NUMEROLOGY_TIMELINE_CATALOG.numbers['6'].length);
    for (const s of sigs) {
      expect(s.ruleId).toBe('numerology.personal_year');
      expect(s.target).toBe('personalYear@2026');
      expect(s.window).toEqual(w);
      expect(s.evidence.text).toContain('2026 = 6');
    }
    expect(evaluateNumerologyRules(chart, { grain: 'natal', start: '1995-07-16', end: '1995-07-16' })).toEqual([]);
  });

  test('month window → personal-month signals scaled by factor', () => {
    const w = { grain: 'month', start: '2026-05-01', end: '2026-05-31' } as const;
    const sigs = evaluateNumerologyRules(chart, w);
    const factor = NUMEROLOGY_TIMELINE_CATALOG.rules.find((r) => r.id === 'numerology.personal_month')!.params.factor;
    const tpl = NUMEROLOGY_TIMELINE_CATALOG.numbers['11'];
    expect(sigs.length).toBe(tpl.length);
    for (const s of sigs) {
      const t = tpl.find((x) => x.domain === s.domain && x.trait === s.trait)!;
      expect(s.intensity).toBeCloseTo(t.intensity * factor, 4);
      expect(s.evidence.modifiers.map((m) => m.factor)).toEqual([factor]);
    }
  });

  test('catalog: every number, closed enums, no 吉/凶 strings', () => {
    const numbers = Object.keys(NUMEROLOGY_TIMELINE_CATALOG.numbers).sort((a, b) => Number(a) - Number(b));
    expect(numbers).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '11', '22', '33']);
    for (const list of Object.values(NUMEROLOGY_TIMELINE_CATALOG.numbers)) {
      const keys = new Set<string>();
      for (const t of list) {
        expect(DOMAINS).toContain(t.domain);
        expect(TRAITS).toContain(t.trait);
        expect(t.intensity).toBeGreaterThan(0);
        expect(t.intensity).toBeLessThanOrEqual(1);
        expect(Math.abs(t.valence)).toBeLessThanOrEqual(1);
        keys.add(`${t.domain}.${t.trait}`);
      }
      expect(keys.size).toBe(list.length);
    }
    expect(JSON.stringify(NUMEROLOGY_TIMELINE_CATALOG)).not.toMatch(/[吉凶]/);
    expect(SYSTEM_IDS).toContain(NUMEROLOGY_TIMELINE_CATALOG.system);
  });
});
