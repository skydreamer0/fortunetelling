/**
 * Copy-paste prompt (D-035, V5-05; ARCHITECTURE-V2 §9).
 *
 * `buildCopyPrompt(report, opts)` assembles ONE self-contained 繁體中文 block the
 * user pastes into any chat AI (ChatGPT, Claude, Gemini…). No API key, no server:
 * the site never talks to a model, the user decides what to share.
 *
 * The block contains, in order:
 *   (a) role + rules adapted from the §9 system prompt (data only, no re-derivation,
 *       〔sig_…〕 citations, 「高共識」 needs ≥ 3 systems, keep contradictions,
 *       tendencies not fate, uncalibrated scores (D-033), say so when data can't answer);
 *   (b) the output format (markdown headings);
 *   (c) the de-identified data (D-029) — `buildInterpretationPayload` with a chat-sized
 *       budget; charts are summarised / dropped and the lowest-intensity signals are
 *       dropped first, and the prompt says what was left out;
 *   (d) the user's question, plus the site's deterministic Question Engine ranking
 *       (clearly labelled as computed by the site, not by an AI).
 *
 * Pure and deterministic (D-014): same report + options → same text.
 * Browser-safe: must never import the Anthropic SDK (`./client`, `./anthropic`).
 */
import type { QuestionAnswer, Signal, Timeline, TimelineCell } from '@fortune/core';
import { listQuestionCategories } from './core-pure';
import {
  buildInterpretationPayload,
  scrub,
  sensitiveStrings,
  type BuiltPayload,
  type InterpretationPayload,
  type ReportEngineLike,
  type ReportLike,
} from './payload';

export const COPY_PROMPT_VERSION = 'copy-v1';
/** Default size of the whole paste-ready text (characters). Fits common chat input limits. */
export const DEFAULT_COPY_MAX_CHARS = 24_000;

export type CopyPromptFocus = 'overview' | 'year' | 'question';

export interface CopyPromptOptions {
  /** Free-text question typed by the user (optional). */
  question?: string;
  /** Deterministic Question Engine answer computed by the site (optional). */
  questionAnswer?: QuestionAnswer | null;
  /** Default: 'question' when a question is given, else 'overview'. */
  focus?: CopyPromptFocus;
  /** Maximum length of the whole text, default 24 000. */
  maxChars?: number;
  lang?: 'zh-Hant';
}

export interface CopyPrompt {
  text: string;
  charCount: number;
  /** True when anything was left out to fit `maxChars` (signals, chart detail, months). */
  truncated: boolean;
  promptVersion: string;
  /** The payload embedded in the text — pass it to `checkPastedAnswer` to check the reply. */
  payload: BuiltPayload;
}

// ─── fixed text ─────────────────────────────────────────────────────────────

const DOMAIN_GLOSSARY =
  'self 自我、career 事業、wealth 財務、relationship 感情、family 家庭、movement 移動、property 居住與不動產、learning 學習、contract 合約、health 健康';
const SYSTEM_GLOSSARY =
  'bazi 八字、ziwei 紫微斗數、numerology 靈數、jyotish 印度占星、humanDesign 人類圖、mingGua 八宅命卦、tzolkin／dreamspell 馬雅曆';

