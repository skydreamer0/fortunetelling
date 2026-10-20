import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';
import { analyzeReplayReport, createReportReplaySession, createProfileFileV2, profileAnalyzeInput,
  parseProfileFile, createProfileCalculation, buildExportBundle } from '@fortune/core';
import type { ZiweiChart, ZiweiEngineChart } from '../../core/src/calculators/ziwei/types';
import { ziweiBoard } from '../../../apps/web/src/model/selectors';
import { buildProfileDownload } from '../../../apps/web/src/lib/profileFile';
import type { Report } from '../../../apps/web/src/model/types';
import { makeFixture } from './helpers';

const fixtureBytes = readFileSync(new URL('../../core/tests/fixtures/fortel1952.json', import.meta.url));
const oracle = JSON.parse(fixtureBytes.toString('utf8')) as {
  fiveElement: string; starReactionMap: Record<string, string>;
  cells: { ground: number; temples: string[]; majorStars: string[]; minorStars: string[] }[];
};
const source = JSON.parse(readFileSync(new URL('../../../docs/validation/ziwei-fortel-oracle-54-sources.json', import.meta.url), 'utf8'));
const branches = '子丑寅卯辰巳午未申酉戌亥';
const aliases: Record<string, string> = { 事業: '官祿', 交友: '僕役' };
const expected = oracle.cells.map(cell => ({ branch: branches[cell.ground],
  name: aliases[cell.temples.find(n => n !== '身宮')!] ?? cell.temples.find(n => n !== '身宮'),
  body: cell.temples.includes('身宮'), major: [...cell.majorStars].sort(), minor: [...cell.minorStars].sort() }));
function verify(chart: { readonly palaces: readonly ZiweiEngineChart['palaces'][number][]; readonly fiveElementBureau: string | null; readonly natalTransformations: readonly ZiweiEngineChart['natalTransformations'][number][] }) {
  expect([...chart.palaces].sort((a, b) => branches.indexOf(a.branch) - branches.indexOf(b.branch)).map(p => ({
    branch: p.branch, name: p.name, body: p.isBodyPalace,
    major: p.majorStars.map(s => s.name).sort(), minor: p.minorStars.map(s => s.name).sort(),
  }))).toEqual(expected);
  expect(chart.fiveElementBureau).toBe(oracle.fiveElement);
  // Keep the complete known difference visible at EVERY entry, not only matching fields.
  const transformations = Object.fromEntries(chart.natalTransformations.map(t => [t.mutagen, t.star]));
  expect(oracle.starReactionMap).toEqual({ 科: '天府', 權: '紫微', 忌: '武曲', 祿: '天梁' });
  expect(transformations).toEqual({ 科: '左輔', 權: '紫微', 忌: '武曲', 祿: '天梁' });
  expect(Object.keys(transformations).filter(k => transformations[k] !== oracle.starReactionMap[k])).toEqual(['科']);
}

