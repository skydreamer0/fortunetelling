import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { makeFixture } from './helpers';

const AS_OF = '2026-09-30';
const base = { profileId: 'sky', asOf: AS_OF };
let fx: Awaited<ReturnType<typeof makeFixture>>;
let all: any[];

async function fetchAll(extra: Record<string, unknown> = {}) {
  const out: any[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 1000; i++) {
    const { isError, json } = await fx.call('list_signals', { ...base, ...extra, limit: 100, ...(cursor ? { cursor } : {}) });
    expect(isError).toBe(false);
    out.push(...json.data.signals);
    cursor = json.data.nextCursor ?? undefined;
    if (!cursor) return out;
  }
  throw new Error('pagination did not terminate');
}

beforeAll(async () => {
  fx = await makeFixture();
  all = await fetchAll();
}, 120_000);
afterAll(() => fx.cleanup());

describe('list_signals', () => {
  test('default page is compact, sorted, and small', async () => {
    const { json, text } = await fx.call('list_signals', base);
    expect(json.data.signals.length).toBeLessThanOrEqual(20);
    expect(json.asOf).toBe(AS_OF);
    const s = json.data.signals[0];
    expect(Object.keys(s).sort()).toEqual(['domain', 'evidence', 'id', 'intensity', 'ruleId', 'system', 'trait', 'valence', 'window']);
    expect(Object.keys(s.evidence)).toEqual(['text']);
    console.log('list_signals default chars', text.length);
    expect(text.length).toBeLessThan(20_000);
    for (let i = 1; i < json.data.signals.length; i++) {
      const a = json.data.signals[i - 1], b = json.data.signals[i];
      expect(a.intensity > b.intensity || (a.intensity === b.intensity && a.id < b.id)).toBe(true);
    }
  }, 120_000);
  test('domain / system / minStrength filters', async () => {
    expect(all.length).toBeGreaterThan(0);
    const domain = all[0].domain, system = all[0].system;
    const d = await fetchAll({ domain });
    expect(d.length).toBe(all.filter(s => s.domain === domain).length);
    expect(d.every(s => s.domain === domain)).toBe(true);
    const sy = await fetchAll({ system });
    expect(sy.length).toBe(all.filter(s => s.system === system).length);
    const min = all[Math.floor(all.length / 2)].intensity;
    const m = await fetchAll({ minStrength: min });
    expect(m.length).toBe(all.filter(s => s.intensity >= min).length);
    expect(m.every(s => s.intensity >= min)).toBe(true);
  }, 120_000);
  test('range keeps only overlapping windows', async () => {
    const range = { start: '2026-03', end: '2026-05' };
    const r = await fetchAll({ range });
    expect(r.length).toBeGreaterThan(0);
    expect(r.length).toBeLessThan(all.length);
    for (const s of r) {
      expect(s.window.start.slice(0, 7) <= '2026-05').toBe(true);
      expect(s.window.end.slice(0, 7) >= '2026-03').toBe(true);
    }
  }, 120_000);
  test('cursor pagination concatenates to the full set without duplicates', async () => {
    const pages: any[] = [];
    let cursor: string | undefined;
    do {
      const { json } = await fx.call('list_signals', { ...base, limit: 7, ...(cursor ? { cursor } : {}) });
      pages.push(...json.data.signals);
      cursor = json.data.nextCursor ?? undefined;
    } while (cursor);
    expect(pages.map(s => s.id)).toEqual(all.map(s => s.id));
    expect(new Set(pages.map(s => s.id)).size).toBe(pages.length);
  }, 120_000);
  test('limit is capped at 100 and bad cursor is structured', async () => {
    const over = await fx.call('list_signals', { ...base, limit: 101 });
    expect(over.isError).toBe(true);
    expect(over.json.error.code).toBe('invalid_args');
    const bad = await fx.call('list_signals', { ...base, cursor: '!!!' });
    expect(bad.json.error.code).toBe('invalid_args');
    const badDomain = await fx.call('list_signals', { ...base, domain: 'nope' });
    expect(badDomain.json.error.code).toBe('invalid_args');
  });
});

describe('get_signal', () => {
  test('returns full signal for listed ids', async () => {
    for (const row of [all[0], all[Math.floor(all.length / 2)], all[all.length - 1]]) {
      const { isError, json } = await fx.call('get_signal', { ...base, signalId: row.id });
      expect(isError).toBe(false);
      const s = json.data.signal;
      expect(s.id).toBe(row.id);
      expect(Array.isArray(s.evidence.modifiers)).toBe(true);
      expect(Array.isArray(s.evidence.componentIds)).toBe(true);
      expect(s.evidence.text).toBe(row.evidence.text);
    }
  }, 120_000);
  test('unknown id → unknown_signal with hint', async () => {
    const { isError, json } = await fx.call('get_signal', { ...base, signalId: 'nope' });
    expect(isError).toBe(true);
    expect(json.error.code).toBe('unknown_signal');
    expect(json.error.hint).toContain('list_signals');
  });
});

