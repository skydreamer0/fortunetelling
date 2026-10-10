import { beforeAll, describe, expect, test } from 'bun:test';
import type { ChartSnapshot } from '../src/core/chartSnapshot';
import { natalCases } from './fixtures/natalCalendarCases';
import type { ProducedSnapshots, ReloadedSnapshots, SnapshotMode, SnapshotTransfer } from './fixtures/chartSnapshotHostProbe';

const zones = ['UTC', 'Asia/Taipei', 'America/New_York', 'Pacific/Apia'] as const;
const offsets = [0, -480, 240, -780];
const modes = ['A', 'B', 'interleaved'] as const;
const probeUrl = new URL('./fixtures/chartSnapshotHostProbe.ts', import.meta.url).href;
const produced = new Map<string, ProducedSnapshots>();
const reloaded = new Map<string, ReloadedSnapshots>();
const transfers: SnapshotTransfer[] = [];
const get = (zone: string, mode: SnapshotMode) => produced.get(`${zone}/${mode}`)!;

function child<T>(TZ: string, expression: string, input?: unknown): T {
  const script = `import { produceSnapshots, reloadSnapshots } from ${JSON.stringify(probeUrl)};
    console.log(JSON.stringify(${expression}));`;
  const result = Bun.spawnSync([process.execPath, '--eval', script], {
    env: { ...process.env, TZ }, timeout: 60_000,
    stdin: input === undefined ? 'ignore' : new TextEncoder().encode(JSON.stringify(input)),
  });
  expect(result.exitCode, `${TZ}: ${new TextDecoder().decode(result.stderr)}`).toBe(0);
  expect(result.signalCode ?? null).toBeNull();
  return JSON.parse(new TextDecoder().decode(result.stdout)) as T;
}

beforeAll(() => {
  // Twelve cold producers. A-only and B-only never share a process or runtime.
  // URL.href preserves the already-fixed Windows-safe subprocess import path.
  for (const TZ of zones) for (const mode of modes) {
    const result = child<ProducedSnapshots>(TZ, `produceSnapshots(${JSON.stringify(mode)})`);
    produced.set(`${TZ}/${mode}`, result);
    if (mode !== 'interleaved') for (const [row] of result.rows) transfers.push({ origin: TZ, ...row });
  }
  // Four additional cold consumers each receive the exact serialized bytes from
  // all four origins through stdin: 4 x 4 host pairs x 8 fixtures x 2 settings.
  for (const TZ of zones) reloaded.set(TZ, child<ReloadedSnapshots>(TZ,
    'reloadSnapshots(JSON.parse(await Bun.stdin.text()))', transfers));
}, 180_000);

