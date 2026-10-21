/** Page-local pending edits, wired to LifeEvents. Never writes outside the supplied store. */
import { cleanEvents, MAX_LIFE_EVENTS_PER_PROFILE, type LifeEventStore } from './lifeEvents';
import { validateLifeEvent, type LifeEvent } from './core';

export function createLifeEventSession(store: LifeEventStore, key: string) {
  let saved = store.list(key);
  const pending = new Map<string, LifeEvent>();
  const visible = () => cleanEvents([...saved.filter(e => !pending.has(e.id)), ...pending.values()]);
  function retry(): boolean {
    if (!pending.size) return true;
    const changes = [...pending.values()];
    if (!store.upsertMany(key, changes)) return false;
    saved = store.snapshot(key) ?? cleanEvents([...saved.filter(e => !pending.has(e.id)), ...changes]);
    pending.clear();
    return true;
  }
  return {
    list: visible,
    pendingIds: () => [...pending.keys()],
    retry,
    submit(event: LifeEvent): 'saved' | 'pending' | 'invalid' | 'full' {
      const checked = validateLifeEvent(event);
      if (!checked.ok) return 'invalid';
      if (!visible().some(e => e.id === event.id) && visible().length >= MAX_LIFE_EVENTS_PER_PROFILE) return 'full';
      pending.set(event.id, checked.value);
      return retry() ? 'saved' : 'pending';
    },
    remove(id: string): boolean {
      // An unsaved addition can always be discarded, even when storage is denied.
      if (pending.has(id) && !saved.some(e => e.id === id)) { pending.delete(id); return true; }
      if (!store.remove(key, id)) return false;
      pending.delete(id);
      saved = saved.filter(e => e.id !== id);
      return true;
    },
    clear(): boolean {
      if (!store.clearProfile(key)) {
        // Do not claim persisted events were deleted; discard only page-local additions.
        for (const id of pending.keys()) if (!saved.some(e => e.id === id)) pending.delete(id);
        return false;
      }
      saved = []; pending.clear(); return true;
    },
  };
}
