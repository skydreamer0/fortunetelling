/**
 * Program-enforced post-validation (V5-04, ARCHITECTURE-V2 §9 後驗證; D-021).
 * Nothing here trusts the model. A section is dropped (never repaired) when:
 *   1. it has no citations, or cites an id that is not in payload.signals;
 *   2. its heading/text mentions a 干支 / 星名 / 宮名 / 行星 / nakshatra / 星座
 *      that does not appear in the payload (anti re-derivation);
 *   3. HonestyGuard (layer L2 — AI prose is about time-varying periods) or the
 *      AI-specific fatalism list flags it;
 *   4. it claims 「高共識」 while its citations span fewer than 3 systems.
 * Returns every reason for every dropped section, so the UI / logs can show why.
 */
import { HonestyGuard } from './core-pure';
import type { InterpretationPayload } from './payload';
import { isSection, type InterpretationSection } from './schema';
import { buildCorpus, findVocabTerms, isInCorpus, VOCAB, type VocabCorpus, type VocabEntry, type VocabKind } from './vocab';

export type DropReasonCode =
  | 'malformed'
  | 'empty'
  | 'no_citations'
  | 'unknown_citation'
  | 'unverified_term'
  | 'honesty'
  | 'fatalism'
  | 'high_consensus_unsupported';

export interface DropReason {
  code: DropReasonCode;
  detail: string;
  /** unknown_citation: the id; unverified_term: the term. */
  value?: string;
  kind?: VocabKind;
}

export interface DroppedSection {
  section: unknown;
  reasons: DropReason[];
}

export interface ValidationResult {
  kept: InterpretationSection[];
  dropped: DroppedSection[];
}

/** HonestyGuard layer applied to AI prose (time-varying interpretation). */
export const AI_HONESTY_LAYER = 'L2';

/** Fatalistic 吉／凶 wording beyond HonestyGuard's list (AI-specific). */
export const FATALISM_PATTERNS: ReadonlyArray<{ id: string; pattern: RegExp }> = [
  { id: 'da-xiong', pattern: /大凶/ },
  { id: 'da-ji', pattern: /大吉/ },
  { id: 'xiong-zhao', pattern: /凶兆/ },
  { id: 'jie-shu', pattern: /劫數/ },
  { id: 'bi-ding', pattern: /必定/ },
  { id: 'bi-ran-hui', pattern: /必然會/ },
];

export const HIGH_CONSENSUS_TERM = '高共識';
export const HIGH_CONSENSUS_MIN_SYSTEMS = 3;

export interface ValidationContext {
  payload: InterpretationPayload;
  /** Canonical JSON of the payload (as sent to the model). */
  payloadJson: string;
  vocab?: readonly VocabEntry[];
}

export function validateSections(sections: unknown[], ctx: ValidationContext): ValidationResult {
  const systemsById = new Map<string, string>();
  for (const s of ctx.payload.signals) systemsById.set(s.id, s.system);
  const corpus: VocabCorpus = buildCorpus(ctx.payloadJson, ctx.payload);
  const vocab = ctx.vocab ?? VOCAB;

  const kept: InterpretationSection[] = [];
  const dropped: DroppedSection[] = [];

  for (const raw of sections) {
    if (!isSection(raw)) {
      dropped.push({ section: raw, reasons: [{ code: 'malformed', detail: 'section must be { heading, text, citations: string[] }' }] });
      continue;
    }
    const reasons: DropReason[] = [];
    const heading = raw.heading.trim();
    const text = raw.text.trim();
    const citations = [...new Set(raw.citations.map((c) => c.trim()).filter(Boolean))];
    const prose = `${heading}\n${text}`;

    if (text.length === 0) reasons.push({ code: 'empty', detail: 'section text is empty' });

    // (1) citations
    if (citations.length === 0) {
      reasons.push({ code: 'no_citations', detail: 'section cites no signal id' });
    }
    for (const id of citations) {
      if (!systemsById.has(id)) {
        reasons.push({ code: 'unknown_citation', detail: `cited id ${JSON.stringify(id)} is not in payload.signals`, value: id });
      }
    }

    // (2) anti re-derivation vocabulary
    for (const entry of findVocabTerms(prose, vocab)) {
      if (!isInCorpus(entry, corpus)) {
        reasons.push({
          code: 'unverified_term',
          kind: entry.kind,
          value: entry.term,
          detail: `${entry.kind} ${JSON.stringify(entry.term)} does not appear in the payload (possible re-derivation)`,
        });
      }
    }

    // (3) honesty
    const lint = HonestyGuard.lint(prose, AI_HONESTY_LAYER);
    for (const problem of lint.problems) reasons.push({ code: 'honesty', detail: problem });
    for (const { id, pattern } of FATALISM_PATTERNS) {
      if (pattern.test(prose)) reasons.push({ code: 'fatalism', value: id, detail: `fatalistic wording ${pattern.source}` });
    }

    // (4) 「高共識」 needs ≥ 3 distinct cited systems
    if (prose.includes(HIGH_CONSENSUS_TERM)) {
      const systems = new Set(citations.map((id) => systemsById.get(id)).filter(Boolean));
      if (systems.size < HIGH_CONSENSUS_MIN_SYSTEMS) {
        reasons.push({
          code: 'high_consensus_unsupported',
          detail: `「${HIGH_CONSENSUS_TERM}」 requires citations from ≥ ${HIGH_CONSENSUS_MIN_SYSTEMS} systems, got ${systems.size}`,
        });
      }
    }

    if (reasons.length > 0) dropped.push({ section: raw, reasons });
    else kept.push({ heading, text, citations });
  }

  return { kept, dropped };
}