describe('get_timeline', () => {
  test('default is compact with ids only', async () => {
    const { json, text } = await fx.call('get_timeline', base);
    console.log('get_timeline default chars', text.length);
    expect(json.data.years.length).toBeGreaterThan(0);
    const cell = json.data.years[0].domains[0];
    expect(typeof cell.score).toBe('number');
    expect(cell.band).toBeDefined();
    expect(cell.topSignalIds.every((x: unknown) => typeof x === 'string')).toBe(true);
    expect(cell.topSignals).toBeUndefined();
  }, 120_000);
  test('range and domain filters', async () => {
    const full = (await fx.call('get_timeline', base)).json.data.years;
    const y = full[0].window.start.slice(0, 4);
    const { json } = await fx.call('get_timeline', { ...base, range: { start: '2026', end: '2026' }, domain: 'career' });
    expect(json.data.years.length).toBeGreaterThan(0);
    expect(json.data.years.length).toBeLessThan(full.length);
    for (const c of json.data.years) {
      expect(c.window.start.slice(0, 4) <= '2026' && c.window.end.slice(0, 4) >= '2026').toBe(true);
      expect(c.domains.map((d: any) => d.domain)).toEqual(['career']);
    }
    // range filters year cells only; month cells need the explicit months parameter
    expect(json.data.months).toEqual([]);
    expect(y).toBeDefined();
  }, 120_000);
  test('months defaults to []; months:{start,end} returns that range month by month (any resolvable year)', async () => {
    expect((await fx.call('get_timeline', base)).json.data.months).toEqual([]);
    // same year as asOf
    const sameYear = (await fx.call('get_timeline', { ...base, months: { start: '2026-10', end: '2026-12' }, domain: 'career', monthsFormat: 'cells' })).json.data;
    expect(sameYear.months.map((c: any) => c.window.start.slice(0, 7))).toEqual(['2026-10', '2026-11', '2026-12']);
    // a different year: this used to come back empty because core only builds the asOf year's months
    const { json, isError } = await fx.call('get_timeline', { ...base, months: { start: '2027-01', end: '2027-12' }, domain: 'wealth', monthsFormat: 'cells' });
    expect(isError).toBe(false);
    expect(json.data.monthsRange).toEqual({ start: '2027-01', end: '2027-12' });
    expect(json.data.months.length).toBe(12);
    for (const c of json.data.months) {
      expect(c.window.grain).toBe('month');
      expect(c.domains.map((d: any) => d.domain)).toEqual(['wealth']);
      expect(c.domains[0].perSystem).toBeUndefined();
      expect(c.domains[0].topSignalIds.length).toBeLessThanOrEqual(5);
      expect(c.domains[0].topSignalIdsTotal).toBeGreaterThanOrEqual(c.domains[0].topSignalIds.length);
    }
    // spanning two years, ascending
    const two = (await fx.call('get_timeline', { ...base, months: { start: '2026-12', end: '2027-02' }, domain: 'wealth' })).json.data.monthTable.rows;
    expect(two.map((row: any[]) => row[0])).toEqual(['2026-12', '2027-01', '2027-02']);
    // cited month ids resolve
    const id = json.data.months.flatMap((c: any) => c.domains[0].topSignalIds)[0];
    expect((await fx.call('get_signal', { ...base, signalId: id })).isError).toBe(false);
  }, 120_000);
  test('months: detail restores perSystem and the full id list; limits are enforced', async () => {
    const months = { start: '2027-03', end: '2027-03' };
    const slim = (await fx.call('get_timeline', { ...base, months, domain: 'wealth', monthsFormat: 'cells' })).json.data.months[0].domains[0];
    const full = (await fx.call('get_timeline', { ...base, months, domain: 'wealth', detail: true })).json.data.months[0].domains[0];
    expect(full.perSystem).toBeDefined();
    expect(full.topSignalIds.length).toBe(slim.topSignalIdsTotal);
    expect(full.topSignalIds.slice(0, 5)).toEqual(slim.topSignalIds);
    expect((await fx.call('get_timeline', { ...base, months: { start: '2026-01', end: '2029-01' } })).json.error.code).toBe('invalid_args');
    expect((await fx.call('get_timeline', { ...base, months: { start: '2027-05', end: '2027-01' } })).json.error.code).toBe('invalid_args');
    expect((await fx.call('get_timeline', { ...base, months: { start: '2050-01', end: '2050-02' } })).json.error.code).toBe('invalid_args');
    expect((await fx.call('get_timeline', { ...base, months: { start: '2027-1', end: '2027-2' } })).json.error.code).toBe('invalid_args');
  }, 120_000);
  test('year cells: topSignalIds preview with total; detail returns all', async () => {
    const slim = (await fx.call('get_timeline', base)).json.data.years;
    const full = (await fx.call('get_timeline', { ...base, detail: true })).json.data.years;
    let cut = 0;
    slim.forEach((y: any, i: number) => y.domains.forEach((d: any, j: number) => {
      const f = full[i].domains[j];
      expect(d.topSignalIds.length).toBeLessThanOrEqual(5);
      expect(d.topSignalIdsTotal).toBe(f.topSignalIds.length);
      expect(d.topSignalIds).toEqual(f.topSignalIds.slice(0, 5));
      if (d.topSignalIdsTotal > 5) cut++;
    }));
    expect(cut).toBeGreaterThan(0);
  }, 120_000);
});

