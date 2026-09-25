import { describe, expect, test } from 'bun:test';
import { buildBacktestTimeline, runBacktest, type LifeEvent, type TimeContext } from '@fortune/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { BacktestResults, LifeEvents } from '../src/components/report/LifeEvents';
import { CHAPTERS, ReportView } from '../src/components/report/ReportView';
import { analyze } from '../src/lib/core';
import { LIFE_EVENTS_STORE_KEY, cleanEvents, createLifeEventStore, profileKeyOf } from '../src/lib/lifeEvents';
import { INSUFFICIENT_LABEL, canBacktest, selectBacktestView, selectEventList } from '../src/model/backtest';
import type { BirthInput, Report } from '../src/model/types';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
}

const INPUT: BirthInput = {
  name: '', year: 1995, month: 7, day: 16, hour: 22, minute: 0, timeKnown: true,
  gender: 'male', calendarType: 'solar', cityId: 'tainan', timeAccuracy: 'exact',
};
const report: Report = analyze(INPUT);
const key = profileKeyOf(report.input);

const EVENTS: LifeEvent[] = [
  { id: 'a', date: '2018-06', category: 'education', domains: ['career', 'movement', 'learning'], description: '畢業／北上／醫院藥局', confidence: 'approx' },
  { id: 'b', date: '2022-06', category: 'job_change', domains: ['career'], description: '化療藥局', confidence: 'approx' },
  { id: 'c', date: '2024-06', category: 'job_change', domains: ['career', 'contract'], description: '離職', confidence: 'approx' },
  { id: 'd', date: '2025-06', category: 'job_change', domains: ['career', 'contract'], description: '藥廠', confidence: 'approx' },
  { id: 'e', date: '2026-06', category: 'relocation', domains: ['career', 'movement'], description: '回台南／KAM', confidence: 'approx' },
];

describe('life event store (localStorage, per profile fingerprint)', () => {
  test('persists per profile, survives a new store instance, rejects invalid events', () => {
    const storage = memoryStorage();
    const store = createLifeEventStore(storage);
    for (const event of EVENTS) expect(store.upsert(key, event)).toBe(true);
    expect(store.upsert(key, { ...EVENTS[0], id: 'bad', date: '2018' })).toBe(false);
    expect(store.upsert('other', EVENTS[1])).toBe(true);
    const reopened = createLifeEventStore(storage);
    expect(reopened.list(key).map(event => event.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(reopened.list('other')).toHaveLength(1);
    // edit = upsert with the same id
    reopened.upsert(key, { ...EVENTS[1], description: '化療調劑' });
    expect(reopened.list(key).find(event => event.id === 'b')!.description).toBe('化療調劑');
    expect(reopened.remove(key, 'c')).toBe(true);
    expect(reopened.list(key).map(event => event.id)).toEqual(['a', 'b', 'd', 'e']);
  });

  test('刪除全部 clears one profile; clearAll removes the key; corrupt data reads as empty', () => {
    const storage = memoryStorage();
    const store = createLifeEventStore(storage);
    EVENTS.forEach(event => store.upsert(key, event));
    store.upsert('other', EVENTS[0]);
    expect(store.clearProfile(key)).toBe(true);
    expect(store.list(key)).toEqual([]);
    expect(store.list('other')).toHaveLength(1);
    store.clearProfile('other');
    expect(storage.data.has(LIFE_EVENTS_STORE_KEY)).toBe(false);
    store.upsert(key, EVENTS[0]);
    expect(store.clearAll()).toBe(true);
    expect(storage.data.has(LIFE_EVENTS_STORE_KEY)).toBe(false);
    storage.setItem(LIFE_EVENTS_STORE_KEY, '{broken');
    expect(store.list(key)).toEqual([]);
    expect(cleanEvents([EVENTS[1], EVENTS[0], EVENTS[0], { junk: true }]).map(event => event.id)).toEqual(['a', 'b']);
  });

  test('no storage (private mode) → writes report failure instead of throwing', () => {
    const store = createLifeEventStore(undefined);
    expect(store.upsert(key, EVENTS[0])).toBe(false);
    expect(store.list(key)).toEqual([]);
  });

  test('profile key is stable, hashed, and differs between people', () => {
    expect(profileKeyOf(report.input)).toBe(key);
    expect(key).toMatch(/^p[0-9a-z]+$/);
    expect(key).not.toContain('1995');
    expect(profileKeyOf({ ...report.input, day: 17 })).not.toBe(key);
  });
});

describe('人生事件 panel', () => {
  test('is a chapter right after 時序, with a privacy note and an empty state', () => {
    const index = CHAPTERS.findIndex(chapter => chapter.id === 'ch-events');
    expect(CHAPTERS[index - 1].id).toBe('ch-timeline');
    const html = renderToStaticMarkup(<ReportView report={report} onBack={() => {}} />);
    expect(html).toContain('id="ch-events"');
    expect(html.indexOf('id="ch-timeline"')).toBeLessThan(html.indexOf('id="ch-events"'));
    expect(html).toContain('只存在這個瀏覽器');
    expect(html).toContain('還沒有事件');
  });

  test('lists stored events for this profile with edit / delete and 刪除全部', () => {
    const store = createLifeEventStore(memoryStorage());
    EVENTS.forEach(event => store.upsert(key, event));
    const html = renderToStaticMarkup(<LifeEvents report={report} store={store} />);
    expect(html).toContain('2018-06（約）');
    expect(html).toContain('學業／畢業・事業、移動、學習：畢業／北上／醫院藥局');
    expect(html).toContain('刪除全部');
    expect((html.match(/>編輯</g) ?? []).length).toBe(5);
    expect(html).toContain('計算回驗');
    expect(selectEventList(EVENTS)[2]).toEqual({ id: 'c', date: '2024-06', category: '工作變動', domains: '事業、合約', description: '離職', approx: true });
  });

  test('v3 report without time context → no backtest button', () => {
    const { timeContext: _t, ...rest } = report;
    const v3: Report = { ...rest, schemaVersion: 3 };
    expect(canBacktest(v3)).toBe(false);
    const store = createLifeEventStore(memoryStorage());
    store.upsert(profileKeyOf(v3.input), EVENTS[0]);
    const html = renderToStaticMarkup(<LifeEvents report={v3} store={store} />);
    expect(html).not.toContain('計算回驗');
    expect(html).toContain('重新排盤');
  });

  test('results: per-domain hit rate vs baseline, all labelled 樣本不足，僅供參考, no predictive claim', () => {
    const tl = buildBacktestTimeline(report.timeContext as unknown as TimeContext, {
      asOf: report.asOf, systems: ['bazi', 'ziwei', 'numerology'],
    });
    const view = selectBacktestView(runBacktest(EVENTS, tl, { seed: key }));
    expect(view.allInsufficient).toBe(true);
    expect(view.domains.map(row => row.key)).toEqual(['career', 'movement', 'learning', 'contract']);
    expect(view.domains.every(row => row.status === INSUFFICIENT_LABEL)).toBe(true);
    expect(view.domains[0].n).toBe(5);
    expect(view.domains[0].baseline).toMatch(/^\d+%$/);
    const html = renderToStaticMarkup(<BacktestResults view={view} />);
    expect(html).toContain(INSUFFICIENT_LABEL);
    expect(html).toContain('基準線');
    expect(html).toContain('不代表預測能力');
    expect(html).not.toMatch(/準確率|預測成功|證實/);
  });
});