function rulesBlock(): string {
  return `## 規則（請嚴格遵守）
1. 只使用下方「資料」區塊的內容。不要重新排盤或推算：不得自行計算、補充或更正任何干支、四柱、大運、流年、星曜、四化、宮位、行星位置、星座、宿；資料中沒有出現的干支、星曜、行星名稱一律不要提。提到紫微斗數這套系統時請寫全名「紫微斗數」。
2. 每個重要結論都要在句末標註引用的訊號 id，格式為〔sig_xxxxxxxxxxxxxxxx〕，逐字複製 signals[].id；可以連續列多個，例如〔sig_…〕〔sig_…〕。不得編造或改寫 id；沒有訊號支撐的內容不要寫。timeline 與 question 內出現的 id 都指向 signals。
3. 只有同一領域、同一時間窗有三套以上不同系統（signals[].system）的訊號同向時，才可以說「高共識」，並引用這些系統的訊號；兩套以下請寫「部分系統」或指明是哪一套系統。
4. 系統之間方向相反（valence 一正一負，或 conflict 欄位有值）時，必須保留矛盾並說明雙方各自的依據，不得擇一，也不得平均成中性。
5. 分數（score 0–100）與 band（低／中／中高／高）是未校準的研究用相對指標：只平均有發出訊號的系統，不同領域、不同年份的分數不可直接比較，也不是機率或準確度。提到分數時請說明這一點。
6. 大運、流年、流月等隨時間變動的內容只是「傾向」，不是命定：請用「這段時期」「可能」「傾向」等語氣。不要寫「你是……」（包括「你是否」）、「你天生」、「注定」、「永遠」、「絕對」、「一定會」、「從不」；不要用吉／凶、大吉、大凶、凶兆、劫數、必定等宿命論用語，改為描述特徵（變動、壓力、支撐、機會）與可以採取的行動。
7. 資料無法回答的事，請直接說「這份資料無法回答」並說明缺少什麼，不要自行發揮或用一般命理知識補上。
8. 不做醫療、法律、投資的確定建議；涉及健康或財務時只描述訊號代表的傾向，並建議諮詢專業人士。
9. 資料已去識別化（沒有姓名、出生地、出生日期時間），請不要詢問或推測這些個人資料。`;
}

function formatBlock(focus: CopyPromptFocus, hasQuestion: boolean, hasRanking: boolean, asOfYear: string | null): string {
  const headings = ['## 總覽', '## 本年與未來五年', '## 各領域', '## 共識與分歧'];
  if (hasQuestion) headings.push('## 問題的回答');
  headings.push('## 資料限制');
  const year = asOfYear ?? '本年';
  const emphasis =
    focus === 'year'
      ? `重點放在「本年與未來五年」：先寫 ${year} 年（含資料中的逐月 months），再逐年寫之後幾年；其他各節精簡（每節 1～3 句）。`
      : focus === 'question' && hasQuestion
        ? hasRanking
          ? '重點放在「問題的回答」：依網站計算的月份排名說明各月份的支持與風險訊號，再補充相反的訊號；其他各節精簡（每節 1～3 句）。'
          : '重點放在「問題的回答」：從資料中找出與問題相關的領域與時間；資料無法回答的部分請直說。其他各節精簡（每節 1～3 句）。'
        : '各節篇幅平均，先講整體傾向，再講時間與領域。';
  return `## 輸出格式
請用 Markdown 依序輸出以下標題（不要增加其他一級內容）：
${headings.join('\n')}
- 每一段的重要說法後面都要附〔sig_…〕引用；「資料限制」一節說明省略了哪些資料、分數未校準、哪些系統沒有資料。
- ${emphasis}
- 「共識與分歧」：列出三套以上系統同向的地方（才可稱「高共識」），以及系統之間方向相反的地方，兩邊都要引用。${
    hasQuestion
      ? `\n- 「問題的回答」：只根據資料回答${hasRanking ? '；網站的月份排名是程式計算的結果，請不要自行重新排名' : ''}。`
      : ''
  }`;
}

function dataGuide(asOf: string | null): string {
  return `## 資料說明
- 基準日（asOf）：${asOf ?? '未提供'}。「本年」指基準日所在的年份。
- profile：只有性別、出生時間精度與時區。charts：各系統的命盤計算結果。signals[]：規則產生的訊號，欄位 id、system、ruleId、domain、trait、intensity（強度 0–1）、valence（方向 −1～+1）、window（生效期間）、evidence.text（依據）。
- timeline.years／timeline.months：每個時間格、各領域的分數（score）、band、共識系統數（consensus）、是否高共識（highConsensus）、發出訊號的系統（systems）、矛盾（conflict）與該格最強的訊號 id（topSignalIds）。
- question（若有）：網站 Question Engine 以程式計算的月份排名，supportSignalIds 為支持訊號、riskSignalIds 為風險訊號。
- signals 與 months 只列基準月起的月份（之前的月份已過去，未提供）。
- domain 對照：${DOMAIN_GLOSSARY}。
- system 對照：${SYSTEM_GLOSSARY}。`;
}

// ─── report trimming (chat-sized input) ─────────────────────────────────────

/**
 * Levels, tried in order until the payload fits with enough signals:
 *   0 full charts; 1 chart summaries (bulky per-palace / per-period components
 *   dropped); 2 no charts; 3 no charts, no months, 1 top id per cell; 4 signals only
 *   (no timeline). If no level keeps enough signals, the one keeping the most wins.
 */
