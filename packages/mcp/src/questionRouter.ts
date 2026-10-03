/**
 * Pure keyword routing from a natural-language question to a question category (no LLM, no guessing).
 * A category wins only when it alone has the most distinct (non-nested) keyword hits; no hit or a tie is `ambiguous`
 * and the caller must ask for an explicit category.
 */

/** Keywords per category id (lower-case; matched as substrings of the lower-cased question). */
export const CATEGORY_KEYWORDS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  vehicle_purchase: ['買車', '购车', '購車', '换车', '換車', '買新車', '買二手車', '買汽車', '買機車', '買摩托車', '買電動車', '新車', '二手車', '車子', '汽車', '車輛', 'buy a car', 'car purchase', 'vehicle'],
  job_change: ['換工作', '转职', '轉職', '跳槽', '離職', '辭職', '找工作', '求職', '換跑道', '新工作', '換公司', 'job change', 'change jobs', 'quit my job', 'career change'],
  relationship_timing: ['感情', '戀愛', '恋爱', '脫單', '交往', '結婚', '婚姻', '告白', '桃花', '對象', '復合', '求婚', '另一半', 'relationship', 'dating', 'marriage', 'get married'],
  startup_timing: ['創業', '创业', '開店', '開公司', '開業', '當老闆', '新創', '創立', 'startup', 'start a business', 'open a shop'],
  property_purchase: ['買房', '购房', '購屋', '買屋', '購房', '置產', '買不動產', '預售屋', '買新房', 'buy a house', 'buy a home', 'property purchase'],
  relocation: ['搬家', '搬遷', '遷居', '移居', '移民', '搬到', '換環境', '出國定居', 'relocat', 'move house', 'moving to'],
  study_exam: ['考試', '考试', '進修', '讀書', '升學', '考研', '考證照', '考照', '留學', '學位', '考研究所', 'exam', 'study'],
  investment: ['投資', '投资', '理財', '股票', '買股', '基金', '加密貨幣', '買幣', 'etf', 'invest', 'stock'],
});

export type RouteResult =
  | { status: 'matched'; category: string; matched: string[] }
  | { status: 'ambiguous'; candidates: string[] };

export function routeQuestion(question: string, table: Readonly<Record<string, readonly string[]>> = CATEGORY_KEYWORDS): RouteResult {
  const text = question.toLowerCase();
  const hits = Object.entries(table)
    .map(([category, keywords]) => {
      const found = keywords.filter(k => text.includes(k));
      // a keyword inside another matched keyword ('新車' in '買新車') is the same hit, not two
      return { category, matched: found.filter(k => !found.some(o => o !== k && o.includes(k))) };
    })
    .filter(h => h.matched.length > 0);
  if (hits.length === 0) return { status: 'ambiguous', candidates: [] };
  const best = Math.max(...hits.map(h => h.matched.length));
  const top = hits.filter(h => h.matched.length === best);
  if (top.length === 1) return { status: 'matched', category: top[0].category, matched: top[0].matched };
  return { status: 'ambiguous', candidates: top.map(h => h.category) };
}
