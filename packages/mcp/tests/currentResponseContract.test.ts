import reportReplayDelta from './fixtures/currentResponse.v0.11.0.delta.json';
import settingsDelta from './fixtures/currentResponse.v0.10.0.delta.json';
import { afterAll, beforeAll, expect, test } from 'vitest';
import contract from './fixtures/currentResponse.contract.json';
import { makeFixture } from './helpers';
import { currentResponseDigests } from './currentResponseContract';

let fx: Awaited<ReturnType<typeof makeFixture>>;
beforeAll(async () => { fx = await makeFixture(); });
afterAll(async () => { await fx.cleanup(); });

for (const row of contract.cases) {
  test(`complete current response: ${row.id}`, async () => {
    const reply = await fx.call(row.tool, row.args);
    expect(reply.isError).toBe(false);
    const previous = settingsDelta.cases.find(candidate => candidate.id === row.id)!;
    expect(previous.before).toEqual(row.digests);
    const delta = reportReplayDelta.cases.find(candidate => candidate.id === row.id)!;
    expect(delta.before).toEqual(previous.after);
    expect(delta.after.data).toBe(row.digests.data);
    expect(delta.after.caveats).toBe(row.digests.caveats);
    expect(reply.json.calculation).toEqual(delta.calculation);
    expect(currentResponseDigests(reply.json)).toEqual(delta.after);
    const expected = delta.after;
    // The same actual response, before any historical omissions, is the oracle.
    const response = reply.json as Record<string, unknown>;
    const { calculation: _removed, ...withoutCalculation } = response;
    expect(currentResponseDigests(withoutCalculation).envelope).not.toBe(expected.envelope);
    const data = response.data as Record<string, unknown>;
    if (row.id === 'timeline-years') {
      expect(Array.isArray(data.years)).toBe(true);
      expect((data.years as unknown[]).length).toBeGreaterThan(0);
    }
    if (row.id === 'timeline-table') expect(data).toHaveProperty('yearTable');
    expect(currentResponseDigests({ ...response, generatedAt: 'synthetic-new-time' }).envelope).not.toBe(expected.envelope);
    expect(currentResponseDigests({ ...response, data: { ...data, nested: { generatedAt: 'synthetic-new-time' } } }).data).not.toBe(expected.data);
    for (const key of ['systemsUsed', 'excludedSystems', 'experimentalIncluded',
      'experimentalSensitivity', 'monthsFormat', 'yearsFormat', 'years', 'yearTable']) {
      if (!Object.hasOwn(data, key)) continue;
      const changed = { ...data }; delete changed[key];
      expect(currentResponseDigests({ ...response, data: changed }).data).not.toBe(expected.data);
    }
    expect(currentResponseDigests({ ...response, data: { ...data, futureField: true } }).data).not.toBe(expected.data);
    const caveat = currentResponseDigests({ ...response, caveats: [] });
    expect(caveat.data).toBe(expected.data);
    expect(caveat.caveats).not.toBe(expected.caveats);
    expect(currentResponseDigests({ ...response, versionsHash: 'changed' }).versions).not.toBe(expected.versions);
    expect(currentResponseDigests({ ...response, futureEnvelope: true }).envelope).not.toBe(expected.envelope);
  }, 120_000);
}

test('contract states its actual provenance instead of claiming historical replay', () => {
  expect(contract.sourceCommit).toBe('d3725a8eee3c9b0edc184aac89ae3405d726d980');
  expect(contract.kind).toContain('NOT historical replay');
  expect(new Set(contract.cases.map(row => row.id)).size).toBe(8);
});


test('generatedAt values at every depth participate in the raw response digest', () => {
  const before = { asOf: null, versionsHash: 'synthetic', caveats: [],
    generatedAt: 'before', data: { rows: [{ generatedAt: 'before' }] } };
  const original = currentResponseDigests(before);
  expect(currentResponseDigests({ ...before, generatedAt: 'after' }).envelope).not.toBe(original.envelope);
  expect(currentResponseDigests({ ...before, data: { rows: [{ generatedAt: 'after' }] } }).data).not.toBe(original.data);
});
