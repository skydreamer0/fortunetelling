import { expect, test } from 'vitest';
import { analyzeReplayReport, createProfileFileV2, profileAnalyzeInput, parseProfileFile,
  createTimeContext, buildTimelineAsync, replayAsyncTimeline, VERSION } from '@fortune/core';
import { buildProfileDownload } from '../../../apps/web/src/lib/profileFile';
import { createLifeEventStore, profileKeyOf } from '../../../apps/web/src/lib/lifeEvents';
import { createLifeEventSession } from '../../../apps/web/src/lib/lifeEventSession';
import { baziStructure, ziweiBoard, mingGua } from '../../../apps/web/src/model/selectors';
import { buildReportBacktestTimeline } from '../../../apps/web/src/model/backtest';
import type { Report } from '../../../apps/web/src/model/types';
import { makeFixture, SAMPLE_PROFILE } from './helpers';

test('combined Report8 typed charts, pending LifeEvents, Profile2 MCP and separate async record retain their contracts', async () => {
  const asOf = '2026-01-01';
  const file = createProfileFileV2('sky', { ...SAMPLE_PROFILE, time: '23:10' },
    { useTrueSolarTime: false, ziHourConvention: 'early' });
  const report = analyzeReplayReport(profileAnalyzeInput(file), { asOf }) as unknown as Report;
  const original = JSON.stringify(report);
  expect(report.schemaVersion).toBe(8);
  expect(baziStructure(report)).not.toBeNull();
  expect(ziweiBoard(report)).not.toBeNull();
  expect(mingGua(report)).not.toBeNull();
  const values = new Map<string, string>(); let denied = true;
  const storage = { getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => { if (denied) throw Error('synthetic quota'); values.set(k, v); },
    removeItem: (k: string) => { if (denied) throw Error('synthetic quota'); values.delete(k); } };
  const key = profileKeyOf(report), store = createLifeEventStore(storage), session = createLifeEventSession(store, key);
  const event = { id: 'integration-synthetic', date: '2026-06', category: 'other' as const,
    domains: ['career' as const], confidence: 'certain' as const };
  expect(session.submit(event)).toBe('pending'); expect(session.list()).toEqual([event]);
  const before = buildReportBacktestTimeline(report);
  denied = false; expect(session.retry()).toBe(true);
  expect(createLifeEventStore(storage).list(key)).toEqual([event]);
  expect(buildReportBacktestTimeline(JSON.parse(original))).toEqual(before);
  const download = buildProfileDownload(report, 'sky'); if (!download.ok) throw Error(download.error);
  const parsed = parseProfileFile(download.text); if (!parsed.ok) throw Error(parsed.errors.join(';'));
  const fx = await makeFixture({});
  try {
    await fx.store.put(parsed.file, { overwrite: true });
    const mcp = await fx.ctx.analyzer.get('sky', asOf);
    expect(mcp.calculation).toMatchObject(report.calculation!);
    expect(mcp.calculation).toMatchObject({ settingsSource: 'profile-v2-explicit',
      settings: { useTrueSolarTime: false, ziHourConvention: 'early' } });
    const context = createTimeContext(parsed.file.profile);
    const record = await buildTimelineAsync(context, { asOf, years: 1, includeMonths: false,
      systems: ['bazi', 'ziwei'], useTrueSolarTime: false, ziHourConvention: 'early' }, { captureReplay: true });
    expect(record.spec.versions.core).toBe(VERSION);
    expect(await replayAsyncTimeline(JSON.parse(JSON.stringify(record)))).toEqual(record);
    expect(JSON.stringify(report)).toBe(original);
    expect(report.calculation?.excludedSystems).toEqual(['jyotish', 'humanDesign']);
  } finally { await fx.cleanup(); }
}, 60_000);
