import { describe, expect, mock, test } from 'bun:test';
import { buildTimeline, cityToBirthplace, createTimeContext, findCity, type Timeline } from '@fortune/core';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BirthForm, formToInput, type BirthFormState } from '../src/components/input/BirthForm';
import { CHAPTERS, ReportView } from '../src/components/report/ReportView';
import { Timeline as TimelineChapter, TimelineTable, TimelineView, pickRows } from '../src/components/report/Timeline';
import { cityById, searchCities } from '../src/lib/cities';
import { analyze } from '../src/lib/core';
import { createReportStore } from '../src/lib/store';
import {
  HEADLINE_DOMAINS, findTimelineCell, selectTimelineMeta, selectTimelineMonths, selectTimelineYears,
  type TimelineCellView,
} from '../src/model/selectors';
import type { BirthInput, Report } from '../src/model/types';

// Fixture: 1995-07-16 22:00 male, Tainan, asOf 2026-09-25. Sync systems only, so the
// result does not depend on whether another test file initialised the ephemeris.
const ASOF = '2026-09-25';
const tainan = findCity('tainan')!;
const ctx = createTimeContext({
  date: '1995-07-16', time: '22:00', timeAccuracy: 'exact', gender: 'male', birthplace: cityToBirthplace(tainan),
});
const timeline: Timeline = buildTimeline(ctx, { asOf: ASOF, systems: ['bazi', 'ziwei', 'numerology'] });

const INPUT: BirthInput = {
  name: '', year: 1995, month: 7, day: 16, hour: 22, minute: 0, timeKnown: true,
  gender: 'male', calendarType: 'solar', cityId: 'tainan', timeAccuracy: 'exact',
};
// Report v4 起 analyze() 自帶 timeline；這裡明確移除 v4 欄位來模擬舊的 v3 報告（例如最近查詢裡存的舊結果）。
const { timeline: _timeline, timeContext: _timeContext, signals: _signals, ...v3Fields } = analyze(INPUT);
const v3: Report = { ...v3Fields, schemaVersion: 3 };
const v4: Report = { ...v3, input: { ...v3.input, cityId: 'tainan' }, asOf: ASOF, schemaVersion: 4, timeline };

const years = selectTimelineYears(v4)!;
const months = selectTimelineMonths(v4)!;
const meta = selectTimelineMeta(v4)!;
const allCells = (grid = years) => grid.rows.flatMap(row => row.cells);
const coreCell = (grain: 'years' | 'months', index: number, domain: string) =>
  timeline[grain][index].domains.find(item => item.domain === domain)!;