test('pinned independent oracle survives Profile2 → Report8 → download → actual MCP/export and owned replay', async () => {
  expect(createHash('sha256').update(fixtureBytes).digest('hex')).toBe(source.extractedJsonSha256);
  expect(source.extractedJsonSha256).toBe('aa8bbd4cdfb10c8e0d87fc27af4edaaa9336706ced927170b3adbbb82807d2ff');
  expect(source.sourceCommit).toBe('26d3323c650057851ed3c8df5986133c41649e21');
  expect(source.sourceReadmeSha256).toBe('dd2e83a4e056f30766aadecc95227d4f1fa53ca4107ecff7dc7a38f90f40f797');
  expect(source.wholeChartStatus).toBe('NOT_EQUIVALENT');
  const asOf = '2026-10-19';
  const file = createProfileFileV2('fortel', { date: '1953-01-29', time: '00:30', timeAccuracy: 'exact', gender: 'male',
    name: 'PUBLIC FORTEL FIXTURE', birthplace: { label: 'Synthetic Hong Kong', lat: 22.3, lng: 114.17, timezone: 'Asia/Hong_Kong' } },
    { useTrueSolarTime: false, ziHourConvention: 'late' });
  const report = analyzeReplayReport(profileAnalyzeInput(file), { asOf });
  expect(report.schemaVersion).toBe(8);
  const engine = report.engines.find(e => e.engineId === 'ziwei');
  expect(engine?.errors).toEqual([]);
  if (!engine) throw Error('missing actual Ziwei engine');
  const natal = report.replay.snapshot.natal.ziwei;
  expect(natal.status).toBe('computed');
  if (natal.status !== 'computed') throw Error('missing owned Ziwei snapshot');
  verify(JSON.parse(JSON.stringify(natal.chart.primary)));
  const board = ziweiBoard(report as unknown as Report);
  expect(board).not.toBeNull();
  if (!board) throw Error('missing actual Web board');
  expect([...board.palaces].sort((a, b) => branches.indexOf(a.branch) - branches.indexOf(b.branch)).map(p => ({
    branch: p.branch, name: p.name, body: p.isBody, major: p.majorStars.map(s => s.name).sort(), minor: p.minorStars.map(s => s.name).sort(),
  }))).toEqual(expected);
  expect(board.fiveElementsClass).toBe(oracle.fiveElement);
  const frozenReport = JSON.stringify(report);
  const session = createReportReplaySession(JSON.parse(frozenReport));
  const projection = session.timeline({ asOf, years: 1, includeMonths: false, useTrueSolarTime: false, ziHourConvention: 'late' });
  expect(projection.calculation).toEqual(report.calculation);
  expect(createReportReplaySession(JSON.parse(frozenReport)).timeline({ asOf, years: 1, includeMonths: false, useTrueSolarTime: false, ziHourConvention: 'late' })).toEqual(projection);
  const download = buildProfileDownload(report as unknown as Report, 'fortel');
  if (!download.ok) throw Error(download.error);
  const parsed = parseProfileFile(download.text);
  if (!parsed.ok) throw Error(parsed.errors.join(';'));
  expect(parsed.file).toEqual(file);
  const calculation = createProfileCalculation(parsed.file);
  expect(calculation.calculation).toMatchObject(report.calculation);
  const fx = await makeFixture({});
  try {
    await fx.store.put(parsed.file, { overwrite: true });
    const response = await fx.call('get_chart', { profileId: 'fortel', asOf, system: 'ziwei', detail: 'full' });
    expect(response.isError).toBe(false);
    expect(response.json.calculation).toEqual(calculation.calculation);
    verify(response.json.data.chart);
    const exported = await buildExportBundle(parsed.file, { preset: 'local-full', asOf });
    expect(exported.profile).toEqual(file);
    expect(exported.manifest.calculation).toEqual(calculation.calculation);
    const charts = exported.chart as { systems: { ziwei: { chart: ZiweiChart } } };
    verify(charts.systems.ziwei.chart);
    expect(charts.systems.ziwei.chart).toEqual(response.json.data.chart);
  } finally { await fx.cleanup(); }
  // Full JSON reconstruction rejects retained-identity corruption; clean record still replays.
  const forged = JSON.parse(frozenReport);
  forged.replay.snapshot.natal.ziwei.chart.primary.palaces[0].majorStars[0].name = 'FORGED';
  expect(() => createReportReplaySession(forged)).toThrow();
  expect(() => session.timeline({ asOf, useTrueSolarTime: true, ziHourConvention: 'late' })).toThrow('mismatch');
  expect(JSON.stringify(report)).toBe(frozenReport);
  expect(createReportReplaySession(JSON.parse(frozenReport)).timeline({ asOf, years: 1, includeMonths: false, useTrueSolarTime: false, ziHourConvention: 'late' })).toEqual(projection);
}, 60_000);
