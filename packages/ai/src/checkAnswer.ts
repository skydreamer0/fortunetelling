/**
 * 貼回答案檢查（M3-03）：把外部 AI 的回答逐段對照「程式算好的訊號」。
 *
 * 與 `checkPastedAnswer` 的差別：後者要整份 payload 才能比對；這裡只要一個 `signalLookup`
 * （id → 訊號所屬系統），所以 MCP 這類「訊號按需查詢」的場景也能用。純函式、無 SDK、瀏覽器安全。
 *
 * 檢查三件事，皆為建議性（只標示，不改寫）：
 *   (a) `unknown_citation`           引用的 sig_ id 查不到；
 *   (b) `honesty_violation`          HonestyGuard（L2）、AI 宿命論用語、或保證式斷言；
 *   (c) `experimental_as_consensus`  把 experimental 系統（吠陀占星）當成「高共識」的依據；
 *       `high_consensus_unsupported` 寫「高共識」但引用的已驗證系統少於 3 套。
 */
import { HonestyGuard } from './core-pure';
import { splitParagraphs } from './pasteCheck';
import { AI_HONESTY_LAYER, BASELINE_ONLY_SYSTEMS, EXPERIMENTAL_SYSTEMS, FATALISM_PATTERNS, HIGH_CONSENSUS_MIN_SYSTEMS, HIGH_CONSENSUS_TERM } from './validate';

/** 文字中提到 experimental 系統的說法。 */
export const EXPERIMENTAL_NAME_RE = /吠陀|Jyotish/i;

/** HonestyGuard 與 FATALISM 之外的保證式斷言。 */
export const ASSERTION_PATTERNS: ReadonlyArray<{ id: string; pattern: RegExp }> = Object.freeze([
  { id: 'bao-zheng', pattern: /保證/ },
  { id: 'que-ding-fa-sheng', pattern: /確定(會)?發生/ },
  { id: 'ken-ding-hui', pattern: /肯定會/ },
  { id: 'bai-fen-zhi-bai', pattern: /百分之百/ },
  { id: 'ding-ding', pattern: /鐵定/ },
]);

export interface SignalRef {
  /** 訊號所屬系統 id（例如 `bazi`、`jyotish`）。 */
  system: string;
}

export interface CheckAnswerOptions {
  /** 以 id 查訊號；查不到回 undefined／null。 */
  signalLookup: (id: string) => SignalRef | undefined | null;
  /** 覆寫 experimental 系統清單（預設 {@link EXPERIMENTAL_SYSTEMS}）。 */
  experimentalSystems?: readonly string[];
}

export type AnswerIssueCode =
  | 'unknown_citation'
  | 'honesty_violation'
  | 'experimental_as_consensus'
  | 'high_consensus_unsupported';

export interface AnswerIssue {
  code: AnswerIssueCode;
  /** 段落索引（以空行分段，從 0 起算）。 */
  paragraph: number;
  /** 問題的 id／用語（已排序、去重）。 */
  values: string[];
  /** 給人看的說明。 */
  detail: string;
  /** 段落開頭，方便對位。 */
  excerpt: string;
}

export interface CheckAnswerResult {
  ok: boolean;
  paragraphCount: number;
  /** 回答中出現的所有 sig_ id（排序、去重）。 */
  citedIds: string[];
  /** 查不到的 id。 */
  unknownCitations: string[];
  issues: AnswerIssue[];
}

const CITATION_RE = /sig_[0-9A-Za-z]+/g;
const EXCERPT_CHARS = 40;
/** 句子裡有這些否定語時，提到「高共識」多半是在說「不算高共識」，不標示。 */
const NEGATION_RE = /不(算|能|可|屬於|是|會算|宜|應)|並非|未(達|算|列入|納入)|沒有|無法|低於/;

const uniqSorted = (xs: Iterable<string>) => [...new Set(xs)].sort();
const excerptOf = (text: string) => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > EXCERPT_CHARS ? `${flat.slice(0, EXCERPT_CHARS)}…` : flat;
};

/** 該用語是否「只以否定形式」出現（例如「不保證」「不一定會」）。 */
function onlyNegated(text: string, term: string): boolean {
  let from = 0;
  let found = false;
  for (;;) {
    const at = text.indexOf(term, from);
    if (at < 0) break;
    found = true;
    if (text[at - 1] !== '不') return false;
    from = at + term.length;
  }
  return found;
}

function honestyTerms(prose: string): string[] {
  const terms: string[] = [];
  for (const problem of HonestyGuard.lint(prose, AI_HONESTY_LAYER).problems) {
    const quoted = /「([^」]+)」/.exec(problem);
    if (quoted) terms.push(quoted[1]);
  }
  for (const { pattern } of [...FATALISM_PATTERNS, ...ASSERTION_PATTERNS]) {
    const m = pattern.exec(prose);
    if (m) terms.push(m[0]);
  }
  return uniqSorted(terms).filter((term) => !onlyNegated(prose, term));
}

