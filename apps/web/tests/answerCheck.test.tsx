import { describe, expect, test } from 'bun:test';
import * as core from '@fortune/core';
import { checkAnswer } from '@fortune/ai/mcp';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnswerCheck, AnswerCheckView } from '../src/components/report/AnswerCheck';
import { McpEntry } from '../src/components/report/McpEntry';
import { monthSignalProvider, reportSignalLookup } from '../src/model/askAi';
import type { BirthInput, Report } from '../src/model/types';

const INPUT: BirthInput = {
  name: '王小明', year: 1995, month: 7, day: 16, hour: 22, minute: 0, timeKnown: true,
  gender: 'male', calendarType: 'solar', cityId: 'tainan', timeAccuracy: 'exact',
};
const report = core.analyze(INPUT as any, { asOf: '2026-09-25' }) as unknown as Report;

describe('M4-03 貼回 Claude 回答檢查', () => {
  test('入口多一個「檢查回答」步驟，且預設不顯示結果', () => {
    const html = renderToStaticMarkup(<McpEntry report={report} />);
    expect(html).toContain('檢查回答（選填）');
    expect(html).toContain('檢查引用的訊號');
    expect(html).not.toContain('ask__check');
    expect(renderToStaticMarkup(<AnswerCheck report={report} />)).toContain('Claude 的回答');
  });

  test('報告時間軸裡的訊號查得到，系統名稱可用', () => {
    const lookup = reportSignalLookup(report);
    const signal = report.timeline!.years[0].domains.flatMap(d => d.topSignals)[0];
    expect(lookup(signal.id)?.system).toBe(signal.system);
  });

  test('其他年份的月份訊號（MCP 查得到的）也查得到；假編號查不到', () => {
    const provider = monthSignalProvider(report)!;
    const other = provider({ start: '2028-03-01', end: '2028-03-31' } as any)[0];
    expect(other).toBeDefined();
    const lookup = reportSignalLookup(report);
    expect(lookup(other.id)?.system).toBe(other.system);
    expect(lookup('sig_fake0000')).toBeNull();
  }, 60_000);

  test('引用真實編號通過、假編號與保證式用語被標出', () => {
    const lookup = reportSignalLookup(report);
    const signal = report.timeline!.years[0].domains.flatMap(d => d.topSignals)[0];
    const ok = checkAnswer(`這段時期傾向有支撐〔${signal.id}〕。`, { signalLookup: lookup });
    expect(ok.ok).toBe(true);
    const bad = checkAnswer('一定會成功〔sig_fake0000〕。', { signalLookup: lookup });
    expect(bad.ok).toBe(false);
    expect(bad.unknownCitations).toEqual(['sig_fake0000']);
    const html = renderToStaticMarkup(<AnswerCheckView result={bad} />);
    expect(html).toContain('引用的訊號編號查不到');
    expect(html).toContain('sig_fake0000');
  }, 60_000);
});
