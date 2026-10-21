import { expect, test } from 'vitest';
import { createTimeContext } from '../src/time';
import { buildTimeline, buildTimelineAsync, type TimelineOptions } from '../src/timeline/buildTimeline';

test('actual async entry owns context and all nested execution options before WASM await', async () => {
  const ctx = createTimeContext({ date: '1990-05-17', time: '23:10', timeAccuracy: 'exact', gender: 'female',
    birthplace: { label: 'Synthetic', lat: 23, lng: 113, timezone: 'Asia/Taipei' } });
  const options: TimelineOptions = { asOf: '2026-01-01', years: 1, includeMonths: false,
    useTrueSolarTime: false, ziHourConvention: 'early', systems: ['numerology'], systemWeights: { numerology: 0.5 } };
  const expected = buildTimeline(structuredClone(ctx), structuredClone(options));
  const pending = buildTimelineAsync(ctx, options);
  (options.systems as string[]).splice(0);
  options.systemWeights!.numerology = 0;
  const result = await pending;
  expect(result).toEqual(expected);
});
