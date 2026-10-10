import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { createCalculationSpec, buildVersionInfo, chartFingerprint, canonicalStringify,
  VERSION, REPORT_SCHEMA_VERSION } from '../src/index';
import old from './fixtures/cooperativeVersion.v0.8.0.json';
import { hashCalculationIdentity } from '../src/core/calculationSpec';
import reportDelta from './fixtures/reportGolden.v0.9.0.delta.json';
import exportDelta from './fixtures/export.v0.9.0.delta.json';
import oldExports from './fixtures/coreRuntimeExports.v0.8.0.json';
import * as core from '../src/index';

test('0.9.0 retains existing runtime exports and explicitly lists additive APIs', () => {
  expect(oldExports.exports).toHaveLength(254);
  expect(Object.keys(core).sort()).toEqual([...oldExports.exports,
    'buildTimelineCooperatively', 'TimelineEnvironmentChangedError',
    // #57: additive period adapters. Keep the original fixture and exact set check.
    'ziweiDecadeNativePeriod', 'ziweiYearlyNativePeriod', 'ziweiMonthlyNativePeriod',
    // #56: source adapters only; preserve the historical inventory and exact set.
    'baziAnnualNativePeriod', 'baziMonthlyNativePeriod', 'baziLuckCycleNativePeriod'].sort());
  expect(typeof core.ResolvedBirthData).toBe('function');
  for (const helper of ['calculateZiweiSteps', 'decadeSequenceSteps', 'yearlySequenceSteps', 'monthlySequenceSteps']) {
    expect(helper in core).toBe(false);
  }
});

test('0.9.0 release explicitly changes only the recorded CalculationSpec core version and its derived hash', () => {
  expect(VERSION).toBe('0.9.0'); expect(REPORT_SCHEMA_VERSION).toBe(7);
  const current = createCalculationSpec(old.input as Parameters<typeof createCalculationSpec>[0]);
  const expectedIdentity = structuredClone(old.spec.identity);
  expectedIdentity.versions.core = '0.9.0'; // Explicit new expected value, not removed from comparison.
  expect(current.identity).toEqual(expectedIdentity as any);
  expect(current.source as unknown).toEqual(old.spec.source);
  expect(old.spec.schemaVersion).toBe(current.schemaVersion);
  expect(current.specHash).not.toBe(old.spec.specHash);
  expect(hashCalculationIdentity(old.spec.identity as any)).toBe(old.spec.specHash);
  expect(current.specHash).toBe(hashCalculationIdentity(expectedIdentity as any));
  expect(chartFingerprint({ date: '1995-07-16', time: '22:00', timeAccuracy: 'exact', gender: 'male',
    birthplace: old.input.birthplace })).toBe(old.profileFingerprint);
});

test('MCP version-hash input has an explicit core-only release delta; no schema/catalog/calculator changes', () => {
  const current = buildVersionInfo({ asOf: old.versions.asOf, ephemeris: 'not_initialized' });
  expect(current as unknown).toEqual({ ...old.versions, coreVersion: '0.9.0' });
  const hash = (versions: typeof current) => {
    const { asOf: _asOf, ...rest } = versions;
    return createHash('sha256').update(canonicalStringify(rest)).digest('hex').slice(0, 12);
  };
  expect(hash(old.versions as typeof current)).toBe(old.versionsHash);
  expect(hash(current)).not.toBe(old.versionsHash);
});

test('new golden deltas are only literal release metadata, with all old fixtures retained', () => {
  expect(reportDelta.changes).toHaveLength(13);
  for (const change of reportDelta.changes) {
    expect(change.path).toHaveLength(3);
    expect(['reports', 'compatibility']).toContain(change.path[0]);
    expect(change.path[2]).toBe('version');
    expect(change.before).toBe('0.8.0'); expect(change.after).toBe('0.9.0');
  }
  expect(exportDelta.changes).toEqual([{ path: ['versions', 'coreVersion'], before: '0.8.0', after: '0.9.0' }]);
});
