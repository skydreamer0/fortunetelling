import { expect, test } from 'vitest';
import {
  analyze, analyzeProfileFile, buildExportBundle, createProfileCalculation, createProfileFileV2,
  parseProfileFile, profileAnalyzeInput,
} from '@fortune/core';
import { buildProfileDownload } from '../../../apps/web/src/lib/profileFile';
import type { Report as WebReport } from '../../../apps/web/src/model/types';
import { makeFixture, SAMPLE_PROFILE } from './helpers';
import { Analyzer } from '../src/compute';

const profile = { ...SAMPLE_PROFILE, name: 'ALICE', time: '23:10',
  birthplace: { ...SAMPLE_PROFILE.birthplace, lng: 113 } };
const asOf = '2026-01-01';

test('non-default Web download → real store/MCP → export preserves charts, settings and snapshot identity', async () => {
  const file = createProfileFileV2('sky', profile, { useTrueSolarTime: false, ziHourConvention: 'early' });
  const report = analyze(profileAnalyzeInput(file), { asOf });
  const download = buildProfileDownload(report as unknown as WebReport, 'sky');
  expect(download.ok).toBe(true);
  if (!download.ok) throw new Error(download.error);
  const parsed = parseProfileFile(download.text);
  if (!parsed.ok) throw new Error(parsed.errors.join('; '));
  expect(parsed.file).toEqual(file);
  const fx = await makeFixture({});
  try {
    await fx.store.put(parsed.file, { overwrite: true });
    const mcp = await fx.ctx.analyzer.get('sky', asOf);
    const session = createProfileCalculation(file);
    const envelope = analyzeProfileFile(file, asOf);
    const exported = await buildExportBundle(file, { preset: 'local-full', asOf });
    expect(mcp.calculation).toEqual(session.calculation);
    expect(envelope.calculation).toEqual(session.calculation);
    expect(exported.manifest.calculation).toEqual(session.calculation);
    expect(exported.profile).toEqual(file);
    expect(mcp.charts(asOf)).toEqual(session.charts(asOf));
    const actualChart = await fx.call('get_chart', { profileId: 'sky', asOf, system: 'bazi', detail: 'full' });
    expect(actualChart.isError).toBe(false);
    expect(actualChart.json.calculation).toEqual(session.calculation);
    const bazi = mcp.charts(asOf)[0].chart;
    if (!('pillars' in bazi) || !bazi.pillars) throw new Error('Expected computed BaZi');
    expect(actualChart.json.data.chart.pillars).toEqual(bazi.pillars);
    expect(report.engines.find(engine => engine.engineId === 'bazi')?.components.find(component => component.id === 'natal')?.value).toMatchObject({
      convention: { trueSolarTime: false, dayBoundary: 'lunar-javascript sect=1' },
      year: bazi.pillars.year, month: bazi.pillars.month, day: bazi.pillars.day, time: bazi.pillars.hour,
    });
    expect(mcp.timeline).toEqual(await session.timelineAsync({ asOf, topSignalsPerDomain: Infinity }));
    expect(mcp.monthCells(2027)).toEqual(session.timeline({ asOf: '2027-01-01', years: 1, topSignalsPerDomain: Infinity,
      systems: mcp.timeline.systems, systemWeights: mcp.timeline.systemWeights,
      consensusThreshold: mcp.timeline.thresholds.theta, conflictThreshold: mcp.timeline.thresholds.tau }).months);
    const chart = exported.chart as { systems: Record<string, { chart: unknown }> };
    for (const result of mcp.charts(asOf)) expect(chart.systems[result.system].chart).toEqual(result.chart);
    expect(report.timeContext.conventions.useTrueSolarTime).toBe(false);
    expect(report.timeContext.conventions.ziHourConvention).toBe('early');
  } finally { await fx.cleanup(); }
}, 60_000);

test('same cf1 with changed settings invalidates cache, preserves ownership and agrees with fresh Analyzer', async () => {
  const first = createProfileFileV2('sky', profile, { useTrueSolarTime: true, ziHourConvention: 'late' });
  const changed = createProfileFileV2('sky', profile, { useTrueSolarTime: false, ziHourConvention: 'early' });
  const fx = await makeFixture({});
  try {
    await fx.store.put(first, { overwrite: true });
    const before = await fx.ctx.analyzer.get('sky', asOf);
    await fx.store.put(changed, { overwrite: true });
    const after = await fx.ctx.analyzer.get('sky', asOf);
    const fresh = await new Analyzer(fx.store).get('sky', asOf);
    expect(first.chartFingerprint).toBe(changed.chartFingerprint);
    expect(after).not.toBe(before);
    expect(after.calculation).not.toEqual(before.calculation);
    expect(after.timeline).toEqual(fresh.timeline);
    expect(after.charts(asOf)).toEqual(fresh.charts(asOf));
    expect(after.charts(asOf)[0].chart).not.toEqual(before.charts(asOf)[0].chart);
    expect(await fx.ctx.analyzer.get('sky', asOf)).toBe(after);
  } finally { await fx.cleanup(); }
}, 60_000);


test('export owns profile/settings before awaiting and cannot publish caller-mutated source', async () => {
  const file = createProfileFileV2('sky', profile, { useTrueSolarTime: false, ziHourConvention: 'early' });
  const expected = structuredClone(file);
  const pending = buildExportBundle(file, { preset: 'local-full', asOf });
  file.profile.name = 'LATER';
  file.profile.birthplace.lng = 120;
  file.settings = { useTrueSolarTime: true, ziHourConvention: 'late' };
  const result = await pending;
  expect(result.profile).toEqual(expected);
  expect(result.manifest.calculation).toEqual(createProfileCalculation(expected).calculation);
});


test('export rejects an accessor source before any getter or async computation', async () => {
  const file = createProfileFileV2('sky', profile, { useTrueSolarTime: false, ziHourConvention: 'early' });
  let reads = 0;
  const source = { ...file, get profile() { reads++; return profile; } };
  await expect(buildExportBundle(source, { preset: 'local-full', asOf })).rejects.toThrow('accessors');
  expect(reads).toBe(0);
});
