/** One browser task boundary per calculation unit; no batching or microtask-only fallback. */
export function yieldToBrowser(): Promise<void> {
  const scheduler = (globalThis as typeof globalThis & {
    scheduler?: { yield?: () => Promise<void> };
  }).scheduler;
  // Call on the actual receiver. A supported API's throw/rejection must reach
  // the existing scheduler-failure/abort path, never silently retry as a timer.
  if (typeof scheduler?.yield === 'function') return scheduler.yield();
  return new Promise(resolve => setTimeout(resolve, 0));
}
