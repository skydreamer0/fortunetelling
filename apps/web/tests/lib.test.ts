import { describe, expect, test } from 'bun:test';
import { GLOSSARY, segmentGlossary } from '../src/lib/glossary';
import { COMPATIBILITY_STORE_KEY, MAX_RECENT_QUERIES, REPORT_STORE_KEY, createReportStore } from '../src/lib/store';
import { preferredTheme, THEME_STORE_KEY } from '../src/lib/theme';
import { niceMax, radarPoint } from '../src/components/ui/Radar';
import { representativeHour, shichenLabel } from '../src/components/input/fields';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
}

const INPUT = { year: 1991, month: 10, day: 5, hour: 14, gender: 'female' as const, name: '王小明' };

describe('report store', () => {
  test('saves, de-duplicates and clears recent queries', () => {
    const store = createReportStore(memoryStorage());
    expect(store.save(INPUT, { asOf: '2026-07-18' })).toBe(true);
    expect(store.save(INPUT, { asOf: '2026-07-19' })).toBe(true);
    expect(store.getRecent()).toHaveLength(1);
    expect(store.getLastInput()?.name).toBe('王小明');
    expect(store.clear()).toBe(true);
    expect(store.getRecent()).toEqual([]);
  });

  test('keeps at most eight entries, newest first, and survives corrupt data', () => {
    const storage = memoryStorage();
    const store = createReportStore(storage);
    for (let index = 0; index < 12; index += 1) store.save({ ...INPUT, name: `Person ${index}`, day: index + 1 });
    expect(store.getRecent()).toHaveLength(MAX_RECENT_QUERIES);
    expect(store.getRecent()[0].input.name).toBe('Person 11');
    storage.setItem(REPORT_STORE_KEY, '{broken');
    expect(store.getRecent()).toEqual([]);
  });

  test('keeps the compatibility pair under its own key', () => {
    const storage = memoryStorage();
    const store = createReportStore(storage);
    expect(store.saveCompatibility(INPUT, { ...INPUT, name: '李小華', year: 1986, gender: 'male' })).toBe(true);
    expect(store.getRecent()).toEqual([]);
    expect(store.getLastCompatibility()?.second.name).toBe('李小華');
    expect(storage.getItem(COMPATIBILITY_STORE_KEY)).not.toBeNull();
    store.clear();
    expect(store.getLastCompatibility()).toBeNull();
  });

  test('degrades safely when storage throws (e.g. Safari private mode)', () => {
    const fail = () => { throw new Error('QuotaExceededError'); };
    const store = createReportStore({ getItem: fail, setItem: fail, removeItem: fail });
    expect(store.save(INPUT)).toBe(false);
    expect(store.getRecent()).toEqual([]);
    expect(store.getLastCompatibility()).toBeNull();
    expect(store.clear()).toBe(false);
  });
});

describe('theme', () => {
  test('prefers the saved choice, then the system preference', () => {
    const storage = memoryStorage();
    expect(preferredTheme(storage, true)).toBe('dark');
    expect(preferredTheme(storage, false)).toBe('light');
    storage.setItem(THEME_STORE_KEY, 'light');
    expect(preferredTheme(storage, true)).toBe('light');
  });
});

describe('glossary', () => {
  test('marks the first occurrence of each term only', () => {
    const segments = segmentGlossary('命宮與身宮對照；命宮再次出現。');
    const terms = segments.filter(segment => typeof segment !== 'string');
    expect(terms.map(segment => typeof segment === 'string' ? '' : segment.term)).toEqual(['命宮', '身宮']);
    expect(segments.map(segment => typeof segment === 'string' ? segment : segment.term).join('')).toBe('命宮與身宮對照；命宮再次出現。');
  });

  test('prefers the longer term when terms overlap', () => {
    const [first] = segmentGlossary('化祿在此').filter(segment => typeof segment !== 'string');
    expect(first).toEqual({ term: '化祿', definition: GLOSSARY.化祿 });
  });

  test('covers the core Zi Wei, BaZi and timing vocabulary', () => {
    for (const term of ['四化', '命宮', '身宮', '十神', '日主', '大運', '大限', '流年', '喜用神']) {
      expect(GLOSSARY[term]).toBeString();
    }
  });
});

describe('radar geometry', () => {
  test('axis 0 points straight up and axes go clockwise', () => {
    expect(radarPoint(0, 4, 1, 100, 150).map(Math.round)).toEqual([150, 50]);
    expect(radarPoint(1, 4, 1, 100, 150).map(Math.round)).toEqual([250, 150]);
    expect(radarPoint(2, 4, 0.5, 100, 150).map(Math.round)).toEqual([150, 200]);
  });

  test('niceMax rounds up to tens within [floor, ceiling]', () => {
    expect(niceMax([12, 35.7, 8])).toBe(40);
    expect(niceMax([52.6])).toBe(60);
    expect(niceMax([140])).toBe(100);
    expect(niceMax([])).toBe(40);
  });
});

describe('時辰', () => {
  test('maps clock hours to the representative hour of their 時辰', () => {
    expect(representativeHour(23)).toBe(0);
    expect(representativeHour(0)).toBe(0);
    expect(representativeHour(1)).toBe(2);
    expect(representativeHour(14)).toBe(14);
    expect(representativeHour(15)).toBe(16);
    expect(shichenLabel(14)).toBe('未時');
  });
});