describe('consensus and conflicts', () => {
  test('list_conflicts ids all exist in the full signal set', async () => {
    const ids = new Set(all.map(s => s.id));
    const { isError, json } = await fx.call('list_conflicts', base);
    expect(isError).toBe(false);
    expect(json.data.total).toBe(json.data.conflicts.length);
    for (const c of json.data.conflicts) {
      expect(c.positive.signalIds.length).toBeGreaterThan(0);
      for (const id of [...c.positive.signalIds, ...c.negative.signalIds]) expect(ids.has(id)).toBe(true);
    }
  }, 120_000);
  test('get_consensus gives agreements and only a conflict count; range filters', async () => {
    const { json, text } = await fx.call('get_consensus', base);
    console.log('get_consensus default chars', text.length);
    expect(typeof json.data.conflictCount).toBe('number');
    expect(json.data.headlines.conflicts).toBeUndefined();
    const conflicts = (await fx.call('list_conflicts', base)).json.data.total;
    expect(json.data.conflictCount).toBe(conflicts);
    const full = (await fx.call('get_consensus', { ...base, detail: true })).json.data;
    let checked = 0;
    json.data.years.forEach((y: any, i: number) => y.highConsensus.forEach((a: any, j: number) => {
      const f = full.years[i].highConsensus[j];
      expect(a.signalIds.length).toBeLessThanOrEqual(5);
      expect(a.signalIdsTotal).toBe(f.signalIds.length);
      expect(a.signalIds).toEqual(f.signalIds.slice(0, 5));
      checked++;
    }));
    expect(checked).toBeGreaterThan(0);
    for (const a of json.data.headlines.agreements) expect(a.signalIds.length).toBeLessThanOrEqual(5);
    const ranged = await fx.call('get_consensus', { ...base, range: { start: '2026', end: '2026' } });
    expect(ranged.json.data.years.length).toBeLessThan(json.data.years.length);
    const rc = await fx.call('list_conflicts', { ...base, range: { start: '2026', end: '2026' } });
    expect(rc.json.data.total).toBeLessThanOrEqual(conflicts);
    expect(rc.json.data.conflicts.every((c: any) => c.window.start.slice(0, 4) <= '2026' && c.window.end.slice(0, 4) >= '2026')).toBe(true);
  }, 120_000);
});

describe('determinism, errors, privacy', () => {
  test('repeated calls are byte-identical', async () => {
    for (const [name, args] of [['list_signals', { ...base, limit: 50 }], ['get_timeline', base], ['get_consensus', base], ['list_conflicts', base]] as const) {
      const a = await fx.call(name, args);
      const b = await fx.call(name, args);
      expect(a.text).toBe(b.text);
    }
  }, 120_000);
  test('invalid asOf and unknown profile are structured errors', async () => {
    for (const name of ['list_signals', 'get_timeline', 'get_consensus', 'list_conflicts']) {
      const bad = await fx.call(name, { profileId: 'sky', asOf: '2026-13-99' });
      expect(bad.json.error.code).toBe('invalid_args');
      const ghost = await fx.call(name, { profileId: 'ghost', asOf: AS_OF });
      expect(ghost.json.error.code).toBe('profile_not_found');
    }
    expect((await fx.call('get_signal', { profileId: 'ghost', asOf: AS_OF, signalId: 'x' })).json.error.code).toBe('profile_not_found');
  });
  test('no output contains the name', async () => {
    for (const [name, args] of [['list_signals', { ...base, limit: 100 }], ['get_signal', { ...base, signalId: all[0].id }], ['get_timeline', base], ['get_consensus', base], ['list_conflicts', base]] as const) {
      expect((await fx.call(name, args)).text).not.toContain('王小明');
    }
  }, 120_000);
});
