import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReportView } from '../src/components/report/ReportView';
import { HISTORICAL_ZONE_WARNING_TEXT, analyze } from '../src/lib/core';
import { historicalZoneNotice, notices } from '../src/model/selectors';
import type { BirthInput, Report } from '../src/model/types';

const BASE: BirthInput = {
  name: '', year: 1995, month: 7, day: 16, hour: 22, minute: 0,
  timeKnown: true, gender: 'male', calendarType: 'solar', cityId: 'tainan',
};
const modern = analyze(BASE);
// 阿姆斯特丹 1930：1970 年前的時區歷史取自 backzone → 歷史時區不確定。
const historical = analyze({ ...BASE, year: 1930, month: 3, day: 14, hour: 11, minute: 30, cityId: 'amsterdam' });
const historicalUnknownTime = analyze({ ...BASE, year: 1930, month: 3, day: 14, timeKnown: false, cityId: 'amsterdam' });

describe('historical_zone_uncertain 顯示', () => {
  test('歷史案例有提示，文字與核心共用同一份', () => {
    expect(historicalZoneNotice(historical)).toBe(HISTORICAL_ZONE_WARNING_TEXT);
    expect(notices(historical).timeZone).toBe(HISTORICAL_ZONE_WARNING_TEXT);
  });

  test('現代案例沒有提示', () => {
    expect(historicalZoneNotice(modern)).toBeNull();
  });

  test('時間未知時不顯示（沒有出生時刻可受影響）', () => {
    expect(historicalZoneNotice(historicalUnknownTime)).toBeNull();
  });

  test('缺少 timeContext 時不報錯', () => {
    expect(historicalZoneNotice({ ...modern, timeContext: null } as Report)).toBeNull();
  });

  test('報告頁在既有提示區塊顯示；現代案例不出現', () => {
    const html = renderToStaticMarkup(<ReportView report={historical} onBack={() => {}} />);
    expect(html).toContain('出生時區');
    expect(html).toContain('出生時刻因歷史時區不確定');
    expect(renderToStaticMarkup(<ReportView report={modern} onBack={() => {}} />)).not.toContain('出生時區');
  });
});
