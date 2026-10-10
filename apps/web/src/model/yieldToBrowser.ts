/** Per preparation: keep every unit boundary and periodically admit other task sources. */
export function createBrowserYieldTask(): () => Promise<void> {
  let consecutiveNative = 0;
  return () => {
    const scheduler = (globalThis as typeof globalThis & {
      scheduler?: { yield?: () => Promise<void> };
    }).scheduler;
    // Seven native continuations then one original timer is a bounded fairness
    // choice, not a wall-clock guarantee. No unit is combined or omitted.
    if (typeof scheduler?.yield === 'function' && consecutiveNative < 7) {
      consecutiveNative++;
      // Preserve the receiver and propagate supported-API failures unchanged.
      return scheduler.yield();
    }
    consecutiveNative = 0;
    return new Promise(resolve => setTimeout(resolve, 0));
  };
}
