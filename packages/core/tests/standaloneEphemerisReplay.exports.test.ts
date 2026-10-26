import { expect, test } from 'vitest';
import * as publicApi from '../src/index';
import { captureStandaloneJyotish, replayStandaloneJyotish } from '../src/core/standaloneEphemerisReplay';
test('standalone A functions are explicitly exposed at core public entry', () => {
  expect(publicApi.captureStandaloneJyotish).toBe(captureStandaloneJyotish);
  expect(publicApi.replayStandaloneJyotish).toBe(replayStandaloneJyotish);
});
