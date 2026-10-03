/**
 * answer_question 的精簡回傳（預設）：前 3 名＋精簡排名表。
 * 所有文字都由固定模板產生（不經 LLM），排名與分數直接取自 core 的 QuestionAnswer，
 * 所以與 detail: true 的完整結構逐筆一致。
 */

import type { Domain, DomainScore, ExperimentalSensitivity, QuestionAnswer, RankedWindow } from '@fortune/core';

/** 領域的台灣繁中名稱（與網站時間軸用語一致）。 */
export const DOMAIN_LABELS: Readonly<Record<Domain, string>> = Object.freeze({
  self: '自我',
  career: '事業',
  wealth: '財運',
  relationship: '感情',
  family: '家庭',
  movement: '移動',
  property: '不動產',
  learning: '學習',
  contract: '合約',
  health: '身心',
});

/** 精簡版每名最多引用的訊號 id 數。 */
export const COMPACT_SIGNAL_IDS = 3;

const fmt1 = (x: number) => String(Math.round(x * 10) / 10);
const month = (r: RankedWindow) => r.window.start.slice(0, 7);

/**
 * 領域一行摘要，例：「財運 58.3：活躍70.2／支撐52.1／風險6／共識2／有矛盾」
 * （共識 = 該領域分數達門檻的系統數；數字取小數 1 位，精確值見 detail: true）。
 */
export function domainLine(d: DomainScore): string {
  const label = DOMAIN_LABELS[d.domain] ?? d.domain;
  if (d.signalIds.length === 0) return `${label} 0：無訊號`;
  return `${label} ${fmt1(d.score)}：活躍${fmt1(d.activity)}／支撐${fmt1(d.support)}／風險${fmt1(d.risk)}／共識${d.consensus}${d.conflict ? '／有矛盾' : ''}`;
}

/**
 * 最多 3 個訊號 id：支撐訊號最強 2 個＋風險訊號最強 1 個；不足時依序以其餘支撐、
 * 其餘風險、再其餘訊號（id 排序）補滿。全部取自該月實際採計的訊號，可用 get_signal 查到。
 */
export function pickSignalIds(r: RankedWindow, n = COMPACT_SIGNAL_IDS): string[] {
  const support = r.supportSignals.map(s => s.id);
  const risk = r.riskSignals.map(s => s.id);
  const order = [...support.slice(0, 2), ...risk.slice(0, 1), ...support.slice(2), ...risk.slice(1), ...r.signalIds];
  return [...new Set(order)].slice(0, n);
}

/** 固定模板的一句話理由。 */
export function oneLine(r: RankedWindow): string {
  const head = `${month(r)} 第 ${r.rank} 名，分數 ${fmt1(r.score)}（${r.band}）`;
  if (r.signalIds.length === 0) return `${head}：這個月相關領域沒有任何訊號。`;
  let best: DomainScore | null = null;
  for (const d of r.domainScores) if (!best || d.score > best.score) best = d;
  const parts = [`${DOMAIN_LABELS[best!.domain] ?? best!.domain}最突出（${fmt1(best!.score)}）`];
  parts.push(`支撐訊號 ${r.supportSignals.length} 筆、風險訊號 ${r.riskSignals.length} 筆`);
  if (r.conflict) parts.push(`${r.conflict.map(c => DOMAIN_LABELS[c.domain] ?? c.domain).join('、')}有系統矛盾`);
  if (r.highConsensus) parts.push('有高共識領域');
  return `${head}：${parts.join('；')}。`;
}

function compactTop(r: RankedWindow) {
  return {
    rank: r.rank,
    month: month(r),
    score: r.score,
    band: r.band,
    highConsensus: r.highConsensus,
    domains: r.domainScores.map(domainLine),
    signalIds: pickSignalIds(r),
    oneLine: oneLine(r),
  };
}

export const RANKING_COLUMNS = ['month', 'score', 'band'] as const;

/** 預設精簡版：前 3 名（各含一行理由）與 [月份, 分數, band] 排名表。 */
export function compactAnswer(answer: QuestionAnswer) {
  return {
    category: answer.category,
    range: answer.range,
    top: answer.top.map(compactTop),
    rankingColumns: RANKING_COLUMNS,
    ranking: answer.ranking.map(r => [month(r), r.score, r.band] as const),
    catalogVersion: answer.catalogVersion,
    ...(answer.categoryVersion !== undefined ? { categoryVersion: answer.categoryVersion } : {}),
    detailOmitted: true as const,
  };
}

/**
 * 敏感度的回傳形狀：前 3 名的月份與分數（band 可由排名表或 detail 取得）。
 * `verifiedSystems` 是「僅已驗證系統」那次採計的系統；含實驗性系統那次 = 它再加上 systemsUsed 裡的實驗性系統。
 */
export function sensitivityOut(s: ExperimentalSensitivity) {
  const pick = (xs: ExperimentalSensitivity['top3All']) => xs.map(x => ({ month: x.month, score: x.score }));
  return {
    top3All: pick(s.top3All),
    top3VerifiedOnly: pick(s.top3VerifiedOnly),
    changed: s.changed,
    verifiedSystems: s.systemsVerifiedOnly,
  };
}

/** changed 時加入 caveats 的提醒（台灣繁中）。 */
export function sensitivityCaveat(s: ExperimentalSensitivity): { code: string; message: string } | null {
  if (!s.changed) return null;
  const list = (xs: { month: string }[]) => (xs.length ? xs.map(x => x.month).join('、') : '（無）');
  return {
    code: 'experimental_sensitive',
    message:
      `結論取決於尚未驗證的系統：含吠陀占星 Jyotish、人類圖 Human Design 時前 3 名為 ${list(s.top3All)}，` +
      `僅已驗證系統為 ${list(s.top3VerifiedOnly)}。不可當成穩定結論，回答時須明講。`,
  };
}