describe('#54 internal sync snapshot cross-host serialization (not persistence or full acceptance)', () => {
  test('all sixteen processes use the requested native host timezone and complete fixture inventory', () => {
    expect(transfers).toHaveLength(zones.length * natalCases.length * 2);
    for (const [index, zone] of zones.entries()) {
      for (const mode of modes) {
        const result = get(zone, mode);
        expect(result.host).toEqual({ zone, offsetMinutes: offsets[index] });
        expect(result.rows.map(rows => rows[0].id)).toEqual(natalCases.map(row => row.id));
        for (const rows of result.rows) expect(rows.map(row => row.setting)).toEqual(mode === 'interleaved' ? ['A', 'B', 'A'] : [mode]);
      }
      expect(reloaded.get(zone)!.host).toEqual({ zone, offsetMinutes: offsets[index] });
      expect(reloaded.get(zone)!.rows).toHaveLength(transfers.length);
    }
  });

  test('full unfiltered snapshot bytes and diagnostic IDs agree across the four producer hosts', () => {
    for (const zone of zones) for (const mode of modes) {
      expect(get(zone, mode).rows, `${zone}/${mode}`).toEqual(get('UTC', mode).rows);
    }
  });

  test('all five natal systems are populated and A/B settings change real content, not just labels', () => {
    for (const zone of zones) {
      let differentNatal = false;
      for (let i = 0; i < natalCases.length; i++) {
        const snapshots = (['A', 'B'] as const).map(setting => JSON.parse(get(zone, setting).rows[i][0].serialized) as ChartSnapshot);
        const [a, b] = snapshots;
        expect(a.snapshotId).not.toBe(b.snapshotId);
        expect(a.specHash).not.toBe(b.specHash);
        differentNatal ||= JSON.stringify(a.natal) !== JSON.stringify(b.natal);
        for (const [index, snapshot] of snapshots.entries()) {
          expect(snapshot.schemaVersion).toBe(1);
          expect(snapshot.scope).toBe('analyze-sync-natal');
          expect(snapshot.snapshotId).toMatch(/^sn1-[0-9a-f]{16}$/);
          expect(snapshot.identity.input.date).toBe(natalCases[i].date);
          expect(snapshot.identity.input.time).toBe(natalCases[i].time);
          expect(snapshot.identity.settings.time).toEqual({ dstOverlap: 'earlier', dstGap: 'shift-forward-by-gap' });
          expect(snapshot.identity.settings.bazi.clock).toBe(index === 0 ? 'civil' : 'trueSolar');
          expect(snapshot.identity.settings.bazi.ziHourConvention).toBe(index === 0 ? 'late' : 'early');
          expect(Object.keys(snapshot.natal).sort()).toEqual(['bazi', 'mingGua', 'numerology', 'tzolkin', 'ziwei']);
          for (const system of Object.values(snapshot.natal)) expect(system.status).toBe('computed');
          if (snapshot.natal.ziwei.status !== 'computed' || snapshot.natal.bazi.status !== 'computed') throw new Error('Missing natal chart');
          expect(snapshot.natal.ziwei.chart.primary.palaces).toHaveLength(12);
          for (const alternative of snapshot.natal.ziwei.chart.alternatives) expect(alternative.natal.palaces).toHaveLength(12);
          expect(snapshot.natal.bazi.chart.luckCycles.steps).toHaveLength(10);
          expect(snapshot.natal.numerology.chart.lifePath?.number).toBeGreaterThan(0);
          expect(snapshot.natal.tzolkin.chart.kin).not.toBeNull();
          expect(snapshot.natal.mingGua.chart.gua).not.toBeNull();
        }
      }
      expect(differentNatal, zone).toBe(true);
    }
  });

  test('snapshot A → B → A equals separate single-setting producer processes in every host', () => {
    for (const zone of zones) for (let i = 0; i < natalCases.length; i++) {
      const [a1, b, a2] = get(zone, 'interleaved').rows[i];
      expect(a1).toEqual(get(zone, 'A').rows[i][0]);
      expect(b).toEqual(get(zone, 'B').rows[i][0]);
      expect(a2).toEqual(a1);
    }
  });

  test('all sixteen origin/destination pairs reload complete bytes through the real session validator', () => {
    for (const zone of zones) for (const [index, row] of reloaded.get(zone)!.rows.entries()) {
      const original = transfers[index];
      expect({ origin: row.origin, id: row.id, setting: row.setting }).toEqual({ origin: original.origin, id: original.id, setting: original.setting });
      expect(row.serialized, `${row.origin} → ${zone}/${row.id}/${row.setting}`).toBe(original.serialized);
      expect(row.owned).toBe(true);
      expect(row.frozen).toBe(true);
    }
  });

  test('same-ID identity and natal corruption are rejected on every transferred candidate', () => {
    for (const zone of zones) for (const row of reloaded.get(zone)!.rows) {
      expect(row.unchangedIds).toBe(true);
      expect(row.identityError).toBe('ChartSnapshot identity mismatch');
      expect(row.contentError).toBe('ChartSnapshot content mismatch');
    }
  });
});
