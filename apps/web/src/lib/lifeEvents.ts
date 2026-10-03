/**
 * Browser-only persistence for life events (V4-03, D-029). Events are sensitive:
 * they stay in this browser's localStorage, keyed by a profile fingerprint, and
 * are never sent anywhere. Same patterns as `store.ts`: injectable storage,
 * every read/write guarded, corrupt data → empty.
 */

import { hashString, validateLifeEvent, type LifeEvent } from './core';
import { fingerprintOfReport } from './profileFile';
import { safeLocalStorage } from './store';
import type { Report } from '../model/types';

export const LIFE_EVENTS_STORE_KEY = 'fortunetelling:life-events:v1';
export const MAX_LIFE_EVENTS_PER_PROFILE = 200;

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

interface StoredProfile { events: LifeEvent[] }
interface StoredData { version: 1; profiles: Record<string, StoredProfile> }

/**
 * Storage key of the chart a report is about: core's `chartFingerprint` (`cf1-…`), the same
 * id the local MCP server uses. Hashed, so the key does not spell out the birth data; the
 * name is not part of it, so renaming a person keeps their events (M4-02).
 */
export function profileKeyOf(report: Pick<Report, 'input' | 'timeContext'>): string {
  return fingerprintOfReport(report);
}

/**
 * The pre-M4-02 key (`p…`): birth fields + name hashed. Kept only so old data can be moved
 * to the new key (see `store.migrate`).
 */
export function legacyProfileKeyOf(input: Report['input']): string {
  const lat = Number.isFinite(input.latitude) ? input.latitude.toFixed(2) : '';
  const lng = Number.isFinite(input.longitude) ? input.longitude.toFixed(2) : '';
  const raw = [input.name ?? '', input.year, input.month, input.day, input.hour, input.minute,
    input.timeKnown !== false, input.gender, lat, lng].join('|');
  return `p${hashString(raw).toString(36)}`;
}

/** Keep only valid, unique events, sorted by date then id. */
export function cleanEvents(items: unknown): LifeEvent[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const out: LifeEvent[] = [];
  for (const item of items) {
    const result = validateLifeEvent(item);
    if (!result.ok || seen.has(result.value.id)) continue;
    seen.add(result.value.id);
    out.push(result.value);
  }
  return out
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, MAX_LIFE_EVENTS_PER_PROFILE);
}

export function createLifeEventStore(storage: KeyValueStorage | undefined = safeLocalStorage()) {
  function read(): StoredData {
    try {
      const parsed = JSON.parse(storage?.getItem(LIFE_EVENTS_STORE_KEY) ?? 'null');
      if (!parsed || parsed.version !== 1 || typeof parsed.profiles !== 'object' || parsed.profiles === null) {
        return { version: 1, profiles: {} };
      }
      return parsed as StoredData;
    } catch {
      return { version: 1, profiles: {} };
    }
  }

  function write(data: StoredData): boolean {
    try {
      if (Object.keys(data.profiles).length === 0) storage?.removeItem(LIFE_EVENTS_STORE_KEY);
      else storage?.setItem(LIFE_EVENTS_STORE_KEY, JSON.stringify(data));
      return Boolean(storage);
    } catch {
      return false;
    }
  }

  function list(profileKey: string): LifeEvent[] {
    return cleanEvents(read().profiles[profileKey]?.events);
  }

  function replace(profileKey: string, events: LifeEvent[]): boolean {
    const data = read();
    const clean = cleanEvents(events);
    if (clean.length === 0) delete data.profiles[profileKey];
    else data.profiles[profileKey] = { events: clean };
    return write(data);
  }

  /**
   * Move the events under `fromKey` (the legacy key) to `toKey`. Events already under `toKey`
   * win on a same-id clash; nothing is dropped except events that were already invalid.
   * The old key is removed only after the new data is written. Returns true when something moved.
   */
  function migrate(fromKey: string, toKey: string): boolean {
    if (fromKey === toKey) return false;
    const data = read();
    const legacy = data.profiles[fromKey];
    if (!legacy) return false;
    const merged = cleanEvents([...(data.profiles[toKey]?.events ?? []), ...(Array.isArray(legacy.events) ? legacy.events : [])]);
    if (merged.length > 0) data.profiles[toKey] = { events: merged };
    delete data.profiles[fromKey];
    return write(data);
  }

  return {
    list,
    replace,
    migrate,
    /** Add or replace (same id) one event. Invalid events are rejected. */
    upsert(profileKey: string, event: LifeEvent): boolean {
      if (!validateLifeEvent(event).ok) return false;
      return replace(profileKey, [...list(profileKey).filter(item => item.id !== event.id), event]);
    },
    remove(profileKey: string, id: string): boolean {
      return replace(profileKey, list(profileKey).filter(item => item.id !== id));
    },
    /** 「刪除全部」: every event of this profile. */
    clearProfile(profileKey: string): boolean {
      return replace(profileKey, []);
    },
    /** Every life event of every profile on this device. */
    clearAll(): boolean {
      try {
        storage?.removeItem(LIFE_EVENTS_STORE_KEY);
        return true;
      } catch {
        return false;
      }
    },
  };
}

export type LifeEventStore = ReturnType<typeof createLifeEventStore>;
