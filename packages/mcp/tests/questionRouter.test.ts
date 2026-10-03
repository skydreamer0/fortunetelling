import { describe, expect, test } from 'bun:test';
import { listQuestionCategories } from '@fortune/core';
import { CATEGORY_KEYWORDS, routeQuestion } from '../src/questionRouter';

describe('question router (pure keywords)', () => {
  test('has keywords for exactly the categories core lists', () => {
    const ids = listQuestionCategories().map(c => c.id).sort();
    expect(Object.keys(CATEGORY_KEYWORDS).sort()).toEqual(ids);
    for (const kws of Object.values(CATEGORY_KEYWORDS)) {
      expect(kws.length).toBeGreaterThan(0);
      for (const k of kws) expect(k).toBe(k.toLowerCase());
    }
  });

  test.each([
    ['我明年想買車，哪幾個月好？', 'vehicle_purchase'],
    ['想換車', 'vehicle_purchase'],
    ['最近想換工作，什麼時候適合', 'job_change'],
    ['要不要轉職或跳槽', 'job_change'],
    ['今年有機會脫單嗎', 'relationship_timing'],
    ['什麼時候適合結婚', 'relationship_timing'],
    ['打算創業，何時開始', 'startup_timing'],
    ['想開店', 'startup_timing'],
    ['想買房，哪個月簽約', 'property_purchase'],
    ['購屋時機', 'property_purchase'],
    ['想搬家', 'relocation'],
    ['考慮移民', 'relocation'],
    ['準備考試，什麼時候報名', 'study_exam'],
    ['想出國留學', 'study_exam'],
    ['股票什麼時候進場', 'investment'],
    ['When should I invest?', 'investment'],
  ])('%s → %s', (question, category) => {
    const r = routeQuestion(question);
    expect(r.status).toBe('matched');
    if (r.status === 'matched') {
      expect(r.category).toBe(category);
      expect(r.matched.length).toBeGreaterThan(0);
    }
  });

  test('a keyword nested in a longer matched keyword counts once', () => {
    // "買新車" contains "新車": vehicle_purchase has one hit, not two, so the investment hit ties it.
    expect(routeQuestion('買新車還是投資').status).toBe('ambiguous');
  });

  test('no keyword → ambiguous with no candidates', () => {
    expect(routeQuestion('今天天氣如何')).toEqual({ status: 'ambiguous', candidates: [] });
  });

  test('tie between categories → ambiguous, lists the tied ones, never picks', () => {
    expect(routeQuestion('想買房也想搬家')).toEqual({ status: 'ambiguous', candidates: ['property_purchase', 'relocation'] });
  });

  test('a clear majority beats a stray hit', () => {
    const r = routeQuestion('想創業開店，順便看看股票');
    expect(r.status).toBe('matched');
    if (r.status === 'matched') expect(r.category).toBe('startup_timing');
  });
});