describe('timeline selectors', () => {
  test('year grid: 5 years × 10 domains, headline domains first with 繁中 labels and icons', () => {
    expect(years.periods.map(period => period.label)).toEqual(['2026', '2027', '2028', '2029', '2030']);
    expect(years.periods.map(period => period.isCurrent)).toEqual([true, false, false, false, false]);
    expect(years.rows).toHaveLength(10);
    expect(years.rows.slice(0, 4).map(row => `${row.icon}${row.label}`)).toEqual(['❤️感情', '💰財運', '💼事業', '🚗移動']);
    expect(years.rows.slice(0, 4).map(row => row.domain)).toEqual([...HEADLINE_DOMAINS]);
    expect(years.rows.slice(4).map(row => row.label)).toEqual(['自我', '家庭', '不動產', '學習', '合約', '身心']);
    for (const row of years.rows) expect(row.cells).toHaveLength(5);
  });

  test('cells carry the core score, band, consensus and signals unchanged', () => {
    years.rows.forEach(row => row.cells.forEach((cell, index) => {
      const source = coreCell('years', index, row.domain);
      expect(cell.score).toBe(source.score);
      expect(cell.band).toBe(source.band);
      expect(cell.consensus).toBe(source.consensus);
      expect(cell.highConsensus).toBe(source.highConsensus);
      expect(cell.topSignals.map(signal => signal.id)).toEqual(source.topSignals.map(signal => signal.id));
      expect(cell.topSignals.map(signal => signal.text)).toEqual(source.topSignals.map(signal => signal.evidence.text));
      expect(cell.key).toBe(`year:${cell.start}:${row.domain}`);
    }));
  });

  test('signals get 繁中 system names, human rule labels and a neutral direction', () => {
    const signals = allCells().flatMap(cell => cell.topSignals);
    expect(signals.length).toBeGreaterThan(0);
    const systems = new Set(signals.map(signal => signal.systemName));
    for (const name of systems) expect(['八字', '紫微斗數', '生命靈數']).toContain(name);
    const numerology = signals.find(signal => signal.ruleId === 'numerology.personal_year')!;
    expect(numerology.ruleLabel).toBe('個人流年數');
    expect(signals.every(signal => signal.ruleLabel !== signal.ruleId)).toBe(true);
    expect(signals.every(signal => ['支持', '壓力', '變動'].includes(signal.direction))).toBe(true);
  });

  test('a domain with no signals is marked empty rather than just 低', () => {
    // 不寫死特定格子：規則集擴充（如 V1-10b 十神）會改變哪些格子沒有訊號。
    const empty = allCells().filter(cell => cell.topSignals.length === 0);
    expect(empty.length).toBeGreaterThan(0);
    for (const cell of empty) {
      expect(cell.score).toBe(0);
      expect(cell.empty).toBe(true);
    }
    expect(allCells().some(cell => cell.band === '低' && !cell.empty)).toBe(true);
  });

  test('conflicts are resolved to both sides with their systems', () => {
    const conflicted = allCells().filter(cell => cell.conflict);
    expect(conflicted.length).toBeGreaterThan(0);
    for (const cell of conflicted) {
      expect(cell.conflict!.positive.length).toBeGreaterThan(0);
      expect(cell.conflict!.negative.length).toBeGreaterThan(0);
    }
    // 每一側都能解析回系統中文名稱與證據文字，且兩側來自不同系統（跨系統矛盾）。
    const known = ['八字', '紫微斗數', '生命靈數'];
    for (const cell of conflicted) {
      const sides = [...cell.conflict!.positive, ...cell.conflict!.negative];
      for (const side of sides) {
        expect(known).toContain(side.systemName);
        expect(side.text ?? '').not.toBe('');
      }
      const pos = new Set(cell.conflict!.positive.map(side => side.systemName));
      const neg = new Set(cell.conflict!.negative.map(side => side.systemName));
      expect([...pos].some(name => !neg.has(name)) || [...neg].some(name => !pos.has(name))).toBe(true);
    }
  });

  test('high consensus is exposed', () => {
    expect(findTimelineCell('year:2026-01-01:family', years)!.highConsensus).toBe(true);
  });

  test('month grid: the 12 months of the asOf year, September current', () => {
    expect(months.periods).toHaveLength(12);
    expect(months.periods[0].label).toBe('1月');
    expect(months.periods.filter(period => period.isCurrent).map(period => period.label)).toEqual(['9月']);
    expect(months.rows[0].cells[8].score).toBe(coreCell('months', 8, 'relationship').score);
  });

  test('meta lists included and skipped systems', () => {
    expect(meta.systems).toEqual(['八字', '紫微斗數', '生命靈數']);
    expect(meta.bandCuts).toEqual([35, 55, 75]);
    const skipped = selectTimelineMeta({ ...v4, timeline: { ...timeline, skippedSystems: [{ system: 'jyotish', reason: 'ephemeris_not_initialised' }] } })!;
    expect(skipped.skipped).toEqual([{ system: 'jyotish', name: '印度占星', reason: '星曆未載入' }]);
  });

  test('a v3 report (no timeline) yields null everywhere', () => {
    expect(selectTimelineYears(v3)).toBeNull();
    expect(selectTimelineMonths(v3)).toBeNull();
    expect(selectTimelineMeta(v3)).toBeNull();
  });
});

/** Depth-first search of a rendered element tree (hook-free components only). */
function findElement(node: ReactNode, predicate: (element: ReactElement<any>) => boolean): ReactElement<any> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, predicate);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const element = node as ReactElement<any>;
  if (predicate(element)) return element;
  return findElement(element.props.children, predicate);
}

const viewProps = (selected: string | null) => ({
  years, months, meta, schemaVersion: 4, selected, onSelect: () => {},
});

