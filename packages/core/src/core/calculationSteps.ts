/**
 * Run-local steps for synchronous/cooperative callers. No shared cache.
 * Private producers must keep cleanup synchronous and must not yield in finally.
 * A step is indivisible; cancellation can only be observed between next() calls.
 */
export type CalculationSteps<T> = Generator<void, T, void>;

export function finishCalculation<T>(steps: CalculationSteps<T>): T {
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}