const LEVELS = [0, 1, 2, 3, 4] as const;
type Level = (typeof LEVELS)[number];
/** Accept a level once at least this many signals (or all of them) fit. */
const MIN_SIGNALS = 20;
/** …and the timeline is dropped (level 4) only when no level with it keeps this many. */
const MIN_FALLBACK_SIGNALS = 8;
const TOP_IDS_PER_CELL: Record<Level, number> = { 0: 3, 1: 3, 2: 2, 3: 1, 4: 0 };
const QUESTION_SIGNALS_PER_SIDE = 4;
/** Components kept at level 1 (summaries and current state; per-palace / per-period details dropped). */
const SUMMARY_COMPONENT =
  /^(natal|day_master|elements|ten_gods|liuNian|natal_summary|mutagen_.+|xiaoXian_current|flyingStars_yearly|life_path|personal_year|personal_month|birthday_number|ming_gua|kin|tone|seal)$/;

function trimEngines(engines: ReportEngineLike[] | undefined, level: Level): ReportEngineLike[] {
  if (level >= 2) return [];
  return (engines ?? []).map((e) =>
    level === 0 ? e : { ...e, components: (e.components ?? []).filter((c) => SUMMARY_COMPONENT.test(c.id)) },
  );
}

function trimCells(cells: TimelineCell[] | undefined, topN: number): TimelineCell[] {
  return (cells ?? []).map((cell) => ({
    ...cell,
    domains: cell.domains.map((d) => ({ ...d, topSignals: (d.topSignals ?? []).slice(0, topN) })),
  }));
}

function trimTimeline(tl: Timeline | null | undefined, asOf: string | null, level: Level): Timeline | null {
  if (!tl || level >= 4) return null;
  const monthStart = asOf ? `${asOf.slice(0, 7)}-01` : '';
  const months = level >= 3 ? [] : (tl.months ?? []).filter((c) => c.window.start >= monthStart);
  const topN = TOP_IDS_PER_CELL[level];
  return { ...tl, years: trimCells(tl.years, topN), months: trimCells(months, topN) };
}

/** Keep only timeline top-signal references whose signal is in `keep`. */
function restrictTopSignals(report: ReportLike, keep: Set<string>): ReportLike {
  const tl = report.timeline;
  if (!tl) return report;
  const cells = (cs: TimelineCell[]) =>
    cs.map((c) => ({ ...c, domains: c.domains.map((d) => ({ ...d, topSignals: (d.topSignals ?? []).filter((x) => keep.has(x.id)) })) }));
  return { ...report, timeline: { ...tl, years: cells(tl.years ?? []), months: cells(tl.months ?? []) } };
}

function trimQuestion(answer: QuestionAnswer | null | undefined): QuestionAnswer | null {
  if (!answer) return null;
  return {
    ...answer,
    ranking: [],
    top: (answer.top ?? []).map((w) => ({
      ...w,
      supportSignals: w.supportSignals.slice(0, QUESTION_SIGNALS_PER_SIDE) as Signal[],
      riskSignals: w.riskSignals.slice(0, QUESTION_SIGNALS_PER_SIDE) as Signal[],
    })),
  };
}

/** Month signals that ended before the asOf month (already past) are not sent. */
function currentSignals(signals: Signal[] | undefined, asOf: string | null): Signal[] | undefined {
  if (!signals || !asOf) return signals;
  const monthStart = `${asOf.slice(0, 7)}-01`;
  return signals.filter((s) => s.window?.grain !== 'month' || s.window.end >= monthStart);
}

function trimReport(report: ReportLike, level: Level): ReportLike {
  return {
    schemaVersion: report.schemaVersion,
    asOf: report.asOf,
    input: report.input,
    timeContext: report.timeContext,
    engines: trimEngines(report.engines, level),
    signals: currentSignals(report.signals, report.asOf ?? null),
    timeline: trimTimeline(report.timeline, report.asOf ?? null, level),
  };
}

// ─── assembly ───────────────────────────────────────────────────────────────

const round2 = (x: number) => Math.round(x * 100) / 100;

