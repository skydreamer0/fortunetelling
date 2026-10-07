import { evidenceMatchesContext, supportsHighConsensusCitations, type DirectionalEvidence } from './core-pure';
import type { InterpretationPayload } from './payload';
import { resolveCitation } from './signalIds';

/** Shared affirmative-claim gate for all three AI validators. */
export function hasHighConsensusClaim(text: string): boolean {
  const negative = /(?:沒有(?:形成|達到)?|並無|無|不算|不是|不構成|不能(?:稱(?:為)?|說(?:是)?)|無法(?:確認|稱(?:為)?)|未(?:達到|形成)|不足以稱(?:為)?)(?:任何|真正的?|有效的?|可靠的?|同向的?|所謂的?|\s)*$/;
  for (const clause of text.replace(/[〔〕\[\]()（）]/g, ' ').split(/[。！？!?\n；;，,]/)) {
    for (const mention of clause.matchAll(/高共識/g)) {
      const before = clause.slice(0, mention.index);
      const after = clause.slice(mention.index! + 3);
      const negated = negative.exec(before);
      const doubleNegative = negated && /(?:不是|並非|不能說|不能否認|不代表|不等於|不意味著|不算)\s*$/.test(before.slice(0, negated.index));
      if (doubleNegative || (!negated && !/^(?:不成立|不足|未成立|不存在)\s*$/.test(after))) return true;
    }
  }
  return false;
}

export function payloadAgreementEvidence(payload: InterpretationPayload): DirectionalEvidence[] {
  if (payload.payloadVersion < 2) return [];
  const out: DirectionalEvidence[] = [];
  const timeline = payload.timeline;
  if (timeline) for (const cell of [...timeline.years, ...timeline.months]) {
    for (const domain of cell.domains) if (evidenceMatchesContext(domain.directionalEvidence, {
      domain: domain.domain, window: cell.window, thresholds: timeline.thresholds, systems: domain.systems,
    })) out.push(domain.directionalEvidence);
  }
  const question = payload.question;
  if (question) for (const item of question.top) {
    for (const proof of item.directionalEvidence ?? []) if (evidenceMatchesContext(proof, {
      domain: proof.domain, window: item.window, thresholds: question.thresholds,
    })) out.push(proof);
  }
  return out;
}

export function payloadSupportsHighConsensus(payload: InterpretationPayload, citedIds: readonly string[]): boolean {
  const byId = new Map(payload.signals.map(signal => [signal.id, signal]));
  const available = [...byId.keys()];
  const citations = citedIds.flatMap(cited => {
    const id = resolveCitation(cited, available);
    const signal = id === null ? undefined : byId.get(id);
    return signal ? [signal] : [];
  });
  return supportsHighConsensusCitations(payloadAgreementEvidence(payload), citations);
}
