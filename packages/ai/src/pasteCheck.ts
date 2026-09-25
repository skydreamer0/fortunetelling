/**
 * Paste-back checker (D-035): the user pastes an external AI's answer back into
 * the site, and the same program checks as `validateSections` run per paragraph.
 * Advisory only — the site cannot intercept an external AI, so nothing is dropped;
 * each paragraph gets neutral flags:
 *   「引用不存在」   cites a sig_ id that is not in the data;
 *   「提到資料中沒有的干支／星曜／行星」 anti re-derivation vocabulary (vocab.ts);
 *   「沒有引用來源」 a content paragraph without any sig_ id;
 *   「宿命論用語」   HonestyGuard (L2) or the AI fatalism list;
 *   「高共識但少於三套系統」 「高共識」 with citations from < 3 systems.
 * Pure and deterministic; browser-safe (no SDK).
 */
import { canonicalJson } from './canonical';
import { HonestyGuard } from './core-pure';
import { buildInterpretationPayload, type BuiltPayload, type InterpretationPayload, type ReportLike } from './payload';
import { AI_HONESTY_LAYER, FATALISM_PATTERNS, HIGH_CONSENSUS_MIN_SYSTEMS, HIGH_CONSENSUS_TERM } from './validate';
import { buildCorpus, findVocabTerms, isInCorpus, VOCAB } from './vocab';

export type PasteFlagCode = 'unknown_citation' | 'unverified_term' | 'no_citation' | 'fatalism' | 'high_consensus_unsupported';

export const PASTE_FLAG_LABELS: Readonly<Record<PasteFlagCode, string>> = Object.freeze({
  unknown_citation: '引用不存在',
  unverified_term: '提到資料中沒有的干支／星曜／行星',
  no_citation: '沒有引用來源',
  fatalism: '宿命論用語',
  high_consensus_unsupported: '高共識但少於三套系統',
});

export interface PasteFlag {
  code: PasteFlagCode;
  label: string;
  /** Offending ids / terms / phrases (sorted, unique). */
  values: string[];
}

export interface PastedParagraphCheck {
  index: number;
  /** Nearest markdown heading above (or on) this paragraph, without '#'. */
  heading: string | null;
  text: string;
  citations: string[];
  flags: PasteFlag[];
}

export interface PasteCheckResult {
  paragraphs: PastedParagraphCheck[];
  flaggedCount: number;
  /** Every distinct sig_ id cited anywhere, sorted. */
  citedIds: string[];
  ok: boolean;
}

/** A report (checked against its full, un-truncated data), the embedded payload, or a bare payload. */
export type PasteCheckSource = ReportLike | BuiltPayload | InterpretationPayload;

const CITATION_RE = /sig_[0-9A-Za-z]+/g;
const HEADING_RE = /^\s{0,3}#{1,6}\s+(.*)$/;
/** Paragraphs under these headings may legitimately have no citation. */
const NO_CITATION_HEADINGS = /資料限制|限制|說明|免責/;
/** Minimum content length (after stripping markdown) that needs a citation. */
const MIN_CLAIM_CHARS = 20;
/** System names that contain a vocabulary term (紫微 is also a star). */
const SYSTEM_NAME_RE = /紫微斗數/g;

function resolve(source: PasteCheckSource): { payload: InterpretationPayload; payloadJson: string } {
  const s = source as Record<string, unknown>;
  if (typeof s.payloadJson === 'string' && s.payload) return source as BuiltPayload;
  if (s.payloadVersion !== undefined && Array.isArray(s.signals)) {
    return { payload: source as InterpretationPayload, payloadJson: canonicalJson(source) };
  }
  const built = buildInterpretationPayload(source as ReportLike, { maxChars: Number.POSITIVE_INFINITY });
  return built;
}

const uniqSorted = (xs: Iterable<string>) => [...new Set(xs)].sort();

export function splitParagraphs(answerText: string): string[] {
  return answerText
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function checkPastedAnswer(source: PasteCheckSource, answerText: string): PasteCheckResult {
  const { payload, payloadJson } = resolve(source);
  const systemsById = new Map<string, string>();
  for (const s of payload.signals) systemsById.set(s.id, s.system);
  const corpus = buildCorpus(payloadJson, payload);

  const paragraphs: PastedParagraphCheck[] = [];
  const allCited = new Set<string>();
  let heading: string | null = null;

  for (const [index, text] of splitParagraphs(answerText).entries()) {
    const lines = text.split('\n');
    const body: string[] = [];
    for (const line of lines) {
      const m = HEADING_RE.exec(line);
      if (m) heading = m[1].replace(/[*_`]/g, '').trim();
      else body.push(line);
    }
    const bodyText = body.join('\n');
    const citations = uniqSorted(text.match(CITATION_RE) ?? []);
    citations.forEach((id) => allCited.add(id));
    const flags: PasteFlag[] = [];

    const unknown = citations.filter((id) => !systemsById.has(id));
    if (unknown.length) flags.push({ code: 'unknown_citation', label: PASTE_FLAG_LABELS.unknown_citation, values: unknown });

    const prose = text.replace(CITATION_RE, ' ').replace(SYSTEM_NAME_RE, ' ');
    const terms = findVocabTerms(prose, VOCAB).filter((e) => !isInCorpus(e, corpus)).map((e) => e.term);
    if (terms.length) flags.push({ code: 'unverified_term', label: PASTE_FLAG_LABELS.unverified_term, values: uniqSorted(terms) });

    const content = bodyText.replace(CITATION_RE, '').replace(/[#*_`>|\-\s〔〕[\]()（）]/g, '');
    const exempt = heading !== null && NO_CITATION_HEADINGS.test(heading);
    if (citations.length === 0 && content.length >= MIN_CLAIM_CHARS && !exempt) {
      flags.push({ code: 'no_citation', label: PASTE_FLAG_LABELS.no_citation, values: [] });
    }

    const fatal: string[] = [];
    for (const problem of HonestyGuard.lint(prose, AI_HONESTY_LAYER).problems) {
      const quoted = /「([^」]+)」/.exec(problem);
      fatal.push(quoted ? quoted[1] : problem);
    }
    for (const { pattern } of FATALISM_PATTERNS) {
      const m = pattern.exec(prose);
      if (m) fatal.push(m[0]);
    }
    if (fatal.length) flags.push({ code: 'fatalism', label: PASTE_FLAG_LABELS.fatalism, values: uniqSorted(fatal) });

    if (prose.includes(HIGH_CONSENSUS_TERM)) {
      const systems = new Set(citations.map((id) => systemsById.get(id)).filter(Boolean));
      if (systems.size < HIGH_CONSENSUS_MIN_SYSTEMS) {
        flags.push({ code: 'high_consensus_unsupported', label: PASTE_FLAG_LABELS.high_consensus_unsupported, values: [] });
      }
    }

    paragraphs.push({ index, heading, text, citations, flags });
  }

  const flaggedCount = paragraphs.filter((p) => p.flags.length > 0).length;
  return { paragraphs, flaggedCount, citedIds: uniqSorted(allCited), ok: flaggedCount === 0 };
}
