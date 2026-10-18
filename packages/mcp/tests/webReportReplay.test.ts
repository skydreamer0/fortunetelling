import { buildInterpretationPayload } from '@fortune/ai';
import { expect, test } from 'vitest';
import { analyzeReplayReport, profileAnalyzeInput, createProfileFileV2, parseProfileFile, buildExportBundle } from '@fortune/core';
import { buildProfileDownload } from '../../../apps/web/src/lib/profileFile';
import { localQuestion } from '../../../apps/web/src/model/askAi';
import { buildReportBacktestTimeline } from '../../../apps/web/src/model/backtest';
import type { Report } from '../../../apps/web/src/model/types';
import { makeFixture, SAMPLE_PROFILE } from './helpers';

test('Report8 Question/Backtest → Profile2 → actual MCP and export retain the same scoped snapshot', async () => {
  const asOf = '2026-01-01';
  const file = createProfileFileV2('sky', { ...SAMPLE_PROFILE, name: 'ALICE', time: '23:10',
    birthplace: { ...SAMPLE_PROFILE.birthplace, lng: 113 } }, { useTrueSolarTime: false, ziHourConvention: 'early' });
  const report = analyzeReplayReport(profileAnalyzeInput(file), { asOf });
  const web = report as unknown as Report;
  const portable = buildProfileDownload(web, 'sky'); if (!portable.ok) throw Error(portable.error);
  const parsed = parseProfileFile(portable.text); if (!parsed.ok) throw Error(parsed.errors.join(';'));
  const fx = await makeFixture({});
  try {
    await fx.store.put(parsed.file, { overwrite: true });
    const mcp = await fx.ctx.analyzer.get('sky', asOf);
    const exported = await buildExportBundle(parsed.file, { preset: 'share-redacted', asOf });
    const question = localQuestion(web, '2026 年買車');
    const backtest = buildReportBacktestTimeline(web);
    for (const actual of [mcp.calculation, exported.manifest.calculation, question?.calculation,
      'calculation' in backtest ? backtest.calculation : null]) {
      expect(actual).toMatchObject({ specHash: report.calculation.specHash, snapshotId: report.calculation.snapshotId,
        scope: 'analyze-sync-natal', excludedSystems: ['jyotish', 'humanDesign'] });
    }
    const reply = await fx.call('get_chart', { profileId: 'sky', asOf, system: 'bazi', detail: 'full' });
    expect(reply.isError).toBe(false);
    expect(reply.json.calculation.snapshotId).toBe(report.calculation.snapshotId);
    expect(JSON.stringify(exported)).not.toContain('ALICE');
    const ai = JSON.stringify(buildInterpretationPayload({ ...report, input: { ...report.input },
      timeContext: { ...report.timeContext, flags: report.timeContext.flags.map(flag => ({ ...flag })) } }));
    expect(ai).not.toContain('ALICE');
    expect(ai).not.toContain('\"replay\"');
    expect(ai).not.toContain('\"snapshot\"');
    expect(JSON.stringify(exported)).not.toContain('"replay"');
    expect(JSON.stringify(reply.json)).not.toContain('"replay"');
  } finally { await fx.cleanup(); }
}, 60_000);
