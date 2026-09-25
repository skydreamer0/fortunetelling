/**
 * 問 AI (D-035, V5-05): map a free-text question to a Question Engine category by
 * KEYWORDS ONLY (no AI), derive a month range, and run the deterministic
 * `answerQuestion` locally so the copy-paste prompt can carry the site's ranking.
 *
 * The SignalProvider is the same timeline layer the report uses: month cells of
 * `buildTimeline` (one call per calendar year in the range, every signal kept).
 */

import {
  answerQuestion, buildTimeline, getQuestionCategory,
  type CoreSignal, type QuestionAnswer, type QuestionRange, type SignalWindow, type TimeContext,
} from '../lib/core';
import type { Report } from './types';

/** Keyword → category. First category with a hit wins only if no other category also hits. */
export const QUESTION_KEYWORDS: ReadonlyArray<{ category: string; keywords: readonly string[] }> = [
  { category: 'vehicle_purchase', keywords: ['買車', '換車', '購車', '買新車', '汽車', '機車', '車子'] },
  { category: 'job_change', keywords: ['換工作', '轉職', '跳槽', '離職', '找工作', '新工作', '換跑道'] },
  { category: 'relationship_timing', keywords: ['感情', '戀愛', '對象', '告白', '結婚', '桃花', '交往', '伴侶', '脫單'] },
  { category: 'startup_timing', keywords: ['創業', '開店', '開公司', '成立公司', '自己當老闆'] },
  { category: 'property_purchase', keywords: ['買房', '購屋', '換房', '買屋', '房子', '房產'] },
  { category: 'relocation', keywords: ['搬家', '遷居', '搬到', '移居', '定居', '搬去'] },
  { category: 'study_exam', keywords: ['考試', '進修', '證照', '研究所', '升學', '讀書', '考研'] },
  { category: 'investment', keywords: ['投資', '進場', '股票', '理財', '基金', '加密貨幣'] },
];

/** The single category whose keywords appear in `text`, or null (none, or more than one). */
export function matchQuestionCategory(text: string): string | null {
  const hits = QUESTION_KEYWORDS.filter(entry => entry.keywords.some(keyword => text.includes(keyword)));
  return hits.length === 1 ? hits[0].category : null;
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymOf = (index: number) => `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
const indexOf = (year: number, month: number) => year * 12 + (month - 1);
const MAX_MONTHS = 36;

/**
 * Month range from the text, relative to `asOf` ('YYYY-MM-DD'); never before the asOf month.
 *   years named (2026、2027…) → first named year … last named year (cut at 36 months);
 *   今年 / 明年 / 後年 → those calendar years; 兩年 / 三年 → 24 / 36 months;
 *   otherwise → the next 12 months starting with the asOf month.
 */
export function questionRange(text: string, asOf: string): QuestionRange {
  const asOfYear = Number(asOf.slice(0, 4));
  const now = indexOf(asOfYear, Number(asOf.slice(5, 7)));
  const years = [...text.matchAll(/(20\d{2}|19\d{2})\s*年?/g)].map(m => Number(m[1]));
  if (/今年/.test(text)) years.push(asOfYear);
  if (/明年/.test(text)) years.push(asOfYear + 1);
  if (/後年/.test(text)) years.push(asOfYear + 2);

  let start = now;
  let end = now + 11;
  if (years.length > 0) {
    start = Math.max(now, indexOf(Math.min(...years), 1));
    end = indexOf(Math.max(...years), 12);
    if (end < start) { start = now; end = now + 11; }
  } else if (/(兩|二|2)\s*年/.test(text)) {
    end = now + 23;
  } else if (/(三|3)\s*年/.test(text)) {
    end = now + 35;
  }
  end = Math.min(end, start + MAX_MONTHS - 1);
  return { start: ymOf(start), end: ymOf(end) };
}

/** Month signals from the timeline layer, one `buildTimeline` per calendar year (cached). */
export function monthSignalProvider(report: Report): ((window: SignalWindow) => CoreSignal[]) | null {
  const ctx = report.timeContext as unknown as TimeContext | null | undefined;
  if (!ctx || !report.timeline) return null;
  const systems = report.timeline.systems;
  const asOfYear = Number(report.asOf.slice(0, 4));
  const byYear = new Map<number, Map<string, CoreSignal[]>>();
  const monthsOf = (year: number) => {
    let months = byYear.get(year);
    if (!months) {
      const tl = buildTimeline(ctx, {
        asOf: year === asOfYear ? report.asOf : `${year}-01-01`,
        years: 1, includeMonths: true, topSignalsPerDomain: Infinity, systems,
      });
      months = new Map();
      for (const cell of tl.months) {
        const byId = new Map<string, CoreSignal>();
        for (const domain of cell.domains) for (const signal of domain.topSignals) byId.set(signal.id, signal);
        months.set(cell.window.start.slice(0, 7), [...byId.values()]);
      }
      byYear.set(year, months);
    }
    return months;
  };
  return window => monthsOf(Number(window.start.slice(0, 4))).get(window.start.slice(0, 7)) ?? [];
}

export interface LocalQuestion {
  category: string;
  categoryName: string;
  range: QuestionRange;
  /** null when the report cannot provide month signals (old report, time unknown) or the engine failed. */
  answer: QuestionAnswer | null;
}

/** Keyword-mapped category + range + deterministic answer; null when no category matches. */
export function localQuestion(report: Report, text: string): LocalQuestion | null {
  const category = matchQuestionCategory(text);
  if (!category) return null;
  const range = questionRange(text, report.asOf);
  const categoryName = getQuestionCategory(category)?.name ?? category;
  const provider = monthSignalProvider(report);
  let answer: QuestionAnswer | null = null;
  if (provider) {
    try {
      answer = answerQuestion({ category, range }, provider);
    } catch {
      answer = null;
    }
  }
  return { category, categoryName, range, answer };
}
