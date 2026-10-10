import { expect, spyOn, test } from 'bun:test';
import { createBrowserYieldTask } from '../src/model/yieldToBrowser';

async function withScheduler(value: unknown, run: () => Promise<void>) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'scheduler');
  Object.defineProperty(globalThis, 'scheduler', { configurable: true, value });
  try { await run(); }
  finally {
    if (previous) Object.defineProperty(globalThis, 'scheduler', previous);
    else Reflect.deleteProperty(globalThis, 'scheduler');
  }
}

test('native scheduler receives its original receiver and exact pending promise without a timer', async () => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  const scheduler = { yield() { expect(this).toBe(scheduler); calls++; return pending; } };
  await withScheduler(scheduler, async () => {
    const yieldToBrowser = createBrowserYieldTask();
    const timer = spyOn(globalThis, 'setTimeout');
    try {
      expect(yieldToBrowser()).toBe(pending);
      expect(calls).toBe(1);
      expect(timer).not.toHaveBeenCalled();
      release(); await pending;
    } finally { release(); timer.mockRestore(); }
  });
});

test('absent or non-callable native yield preserves the asynchronous zero-delay timer fallback', async () => {
  for (const scheduler of [undefined, null, {}, { yield: undefined }, { yield: 4 }]) {
    await withScheduler(scheduler, async () => {
      const yieldToBrowser = createBrowserYieldTask();
      let callback!: () => void;
      const timer = spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, delay: number) => {
        expect(delay).toBe(0); callback = fn; return 1;
      }) as typeof setTimeout);
      try {
        let settled = false;
        const promise = yieldToBrowser().then(() => { settled = true; });
        await Promise.resolve();
        expect(settled).toBe(false);
        expect(timer).toHaveBeenCalledTimes(1);
        callback(); await promise;
        expect(settled).toBe(true);
      } finally { timer.mockRestore(); }
    });
  }
});

test('native throw and rejection are not swallowed or retried through the fallback', async () => {
  for (const throws of [false, true]) {
    const reason = { scheduler: 'synthetic failure', throws };
    await withScheduler({ yield() { if (throws) throw reason; return Promise.reject(reason); } }, async () => {
      const yieldToBrowser = createBrowserYieldTask();
      const timer = spyOn(globalThis, 'setTimeout');
      try {
        if (throws) {
          let observed: unknown;
          try { yieldToBrowser(); } catch (error) { observed = error; }
          expect(observed).toBe(reason);
        } else await expect(yieldToBrowser()).rejects.toBe(reason);
        expect(timer).not.toHaveBeenCalled();
      } finally { timer.mockRestore(); }
    });
  }
});

test('browser scheduler factories interleave independently and every eighth call crosses a real timer task', async () => {
  let native = 0;
  await withScheduler({ yield() { native++; return Promise.resolve(); } }, async () => {
    const a = createBrowserYieldTask(), b = createBrowserYieldTask();
    const timer = spyOn(globalThis, 'setTimeout');
    try {
      for (let cycle = 0; cycle < 2; cycle++) {
        for (let i = 0; i < 7; i++) { await a(); await b(); }
        expect(native).toBe(14 * (cycle + 1));
        expect(timer).toHaveBeenCalledTimes(cycle * 2);
        let settled = false;
        const eighthA = a().then(() => { settled = true; });
        await Promise.resolve(); expect(settled).toBe(false);
        await eighthA;
        expect(native).toBe(14 * (cycle + 1));
        expect(timer).toHaveBeenCalledTimes(cycle * 2 + 1);
        await b();
        expect(timer).toHaveBeenCalledTimes((cycle + 1) * 2);
      }
      expect(timer.mock.calls.every(call => call[1] === 0)).toBe(true);
      const fresh = createBrowserYieldTask();
      for (let i = 0; i < 7; i++) await fresh();
      expect(native).toBe(35);
      expect(timer).toHaveBeenCalledTimes(4);
      await fresh(); expect(timer).toHaveBeenCalledTimes(5);
    } finally { timer.mockRestore(); }
  });
});

test('browser scheduler unsupported API uses a timer on every call, not only every eighth', async () => {
  await withScheduler(undefined, async () => {
    const task = createBrowserYieldTask(), timer = spyOn(globalThis, 'setTimeout');
    try {
      for (let i = 0; i < 16; i++) await task();
      expect(timer).toHaveBeenCalledTimes(16);
      expect(timer.mock.calls.every(call => call[1] === 0)).toBe(true);
    } finally { timer.mockRestore(); }
  });
});
