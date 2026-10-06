import { describe, expect, test } from 'bun:test';
import * as core from '@fortune/core';
import { shortSignalId } from '../src/lib/core';
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
    expect(lookup('sig_fa0e0000')).toBeNull();
  }, 60_000);

  test('引用真實編號通過、假編號與保證式用語被標出', () => {
    const lookup = reportSignalLookup(report);
    const signal = report.timeline!.years[0].domains.flatMap(d => d.topSignals)[0];
    const ok = checkAnswer(`這段時期傾向有支撐〔${signal.id}〕。`, { signalLookup: lookup });
    expect(ok.ok).toBe(true);
    const bad = checkAnswer('一定會成功〔sig_fa0e0000〕。', { signalLookup: lookup });
    expect(bad.ok).toBe(false);
    expect(bad.unknownCitations).toEqual(['sig_fa0e0000']);
    const html = renderToStaticMarkup(<AnswerCheckView result={bad} />);
    expect(html).toContain('引用的訊號編號查不到');
    expect(html).toContain('sig_fa0e0000');
  }, 60_000);
  test('短編號、前綴與大小寫都能解析；太短不當編號；ambiguous 與假編號查不到', () => {
    const lookup = reportSignalLookup(report);
    const signal = report.timeline!.years[0].domains.flatMap(d => d.topSignals)[0];
    const short = shortSignalId(signal.id);
    expect(short).toMatch(/^sig_[0-9a-f]{8}$/);
    expect(lookup(short)?.system).toBe(signal.system);
    expect(lookup(signal.id.slice(0, 14))?.system).toBe(signal.system);
    expect(lookup(short.toUpperCase())?.system).toBe(signal.system);
    // 少於 8 位不是編號，lookup 回 null；checkAnswer 也不會當成編號
    expect(lookup(signal.id.slice(0, 9))).toBeNull();
    const r = checkAnswer(`這段時期傾向有支撐〔${short}〕。短寫〔${signal.id.slice(0, 8)}〕不算。`, { signalLookup: lookup });
    expect(r.ok).toBe(true);
    expect(r.citedIds).toEqual([short]);
    expect(checkAnswer('這段時期傾向有支撐〔sig_00000000〕。', { signalLookup: lookup }).unknownCitations).toEqual(['sig_00000000']);
  }, 60_000);

  test('ambiguous 前綴不猜（兩筆訊號共用同一個短編號）', () => {
    const signal = report.timeline!.years[0].domains.flatMap(d => d.topSignals)[0];
    const twin = { ...signal, id: `${signal.id.slice(0, 12)}ffffffff` };
    const clone = { ...report, signals: [signal, twin], timeContext: null } as unknown as Report;
    const lookup = reportSignalLookup(clone);
    expect(lookup(shortSignalId(signal.id))).toBeNull();
    expect(lookup(signal.id)?.system).toBe(signal.system);
    expect(lookup(twin.id)?.system).toBe(twin.system);
  });
});
