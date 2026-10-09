import { astro } from 'iztro';
import i18next from 'iztro/lib/i18n';
import type { CalculationSteps } from '../core/calculationSteps';

/** A failed environment check must never become an empty, successfully scanned year. */
export class TimelineEnvironmentChangedError extends Error {
  constructor() {
    super('Cooperative timeline requires unchanged zh-TW/default iztro settings');
    this.name = 'TimelineEnvironmentChangedError';
  }
}

const DEFAULT_CONFIG = {
  mutagens: {}, brightness: {}, yearDivide: 'normal', ageDivide: 'normal',
  dayDivide: 'forward', horoscopeDivide: 'normal', algorithm: 'default',
};

function settings() {
  // Own snapshots: getConfig returns mutable nested maps, not an immutable snapshot.
  return JSON.stringify({ language: i18next.language, resolvedLanguage: i18next.resolvedLanguage,
    config: astro.getConfig() });
}

/** Read-only boundary guard, not cross-global-configuration isolation or a mutation audit. */
export function supportedTimelineEnvironment(): () => void {
  const expected = JSON.stringify({ language: 'zh-TW', resolvedLanguage: 'zh-TW', config: DEFAULT_CONFIG });
  const initial = settings();
  if (initial !== expected) throw new TimelineEnvironmentChangedError();
  return () => { if (settings() !== initial) throw new TimelineEnvironmentChangedError(); };
}

/** The scheduler must settle; boundary checks cannot interrupt its pending promise. */
export async function finishCooperatively<T>(steps: CalculationSteps<T>, signal: AbortSignal,
  yieldTask: () => Promise<void>, verifyEnvironment: () => void): Promise<T> {
  const check = () => { signal.throwIfAborted(); verifyEnvironment(); };
  let failed = false;
  try {
    for (;;) {
      check();
      await yieldTask();
      check();
      const step = steps.next();
      check();
      if (step.done) return step.value;
    }
  } catch (error) {
    failed = true;
    // Actual signal state/reason is authoritative, not an error's name. A unit
    // or scheduler may both abort and throw before the next boundary check.
    signal.throwIfAborted();
    throw error;
  } finally {
    // Closing can execute a generator's finally block. Producers must not yield
    // from cleanup; never drain it here, which could resume more calculation.
    // A cleanup failure must not replace the primary abort/guard/work failure.
    if (failed) {
      try { steps.return(undefined as never); } catch { /* Preserve the original failure. */ }
    } else {
      steps.return(undefined as never);
    }
  }
}