function truncationNote(p: InterpretationPayload, level: Level, monthsDropped: boolean): string | null {
  const parts: string[] = [];
  const t = p.truncation;
  if (t.signalsDropped > 0) {
    parts.push(
      `signals 只保留強度最高的 ${t.signalsKept}／${t.signalsTotal} 個（被省略的訊號強度都 ≤ ${round2(t.droppedMaxIntensity ?? 0)}）`,
    );
  }
  if (level === 1) parts.push('命盤（charts）只保留摘要，省略逐宮、逐步大運等細節');
  if (level === 2 || level === 3) parts.push('未附命盤細節（charts），只有訊號與時間表');
  if (level >= 4) parts.push('未附命盤細節（charts）與時間表（timeline），只有訊號');
  if (monthsDropped) parts.push('未附逐月資料（months）');
  if (t.overBudget) parts.push('即使如此仍超過長度上限');
  if (parts.length === 0) return null;
  return `為符合聊天輸入長度，資料已精簡：${parts.join('；')}。請不要猜測被省略的內容，並在「資料限制」一節說明。`;
}

function ym(date: string): string {
  return date.slice(0, 7);
}

function questionBlock(question: string | null, p: InterpretationPayload): string | null {
  const q = p.question;
  if (!question && !q) return null;
  const lines: string[] = ['## 使用者的問題'];
  lines.push(question ? `「${question}」` : '（使用者沒有輸入文字，只選了下列問事類別。）');
  if (q) {
    const cat = listQuestionCategories().find((c) => c.id === q.category);
    lines.push('');
    lines.push('### 網站計算的月份排名（Question Engine 確定性計算，不是 AI 產生）');
    if (q.unsupported) {
      lines.push('網站的問事目錄不支援這類問題，沒有月份排名。');
    } else {
      const range = q.range ? `；範圍 ${q.range.start}～${q.range.end}` : '';
      lines.push(`類別：${cat?.name ?? q.category}（${q.category}）${range}；問事目錄版本 ${q.catalogVersion}。`);
      if (q.top.length === 0) lines.push('（範圍內沒有可排名的月份。）');
      for (const w of q.top) {
        const cite = (ids: string[]) => (ids.length ? ids.map((id) => `〔${id}〕`).join('') : '無');
        const conflict = w.conflict && w.conflict.length ? `；有系統間矛盾（${w.conflict.map((c) => c.domain).join('、')}）` : '';
        lines.push(
          `${w.rank}. ${ym(w.window.start)}：分數 ${w.score}（${w.band}，未校準）、共識 ${w.consensus} 套系統${
            w.highConsensus ? '（高共識）' : ''
          }${conflict}；支持 ${cite(w.supportSignalIds)}；風險 ${cite(w.riskSignalIds)}`,
        );
      }
      lines.push('分數只在同一問題的月份之間比較，請以這份排名為準，不要自行重新排名；可以說明排名依據與相反的訊號。');
    }
  } else {
    lines.push('（網站沒有為這個問題計算月份排名；請只根據上方資料回答，資料無法回答的部分請直說。）');
  }
  return lines.join('\n');
}

function assemble(parts: {
  focus: CopyPromptFocus;
  question: string | null;
  payload: BuiltPayload;
  note: string | null;
}): string {
  const p = parts.payload.payload;
  const hasQuestion = Boolean(parts.question || p.question);
  const asOf = p.report.asOf;
  const blocks = [
    `# 命理報告解讀請求（${COPY_PROMPT_VERSION}）`,
    '你是一位謹慎、誠實的命理報告解讀者。下方「資料」是一個命理網站用程式確定性計算好的結果（多套系統的命盤、訊號與分數），已經去除姓名、出生地與出生日期時間。請只根據這份資料，用繁體中文寫出清楚、可追溯的解讀。',
    rulesBlock(),
    formatBlock(parts.focus, hasQuestion, Boolean(p.question && !p.question.unsupported), asOf ? asOf.slice(0, 4) : null),
    dataGuide(asOf),
    `## 資料（JSON）\n${parts.note ?? '資料完整：沒有省略訊號。'}\n\`\`\`json\n${parts.payload.payloadJson}\n\`\`\``,
  ];
  const qb = questionBlock(parts.question, p);
  if (qb) blocks.push(qb);
  blocks.push('請開始解讀。');
  return blocks.join('\n\n');
}

