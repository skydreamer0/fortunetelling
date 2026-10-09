import type { AbstentionReason, QuestionAnswer, QuestionAnswerV2, QuestionRange, QuestionStatus } from '@fortune/core';

/** The decision from the SAME category, range, systems and analysis as the answer being checked. */
export interface QuestionCheckContext {
  category: string;
  range: QuestionRange | null;
  catalogVersion: number;
  status: QuestionStatus;
  abstentionReasons: readonly AbstentionReason[];
}

/** Archived answers are readable, but cannot acquire a new ranking policy by implication. */
export function questionContextOf(answer: QuestionAnswer | QuestionAnswerV2): QuestionCheckContext {
  const current = answer as Partial<QuestionAnswer>;
  const known = ['ranked', 'tied', 'no_clear_advantage', 'insufficient_evidence', 'unsupported'].includes(current.status ?? '');
  return {
    category: answer.category, range: answer.range, catalogVersion: answer.catalogVersion,
    status: answer.unsupported ? 'unsupported' : known ? current.status! : 'insufficient_evidence',
    abstentionReasons: answer.unsupported
      ? [{ code: 'unsupported_category', message: '問事目錄不支援這個類別，無法提供月份排名。' }]
      : known ? (current.abstentionReasons ?? []).map(reason => ({ ...reason }))
        : [{ code: 'legacy_policy_missing', message: '這份舊問事結果沒有不排名政策與狀態；保留原始結果，重新計算前不提供月份推薦。' }],
  };
}

export type QuestionRecommendationIssue = 'month_recommendation_when_abstained' | 'question_context_missing';
const MONTH = /(?:\d{4}[-/]\d{1,2}(?!\d)|(?:\d{4}\s*年\s*)?(?:0?[1-9]|1[0-2]|[一二三四五六七八九十]{1,3})\s*月(?:份)?|\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b)/gi;
const RECOMMENDATION = /推薦|推荐|建議|建议|最?適合|最?适合|最佳|首選|首选|最有利|優先|优先|\b(?:recommend(?:ed)?|best|ideal|prefer(?:red)?)\b/gi;
const RECOMMENDATION_HEADING = /^(?:(?:推薦|推荐|建議|建议|最佳|首選|首选)(?:的)?(?:月份|時間|时间)|(?:recommended|best|ideal)\s+months?)$/i;

/** Only explicit recommendation headings carry across paragraphs; a new heading ends that scope. */
export function recommendationScopes(paragraphs: readonly string[], initial = false): boolean[] {
  let active = initial;
  return paragraphs.map(paragraph => {
    for (const line of paragraph.split('\n')) {
      const plain = line.trim().replace(/^#{1,6}\s*/, '').replace(/[*_`]/g, '').replace(/[：:]\s*$/, '').trim();
      if (RECOMMENDATION_HEADING.test(plain)) active = true;
      else if (/^\s*#{1,6}\s|[：:]\s*$/.test(line) || /^(?:資料限制|限制|說明|診斷|limitations|diagnostics)$/i.test(plain)) active = false;
    }
    return active;
  });
}

function negatedRecommendation(prefix: string): boolean {
  const plain = prefix.replace(MONTH, ' ').trim();
  const compact = plain.replace(/\s+/g, '');
  return /(?:不|未|無法|无法|不能|不可|不宜|沒有|没有|並非|并非|勿|避免|不要|不應|不应)(?:特別|特别|再|直接|明確|明确|認為|认为|說|说|作為|作为|是|屬於|属于|提供|太)?$/.test(compact)
    || /(?:無法|无法|不能|尚未|未能|不確定|不确定)(?:判定|判斷|判断|確認|确认|確定|确定|得知)?(?:是否|能否|可否)?$/.test(compact)
    || /(?:沒有|没有|缺乏|欠缺|缺少|不足)(?:足夠|足够|充分)?的?(?:資料|资料|證據|证据)(?:來|来|去|可以|支持)?$/.test(compact)
    || /(?:是否|能否|可否)$/.test(compact)
    || /(?:not|never|cannot|can't|do not|don't)\s*(?:necessarily\s+)?(?:the\s+)?$/i.test(plain)
    || /(?:no|not)\s+(?:enough|sufficient)\s+evidence\s+(?:to\s+)?$/i.test(plain);
}

/** Sentence-local association plus explicit heading scope, not general semantic understanding. */
export function monthRecommendations(text: string, inheritedHeading = false): string[] {
  const result: string[] = [];
  const paragraphs = text.replace(/\r\n?/g, '\n').split(/\n\s*\n/);
  const scopes = recommendationScopes(paragraphs, inheritedHeading);
  for (const [index, paragraph] of paragraphs.entries()) for (const sentence of paragraph.split(/[。！？!?；;]/)) {
    const sentenceMonths = sentence.match(MONTH) ?? [];
    if (!sentenceMonths.length) continue;
    let explicit = false;
    for (const clause of sentence.split(/[,，]|但是|不過|然而|但|\bbut\b|\bhowever\b/i)) {
      const recommendations = [...clause.matchAll(RECOMMENDATION)];
      explicit ||= recommendations.length > 0;
      const positive = recommendations.some(match => !negatedRecommendation(clause.slice(0, match.index)));
      // A comma does not end the sentence's month topic. A locally mentioned month wins,
      // so "do not recommend March, prefer April" never labels March as recommended.
      if (positive) result.push(...(clause.match(MONTH) ?? sentenceMonths));
    }
    if (scopes[index] && !explicit && !/無法|无法|不確定|不确定|是否|能否|證據不足|证据不足|not enough evidence/i.test(sentence)) {
      result.push(...sentenceMonths);
    }
  }
  return [...new Set(result)].sort();
}

export function questionRecommendationIssue(text: string, context?: QuestionCheckContext | null, recommendationHeading = false): { code: QuestionRecommendationIssue; values: string[]; detail: string } | null {
  const values = monthRecommendations(text, recommendationHeading);
  if (!values.length || context?.status === 'ranked') return null;
  return context
    ? { code: 'month_recommendation_when_abstained', values, detail: `問事引擎狀態為 ${context.status}，沒有提供月份排名，回答仍推薦月份。${context.abstentionReasons.map(reason => reason.message).join('')}` }
    : { code: 'question_context_missing', values, detail: '缺少同一問題的類別、範圍與採計系統所算出的問事狀態，無法核對月份推薦；請提供原問事 context。' };
}