describe('timeline chapter', () => {
  test('report v4 renders the 時序 chapter in the nav and the full grid', () => {
    expect(CHAPTERS.map(chapter => chapter.label)).toEqual(['命格', '本年', '時序', '領域', '命盤', '運程', '情境', '建議', '方法']);
    const html = renderToStaticMarkup(<ReportView report={v4} onBack={() => {}} />);
    expect(html).toContain('href="#ch-timeline"');
    expect(html).toContain('id="ch-timeline"');
    // 4 headline + 6 collapsed domains × 5 years, and 4 headline domains × 12 months.
    expect(html.match(/data-key="year:/g)).toHaveLength(50);
    expect(html.match(/data-key="month:/g)).toHaveLength(48);
    for (const label of ['感情', '財運', '事業', '移動']) expect(html).toContain(label);
    expect(html).toContain('臺南市');
  });

  test('grid rows × columns and band labels', () => {
    const html = renderToStaticMarkup(
      <TimelineTable grid={pickRows(years, HEADLINE_DOMAINS)} caption="t" selected={null} onSelect={() => {}} />,
    );
    expect(html.match(/<tr>/g)).toHaveLength(5); // header + 4 domains
    expect(html.match(/class="tl-cell"/g)).toHaveLength(20);
    expect(html).toMatch(/data-band="(低|中|中高|高|none)"/);
  });

  test('clicking a cell selects it and the detail panel lists its top signals', () => {
    const target: TimelineCellView = allCells().find(cell => cell.topSignals.length >= 2)!;
    const onSelect = mock((_key: string) => {});
    const grid = pickRows(years, [target.domain]);
    const tree = TimelineTable({ grid, caption: 't', selected: null, onSelect });
    const button = findElement(tree, element => element.props['data-key'] === target.key)!;
    expect(button.type).toBe('button');
    expect(button.props['aria-pressed']).toBe(false);
    button.props.onClick();
    expect(onSelect).toHaveBeenCalledWith(target.key);

    const html = renderToStaticMarkup(<TimelineView {...viewProps(target.key)} />);
    expect(html).toContain('aria-pressed="true"');
    for (const signal of target.topSignals) {
      expect(html).toContain(signal.ruleLabel);
      expect(html).toContain(signal.ruleId);
      expect(html).toContain(signal.systemName);
      expect(html).toContain(signal.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
    }
  });

  test('conflict and consensus are shown, never hidden', () => {
    const conflictHtml = renderToStaticMarkup(<TimelineView {...viewProps('year:2029-01-01:relationship')} />);
    expect(conflictHtml).toContain('系統間有分歧');
    expect(conflictHtml).toContain('偏支持');
    expect(conflictHtml).toContain('偏壓力');
    const consensusHtml = renderToStaticMarkup(<TimelineView {...viewProps('year:2026-01-01:family')} />);
    expect(consensusHtml).toContain('高共識');
  });

  test('footnote names systems and uses neutral wording', () => {
    const html = renderToStaticMarkup(<TimelineChapter report={v4} />);
    expect(html).toContain('納入系統：八字、紫微斗數、生命靈數');
    expect(html).toContain('尚未經過校準');
    // Chapter chrome (without the core evidence text) never says 吉/凶 or 「你是」.
    const chrome = renderToStaticMarkup(<TimelineView {...viewProps(null)} />);
    expect(chrome).not.toMatch(/[吉凶]|你是/);
  });

  test('a v3 report shows an empty state instead of failing', () => {
    const html = renderToStaticMarkup(<ReportView report={v3} onBack={() => {}} />);
    expect(html).toContain('id="ch-timeline"');
    expect(html).toContain('沒有時序資料');
    expect(html).not.toContain('data-key="year:');
  });
});

describe('birthplace and time accuracy', () => {
  test('city search matches 中文 (台/臺), English and aliases, grouped 台灣／海外', () => {
    expect(searchCities('台南').taiwan.map(city => city.id)).toEqual(['tainan']);
    expect(searchCities('臺北').taiwan.map(city => city.id)).toContain('taipei');
    expect(searchCities('Tokyo')).toEqual({ taiwan: [], overseas: [cityById('tokyo')!] });
    expect(searchCities('馬祖').taiwan.map(city => city.id)).toEqual(['lienchiang']);
    expect(searchCities('zzz')).toEqual({ taiwan: [], overseas: [] });
    const all = searchCities('');
    expect(all.taiwan).toHaveLength(22);
    expect(all.overseas.length).toBeGreaterThan(10);
  });

  test('form renders the birthplace picker (default 台北) and the accuracy options', () => {
    const html = renderToStaticMarkup(<BirthForm initial={null} onSubmit={() => {}} onExample={() => {}} />);
    expect(html).toContain('出生地');
    expect(html).toContain('<optgroup label="台灣">');
    expect(html).toContain('<optgroup label="海外">');
    expect(html).toMatch(/<option value="taipei" selected="">臺北市<\/option>/);
    for (const label of ['精確', '約15分', '約1小時', '不知道']) expect(html).toContain(label);
  });

  const state: BirthFormState = {
    name: ' 測試 ', gender: 'male', calendar: 'solar', solarDate: '1995-07-16',
    lunar: { year: 1995, month: 6, day: 19, isLeap: false },
    time: { hour: 22, timeKnown: true }, accuracy: 'exact', clock: '22:10', cityId: 'tainan',
  };

  test('form state passes cityId and timeAccuracy to analyze', () => {
    const input = formToInput(state);
    expect(input).toMatchObject({ name: '測試', year: 1995, month: 7, day: 16, hour: 22, minute: 10, cityId: 'tainan', timeAccuracy: 'exact' });
    expect(formToInput({ ...state, clock: '', accuracy: 'approx1h' })).toMatchObject({ hour: 22, minute: 0, timeAccuracy: 'approx1h' });
    expect(formToInput({ ...state, accuracy: 'unknown' })).toMatchObject({ timeKnown: false, hour: 12, timeAccuracy: 'unknown' });
    // Extra fields are accepted by the current analyze().
    expect(analyze(input).input.year).toBe(1995);
  });

  test('recent queries keep cityId and timeAccuracy and drop invalid values', () => {
    const data = new Map<string, string>();
    const store = createReportStore({
      getItem: key => data.get(key) ?? null,
      setItem: (key, value) => { data.set(key, value); },
      removeItem: key => { data.delete(key); },
    });
    store.save(formToInput(state));
    expect(store.getLastInput()).toMatchObject({ cityId: 'tainan', timeAccuracy: 'exact', minute: 10 });
    store.save({ ...formToInput(state), cityId: '<script>', timeAccuracy: 'sometimes' as never });
    const last = store.getLastInput()!;
    expect(last.cityId).toBeUndefined();
    expect(last.timeAccuracy).toBeUndefined();
  });
});