/** Normalise the free-text question: trim, collapse whitespace, cap length, redact name/birthplace. */
function cleanQuestion(text: string | undefined, secrets: string[]): string | null {
  const t = (text ?? '').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (!t) return null;
  return scrub(t, secrets) as string;
}

export function buildCopyPrompt(report: ReportLike, options: CopyPromptOptions = {}): CopyPrompt {
  const maxChars = options.maxChars ?? DEFAULT_COPY_MAX_CHARS;
  const secrets = sensitiveStrings(report);
  const question = cleanQuestion(options.question, secrets);
  const answer = trimQuestion(options.questionAnswer);
  const focus: CopyPromptFocus = options.focus ?? (question || answer ? 'question' : 'overview');
  const hadMonths = (report.timeline?.months ?? []).some((c) => !report.asOf || c.window.end >= report.asOf);

  type Candidate = { built: BuiltPayload; level: Level; text: string; fits: boolean };
  const candidates: Candidate[] = [];
  let chosen: Candidate | null = null;
  for (const level of LEVELS) {
    const monthsDropped = hadMonths && level >= 3;
    let trimmed = trimReport(report, level);
    // Size of everything except the JSON, with a worst-case truncation note.
    const probe = buildInterpretationPayload(trimmed, { question: answer, maxChars: 0 });
    const worst = { ...probe.payload.truncation, signalsKept: 99999, signalsTotal: 99999, droppedMaxIntensity: 0.99, overBudget: true };
    const worstNote = truncationNote({ ...probe.payload, truncation: worst }, level, monthsDropped);
    let budget = maxChars - assemble({ focus, question, payload: { ...probe, payloadJson: '' }, note: worstNote }).length;
    const render = (b: BuiltPayload) =>
      assemble({ focus, question, payload: b, note: truncationNote(b.payload, level, monthsDropped) });

    let built = buildInterpretationPayload(trimmed, { question: answer, maxChars: Math.max(0, budget) });
    // Timeline cells list top ids of signals that may be dropped; restricting them to the
    // kept set shrinks the fixed part so more signals fit. Kept sets only grow → converges.
    for (let pass = 0; pass < 4; pass += 1) {
      const restricted = restrictTopSignals(trimmed, built.signalIds);
      const next = buildInterpretationPayload(restricted, { question: answer, maxChars: Math.max(0, budget) });
      if (next.signalIds.size < built.signalIds.size) break;
      const grew = next.signalIds.size > built.signalIds.size;
      trimmed = restricted;
      built = next;
      if (!grew) break;
    }
    let text = render(built);
    // Safety net: shrink the JSON budget until the whole text fits.
    for (let i = 0; i < 5 && text.length > maxChars && budget > 0; i += 1) {
      budget -= text.length - maxChars;
      built = buildInterpretationPayload(trimmed, { question: answer, maxChars: Math.max(0, budget) });
      text = render(built);
    }
    const t = built.payload.truncation;
    const fits = !t.overBudget && text.length <= maxChars;
    candidates.push({ built, level, text, fits });
    if (fits && level < 4 && t.signalsKept >= Math.min(t.signalsTotal, MIN_SIGNALS)) {
      chosen = candidates[candidates.length - 1];
      break;
    }
  }
  if (!chosen) {
    // No level kept enough signals: keep the timeline if some level with it still carries a
    // few signals; otherwise signals only; otherwise whatever came closest.
    const kept = (c: Candidate) => c.built.payload.truncation.signalsKept;
    const byKept = (a: Candidate, b: Candidate) => kept(b) - kept(a) || a.level - b.level;
    const withTimeline = candidates.filter((c) => c.fits && c.level < 4 && kept(c) >= MIN_FALLBACK_SIGNALS).sort(byKept);
    const anyFit = candidates.filter((c) => c.fits).sort(byKept);
    chosen = withTimeline[0] ?? anyFit[0] ?? [...candidates].sort((a, b) => a.text.length - b.text.length)[0];
  }

  const { built, level, text } = chosen!;
  const t = built.payload.truncation;
  const monthsDropped = hadMonths && level >= 3;
  return {
    text,
    charCount: text.length,
    truncated: t.signalsDropped > 0 || level > 0 || t.overBudget || monthsDropped || text.length > maxChars || !report.timeline !== !built.payload.timeline,
    promptVersion: COPY_PROMPT_VERSION,
    payload: built,
  };
}