/** 同一句內同時提到「高共識」與 experimental 系統名稱（且沒有否定語）。 */
function experimentalNamedInConsensusSentence(prose: string): string[] {
  const hits: string[] = [];
  for (const sentence of prose.split(/[。！？!?\n；;，,]/)) {
    if (!sentence.includes(HIGH_CONSENSUS_TERM) || NEGATION_RE.test(sentence)) continue;
    const m = EXPERIMENTAL_NAME_RE.exec(sentence);
    if (m) hits.push(m[0]);
  }
  return uniqSorted(hits);
}

export function checkAnswer(answerText: string, options: CheckAnswerOptions): CheckAnswerResult {
  const experimental = new Set(options.experimentalSystems ?? EXPERIMENTAL_SYSTEMS);
  const systemCache = new Map<string, string | null>();
  const systemOf = (id: string): string | null => {
    let hit = systemCache.get(id);
    if (hit === undefined) {
      hit = options.signalLookup(id)?.system ?? null;
      systemCache.set(id, hit);
    }
    return hit;
  };

  const issues: AnswerIssue[] = [];
  const allCited = new Set<string>();
  const paragraphs = splitParagraphs(answerText);

  for (const [paragraph, text] of paragraphs.entries()) {
    const citations = uniqSorted(text.match(CITATION_RE) ?? []);
    citations.forEach((id) => allCited.add(id));
    const excerpt = excerptOf(text);

    const unknown = citations.filter((id) => systemOf(id) === null);
    if (unknown.length) {
      issues.push({ code: 'unknown_citation', paragraph, values: unknown, detail: `引用的訊號 id 查不到：${unknown.join('、')}`, excerpt });
    }

    const prose = text.replace(CITATION_RE, ' ');

    const terms = honestyTerms(prose);
    if (terms.length) {
      issues.push({ code: 'honesty_violation', paragraph, values: terms, detail: `含宿命論或保證式用語：${terms.join('、')}`, excerpt });
    }

    const consensusSentences = prose.split(/[。！？!?\n；;]/).filter((s) => s.includes(HIGH_CONSENSUS_TERM));
    // 每一句提到「高共識」的都在否定（例如「不算高共識」）→ 是誠實的說法，不檢查
    if (consensusSentences.length > 0 && !consensusSentences.every((s) => NEGATION_RE.test(s))) {
      const systems = citations.map(systemOf).filter((s): s is string => s !== null);
      const cited = uniqSorted(systems);
      const citedExperimental = cited.filter((s) => experimental.has(s));
      const baseline = cited.filter((s) => BASELINE_ONLY_SYSTEMS.includes(s));
      // 已驗證且有時間變化的系統才算票；只有出生盤基線的系統（人類圖，直到有行運規則）不算
      const verified = cited.filter((s) => !experimental.has(s) && !BASELINE_ONLY_SYSTEMS.includes(s));
      const named = experimentalNamedInConsensusSentence(prose);

      if (verified.length < HIGH_CONSENSUS_MIN_SYSTEMS) {
        if (citedExperimental.length > 0) {
          issues.push({
            code: 'experimental_as_consensus',
            paragraph,
            values: citedExperimental,
            detail: `「高共識」引用了 experimental 系統（${citedExperimental.join('、')}），已驗證系統僅 ${verified.length} 套，不足 ${HIGH_CONSENSUS_MIN_SYSTEMS} 套`,
            excerpt,
          });
        } else {
          issues.push({
            code: 'high_consensus_unsupported',
            paragraph,
            values: verified,
            detail: `「高共識」需要至少 ${HIGH_CONSENSUS_MIN_SYSTEMS} 套已驗證系統的訊號，目前引用 ${verified.length} 套` +
              (baseline.length > 0 ? `（${baseline.join('、')} 目前只有出生盤規則、每個時間窗都一樣，不算這個時間窗的一票）` : ''),
            excerpt,
          });
        }
      }
      if (named.length > 0 && !issues.some((i) => i.paragraph === paragraph && i.code === 'experimental_as_consensus')) {
        issues.push({
          code: 'experimental_as_consensus',
          paragraph,
          values: named,
          detail: `同一句把 experimental 系統（${named.join('、')}）與「高共識」並列；experimental 系統不得計入高共識`,
          excerpt,
        });
      }
    }
  }

  const citedIds = uniqSorted(allCited);
  return {
    ok: issues.length === 0,
    paragraphCount: paragraphs.length,
    citedIds,
    unknownCitations: citedIds.filter((id) => systemOf(id) === null),
    issues,
  };
}
