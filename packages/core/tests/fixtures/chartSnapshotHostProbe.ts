/** Fresh-process probes for #54. Test data only; no persistence API or stored golden. */
import { createCalculationSpec } from '../../src/core/calculationSpec';
import { createChartSnapshot, validateChartSnapshot, type ChartSnapshot } from '../../src/core/chartSnapshot';
import { createChartSnapshotSession } from '../../src/core/chartSnapshotSession';
import { parseIsoDate } from '../../src/core/calendar';
import { calendarPlaces, natalCases, settings } from './natalCalendarCases';

export type Setting = keyof typeof settings;
export type SnapshotMode = Setting | 'interleaved';
type Mutable<T> = { -readonly [P in keyof T]: Mutable<T[P]> };
export interface SnapshotTransfer { origin: string; id: string; setting: Setting; serialized: string }

function specFor(id: string, setting: Setting) {
  const fixture = natalCases.find(row => row.id === id);
  if (!fixture) throw new Error(`Unknown natal calendar fixture: ${id}`);
  const [hour, minute] = fixture.time.split(':').map(Number);
  return createCalculationSpec({ ...parseIsoDate(fixture.date), hour, minute,
    gender: 'female', name: 'SYNTHETIC MATRIX', birthplace: calendarPlaces[0], ...settings[setting] });
}

function host() {
  return { zone: process.env.TZ, offsetMinutes: new Date('2025-07-25T00:00:00Z').getTimezoneOffset() };
}

export function produceSnapshots(mode: SnapshotMode) {
  const sequence: readonly Setting[] = mode === 'interleaved' ? ['A', 'B', 'A'] : [mode];
  return { host: host(), rows: natalCases.map(row => sequence.map(setting => ({
    id: row.id, setting, serialized: JSON.stringify(createChartSnapshot(specFor(row.id, setting))),
  }))) };
}
export type ProducedSnapshots = ReturnType<typeof produceSnapshots>;

function rejection(candidate: unknown, expected: ChartSnapshot): string | null {
  try { validateChartSnapshot(candidate, expected); return null; }
  catch (error) { if (!(error instanceof Error)) throw error; return error.message; }
}

/** Read bytes from another process, reconstruct once, and use the actual session reload path. */
export function reloadSnapshots(transfers: SnapshotTransfer[]) {
  return { host: host(), rows: transfers.map(transfer => {
    const candidate = JSON.parse(transfer.serialized) as Mutable<ChartSnapshot>;
    const session = createChartSnapshotSession(specFor(transfer.id, transfer.setting), candidate);
    // Preserve both diagnostic IDs while changing complete identity or natal content.
    const wrongIdentity = JSON.parse(transfer.serialized) as Mutable<ChartSnapshot>;
    wrongIdentity.identity = JSON.parse(JSON.stringify(specFor(transfer.id, transfer.setting === 'A' ? 'B' : 'A').identity));
    const wrongContent = JSON.parse(transfer.serialized) as Mutable<ChartSnapshot>;
    if (!wrongContent.natal.numerology.chart.lifePath) throw new Error('Missing natal life path');
    wrongContent.natal.numerology.chart.lifePath.number += 1;
    return { origin: transfer.origin, id: transfer.id, setting: transfer.setting,
      serialized: JSON.stringify(session.snapshot), owned: session.snapshot !== candidate,
      frozen: Object.isFrozen(session.snapshot) && Object.isFrozen(session.snapshot.natal),
      identityError: rejection(wrongIdentity, session.snapshot),
      contentError: rejection(wrongContent, session.snapshot),
      unchangedIds: [wrongIdentity, wrongContent].every(value =>
        value.snapshotId === candidate.snapshotId && value.specHash === candidate.specHash),
    };
  }) };
}
export type ReloadedSnapshots = ReturnType<typeof reloadSnapshots>;
